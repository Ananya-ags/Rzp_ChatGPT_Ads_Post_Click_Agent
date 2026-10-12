import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { getDb, resolveAdGroup } from "@/lib/data";
import { AGENT_MODEL, buildTools, systemPrompt, type ChatContext } from "@/lib/agent/agent";
import { inputCheck, outputChecks, redact } from "@/lib/agent/guardrails";
import * as core from "@/lib/tools/core";
import { userFromRequest } from "@/lib/user";

export const maxDuration = 30;

// Haiku 5.5 list price per 1M tokens (prompts ≤100K): $0.10 in / $0.50 out
const COST_IN = 0.1 / 1e6, COST_OUT = 0.5 / 1e6;

type Body = { messages: UIMessage[]; context: ChatContext };

const lastUserText = (messages: UIMessage[]) =>
  [...messages].reverse().find((m) => m.role === "user")?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim() ?? "";

export async function POST(req: Request) {
  const { messages, context: clientCtx }: Body = await req.json();
  const db = getDb();
  // who the shopper is comes from the login cookie on the server, never from the client's claim
  const user = userFromRequest(req);
  const context: ChatContext = {
    ...clientCtx,
    tier: user ? 3 : Math.min(clientCtx.tier ?? 1, 2),
    loggedIn: !!user,
    firstName: user?.firstName ?? null,
    pincode: user?.address.pincode ?? null,
    rtoRisk: user?.rtoRisk,
    ownedTitles: user ? user.ownedSkus.map((s) => core.findProduct(db, s)?.title ?? s) : [],
  };
  // the product page the chat was opened on; null when opened from the store home or a category page
  const page = context.sku ? core.findProduct(db, context.sku) : null;
  const group = context.adGroupId ? resolveAdGroup({ ad_group: context.adGroupId }) : null;
  const userText = lastUserText(messages);
  const input = inputCheck(userText);
  const started = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) return fallback(userText, input.injection, "no_api_key", page?.handle ?? null, context);

  const tools = buildTools(db, context);
  const { stable, context: ctxText } = systemPrompt(db, context, page, group, input);
  const toolLog: { tool: string; args: unknown; output: unknown; ms: number }[] = [];
  let stepStart = Date.now();

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "data-guard", data: { stage: "input", name: "injection patterns", pass: !input.injection, detail: input.injection ? input.patterns.join(", ") : "none", text: redact(userText) } });
      const result = streamText({
        model: anthropic(AGENT_MODEL),
        system: `${stable}\n\n${ctxText}`,
        messages: await convertToModelMessages(messages),
        tools,
        stopWhen: isStepCount(5),
        maxOutputTokens: 1200,
        providerOptions: { anthropic: { effort: "low" } },
        onStepFinish: (step) => {
          for (const r of step.toolResults ?? []) toolLog.push({ tool: r.toolName, args: r.input, output: r.output, ms: Date.now() - stepStart });
          stepStart = Date.now();
        },
      });
      writer.merge(toUIMessageStream({ stream: result.stream, tools, sendStart: false, sendFinish: false }));
      const [text, usage] = await Promise.all([result.text, result.totalUsage]);
      const sources = JSON.stringify(toolLog.map((t) => t.output)) + JSON.stringify(page ? core.verifiedFacts(page) : null) + JSON.stringify(db.brand.policies) + JSON.stringify(db.rules.offer_caps);
      for (const c of outputChecks(text, sources, db.rules, page)) writer.write({ type: "data-guard", data: { stage: "output", ...c } });
      const tokensIn = usage.inputTokens ?? 0, tokensOut = usage.outputTokens ?? 0;
      writer.write({ type: "data-usage", data: { model: AGENT_MODEL, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: +(tokensIn * COST_IN + tokensOut * COST_OUT).toFixed(5), latency_ms: Date.now() - started, tools: toolLog.map((t) => ({ tool: t.tool, args: t.args, ms: t.ms })), fallback: false } });
      writer.write({ type: "finish" });
    },
    onError: (e) => {
      console.error("chat error", e);
      return "Sorry, I hit a snag. Try one of the suggested questions, or reach our care team on WhatsApp.";
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/** Welcome chips on the store home / category chat: answered by the real tools and store policy (no LLM). */
const STORE_CHIPS: Record<string, (db: ReturnType<typeof getDb>) => { text: string; cards: never[]; trace: { tool: string; args: Record<string, unknown> }[] }> = {
  "find a gift": () => ({ text: "Here are some gift picks. Gift wrap and a note are available.", cards: [], trace: [{ tool: "search_catalog", args: { query: "gift", occasion: "gifting", limit: 3 } }] }),
  "waterproof pieces": () => ({ text: "These are verified water-resistant: fine in the shower and at the gym.", cards: [], trace: [{ tool: "search_catalog", args: { query: "everyday", water_resistant: true, limit: 3 } }] }),
  "under 2000": () => ({ text: "Here are some favourites under ₹2,000.", cards: [], trace: [{ tool: "search_catalog", args: { query: "", max_price_inr: 2000, limit: 3 } }] }),
  "delivery  returns": (db) => {
    const pol = db.brand.policies;
    const wh = db.logistics.warehouses[0];
    return { text: `Order before ${wh.cutoff_ist} IST and most pieces ship the same day from ${wh.city}. Shipping is free over ₹${pol.free_shipping_threshold_inr.toLocaleString("en-IN")}, and returns are open for ${pol.return_window_days} days.`, cards: [], trace: [] };
  },
};

/** No API key (or outage): replay the guided-demo answer with real tool outputs, else hand off politely. */
function fallback(userText: string, injection: boolean, reason: string, pageSku: string | null, ctx: ChatContext) {
  const db = getDb();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const cached = db.demo.steps.find((s) => s.chip && s.cached_response && norm(s.chip) === norm(userText))?.cached_response ?? null;
  // "Show me other products" (4th prompt tile): similar pieces to the page product, computed by the real tool
  const page = pageSku ? core.findProduct(db, pageSku) : null;
  const step =
    cached ? { cached_response: cached }
    : !page && STORE_CHIPS[norm(userText)] ? { cached_response: STORE_CHIPS[norm(userText)](db) }
    : norm(userText) === "show me other products" && page
      ? { cached_response: { text: `Here are a few similar pieces.`, cards: [], trace: [{ tool: "search_catalog", args: { query: page.metafields.jewellery.subtype, similar_to: page.handle, limit: 3 } as Record<string, unknown> }] } }
      : norm(userText) === "when will it be delivered" && page
        ? (() => {
            // tier 0: approx city from IP → Pune; the exact date is computed by check_delivery
            const pin = ctx.pincode ?? "411038";
            const d = core.checkDelivery(db, page.handle, pin);
            const nudge = ctx.loggedIn && ctx.rtoRisk === "high" ? " Pay online at checkout and you get an extra 5% off." : "";
            const text = ctx.pincode
              ? `${ctx.firstName ? `${ctx.firstName}, it` : "It"} arrives ${"error" in d ? "" : d.arrives_label} at your saved address in ${"error" in d ? "" : d.city} if you order before 2pm today.${nudge}`
              : `It arrives ${"error" in d ? "" : d.arrives_label} in ${"error" in d ? "" : d.city} if you order before 2pm today. Share your pincode for an exact date.`;
            return "error" in d ? null : { cached_response: { text, cards: [], trace: [{ tool: "check_delivery", args: { sku: page.handle, pincode: pin } as Record<string, unknown> }] } };
          })()
        : /^(any offers|any offers on this|koi offer hai kya|can i pay cash on delivery|cod available)/.test(norm(userText)) && page
          ? (() => {
              const o = core.getOffer(db, [{ sku: page.handle, qty: 1 }], { prepaid: true, logged_in: !!ctx.loggedIn, rto_risk: ctx.rtoRisk });
              const lines = o.applied.map((a) => `${a.label} (−₹${a.amount_inr.toLocaleString("en-IN")})`).join("; ");
              const extra = ctx.loggedIn && ctx.rtoRisk === "high" ? " Cash on delivery doesn't get these offers." : "";
              return { cached_response: { text: `${ctx.firstName ? `${ctx.firstName}, pay` : "Pay"} online and you get: ${lines || "no offers right now"}. ${o.wallet.usable_inr > 0 ? `With your ₹${o.wallet.usable_inr.toLocaleString("en-IN")} wallet, you'd` : "You'd"} pay ₹${o.total_inr.toLocaleString("en-IN")}.${extra}`, cards: [], trace: [{ tool: "get_offer", args: { cart: [{ sku: page.handle, qty: 1 }], prepaid: true } as Record<string, unknown> }] } };
            })()
        : ["what metal is this", "is it nickelfree", "is it nickel free", "are these nickelfree", "are these nickel free"].includes(norm(userText)) && page
          ? (() => {
              // answered from verified metafields only: the metal, and nickel_free (steel contains some nickel)
              const j = page.metafields.jewellery;
              const metal = { "stainless steel": "stainless steel", "925 silver": "sterling silver", brass: "brass" }[j.base_metal];
              const finish = j.plating === "18k gold plating" ? "18K gold plating" : j.plating === "gold vermeil" ? "gold vermeil" : j.plating ?? "a gold-toned finish";
              const verb = /s$/i.test(page.title) ? "are" : "is";
              if (norm(userText) === "what metal is this")
                return { cached_response: { text: `${verb === "are" ? "They're" : "It's"} ${metal} all the way through, with ${finish}.`, cards: [], trace: [] } };
              const text =
                j.nickel_free === false
                  ? `No. ${verb === "are" ? "They're" : "It's"} ${metal}, which has a little nickel, so we don't call ${verb === "are" ? "them" : "it"} hypoallergenic. If you have a nickel allergy, please check with your doctor first. Our care team can help too.`
                  : `The brand hasn't confirmed this. ${verb === "are" ? "They're" : "It's"} ${metal} with ${finish}. If you have a nickel allergy, please check with your doctor first. Our care team can help too.`;
              return { cached_response: { text, cards: [], trace: [{ tool: "handoff", args: { reason: "nickel / sensitive-ears question" } as Record<string, unknown> }] } };
            })()
        : (norm(userText) === "suitable for wedding gift" || norm(userText) === "is gift wrap available") && page
          ? (() => {
              // answered from verified occasions + store policy (no numbers invented)
              const j = page.metafields.jewellery;
              const pol = db.brand.policies;
              const fits = j.occasions.includes("wedding guest") || j.occasions.includes("gifting");
              const wrap = `Gift wrap is ₹${pol.gift_wrap_inr} and a note is free. Returns are open for ${pol.return_window_days} days.`;
              const isGiftWrap = norm(userText) === "is gift wrap available";
              const verb = /s$/i.test(page.title) ? "are" : "is";
              const uses = [j.occasions.includes("wedding guest") ? "wedding-guest looks" : null, j.occasions.includes("gifting") ? "gifting" : null].filter(Boolean).join(" and ");
              const text = isGiftWrap
                ? `Yes. ${wrap}`
                : fits
                  ? `Yes, a lovely pick for ${uses}. ${wrap}`
                  : `${verb === "are" ? "They're" : "It's"} more of an everyday piece. For a wedding, jhumkas or pearls suit better: tap "Show me other products". ${wrap}`;
              const trace = isGiftWrap ? [] : [{ tool: "get_return_insight", args: { sku: page.handle, context: "wedding" } as Record<string, unknown> }];
              return { cached_response: { text, cards: [], trace } };
            })()
          : null;
  const run = (t: { tool: string; args: Record<string, unknown> }) => {
    const a = t.args as never as Record<string, never>;
    switch (t.tool) {
      case "get_return_insight": return core.getReturnInsight(db, a.sku, a.context);
      case "search_catalog": { const { query, ...f } = a; return core.searchCatalog(db, query, f); }
      case "check_delivery": return core.checkDelivery(db, a.sku, a.pincode, a.deadline);
      case "handoff": return core.handoff(db, a.reason);
      case "get_offer": { const { cart, ...o } = a; return core.getOffer(db, cart, { ...(o as object), logged_in: !!ctx.loggedIn, rto_risk: ctx.rtoRisk }); }
      default: return null;
    }
  };
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "data-guard", data: { stage: "input", name: "injection patterns", pass: !injection, detail: injection ? "override attempt detected" : "none", text: redact(userText) } });
      const id = "t1";
      if (step?.cached_response) {
        step.cached_response.trace.forEach((t, i) => {
          const toolCallId = `cached-${i}`;
          writer.write({ type: "tool-input-available", toolCallId, toolName: t.tool, input: t.args });
          writer.write({ type: "tool-output-available", toolCallId, output: run(t) });
        });
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: step.cached_response.text });
        writer.write({ type: "text-end", id });
      } else {
        const h = core.handoff(db, "assistant offline");
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: `I can only answer the suggested questions right now. For anything else, our care team is on ${h.contact} (${h.hours}).` });
        writer.write({ type: "text-end", id });
      }
      writer.write({ type: "data-usage", data: { model: "cached", tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: 0, tools: step?.cached_response?.trace.map((t) => ({ tool: t.tool, args: t.args, ms: 0 })) ?? [], fallback: reason } });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
