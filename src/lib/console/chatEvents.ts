"use client";
/**
 * Chat → AI console. Maps what the chat already receives (the shopper's message and the route's data parts:
 * data-tool, data-guard, data-usage, data-cart, data-preferences) to console events. Structured decisions only:
 * the tool's why line, its arguments and result summary, guardrail outcomes and usage. Never model reasoning or
 * the system prompt. No-ops unless the console is listening.
 */
import { abuseCheck } from "@/lib/agent/abuse";
import { redact } from "@/lib/agent/guardrails";
import { clip, consoleListening, emit, markChatBag } from "./emit";

type Part = { type: string; data?: unknown };

const ROUTE: Record<string, { title: string; status: "ok" | "caught" | "fallback" | "info"; source: "ai" | "code" | "rule" }> = {
  fast_path: { title: "Fast path · answered by code, no AI · ₹0", status: "ok", source: "code" },
  llm: { title: "LLM answer (main model)", status: "ok", source: "ai" },
  llm_fallback: { title: "LLM answer (fallback model)", status: "fallback", source: "ai" },
  abuse: { title: "Blocked by guardrail: abuse filter (no model call)", status: "caught", source: "rule" },
  safety_handoff: { title: "Safety handoff answered in code (no model call)", status: "ok", source: "rule" },
  care_line: { title: "Unknown policy → exact care line (no model call)", status: "ok", source: "rule" },
  limited: { title: "Quick answer (model unavailable or busy)", status: "fallback", source: "code" },
  input_rejected: { title: "Input rejected (text only, 500 characters)", status: "caught", source: "rule" },
  safety: { title: "Gemini safety block → polite decline", status: "caught", source: "ai" },
};

/** The shopper's message: redacted, and never the text of a blocked (abusive) message. */
export function consoleMessage(text: string) {
  if (!consoleListening()) return;
  const blocked = abuseCheck(text).hit;
  emit({ journey_step: "chat", kind: "message", title: blocked ? "Shopper: [blocked message]" : `Shopper: "${clip(redact(text), 110)}"`, source: "session", status: "info" });
}

export function consoleData(part: Part) {
  if (!consoleListening() || !part.type.startsWith("data-")) return;
  const d = (part.data ?? {}) as Record<string, unknown>;
  if (part.type === "data-tool") {
    const args = Object.entries((d.args ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${clip(v, 40)}`).join(", ");
    emit({
      journey_step: "chat",
      kind: "tool",
      title: `${d.tool}(${clip(args, 70)}) → ${clip(d.result_summary, 60)}`,
      detail: `Decision: ${d.why || "—"}`,
      source: d.source === "code" ? "code" : "ai",
      status: "ok",
      latency_ms: Number(d.latency_ms) || 0,
      data: { trigger: d.source === "code" ? "chosen by code (fast path or forced)" : "chosen by the model", tool: d.tool, args: d.args, result: d.result_summary, why: d.why },
    });
  } else if (part.type === "data-guard") {
    const name = String(d.name);
    if (name === "routed intent") {
      const forced = /^forced (\w+)/.exec(String(d.detail))?.[1];
      emit({ journey_step: "chat", kind: "forced", title: forced ? `Forced tool: ${forced} (rule in code)` : "No forced tool: the model chooses", detail: forced ? "An intent rule (src/lib/agent/intents.ts) matched the message" : undefined, source: forced ? "rule" : "ai", status: "info" });
      return;
    }
    const caught = d.pass === false;
    const claim = name === "verified claims only" && caught ? String(d.detail).replace(/^unverified claim: /, "") : null;
    emit({
      journey_step: "chat",
      kind: "guard",
      title: claim ? `Claim check caught "${claim}"` : `${name}: ${caught ? "caught" : "passed"}`,
      detail: name === "abuse filter" || name === "injection patterns" ? String(d.detail).replace(/text:.*/, "") : clip(d.detail, 140),
      source: "rule",
      status: caught ? "caught" : "ok",
      data: { stage: d.stage, check: name },
    });
  } else if (part.type === "data-usage") {
    const r = ROUTE[String(d.mode)] ?? { title: `Answered (${d.mode})`, status: "info" as const, source: "code" as const };
    const tokens = (Number(d.tokens_in) || 0) + (Number(d.tokens_out) || 0);
    emit({
      journey_step: "chat",
      kind: "usage",
      title: r.title,
      detail: String(d.mode).startsWith("llm") ? `${d.model} · ${tokens.toLocaleString("en-IN")} tokens · $${Number(d.cost_usd ?? 0).toFixed(5)} · first token ${d.first_output_ms ?? "–"}ms` : "0 tokens · $0",
      source: r.source,
      status: r.status,
      latency_ms: Number(d.latency_ms) || 0,
      data: { mode: d.mode, model: d.model, tokens, tokens_in: d.tokens_in, tokens_out: d.tokens_out, cost_usd: d.cost_usd ?? 0, first_output_ms: d.first_output_ms, llm: String(d.mode).startsWith("llm") },
    });
  } else if (part.type === "data-cart") {
    markChatBag();
    const a = d.added as { title?: string; qty?: number } | undefined;
    emit({ journey_step: "action", kind: "chat_bag", title: `Chat added ${a?.qty ?? 1} × ${a?.title ?? "item"} to the bag`, detail: "add_to_bag runs only on a clear request (code-gated)", source: "code", status: "ok" });
  } else if (part.type === "data-preferences") {
    const prefs = Object.entries((d.preferences ?? {}) as Record<string, unknown>).map(([k, v]) => `${k} ${v}`).join(", ");
    emit({ journey_step: "action", kind: "preferences", title: `Preferences updated: ${clip(prefs, 80)}`, detail: "Extracted from the chat, saved for this session (cookie)", source: "session", status: "ok" });
  }
}
