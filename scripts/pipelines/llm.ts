/**
 * Offline pipeline model access via the Vercel AI SDK. Model, thinking level and fallback come from
 * src/lib/ai/model.ts (Gemini 3.8 Flash, medium thinking; Gemini 3.1 Flash-Lite if it fails). Without a key, stages
 * fall back to a rule-based "heuristic" mode and say so in their output's `producer` block. Pass --heuristic to force it.
 *
 * Cache: each LLM output is stored in .cache/pipelines/<sha256 of model, prompt version, system, prompt, schema>.json,
 * so re-running with unchanged inputs makes no API call. Pass --force to ignore the cache. Each run prints its
 * estimated cost (tokens × list price from src/lib/ai/model.ts).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, Output } from "ai";
import type { z } from "zod";
import { PIPELINE, estimateCostUsd, llmSettings, pickFallbackLlm, pickLlm, type Llm } from "../../src/lib/ai/model";

// tsx doesn't read env files the way `next dev` does, so load them here (missing files are fine)
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}

const llm = process.argv.includes("--heuristic") ? null : pickLlm("pipeline");
export const PIPELINE_MODEL = llm?.modelId ?? null;
export const useLlm = !!llm;
const fallbackLlm = llm ? pickFallbackLlm(llm) : null;
/** Models that actually produced output this run (the fallback only appears if the main model failed). */
const modelsUsed = new Set<string>();
export const forceRefresh = process.argv.includes("--force");
const CACHE_DIR = join(process.cwd(), ".cache", "pipelines");
const run = { calls: 0, cacheHits: 0, costUsd: 0, unpriced: 0 };

export function printRunCost() {
  if (!useLlm) return;
  console.log(`  LLM calls: ${run.calls} (cache hits: ${run.cacheHits}) · estimated cost this run: $${run.costUsd.toFixed(4)}${run.unpriced ? ` (+${run.unpriced} call(s) on a model without a recorded price)` : ""}`);
}

export function producer(stage: string, promptVersion: string) {
  return {
    stage,
    mode: (useLlm ? "llm" : "heuristic") as "llm" | "heuristic",
    model: useLlm ? [...modelsUsed].join(" + ") || PIPELINE_MODEL : null,
    prompt_version: promptVersion,
    note: useLlm ? "AI output; attributes are unverified until the brand confirms them." : "Rule-based fallback (no API key). Add GOOGLE_GENERATIVE_AI_API_KEY to .env.local and re-run `npm run pipelines` for the AI version.",
  };
}

export async function llmObject<T extends z.ZodTypeAny>(promptVersion: string, schema: T, system: string, prompt: string): Promise<z.infer<T>> {
  const key = createHash("sha256").update(JSON.stringify([llm!.modelId, promptVersion, system, prompt, JSON.stringify(schema.def ?? schema)])).digest("hex");
  const file = join(CACHE_DIR, `${key}.json`);
  if (!forceRefresh && existsSync(file)) {
    const hit = JSON.parse(readFileSync(file, "utf8")) as { model: string; output: z.infer<T> };
    run.cacheHits++;
    modelsUsed.add(hit.model);
    console.log(`    llm: cache hit (${hit.model}, ${promptVersion}) · $0`);
    return hit.output;
  }
  const call = (m: Llm) => generateText({ model: m.model, system, prompt, output: Output.object({ schema }), ...llmSettings(m), maxOutputTokens: PIPELINE.maxOutputTokens, seed: PIPELINE.seed, maxRetries: PIPELINE.maxRetries });
  let m = llm!;
  let res: Awaited<ReturnType<typeof call>>;
  try {
    res = await call(m);
  } catch (e) {
    if (!fallbackLlm) throw e;
    console.warn(`    ${m.modelId} failed (${(e as Error).message.split("\n")[0]}); trying ${fallbackLlm.modelId}`);
    m = fallbackLlm;
    res = await call(m);
  }
  modelsUsed.add(m.modelId);
  const cost = estimateCostUsd(m.modelId, res.usage.inputTokens ?? 0, res.usage.outputTokens ?? 0);
  run.calls++;
  if (cost === null) run.unpriced++;
  else run.costUsd += cost;
  console.log(`    llm: ${m.modelId} · ${res.usage.inputTokens ?? "?"} in / ${res.usage.outputTokens ?? "?"} out tokens · ~$${cost?.toFixed(4) ?? "?"}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify({ model: m.modelId, prompt_version: promptVersion, created: new Date().toISOString(), output: res.output }, null, 2));
  return res.output as z.infer<T>;
}
