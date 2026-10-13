import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage, type UIMessageStreamWriter } from "ai";
import { getDb, resolveAdGroup } from "@/lib/data";
import { buildTools, systemPrompt, type ChatContext } from "@/lib/agent/agent";
import { AGENT, estimateCostUsd, llmSettings, pickFallbackLlm, pickLlm, type Llm } from "@/lib/ai/model";
import { addSpend, overDailyBudget, spendToday } from "@/lib/ai/spend";
import { inputCheck, outputChecks, redact } from "@/lib/agent/guardrails";
import { ALLERGY, MAX_MESSAGE_CHARS, TEXT_ONLY_REPLY, TOO_LONG_REPLY, forcedTool, isFastPath, norm, parseDeadline } from "@/lib/agent/intents";
import { allowMessage, hasDemoBypass, visitorKey, VISITOR_COOKIE } from "@/lib/agent/rateLimit";
import * as core from "@/lib/tools/core";
import { userFromRequest } from "@/lib/user";

export const maxDuration = 30;

type Body = { messages: UIMessage[]; context: ChatContext };
type Writer = UIMessageStreamWriter;

/** Plan 6.6: the calm decline for blocked or objectionable content (never an error). */
const DECLINE = "I'm here to help with Cosmos jewellery and orders, so I can't respond to that. Is there something I can help you find?";
/** G17: shown when the model is unavailable (timeout, 429/quota, 503, no key) and a quick answer is used instead. */
const LIMITED_NOTE = "Limited mode: I'm using quick answers right now.";
/** Spending guards (rate limit, daily cap): quick answers keep working, with this note. Never an error. */
const BUSY_NOTE = "Lots of questions! Quick answers are still on; try a suggestion below.";

const lastUserText = (messages: UIMessage[]) =>
  [...messages].reverse().find((m) => m.role === "user")?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim() ?? "";

/** Resolve an SDK PromiseLike, or a fallback value if it rejects (e.g. no output after a failed stream). */
const settle = <T, F>(p: PromiseLike<T>, fallback: F): Promise<T | F> => Promise.resolve(p).then((v) => v, () => fallback);

const writeText = (writer: Writer, id: string, text: string) => {
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
};

/**
 * Order: input limits → fast path (exact chip, zero LLM calls; always on) → no key → spending guards (rate limit,
 * daily cap) → main model → fallback model → quick answer with a note. Every reply streams data-guard and
 * data-usage parts (including today's estimated spend) for the AI console.
 */
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
  const inputGuard = { type: "data-guard" as const, data: { stage: "input", name: "injection patterns", pass: !input.injection, detail: input.injection ? input.patterns.join(", ") : "none", text: redact(userText) } };

  // visitor id cookie for the rate limit (IP as backup until the cookie exists)
  const { key, newVisitorId } = visitorKey(req);
  const headers = newVisitorId ? { "set-cookie": `${VISITOR_COOKIE}=${newVisitorId}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly` } : undefined;
  const respond = (execute: (writer: Writer) => Promise<void> | void) =>
    createUIMessageStreamResponse({
      headers,
      stream: createUIMessageStream({
        execute: ({ writer }) => execute(writer),
        onError: (e) => {
          console.error("chat error", e);
          return `Sorry, I couldn't finish that. Try one of the suggested questions, or email our care team at ${db.brand.support.email}.`;
        },
      }),
    });
  type OfflineReason = "fast_path" | "no_api_key" | "llm_unavailable" | "rate_limited" | "daily_cap";
  const offline = (writer: Writer, reason: OfflineReason, attempts: unknown[] = [], intent: ReturnType<typeof forcedTool> = null) => {
    const o = offlineWriter(userText, page?.handle ?? null, context, intent);
    const busy = reason === "rate_limited" || reason === "daily_cap";
    if (!busy || o.answered) o.write(writer); // busy with nothing quick to say: just the friendly note
    if (busy) writeText(writer, "note", BUSY_NOTE);
    else if (reason !== "fast_path") writeText(writer, "note", LIMITED_NOTE);
    writer.write({ type: "data-usage", data: { model: reason === "fast_path" ? "fast-path" : "cached", tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: Date.now() - started, first_output_ms: Date.now() - started, tools: o.trace, fallback: reason, attempts, mode: reason === "fast_path" ? "fast_path" : "limited", ...spendToday() } });
  };

  // G3/G4 input limits: text only, and a length cap (no model call)
  const nonText = messages.filter((m) => m.role === "user").flatMap((m) => m.parts).find((p) => p.type !== "text");
  const tooLong = userText.length > MAX_MESSAGE_CHARS;
  if (nonText || tooLong)
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write({ type: "data-guard", data: nonText ? { stage: "input", name: "text only", pass: false, detail: `rejected a ${nonText.type} part` } : { stage: "input", name: "length cap", pass: false, detail: `${userText.length} characters (max ${MAX_MESSAGE_CHARS})` } });
      writeText(writer, "t1", nonText ? TEXT_ONLY_REPLY : TOO_LONG_REPLY);
      writer.write({ type: "data-usage", data: { model: "none", tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: Date.now() - started, tools: [], fallback: nonText ? "non_text_input" : "too_long", mode: "input_rejected", ...spendToday() } });
      writer.write({ type: "finish" });
    });

  // fast path: exact suggested-chip text answered from tools + templates, zero LLM calls
  if (isFastPath(userText) && offlineWriter(userText, page?.handle ?? null, context).matched)
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write(inputGuard);
      offline(writer, "fast_path");
      writer.write({ type: "finish" });
    });

  const llm = pickLlm("agent");
  if (!llm)
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write(inputGuard);
      offline(writer, "no_api_key");
      writer.write({ type: "finish" });
    });

  // G4 spending guards (judges shouldn't feel them): 40 messages / 10 min per visitor (demo cookie skips it), and a
  // daily spend cap. Either one → quick answers with a friendly note instead of a model call.
  const overRate = !allowMessage(key) && !(await hasDemoBypass(req));
  const overCap = overDailyBudget();
  const routed = forcedTool(userText, !!page);
  if (overRate || overCap)
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write(inputGuard);
      writer.write({ type: "data-guard", data: { stage: "input", name: overRate ? "rate limit" : "daily spend cap", pass: false, detail: overRate ? "over 40 messages in 10 minutes" : `estimated spend today ≥ $${spendToday().budget_usd}` } });
      offline(writer, overRate ? "rate_limited" : "daily_cap", [], routed);
      writer.write({ type: "finish" });
    });

  const tools = buildTools(db, context);
  const { stable, context: ctxText } = systemPrompt(db, context, page, group, input);
  const forced = routed;

  return respond(async (writer) => {
    writer.write({ type: "start" });
    writer.write(inputGuard);
    writer.write({ type: "data-guard", data: { stage: "input", name: "routed intent", pass: true, detail: forced ? `forced ${forced} on step 1` : "none (auto)" } });
    // only the last 10 messages of history go to the model (cost; the page context is in the system prompt)
    const modelMessages = await convertToModelMessages(messages.slice(-AGENT.historyMessages));
    const deadline = started + AGENT.timeout.totalMs;
    const chain = [llm, pickFallbackLlm(llm)].filter((m): m is Llm => !!m);
    const attempts: { model: string; outcome: string; ms: number }[] = [];
    let toolLog: { tool: string; args: unknown; output: unknown; ms: number }[] = [];

    for (const m of chain) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) break;
      const t0 = Date.now();
      let stepStart = t0;
      const log: typeof toolLog = [];
      const r = streamText({
        model: m.model,
        system: `${stable}\n\n${ctxText}`, // stable rules first, dynamic context after (implicit caching)
        messages: modelMessages,
        tools,
        toolChoice: "auto",
        // routed intents (decided by rules in code): the model must call this tool before answering
        prepareStep: forced ? ({ stepNumber }) => (stepNumber === 0 ? { toolChoice: { type: "tool", toolName: forced } } : {}) : undefined,
        stopWhen: isStepCount(AGENT.maxSteps),
        maxOutputTokens: AGENT.maxOutputTokens,
        seed: AGENT.seed,
        maxRetries: AGENT.maxRetries, // fail fast to the fallback model instead of retrying a 503/429
        timeout: { ...AGENT.timeout, totalMs: remaining }, // a slow or overloaded call fails over to the fallback
        ...llmSettings(m),
        onStepFinish: (step) => {
          for (const tr of step.toolResults ?? []) log.push({ tool: tr.toolName, args: tr.input, output: tr.output, ms: Date.now() - stepStart });
          stepStart = Date.now();
        },
      });
      const piped = await pipeUntilFirstOutput(r, tools, writer, started);
      if (!piped.started) {
        // blocked by safety settings → polite decline, never an error, and no point trying another model
        const finish = await settle(r.finishReason, null);
        const meta = (await settle(r.providerMetadata, null)) as { google?: { promptFeedback?: { blockReason?: string } } } | null;
        if (finish === "content-filter" || meta?.google?.promptFeedback?.blockReason) {
          attempts.push({ model: m.modelId, outcome: "blocked (safety)", ms: Date.now() - t0 });
          writeText(writer, "t1", DECLINE);
          writer.write({ type: "data-guard", data: { stage: "output", name: "safety block", pass: false, detail: meta?.google?.promptFeedback?.blockReason ?? "finishReason content-filter" } });
          writer.write({ type: "data-usage", data: { model: m.modelId, tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: Date.now() - started, tools: [], fallback: false, attempts, forced_tool: forced, mode: "safety", ...spendToday() } });
          writer.write({ type: "finish" });
          return;
        }
        attempts.push({ model: m.modelId, outcome: piped.error ?? "empty reply", ms: Date.now() - t0 });
        console.warn(`chat: ${m.modelId} failed before answering (${piped.error ?? "empty reply"})`);
        continue;
      }

      // answered (possibly with a late error, which is never shown raw)
      toolLog = log;
      attempts.push({ model: m.modelId, outcome: piped.error ? `late error: ${piped.error}` : "ok", ms: Date.now() - t0 });
      const usage = await settle(r.totalUsage, null);
      const finishReason = await settle(r.finishReason, piped.error ? "error" : null);
      let text = piped.text;
      if (finishReason === "content-filter" && !text.trim()) {
        text = DECLINE;
        writeText(writer, "decline", DECLINE);
      } else if (!text.trim()) {
        // the model went quiet after its tool calls (e.g. a step timeout): G11 safe answer built from the tool results
        text = answerFromTools(log, !!context.pincode, page, userText) ?? `Sorry, that took too long to finish. Please ask again, or email our care team at ${db.brand.support.email}.`;
        writeText(writer, "tail", text);
        writer.write({ type: "data-guard", data: { stage: "output", name: "safe template", pass: true, detail: `model gave no text${piped.error ? ` (${piped.error})` : ""}; answer built from tool results` } });
      }
      const sources = JSON.stringify(toolLog.map((t) => t.output)) + JSON.stringify(page ? core.verifiedFacts(page) : null) + JSON.stringify(db.brand.policies) + JSON.stringify(db.rules.offer_caps) + JSON.stringify(db.rules.escalation);
      for (const c of outputChecks(text, sources, db.rules, page)) writer.write({ type: "data-guard", data: { stage: "output", ...c } });
      if (finishReason === "length") writer.write({ type: "data-guard", data: { stage: "output", name: "length", pass: false, detail: `finishReason length at ${AGENT.maxOutputTokens} max output tokens` } });
      const tokensIn = usage?.inputTokens ?? 0, tokensOut = usage?.outputTokens ?? 0;
      const cost = estimateCostUsd(m.modelId, tokensIn, tokensOut);
      addSpend(cost);
      writer.write({
        type: "data-usage",
        data: {
          model: m.modelId,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: cost === null ? null : +cost.toFixed(5),
          latency_ms: Date.now() - started,
          first_output_ms: piped.firstOutputMs,
          tools: toolLog.map((t) => ({ tool: t.tool, args: t.args, ms: t.ms })),
          fallback: m === llm ? false : "fallback_model",
          attempts,
          forced_tool: forced,
          finish_reason: finishReason,
          mode: m === llm ? "llm" : "llm_fallback",
          ...spendToday(),
        },
      });
      writer.write({ type: "finish" });
      return;
    }

    // every model failed (timeout, 429/quota, 503, empty) → quick answer (for a routed intent, answered from code)
    // + limited-mode note
    offline(writer, "llm_unavailable", attempts, forced);
    writer.write({ type: "finish" });
  });
}

/** Short, key-free reason for a failed model call, e.g. "429 quota", "503 high demand", "timeout". */
function describeError(e: unknown): string {
  const err = e as { statusCode?: number; name?: string; message?: string; lastError?: { statusCode?: number; message?: string } };
  const status = err.statusCode ?? err.lastError?.statusCode;
  const msg = String(err.lastError?.message ?? err.message ?? e);
  if (err.name === "AbortError" || /timeout|aborted/i.test(msg)) return "timeout";
  if (status === 429 || /quota|rate limit/i.test(msg)) return "429 quota";
  if (status === 503 || /high demand|unavailable/i.test(msg)) return "503 high demand";
  return `${status ?? "error"} ${msg.split("\n")[0].slice(0, 60)}`;
}

/** G17: a templated answer for a routed intent when no model is available (computed by the same tools). */
function routedAnswer(intent: NonNullable<ReturnType<typeof forcedTool>>, page: NonNullable<ReturnType<typeof core.findProduct>>, userText: string, ctx: ChatContext) {
  const db = getDb();
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const t = (tool: string, args: Record<string, unknown>, text: string) => ({ cached_response: { text, cards: [], trace: [{ tool, args }] } });
  if (intent === "get_offer") {
    const pct = Number(userText.match(/(\d{1,3})\s?%/)?.[1]) || undefined;
    const o = core.getOffer(db, [{ sku: page.handle, qty: 1 }], { prepaid: true, requested_discount_pct: pct, logged_in: !!ctx.loggedIn, rto_risk: ctx.rtoRisk });
    const best = o.applied[0];
    return t("get_offer", { cart: [{ sku: page.handle, qty: 1 }], prepaid: true, requested_discount_pct: pct }, `I can't create discounts; the store caps offers at ${o.cap.max_pct}% or ${inr(o.cap.max_flat_inr)}.${best ? ` What you do get: ${best.label.charAt(0).toLowerCase() + best.label.slice(1)}, so you'd pay ${inr(o.total_inr)}.` : ""}`);
  }
  if (intent === "check_delivery") {
    const pin = ctx.pincode ?? "411038";
    const deadline = parseDeadline(userText, db.now);
    const d = core.checkDelivery(db, page.handle, pin, deadline);
    if ("error" in d) return null;
    return t("check_delivery", { sku: page.handle, pincode: pin, ...(deadline ? { deadline } : {}) }, deliveryText(d, !!ctx.pincode));
  }
  if (intent === "handoff") return t("handoff", { reason: "routed: care question" }, ALLERGY.test(userText) ? `${nickelAnswer(page)} ${carePointer()}` : db.rules.escalation.text);
  return null; // get_return_insight needs the model to judge fit
}

type DeliveryResult = Exclude<ReturnType<typeof core.checkDelivery>, { error: string }>;

/** Delivery answer from check_delivery's code-written summary (incl. in-time alternatives), plus the estimate note. */
function deliveryText(d: DeliveryResult, knownPincode: boolean): string {
  return `${d.summary}${knownPincode ? "" : " That's an estimate for Pune; share your pincode for an exact date."}`;
}

/** "Our care team can help…" with the support email and reply time (for answers that aren't a dead end). */
const carePointer = () => {
  const b = getDb().brand.support;
  return `Our care team can help at ${b.email}; we reply ${b.reply}.`;
};

/** Honest nickel answer from verified metafields (fast path and safe template share it). */
function nickelAnswer(page: NonNullable<ReturnType<typeof core.findProduct>>): string {
  const j = page.metafields.jewellery;
  const metal = { "stainless steel": "stainless steel", "925 silver": "sterling silver", brass: "brass" }[j.base_metal];
  const finish = j.plating === "18k gold plating" ? "18K gold plating" : j.plating === "gold vermeil" ? "gold vermeil" : j.plating ?? "a gold-toned finish";
  const plural = /s$/i.test(page.title);
  return j.nickel_free === false
    ? `No. ${plural ? "They're" : "It's"} ${metal}, which has a little nickel, so we don't call ${plural ? "them" : "it"} hypoallergenic. If you have a nickel allergy, please check with your doctor first.`
    : `The brand hasn't confirmed this. ${plural ? "They're" : "It's"} ${metal} with ${finish}. If you have a nickel allergy, please check with your doctor first.`;
}

/** G11: a plain answer built only from tool results, used when the model returns no text after calling tools. */
function answerFromTools(log: { tool: string; output: unknown }[], knownPincode: boolean, page: ReturnType<typeof core.findProduct>, userText: string): string | null {
  const db = getDb();
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  for (const { tool, output } of [...log].reverse()) {
    const o = output as Record<string, never>;
    if (!o || "error" in o) continue;
    if (tool === "get_offer") {
      const cap = o.cap as { max_pct: number; max_flat_inr: number };
      const best = (o.applied as { label: string }[])[0];
      return `I can't create discounts; the store caps offers at ${cap.max_pct}% or ${inr(cap.max_flat_inr)}.${best ? ` What you do get: ${best.label.charAt(0).toLowerCase() + best.label.slice(1)}, so you'd pay ${inr(o.total_inr)}.` : ""}`;
    }
    if (tool === "check_delivery") return deliveryText(o as unknown as DeliveryResult, knownPincode);
    if (tool === "handoff") return page && ALLERGY.test(userText) ? `${nickelAnswer(page)} ${carePointer()}` : db.rules.escalation.text;
    if (tool === "get_return_insight") {
      const ri = output as unknown as { relevant: boolean; title: string; top_reason: { count: number; of: number; label: string } | null; keepers: { title: string; share_of_keepers: number } | null; context: string };
      if (!ri.relevant || !ri.top_reason) return `The ${ri.title} suit ${ri.context} wear well; buyers in that context rarely return them.`;
      return `Buyers who wore the ${ri.title} for ${ri.context} and returned them mostly said "${ri.top_reason.label.toLowerCase()}" (${ri.top_reason.count} of ${ri.top_reason.of}).${ri.keepers ? ` ${Math.round(ri.keepers.share_of_keepers * 100)}% of ${ri.context} keepers picked the ${ri.keepers.title} instead.` : ""}`;
    }
  }
  return null;
}

const OUTPUT_PARTS = new Set(["text-start", "text-delta", "tool-input-start", "tool-input-available", "tool-output-available"]);

/**
 * Forward a model's UI stream, holding back bookkeeping parts until the first text or tool part. If it errors or
 * ends before any output, nothing is forwarded (started: false) so the caller can try the next model. Errors after
 * output has started are swallowed (never shown raw) and reported back.
 */
async function pipeUntilFirstOutput(result: { stream: Parameters<typeof toUIMessageStream>[0]["stream"] }, tools: Parameters<typeof toUIMessageStream>[0]["tools"], writer: Writer, requestStart: number) {
  // onError: keep the real reason (429 quota, 503, timeout) for the attempt log; it is never shown to the shopper
  const reader = toUIMessageStream({ stream: result.stream, tools, sendStart: false, sendFinish: false, onError: (e) => describeError(e) }).getReader();
  const held: Parameters<Writer["write"]>[0][] = [];
  let started = false, text = "", error: string | undefined, firstOutputMs: number | null = null;
  for (;;) {
    let chunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      chunk = await reader.read();
    } catch (e) {
      error = (e as Error).message.split("\n")[0];
      break;
    }
    const { value, done } = chunk;
    if (done) break;
    if (value.type === "abort") {
      error = error ?? "timeout";
      if (!started) break;
      continue;
    }
    if (value.type === "error") {
      error = value.errorText.split("\n")[0];
      if (!started) {
        await reader.cancel().catch(() => {});
        break;
      }
      continue; // late error: keep what was said, never show the raw error
    }
    if (value.type === "text-delta") text += value.delta;
    if (started) {
      writer.write(value);
      continue;
    }
    held.push(value);
    if (OUTPUT_PARTS.has(value.type)) {
      started = true;
      firstOutputMs = Date.now() - requestStart;
      held.forEach((part) => writer.write(part));
    }
  }
  return { started, text, error, firstOutputMs };
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

/**
 * Quick answers from tools + templates (fast path, no API key, or every model failed): a templated lookup or the
 * guided-demo answer, with real tool outputs; else a pointer to the care team. `matched` says whether one applied.
 */
function offlineWriter(userText: string, pageSku: string | null, ctx: ChatContext, intent: ReturnType<typeof forcedTool> = null) {
  const db = getDb();
  // a cached guided-demo answer applies only on the product it's about (its first tool's SKU), never on another page
  const cachedFor = (c: { trace: { args: Record<string, unknown> }[] }) => {
    const a = c.trace[0]?.args ?? {};
    return (a.sku as string | undefined) ?? (a.cart as { sku: string }[] | undefined)?.[0]?.sku ?? null;
  };
  const cached = db.demo.steps.find((s) => s.chip && s.cached_response && norm(s.chip) === norm(userText) && (!pageSku || cachedFor(s.cached_response) === pageSku))?.cached_response ?? null;
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
              const text = `${nickelAnswer(page)} Our care team can help too.`;
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
  // no chip matched, but the intent is known (routed by rules in code): answer it from the tool, no model
  const routedStep = !step && page && intent ? routedAnswer(intent, page, userText, ctx) : null;
  const finalStep = step ?? routedStep;
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
  const trace = finalStep?.cached_response?.trace.map((t) => ({ tool: t.tool, args: t.args, ms: 0 })) ?? [];
  const write = (writer: Writer) => {
      const id = "t1";
      if (finalStep?.cached_response) {
        finalStep.cached_response.trace.forEach((t, i) => {
          const toolCallId = `cached-${i}`;
          writer.write({ type: "tool-input-available", toolCallId, toolName: t.tool, input: t.args });
          writer.write({ type: "tool-output-available", toolCallId, output: run(t) });
        });
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: finalStep.cached_response.text });
        writer.write({ type: "text-end", id });
      } else {
        const h = core.handoff(db, "assistant offline");
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: `I can only answer the suggested questions right now. For anything else, email our care team at ${h.contact}; we reply ${h.reply}.` });
        writer.write({ type: "text-end", id });
      }
  };
  // matched = an exact chip/cached answer (fast path); answered = any quick answer, incl. a routed intent
  return { matched: !!step?.cached_response, answered: !!finalStep?.cached_response, trace, write };
}
