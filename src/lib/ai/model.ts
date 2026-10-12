/**
 * Every model ID, setting and price in one place (shared by the chat agent, offline pipelines and checks).
 * Keys stay server-side. Order of preference:
 *   1. Gemini when GOOGLE_GENERATIVE_AI_API_KEY is set
 *   2. Anthropic when ANTHROPIC_API_KEY is set (kept as an alternative)
 *   3. Neither: null, and callers fall back (agent → fast path / cached answers, pipelines → heuristic mode)
 * A placeholder such as "paste_your_key_here" counts as no key. Env vars can override the model IDs.
 */
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel, streamText } from "ai";

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]["providerOptions"]>;
export type Role = "agent" | "agent_fallback" | "pipeline" | "pipeline_fallback" | "judge";

/**
 * Gemini model per role (decided 13 Oct 2026; see BUILD_LOG). 3.8 Flash was overloaded at test time (one call took
 * 210s with retries, then hit the free-tier quota), so the live agent runs on 3.1 Flash-Lite and fails over to
 * 3.8 Flash: a deliberate latency-vs-accuracy choice, since tools and code do the computing. 2.5 Flash is listed
 * but closed to new API users.
 */
export const GEMINI_MODELS: Record<Role, string> = {
  agent: process.env.GEMINI_MODEL || "gemini-3.1-flash-lite",
  agent_fallback: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash",
  pipeline: process.env.GEMINI_PIPELINE_MODEL || "gemini-3.8-flash",
  pipeline_fallback: process.env.GEMINI_PIPELINE_FALLBACK_MODEL || "gemini-3.5-flash-lite",
  // eval judge: a different (Pro) tier from the agent, for later. On 13 Oct 2026 no Pro model was callable on the
  // free tier (2.5 Pro is closed to new users; pro-latest and 3.1 Pro returned 429), so this needs billing first.
  judge: process.env.GEMINI_JUDGE_MODEL || "gemini-pro-latest",
};

/**
 * Thinking level per role (Gemini 3.x; 2.x uses a token budget instead). 3.1 Flash-Lite accepts "minimal";
 * 3.8 Flash rejects it ("Thinking level MINIMAL is not supported for this model"), so the fallback uses "low",
 * and any other model that rejects "minimal" gets "low" too.
 */
const THINKING: Record<Role, "minimal" | "low" | "medium" | "high"> = { agent: "minimal", agent_fallback: "low", pipeline: "medium", pipeline_fallback: "medium", judge: "low" };
const NO_MINIMAL = /^gemini-3\.8-flash$/;

/**
 * List prices, USD per 1M tokens (standard paid tier, text; output includes thinking), from
 * ai.google.dev/gemini-api/docs/pricing on 13 Oct 2026. Re-check before quoting: 3.8 Flash doubles from 1 Jan 2027.
 */
export const COST: Record<string, { in: number; out: number }> = {
  "gemini-3.8-flash": { in: 0.75, out: 3.75 },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};

/**
 * Agent call settings (plan §3). Fail fast: no retries, and a slow or overloaded call fails over to the fallback.
 * Grounding comes from tools, verified flags and output checks, not temperature.
 */
export const AGENT = { maxOutputTokens: 800, seed: 7, maxSteps: 5, maxRetries: 0, historyMessages: 10, timeout: { stepMs: 8000, firstChunkMs: 5000, totalMs: 20000 } } as const;
/** Offline pipelines: latency doesn't matter, so normal retries (SDK default 2). */
export const PIPELINE = { maxOutputTokens: 16000, seed: 7, maxRetries: 2 } as const;

/** Daily LLM spend cap (USD, estimated from tokens × COST). Above it the agent uses quick answers until tomorrow. */
export const dailyBudgetUsd = () => Number(process.env.LLM_DAILY_BUDGET_USD) || 1.5;
/** Estimated cost of a call from its token usage, or null when the model's price isn't recorded. */
export const estimateCostUsd = (modelId: string, tokensIn: number, tokensOut: number) => {
  const c = COST[modelId];
  return c ? (tokensIn * c.in + tokensOut * c.out) / 1e6 : null;
};

export type Llm = {
  provider: "google" | "anthropic";
  role: Role;
  modelId: string;
  model: LanguageModel;
  /** USD per 1M tokens; null when unknown */
  costPerM: { in: number; out: number } | null;
};

const hasKey = (v: string | undefined) => !!v && !/^\s*$|paste_your_key_here|your[_-]?key/i.test(v);
export const geminiKeySet = () => hasKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

function gemini(role: Role): Llm {
  const id = GEMINI_MODELS[role];
  return { provider: "google", role, modelId: id, model: google(id), costPerM: COST[id] ?? null };
}

/** The model for a role, or null with no usable key. */
export function pickLlm(role: "agent" | "pipeline" | "judge"): Llm | null {
  if (geminiKeySet()) return gemini(role);
  if (hasKey(process.env.ANTHROPIC_API_KEY)) {
    const id = role === "agent" ? "claude-haiku-5-5" : "claude-opus-5-5";
    return { provider: "anthropic", role, modelId: id, model: anthropic(id), costPerM: COST[id] ?? null };
  }
  return null;
}

/** The model to try when the main one fails before answering (503, 429, timeout, empty reply). Gemini only. */
export function pickFallbackLlm(primary: Llm): Llm | null {
  if (primary.provider !== "google") return null;
  // agent (3.1 Flash-Lite) → 3.8 Flash; pipelines (3.8 Flash) → 3.5 Flash-Lite
  const fb = gemini(primary.role === "pipeline" ? "pipeline_fallback" : "agent_fallback");
  return fb.modelId === primary.modelId ? null : fb;
}

/**
 * Provider settings.
 * - Gemini 3.x: default temperature (Google advises against lowering it; it can cause looping) and a thinking level.
 * - Gemini 2.x: temperature 0.2 and a thinking budget (0 = off for the live agent).
 * - Both: default topP/topK and default safety settings. Google Search grounding, URL context and code execution
 *   are built-in tools that are never added, so they stay off.
 * - Anthropic: low effort for the agent, medium for pipelines.
 */
export function llmSettings(llm: Llm): { temperature?: number; providerOptions: ProviderOptions } {
  const live = llm.role === "agent" || llm.role === "agent_fallback"; // pipeline/judge roles are offline
  if (llm.provider === "google") {
    if (/^gemini-2\./.test(llm.modelId)) return { temperature: 0.2, providerOptions: { google: { thinkingConfig: { thinkingBudget: live ? 0 : 1024 } } } };
    const wanted = THINKING[llm.role];
    const thinkingLevel = wanted === "minimal" && NO_MINIMAL.test(llm.modelId) ? "low" : wanted;
    return { providerOptions: { google: { thinkingConfig: { thinkingLevel } } } };
  }
  return { providerOptions: { anthropic: { effort: live ? "low" : "medium" } } };
}
