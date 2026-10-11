import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage } from "ai";
import { getDb, resolveAdGroup } from "@/lib/data";
import { AGENT_MODEL, buildTools, systemPrompt, type ChatContext } from "@/lib/agent/agent";
import { inputCheck, outputChecks, redact } from "@/lib/agent/guardrails";
import * as core from "@/lib/tools/core";

export const maxDuration = 30;

// Haiku 5.5 list price per 1M tokens (prompts ≤100K): $0.10 in / $0.50 out
const COST_IN = 0.1 / 1e6, COST_OUT = 0.5 / 1e6;

type Body = { messages: UIMessage[]; context: ChatContext };

const lastUserText = (messages: UIMessage[]) =>
  [...messages].reverse().find((m) => m.role === "user")?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim() ?? "";

export async function POST(req: Request) {
  const { messages, context }: Body = await req.json();
  const db = getDb();
  const page = core.findProduct(db, context.sku) ?? db.products[0];
  const group = context.adGroupId ? resolveAdGroup({ ad_group: context.adGroupId }) : null;
  const userText = lastUserText(messages);
  const input = inputCheck(userText);
  const started = Date.now();

  if (!process.env.ANTHROPIC_API_KEY) return fallback(userText, input.injection, "no_api_key", page.handle);

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
      const sources = JSON.stringify(toolLog.map((t) => t.output)) + JSON.stringify(core.verifiedFacts(page)) + JSON.stringify(db.brand.policies) + JSON.stringify(db.rules.offer_caps);
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

/** No API key (or outage): replay the guided-demo answer with real tool outputs, else hand off politely. */
function fallback(userText: string, injection: boolean, reason: string, pageSku: string) {
  const db = getDb();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const cached = db.demo.steps.find((s) => s.chip && s.cached_response && norm(s.chip) === norm(userText))?.cached_response ?? null;
  // "Show me other products" (4th prompt tile): similar pieces to the page product, computed by the real tool
  const page = core.findProduct(db, pageSku);
  const step =
    cached ? { cached_response: cached }
    : norm(userText) === "show me other products" && page
      ? { cached_response: { text: `Here are a few pieces in a similar style to the ${page.title}. Tap any of them to see more.`, cards: [], trace: [{ tool: "search_catalog", args: { query: page.metafields.jewellery.subtype, similar_to: page.handle, limit: 3 } as Record<string, unknown> }] } }
      : norm(userText) === "when will it be delivered" && page
        ? (() => {
            // tier 0: approx city from IP → Pune; the exact date is computed by check_delivery
            const d = core.checkDelivery(db, page.handle, "411038");
            return "error" in d ? null : { cached_response: { text: `It arrives ${d.arrives_label} in ${d.city} (approximate location) if you order before 2pm today. Share your pincode and I'll check the exact date for your address.`, cards: [], trace: [{ tool: "check_delivery", args: { sku: page.handle, pincode: "411038" } as Record<string, unknown> }] } };
          })()
        : null;
  const run = (t: { tool: string; args: Record<string, unknown> }) => {
    const a = t.args as never as Record<string, never>;
    switch (t.tool) {
      case "get_return_insight": return core.getReturnInsight(db, a.sku, a.context);
      case "search_catalog": { const { query, ...f } = a; return core.searchCatalog(db, query, f); }
      case "check_delivery": return core.checkDelivery(db, a.sku, a.pincode, a.deadline);
      case "get_offer": { const { cart, ...o } = a; return core.getOffer(db, cart, o); }
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
        writer.write({ type: "text-delta", id, delta: `I'm running in offline preview mode right now, so I can only answer the suggested questions. For anything else, our care team is on ${h.contact} (${h.hours}).` });
        writer.write({ type: "text-end", id });
      }
      writer.write({ type: "data-usage", data: { model: "cached", tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: 0, tools: step?.cached_response?.trace.map((t) => ({ tool: t.tool, args: t.args, ms: 0 })) ?? [], fallback: reason } });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
