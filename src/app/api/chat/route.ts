import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, type UIMessage, type UIMessageStreamWriter } from "ai";
import { getDb, resolveAdGroup } from "@/lib/data";
import { buildTools, systemPrompt, type ChatContext } from "@/lib/agent/agent";
import { AGENT, estimateCostUsd, llmSettings, pickFallbackLlm, pickLlm, type Llm } from "@/lib/ai/model";
import { addSpend, overDailyBudget, spendToday } from "@/lib/ai/spend";
import { ABUSE_LINE, END_LINE, MAX_STRIKES, abuseCheck, chatEnded, strikesSoFar } from "@/lib/agent/abuse";
import { dayLabel, fastKey, nextFridayIso, type FastKey } from "@/lib/agent/chips";
import { inputCheck, opensWithYes, outputChecks, policyAssertion, policyCovers, redact } from "@/lib/agent/guardrails";
import { MAX_MESSAGE_CHARS, PREFS, TEXT_ONLY_REPLY, TOO_LONG_REPLY, forcedTool, handoffKind, isHinglish, norm, parseDeadline, parsePrefs, parseQty, typedPincode } from "@/lib/agent/intents";
import { allowMessage, hasDemoBypass, visitorKey, VISITOR_COOKIE } from "@/lib/agent/rateLimit";
import * as core from "@/lib/tools/core";
import { userFromRequest } from "@/lib/user";
import { PREFS_COOKIE, readPreferencesCookie } from "@/lib/preferences";

export const maxDuration = 30;

type Body = { messages: UIMessage[]; context: ChatContext };
type Writer = UIMessageStreamWriter;

/** Plan 6.6: the calm decline for blocked or objectionable content (never an error). */
/** G2: the abuse / safety decline (one strike), and the line that ends the chat on the 3rd strike. */
const DECLINE = ABUSE_LINE;
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
    cart: Array.isArray(clientCtx.cart) ? clientCtx.cart.filter((l) => l && typeof l.sku === "string" && Number.isFinite(l.qty)).slice(0, 50) : [],
    loginOffered: !!clientCtx.loginOffered,
    path: typeof clientCtx.path === "string" && clientCtx.path.startsWith("/") ? clientCtx.path.slice(0, 300) : "/",
    preferences: readPreferencesCookie((req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${PREFS_COOKIE}=([^;]+)`))?.[1]),
  };
  // the product page the chat was opened on; null when opened from the store home or a category page
  const page = context.sku ? core.findProduct(db, context.sku) : null;
  const group = context.adGroupId ? resolveAdGroup({ ad_group: context.adGroupId }) : null;
  const userText = lastUserText(messages);
  context.userText = userText;
  // a pincode the shopper typed (any turn) counts as theirs; Hinglish in → Hinglish out
  context.typedPincode = typedPincode(messages.filter((m) => m.role === "user").map((m) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ")));
  context.hinglish = isHinglish(userText);
  Object.assign(context, lastTools(messages));
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
  type OfflineReason = "fast_path" | "safety_handoff" | "care_line" | "no_api_key" | "llm_unavailable" | "rate_limited" | "daily_cap";
  const offline = (writer: Writer, reason: OfflineReason, attempts: unknown[] = [], intent: QuickIntent = null) => {
    const o = offlineWriter(userText, page?.handle ?? null, context, intent);
    const busy = reason === "rate_limited" || reason === "daily_cap";
    if (!busy || o.answered) o.write(writer); // busy with nothing quick to say: just the friendly note
    if (busy) writeText(writer, "note", BUSY_NOTE);
    const code = reason === "fast_path" || reason === "safety_handoff" || reason === "care_line";
    if (!busy && !code) writeText(writer, "note", LIMITED_NOTE);
    writer.write({ type: "data-usage", data: { model: code ? (reason === "fast_path" ? "fast-path" : "code") : "cached", tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: Date.now() - started, first_output_ms: Date.now() - started, tools: o.trace, fallback: reason, attempts, mode: code ? reason : "limited", ...spendToday() } });
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

  // G2 abuse filter with strikes: no model call, a fixed line, never the shopper's words (not even in the console).
  // Strikes are counted from this conversation, so "New chat" resets them; the 3rd ends the chat.
  const priorStrikes = strikesSoFar(messages);
  const abuse = abuseCheck(userText);
  if (abuse.hit || chatEnded(messages))
    return respond((writer) => {
      const ended = chatEnded(messages);
      const strikes = ended ? priorStrikes : priorStrikes + 1;
      const last = ended || strikes >= MAX_STRIKES;
      writer.write({ type: "start" });
      writer.write({ type: "data-guard", data: { stage: "input", name: "abuse filter", pass: false, detail: ended ? "chat already ended" : `${abuse.category} · strike ${strikes} of ${MAX_STRIKES}`, text: "[withheld]" } });
      writeText(writer, "t1", last ? END_LINE : DECLINE);
      writer.write({ type: "data-abuse", data: { strikes, ended: last } });
      writer.write({ type: "data-usage", data: { model: "none", tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: Date.now() - started, tools: [], fallback: "abuse", mode: "abuse", ...spendToday() } });
      writer.write({ type: "finish" });
    });

  // fast path: exact suggested-chip text answered from tools + templates, zero LLM calls
  if (fastKey(userText) && offlineWriter(userText, page?.handle ?? null, context).matched)
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write(inputGuard);
      offline(writer, "fast_path");
      writer.write({ type: "finish" });
    });

  // routed intent (rules in code). For quick answers without a model, simple product-fact questions count too (B9).
  const routed = forcedTool(userText, !!page);
  const quickIntent: QuickIntent = routed ?? (page && FACTS_Q.test(userText) ? "get_product_facts" : PREFS.test(userText) ? "update_preferences" : null);
  // medical questions and "talk to a person" get a fixed, code-written reply (no model paraphrase of safety lines)
  const safetyKind = routed === "handoff" ? handoffKind(userText) : null;
  if (safetyKind === "medical" || safetyKind === "human")
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write(inputGuard);
      writer.write({ type: "data-guard", data: { stage: "input", name: "safety handoff", pass: true, detail: `${safetyKind}: answered in code, no model call` } });
      offline(writer, "safety_handoff", [], "handoff");
      writer.write({ type: "finish" });
    });

  // a policy question the knowledge base doesn't cover: the exact care line, in code (no model paraphrase or guess)
  if (routed === "lookup_policy" && !core.lookupPolicy(db, userText).found)
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write(inputGuard);
      writer.write({ type: "data-guard", data: { stage: "input", name: "unknown policy", pass: true, detail: "no knowledge-base section: care line in code, no model call" } });
      offline(writer, "care_line", [], "lookup_policy");
      writer.write({ type: "finish" });
    });

  const llm = pickLlm("agent");
  if (!llm)
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write(inputGuard);
      offline(writer, "no_api_key", [], quickIntent);
      writer.write({ type: "finish" });
    });

  // G4 spending guards (judges shouldn't feel them): 40 messages / 10 min per visitor (demo cookie skips it), and a
  // daily spend cap. Either one → quick answers with a friendly note instead of a model call.
  const overRate = !allowMessage(key) && !(await hasDemoBypass(req));
  const overCap = overDailyBudget();
  if (overRate || overCap)
    return respond((writer) => {
      writer.write({ type: "start" });
      writer.write(inputGuard);
      writer.write({ type: "data-guard", data: { stage: "input", name: overRate ? "rate limit" : "daily spend cap", pass: false, detail: overRate ? "over 40 messages in 10 minutes" : `estimated spend today ≥ $${spendToday().budget_usd}` } });
      offline(writer, overRate ? "rate_limited" : "daily_cap", [], quickIntent);
      writer.write({ type: "finish" });
    });

  const tools = buildTools(db, context);
  const requestedPrefs = routed === "search_catalog" ? parsePrefs(userText, db.now) : {};
  const prefsResult = Object.keys(requestedPrefs).length
    ? await tools.update_preferences.execute!(requestedPrefs, { toolCallId: "requested-prefs", messages: [], context: {} })
    : null;
  const { stable, context: ctxText } = systemPrompt(db, context, page, group, input);
  const forced = routed;

  return respond(async (writer) => {
    writer.write({ type: "start" });
    writer.write(inputGuard);
    if (prefsResult) {
      writer.write({ type: "tool-input-available", toolCallId: "requested-prefs", toolName: "update_preferences", input: requestedPrefs });
      writer.write({ type: "tool-output-available", toolCallId: "requested-prefs", output: prefsResult });
      writeToolParts(writer, "update_preferences", requestedPrefs, prefsResult, 0, "code");
    }
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
      const log: typeof toolLog = prefsResult ? [{ tool: "update_preferences", args: requestedPrefs, output: prefsResult, ms: 0 }] : [];
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
      const piped = await pipeUntilFirstOutput(r, tools, writer, started, forced);
      if (!piped.started) {
        // blocked by safety settings → polite decline, never an error, and no point trying another model
        const finish = await settle(r.finishReason, null);
        const meta = (await settle(r.providerMetadata, null)) as { google?: { promptFeedback?: { blockReason?: string } } } | null;
        if (finish === "content-filter" || meta?.google?.promptFeedback?.blockReason) {
          attempts.push({ model: m.modelId, outcome: "blocked (safety)", ms: Date.now() - t0 });
          const strikes = priorStrikes + 1; // Gemini's safety block is a G2 strike too
          writeText(writer, "t1", strikes >= MAX_STRIKES ? END_LINE : DECLINE);
          writer.write({ type: "data-abuse", data: { strikes, ended: strikes >= MAX_STRIKES } });
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
        text = answerFromTools(log, !!(context.pincode || context.typedPincode)) ?? `Sorry, that took too long to finish. Please ask again, or email our care team at ${db.brand.support.email}.`;
        writeText(writer, "tail", text);
        writer.write({ type: "data-guard", data: { stage: "output", name: "safe template", pass: true, detail: `model gave no text${piped.error ? ` (${piped.error})` : ""}; answer built from tool results` } });
      }
      // delivery checked without a known pincode: the estimate line is required, so code adds it if the reply left it out
      if (!context.pincode && !context.typedPincode && toolLog.some((x) => x.tool === "check_delivery") && !/pincode/i.test(text)) {
        const note = "That's an estimate for Pune; share your pincode for an exact date.";
        writeText(writer, "estimate", note);
        text = `${text} ${note}`;
      }
      const sources = JSON.stringify(toolLog.map((t) => t.output)) + JSON.stringify(page ? core.verifiedFacts(page) : null) + JSON.stringify(db.brand.policies) + JSON.stringify(db.rules.offer_caps) + JSON.stringify(db.rules.escalation);
      for (const c of outputChecks(text, sources, db.rules, page)) writer.write({ type: "data-guard", data: { stage: "output", ...c } });
      // unknown facts: an "we offer / don't offer …" claim needs a lookup_policy result this turn
      const asserted = policyAssertion(text);
      const policyBacked = !!asserted && toolLog.some((x) => x.tool === "lookup_policy" && policyCovers(String((x.output as { text?: string })?.text ?? ""), asserted.topic));
      const notIdeal = toolLog.some((x) => x.tool === "get_return_insight" && (x.output as { fit?: string })?.fit === "not_ideal");
      writer.write({ type: "data-guard", data: { stage: "output", name: "honest lead", pass: !(notIdeal && opensWithYes(text)), detail: notIdeal ? (opensWithYes(text) ? "opened with yes although the fit is not ideal" : "led with the honest answer") : "no fit verdict" } });
      writer.write({ type: "data-guard", data: { stage: "output", name: "policy claims grounded", pass: !asserted || policyBacked, detail: asserted ? `${policyBacked ? "backed by lookup_policy" : "no lookup_policy result covers"}: "${asserted.phrase}"` : "no policy claims" } });
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
    offline(writer, "llm_unavailable", attempts, quickIntent);
    writer.write({ type: "finish" });
  });
}

/** One line for the AI console describing a tool result. */
function summarizeTool(tool: string, o: Record<string, unknown> | null): string {
  if (!o) return "no result";
  if ("error" in o && o.error) return `error: ${o.error}`;
  const list = (xs: unknown) => (Array.isArray(xs) ? xs : []) as Record<string, unknown>[];
  switch (tool) {
    case "search_catalog": return `${list(o.results).length} of ${o.total_matches ?? list(o.results).length} remaining: ${list(o.results).map((r) => r.sku).join(", ")}`;
    case "check_delivery": return `${o.title} arrives ${o.arrives_label}${o.meets_deadline === false ? " (misses the deadline)" : ""}${list(o.alternatives).length ? `; alternatives: ${list(o.alternatives).map((a) => `${a.sku} ${a.arrives_label}`).join(", ")}` : ""}`;
    case "get_offer": return `pay ₹${o.total_inr}; applied: ${list(o.applied).map((a) => a.id).join(", ") || "none"}`;
    case "get_return_insight": return o.relevant ? `relevant: ${(o.top_reason as Record<string, unknown>)?.label} ${(o.top_reason as Record<string, unknown>)?.count}/${(o.top_reason as Record<string, unknown>)?.of}` : "not relevant";
    case "handoff": return "care line";
    case "lookup_policy": return o.found ? `${o.id} ${o.version}` : "no match → care line";
    case "get_product_facts": return o.found ? `${o.title} · ${o.size ?? "size n/a"}` : "not found";
    case "add_to_bag": return o.added ? `added ${o.qty} × ${o.title} (bag ${o.bag_count})` : `not added: ${o.reason}`;
    case "update_preferences": return `preferences ${JSON.stringify(o.preferences)}`;
    case "suggest_login": return o.show ? "login card shown" : String(o.why);
    default: return "done";
  }
}

/**
 * After a tool result: the console part (B8) and, where the browser must act, a client part:
 * data-cart (new bag → header count + toast) and data-preferences (saved to the session cookie).
 */
function writeToolParts(writer: Writer, tool: string, args: unknown, output: unknown, latencyMs: number, source: "code" | "ai") {
  const o = (output ?? null) as Record<string, unknown> | null;
  writer.write({ type: "data-tool", data: { tool, args, why: String(o?.why ?? ""), result_summary: summarizeTool(tool, o), latency_ms: latencyMs, source } });
  if (tool === "add_to_bag" && o?.added) writer.write({ type: "data-cart", data: { cart: o.cart, added: { sku: o.sku, title: o.title, qty: o.qty } } });
  if (tool === "update_preferences" && o?.preferences) writer.write({ type: "data-preferences", data: { preferences: o.preferences } });
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
function routedAnswer(intent: NonNullable<QuickIntent>, page: NonNullable<ReturnType<typeof core.findProduct>>, userText: string, ctx: ChatContext) {
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
    const pin = ctx.pincode ?? ctx.typedPincode ?? "411038";
    const deadline = parseDeadline(userText, db.now);
    const d = core.checkDelivery(db, page.handle, pin, deadline);
    if ("error" in d) return null;
    return t("check_delivery", { sku: page.handle, pincode: pin, ...(deadline ? { deadline } : {}) }, deliveryText(d, !!(ctx.pincode || ctx.typedPincode)));
  }
  if (intent === "lookup_policy") {
    const r = core.lookupPolicy(db, userText);
    return t("lookup_policy", { topic: userText }, r.found ? shortPolicy(r.text) : db.rules.escalation.text);
  }
  if (intent === "get_product_facts") {
    // a product named in the question ("the Pearl Drop Earrings") wins over the page product
    const named = db.products.find((x) => {
      const core_ = x.title.toLowerCase().replace(/ (earrings?|necklace|ring|bracelet)$/, "");
      return core_.length > 3 && userText.toLowerCase().includes(core_);
    });
    const sku = named?.handle ?? page.handle;
    const f = core.getProductFacts(db, sku);
    return f.found ? t("get_product_facts", { sku }, factsText(f)) : null;
  }
  if (intent === "add_to_bag") {
    const r = core.addToBag(db, ctx.cart ?? [], page.handle, parseQty(userText));
    return t("add_to_bag", { sku: page.handle, qty: parseQty(userText) }, bagText(r));
  }
  if (intent === "handoff") return t("handoff", { reason: "routed: care question" }, core.handoff(db, "routed: care question", handoffKind(userText), page).message);
  if (intent === "update_preferences") {
    const prefs = parsePrefs(userText, db.now);
    const filters = { ...(prefs.budget_max_inr ? { max_price_inr: prefs.budget_max_inr } : {}), ...(prefs.occasion ? { occasion: prefs.occasion } : {}), ...(prefs.deadline ? { deliver_by: prefs.deadline, deliver_to_pincode: ctx.pincode ?? ctx.typedPincode ?? "411038" } : {}), limit: 3 };
    const said = [prefs.budget_max_inr ? `under ₹${prefs.budget_max_inr.toLocaleString("en-IN")}` : null, prefs.occasion ? `for ${prefs.occasion}` : null, prefs.deadline ? `by ${formatDeadline(prefs.deadline)}` : null].filter(Boolean).join(", ");
    return { cached_response: { text: `Noted${said ? `: ${said}` : ""}. Here are a few pieces that fit.`, cards: [], trace: [{ tool: "update_preferences", args: prefs as Record<string, unknown> }, { tool: "search_catalog", args: { query: "", ...filters } as Record<string, unknown> }] } };
  }
  return null; // get_return_insight needs the model to judge fit
}

type DeliveryResult = Exclude<ReturnType<typeof core.checkDelivery>, { error: string }>;

/** Delivery answer from check_delivery's code-written summary (incl. in-time alternatives), plus the estimate note. */
function deliveryText(d: DeliveryResult, knownPincode: boolean): string {
  return `${d.summary}${knownPincode ? "" : " That's an estimate for Pune; share your pincode for an exact date."}`;
}

type QuickIntent = ReturnType<typeof forcedTool> | "get_product_facts" | "update_preferences";
const formatDeadline = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** Simple product-fact questions, answered from verified facts when no model is available. */
const FACTS_Q = /\b(how (big|long|heavy|wide)|what size|size of|dimensions?|diameter|length|weight|made of|material|what metal)\b/i;
type Facts = Extract<ReturnType<typeof core.getProductFacts>, { found: true }>;

/** A policy section shortened for chat: its first two sentences (the full text stays in the tool result). */
function shortPolicy(text: string) {
  const parts = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return parts.slice(0, 2).join(" ").trim();
}
/** Product facts as one plain line: size, metal and finish, weight (verified fields only). */
function factsText(f: Facts) {
  const metal = { "stainless steel": "stainless steel", "925 silver": "sterling silver", brass: "brass" }[f.base_metal] ?? f.base_metal;
  const plural = /s$/i.test(f.title);
  return `The ${f.title} ${plural ? "are" : "is"} ${f.size ?? "listed without a size"}, ${metal}${f.plating ? ` with ${f.plating === "18k gold plating" ? "18K gold plating" : f.plating}` : ""}${f.weight_g ? `, ${f.weight_g}g${f.category === "earrings" ? " the pair" : ""}` : ""}.`;
}
/** add_to_bag result as one line. */
function bagText(r: ReturnType<typeof core.addToBag>) {
  if (r.added) return `Added ${r.qty} × ${r.title} to your bag.`;
  if (r.reason === "bulk_order") return r.message ?? "";
  if (r.reason === "stock") return `Only ${r.available} of the ${r.title} ${r.available === 1 ? "is" : "are"} left to add.`;
  return "I couldn't add that one. Which piece would you like?";
}

/** G11: a plain answer built only from tool results, used when the model returns no text after calling tools. */
function answerFromTools(log: { tool: string; output: unknown }[], knownPincode: boolean): string | null {
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
    if (tool === "lookup_policy") return o.found ? shortPolicy(String(o.text)) : db.rules.escalation.text;
    if (tool === "get_product_facts" && o.found) return factsText(o as unknown as Facts);
    if (tool === "add_to_bag") return bagText(o as unknown as ReturnType<typeof core.addToBag>);
    if (tool === "handoff") return String(o.message ?? db.rules.escalation.text);
    if (tool === "get_return_insight") {
      const ri = output as unknown as { relevant: boolean; title: string; top_reason: { count: number; of: number; label: string } | null; keepers: { title: string; share_of_keepers: number } | null; alternative: { title: string; size: string | null; price_inr: number } | null; context: string };
      if (!ri.relevant || !ri.top_reason) return `The ${ri.title} suit ${ri.context} wear well; buyers in that context rarely return them.`;
      // honest answer first, then the code-computed alternative (with its size)
      const alt = ri.alternative ? ` A better fit: the ${ri.alternative.size ? `${ri.alternative.size.replace(/ (across|long)$/, "")} ` : ""}${ri.alternative.title} (${inr(ri.alternative.price_inr)})${ri.keepers ? `, picked by ${Math.round(ri.keepers.share_of_keepers * 100)}% of ${ri.context} keepers` : ""}.` : "";
      return `Honestly, buyers who wore the ${ri.title} for ${ri.context} and returned them mostly said "${ri.top_reason.label.toLowerCase()}" (${ri.top_reason.count} of ${ri.top_reason.of}).${alt}`;
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
async function pipeUntilFirstOutput(result: { stream: Parameters<typeof toUIMessageStream>[0]["stream"] }, tools: Parameters<typeof toUIMessageStream>[0]["tools"], writer: Writer, requestStart: number, forced: string | null = null) {
  // B8: a console part per tool result; the first tool is "code"-chosen when it was forced, otherwise the model chose it
  const calls = new Map<string, { tool: string; args: unknown; t0: number }>();
  let first = true;
  const forward = (part: Parameters<Writer["write"]>[0]) => {
    writer.write(part);
    if (part.type === "tool-input-available") {
      calls.set(part.toolCallId, { tool: part.toolName, args: part.input, t0: Date.now() });
    } else if (part.type === "tool-output-available") {
      const c = calls.get(part.toolCallId);
      if (!c) return;
      const source = first && forced === c.tool ? "code" : "ai";
      first = false;
      writeToolParts(writer, c.tool, c.args, part.output, Date.now() - c.t0, source);
    }
  };
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
      forward(value);
      continue;
    }
    held.push(value);
    if (OUTPUT_PARTS.has(value.type)) {
      started = true;
      firstOutputMs = Date.now() - requestStart;
      held.forEach((part) => forward(part));
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

/** Fast keys answered by the older templates below, matched on their canonical chip text. */
const LEGACY_TEXT: Partial<Record<FastKey, string>> = {
  delivery: "when will it be delivered",
  offers: "any offers",
  similar: "show me other products",
  metal: "what metal is this",
  nickel: "is it nickel free",
  wedding_fit: "suitable for wedding gift",
  gift_wrap: "is gift wrap available",
  find_gift: "find a gift",
  waterproof_pieces: "waterproof pieces",
  under_2000: "under 2000",
  delivery_returns: "delivery  returns",
};

/** The last search and delivery check in the chat history (follow-up chips refine them). */
function lastTools(messages: UIMessage[]): Pick<ChatContext, "lastSearch" | "lastDelivery"> {
  let lastSearch: ChatContext["lastSearch"] = null, lastDelivery: ChatContext["lastDelivery"] = null;
  for (const m of [...messages].reverse()) {
    if (m.role !== "assistant") continue;
    for (const part of [...m.parts].reverse() as { type: string; toolName?: string; input?: Record<string, unknown>; output?: Record<string, unknown> }[]) {
      const name = part.type === "dynamic-tool" ? part.toolName : part.type.startsWith("tool-") ? part.type.slice(5) : null;
      if (!lastSearch && name === "search_catalog" && part.input) {
        const filters = part.output?.filters;
        lastSearch = {
          args: { ...part.input, ...(filters && typeof filters === "object" && !Array.isArray(filters) ? filters : {}), ...(typeof part.output?.query === "string" ? { query: part.output.query } : {}) },
          skus: ((part.output?.results as { sku: string }[] | undefined) ?? []).map((r) => r.sku),
        };
      }
      if (!lastDelivery && name === "check_delivery" && part.input?.sku && part.input?.pincode) lastDelivery = { sku: String(part.input.sku), pincode: String(part.input.pincode), deadline: (part.input.deadline as string | undefined) ?? null };
    }
    if (lastSearch && lastDelivery) break;
  }
  return { lastSearch, lastDelivery };
}

type Step = { cached_response: { text: string; cards: never[]; trace: { tool: string; args: Record<string, unknown> }[] } };
const COMPLEMENT: Record<string, string> = { earrings: "necklace", necklace: "earrings", ring: "bracelet", bracelet: "ring" };

/**
 * Fast-path templates for the chat chips (src/lib/agent/chips.ts): a tool computes the facts, a template supplies
 * the words. Returns null when the key is answered by an older template, or can't be answered here (the model
 * takes it). Every number comes from a tool result or verified product data.
 */
function fastTemplate(key: FastKey, page: ReturnType<typeof core.findProduct>, ctx: ChatContext, userText: string): Step | null {
  const db = getDb();
  const pol = db.brand.policies;
  const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const step = (text: string, trace: Step["cached_response"]["trace"]): Step => ({ cached_response: { text, cards: [], trace } });
  const search = (args: Record<string, unknown>) => {
    const { query, ...f } = args as { query?: string } & core.SearchFilters;
    return core.searchCatalog(db, query ?? "", f).results;
  };
  const known = !!(ctx.pincode || ctx.typedPincode);
  const pin = ctx.pincode ?? ctx.typedPincode ?? "411038";
  const estimate = known ? "" : " That's an estimate for Pune; share your pincode for an exact date.";
  const j = page?.metafields.jewellery;
  const plural = page ? /s$/i.test(page.title) : false;
  const they = plural ? "They're" : "It's";
  const sizeOf = (p: NonNullable<typeof page>) => core.getProductFacts(db, p.handle) as Facts;
  const cart = ctx.cart ?? [];

  switch (key) {
    // ── product page ──
    case "size":
    case "materials": {
      if (!page) return null;
      return step(factsText(sizeOf(page)), [{ tool: "get_product_facts", args: { sku: page.handle } }]);
    }
    case "shower": {
      if (!page || !j) return null;
      const text = j.water_resistant === true
        ? `Yes. The ${page.title} ${plural ? "are" : "is"} verified water-resistant, so showers and workouts are fine.`
        : `The brand hasn't confirmed water resistance for the ${page.title}, so it's best to keep ${plural ? "them" : "it"} dry.`;
      return step(text, [{ tool: "get_product_facts", args: { sku: page.handle } }]);
    }
    case "tarnish": {
      if (!page || !j) return null;
      const text = j.anti_tarnish_warranty_months
        ? `${they} anti-tarnish, with a ${j.anti_tarnish_warranty_months}-month anti-tarnish warranty from delivery.`
        : `The ${page.title} ${plural ? "don't" : "doesn't"} carry an anti-tarnish warranty. ${pol.care_guide}`;
      return step(text, [{ tool: "get_product_facts", args: { sku: page.handle } }, { tool: "lookup_policy", args: { topic: "warranty.anti_tarnish" } }]);
    }
    case "size_daily": {
      if (!page) return null;
      const ri = core.getReturnInsight(db, page.handle, "everyday");
      if ("error" in ri) return null;
      const text = answerFromTools([{ tool: "get_return_insight", output: ri }], known) ?? "";
      return step(text, [{ tool: "get_return_insight", args: { sku: page.handle, context: "everyday" } }]);
    }
    case "smaller": {
      if (!page || !j) return null;
      const size = j.outer_diameter_cm ?? j.drop_length_cm;
      const args = { query: "", similar_to: page.handle, category: j.category, ...(j.outer_diameter_cm ? { max_outer_diameter_cm: j.outer_diameter_cm - 0.05 } : {}), limit: 3 };
      const n = size ? search(args).length : 0;
      const facts = sizeOf(page);
      return n
        ? step(`For a subtler look, these are smaller than the ${(facts.size ?? "").replace(/ (across|long)$/, "")}:`, [{ tool: "search_catalog", args }])
        : step(`The ${page.title} ${plural ? "are" : "is"} ${facts.size ?? "already small"}, already one of our smallest in this style.`, [{ tool: "get_product_facts", args: { sku: page.handle } }]);
    }
    case "matching": {
      if (!page || !j) return null;
      const args = { query: "", category: COMPLEMENT[j.category] ?? "earrings", occasion: j.occasions[0], limit: 3 };
      return search(args).length ? step(`Pieces that go with the ${page.title}:`, [{ tool: "search_catalog", args }]) : null;
    }
    case "compare_sizes": {
      if (!page || !j) return null;
      const args = { query: "", similar_to: page.handle, category: j.category, subtype: j.subtype, limit: 3 };
      const facts = sizeOf(page);
      return search(args).length
        ? step(`The ${page.title} ${plural ? "are" : "is"} ${facts.size ?? "one size"}. Other sizes in this style:`, [{ tool: "search_catalog", args }])
        : step(`This style comes in one size: ${facts.size ?? "see the product details"}.`, [{ tool: "get_product_facts", args: { sku: page.handle } }]);
    }
    case "owned": {
      const owned = db.products.filter((p) => ctx.ownedTitles?.includes(p.title));
      if (!ctx.loggedIn || !owned.length) return null; // anonymous: the model offers login (suggest_login)
      const args = { query: "", similar_to: owned[0].handle, exclude: owned.map((p) => p.handle), limit: 3 };
      return step(`Pieces that go with your ${owned[0].title}:`, [{ tool: "search_catalog", args }]);
    }
    case "arrive_by": {
      if (!page) return null;
      const deadline = parseDeadline(userText, db.now);
      const d = core.checkDelivery(db, page.handle, pin, deadline);
      if ("error" in d) return null;
      return step(deliveryText(d, known), [{ tool: "check_delivery", args: { sku: page.handle, pincode: pin, ...(deadline ? { deadline } : {}) } }]);
    }
    case "cod": {
      const cod = core.lookupPolicy(db, "payments.cod");
      const limit = cod.found ? cod.text.match(/up to (₹\d[\d,]*\d)/)?.[1] : undefined; // from the knowledge base
      const text = pol.cod_allowed
        ? `Yes, cash on delivery is available${limit ? ` on orders up to ${limit}` : ""}, for a ${inr(pol.cod_fee_inr)} fee. Online-only offers don't apply to it.`
        : db.rules.escalation.text;
      return step(text, [{ tool: "lookup_policy", args: { topic: "payments.cod" } }]);
    }
    case "gift_wrap": {
      if (page) return null; // product page: the older template (gift wrap + returns)
      return step(`Yes. Gift wrap is ${inr(pol.gift_wrap_inr)} and a handwritten note is free.`, [{ tool: "lookup_policy", args: { topic: "gifting" } }]);
    }
    case "offers": {
      if (page || !cart.length) return page ? null : step("Add a piece to your bag and I'll show the offers that apply.", []);
      const o = core.getOffer(db, cart, { prepaid: true, logged_in: !!ctx.loggedIn, rto_risk: ctx.rtoRisk });
      const lines = o.applied.map((a) => `${a.label} (−${inr(a.amount_inr)})`).join("; ");
      return step(`Pay online and you get: ${lines || "no offers right now"}. You'd pay ${inr(o.total_inr)}.`, [{ tool: "get_offer", args: { cart, prepaid: true } }]);
    }
    // ── home and category ──
    case "gift_under_2000": {
      const args = { query: "gift", occasion: "gifting", max_price_inr: 2000, limit: 3 };
      return step(`Gift picks under ₹2,000. Gift wrap is ${inr(pol.gift_wrap_inr)}, with a free note.`, [{ tool: "search_catalog", args }]);
    }
    case "office_earrings":
      return step("Earrings picked for office wear:", [{ tool: "search_catalog", args: { query: "", category: "earrings", occasion: "office", limit: 3 } }]);
    case "wedding_gifts":
      return step(`Wedding-guest picks. Gift wrap is ${inr(pol.gift_wrap_inr)}, with a free note.`, [{ tool: "search_catalog", args: { query: "", occasion: "wedding guest", limit: 3 } }]);
    case "minimal_studs":
      return step("Minimal studs for work:", [{ tool: "search_catalog", args: { query: "", category: "earrings", subtype: "stud", occasion: "office", limit: 3 } }]);
    case "steel_earrings":
      return step("Earrings that are stainless steel all the way through:", [{ tool: "search_catalog", args: { query: "", category: "earrings", base_metal: "stainless steel", limit: 3 } }]);
    case "need_by_friday": {
      const by = nextFridayIso();
      const args = { query: "", deliver_to_pincode: pin, deliver_by: by, limit: 3 };
      return step(`These arrive by ${dayLabel(new Date(`${by}T00:00:00Z`))}.${estimate}`, [{ tool: "search_catalog", args }]);
    }
    // ── bag ──
    case "order_arrival": {
      if (!cart.length) return step("Your bag is empty right now. Add a piece and I'll check the date.", []);
      const ds = cart.map((l) => core.checkDelivery(db, l.sku, pin)).filter((d): d is DeliveryResult => !("error" in d));
      if (!ds.length) return null;
      const last = ds.reduce((a, b) => (a.arrives_on >= b.arrives_on ? a : b));
      const text = `${ds.length > 1 ? "Everything in your bag arrives" : `The ${last.title} arrive${/s$/i.test(last.title) ? "" : "s"}`} by ${last.arrives_label} in ${last.city}.${estimate}`;
      return step(text, [{ tool: "check_delivery", args: { sku: last.sku, pincode: pin } }]);
    }
    // ── follow-ups ──
    case "under_2000": {
      const base = ctx.lastSearch?.args ?? (page ? { query: "", similar_to: page.handle, limit: 3 } : null);
      if (!base) return null; // home with no earlier search: the older template
      const args = { ...base, max_price_inr: 2000, limit: 3 };
      return search(args).length ? step("Here are some under ₹2,000:", [{ tool: "search_catalog", args }]) : step("Nothing like that under ₹2,000 right now.", []);
    }
    case "show_more": {
      if (!ctx.lastSearch) return null;
      const args = { ...ctx.lastSearch.args, exclude: [...((ctx.lastSearch.args.exclude as string[] | undefined) ?? []), ...ctx.lastSearch.skus], limit: 3 };
      return step(search(args).length ? "A few more:" : "That's everything that matches.", [{ tool: "search_catalog", args }]);
    }
    case "faster": {
      const d = ctx.lastDelivery;
      const p = d ? core.findProduct(db, d.sku) : null;
      if (!d?.deadline || !p) return null;
      const args = { query: "", similar_to: p.handle, category: p.metafields.jewellery.category, deliver_to_pincode: d.pincode, deliver_by: d.deadline, limit: 3 };
      return search(args).length
        ? step(`These arrive by ${formatDeadline(d.deadline)}:`, [{ tool: "search_catalog", args }])
        : step(`Nothing similar arrives by ${formatDeadline(d.deadline)}, sorry.`, []);
    }
    case "add_named": {
      const title = userText.replace(/^\s*add the\s+/i, "").replace(/\s+to (my )?bag\??\s*$/i, "").trim().toLowerCase();
      const p = db.products.find((x) => x.title.toLowerCase() === title);
      if (!p) return null;
      const r = core.addToBag(db, cart, p.handle, 1);
      return step(bagText(r), [{ tool: "add_to_bag", args: { sku: p.handle, qty: 1 } }]);
    }
    // answered by the older templates (LEGACY_TEXT)
    case "delivery": case "similar": case "metal": case "nickel": case "wedding_fit":
    case "find_gift": case "waterproof_pieces": case "delivery_returns":
      return null;
  }
}

/**
 * Quick answers from tools + templates (fast path, no API key, or every model failed): a templated lookup or the
 * guided-demo answer, with real tool outputs; else a pointer to the care team. `matched` says whether one applied.
 */
function offlineWriter(userText: string, pageSku: string | null, ctx: ChatContext, intent: QuickIntent = null) {
  const db = getDb();
  // a cached guided-demo answer applies only on the product it's about (its first tool's SKU), never on another page
  const cachedFor = (c: { trace: { args: Record<string, unknown> }[] }) => {
    const a = c.trace[0]?.args ?? {};
    return (a.sku as string | undefined) ?? (a.cart as { sku: string }[] | undefined)?.[0]?.sku ?? null;
  };
  const demoCached = db.demo.steps.find((s) => s.chip && s.cached_response && norm(s.chip) === norm(userText) && (!pageSku || cachedFor(s.cached_response) === pageSku))?.cached_response ?? null;
  // demo answers were cached with a known pincode; without one, a delivery answer still says it's a Pune estimate
  const estimateLine = " That's an estimate for Pune; share your pincode for an exact date.";
  const cached = demoCached && !ctx.pincode && !ctx.typedPincode && demoCached.trace.some((t) => t.tool === "check_delivery") && !/pincode/i.test(demoCached.text) ? { ...demoCached, text: demoCached.text + estimateLine } : demoCached;
  // "Show me other products" (4th prompt tile): similar pieces to the page product, computed by the real tool
  const page = pageSku ? core.findProduct(db, pageSku) : null;
  // chip wording (chips.ts) → the fast-path key; older templates below match on their canonical text
  const fk = fastKey(userText);
  const q = (fk && LEGACY_TEXT[fk]) || norm(userText);
  const fastStep = fk ? fastTemplate(fk, page, ctx, userText) : null;
  const step =
    fastStep ? fastStep
    : cached ? { cached_response: cached }
    : !page && STORE_CHIPS[q] ? { cached_response: STORE_CHIPS[q](db) }
    : q === "show me other products" && page
      ? { cached_response: { text: `Here are a few similar pieces.`, cards: [], trace: [{ tool: "search_catalog", args: { query: page.metafields.jewellery.subtype, similar_to: page.handle, limit: 3 } as Record<string, unknown> }] } }
      : q === "when will it be delivered" && page
        ? (() => {
            // tier 0: approx city from IP → Pune; the exact date is computed by check_delivery
            const pin = ctx.pincode ?? "411038";
            const d = core.checkDelivery(db, page.handle, pin);
            const nudge = ctx.loggedIn && ctx.rtoRisk === "high" ? " Check your online offers at checkout. Store caps apply." : "";
            const text = ctx.pincode
              ? `It arrives ${"error" in d ? "" : d.arrives_label} at your saved address in ${"error" in d ? "" : d.city} if you order before 2pm today.${nudge}`
              : `It arrives ${"error" in d ? "" : d.arrives_label} in ${"error" in d ? "" : d.city} if you order before 2pm today. Share your pincode for an exact date.`;
            return "error" in d ? null : { cached_response: { text, cards: [], trace: [{ tool: "check_delivery", args: { sku: page.handle, pincode: pin } as Record<string, unknown> }] } };
          })()
        : /^(any offers|any offers on this|koi offer hai kya)/.test(q) && page
          ? (() => {
              const o = core.getOffer(db, [{ sku: page.handle, qty: 1 }], { prepaid: true, logged_in: !!ctx.loggedIn, rto_risk: ctx.rtoRisk });
              const lines = o.applied.map((a) => `${a.label} (−₹${a.amount_inr.toLocaleString("en-IN")})`).join("; ");
              const extra = ctx.loggedIn && ctx.rtoRisk === "high" ? " Cash on delivery doesn't get these offers." : "";
              return { cached_response: { text: `Pay online and you get: ${lines || "no offers right now"}. ${o.wallet.usable_inr > 0 ? `With your ₹${o.wallet.usable_inr.toLocaleString("en-IN")} wallet, you'd` : "You'd"} pay ₹${o.total_inr.toLocaleString("en-IN")}.${extra}`, cards: [], trace: [{ tool: "get_offer", args: { cart: [{ sku: page.handle, qty: 1 }], prepaid: true } as Record<string, unknown> }] } };
            })()
        : ["what metal is this", "is it nickelfree", "is it nickel free", "are these nickelfree", "are these nickel free"].includes(q) && page
          ? (() => {
              // answered from verified metafields only: the metal, and nickel_free (steel contains some nickel)
              const j = page.metafields.jewellery;
              const metal = { "stainless steel": "stainless steel", "925 silver": "sterling silver", brass: "brass" }[j.base_metal];
              const finish = j.plating === "18k gold plating" ? "18K gold plating" : j.plating === "gold vermeil" ? "gold vermeil" : j.plating ?? "a gold-toned finish";
              const verb = /s$/i.test(page.title) ? "are" : "is";
              if (q === "what metal is this")
                return { cached_response: { text: `${verb === "are" ? "They're" : "It's"} ${metal} all the way through, with ${finish}.`, cards: [], trace: [] } };
              const text = `${core.nickelAnswer(page)} Our care team can help too.`;
              return { cached_response: { text, cards: [], trace: [{ tool: "handoff", args: { reason: "nickel / sensitive-ears question" } as Record<string, unknown> }] } };
            })()
        : (q === "suitable for wedding gift" || q === "is gift wrap available") && page
          ? (() => {
              // answered from verified occasions + store policy (no numbers invented)
              const j = page.metafields.jewellery;
              const pol = db.brand.policies;
              const fits = j.occasions.includes("wedding guest") || j.occasions.includes("gifting");
              const wrap = `Gift wrap is ₹${pol.gift_wrap_inr} and a note is free. Returns are open for ${pol.return_window_days} days.`;
              const isGiftWrap = q === "is gift wrap available";
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
      case "handoff": return core.handoff(db, a.reason, handoffKind(userText), page);
      case "update_preferences": return { saved: true, preferences: a, why: `Saved (quick answer): ${Object.entries(a).map(([k, v]) => `${k}=${v}`).join(", ")}` };
      case "lookup_policy": return core.lookupPolicy(db, a.topic);
      case "get_product_facts": return core.getProductFacts(db, a.sku);
      case "add_to_bag": return core.addToBag(db, ctx.cart ?? [], a.sku, a.qty);
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
          const t0 = Date.now();
          const output = run(t);
          writer.write({ type: "tool-input-available", toolCallId, toolName: t.tool, input: t.args });
          writer.write({ type: "tool-output-available", toolCallId, output });
          writeToolParts(writer, t.tool, t.args, output, Date.now() - t0, "code");
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
