/**
 * Offline pipeline model access via the Vercel AI SDK. Model, thinking level and fallback come from
 * src/lib/ai/model.ts (Gemini 3.8 Flash, medium thinking; Gemini 3.1 Flash-Lite if it fails). Without a key, stages
 * fall back to a rule-based "heuristic" mode and say so in their output's `producer` block. Pass --heuristic to force it.
 *
 * Cache: each LLM output is stored in .cache/pipelines/<sha256 of model, prompt version, system, prompt, schema>.json,
 * so re-running with unchanged inputs makes no API call. Pass --force to ignore the cache. Each run prints its
 * estimated cost (tokens × list price from src/lib/ai/model.ts).
 *
 * --dry-run: no API calls and no writes. Each would-be call is estimated (characters/4, images at a fixed token
 * count, output as a share of input plus a thinking allowance) and skipped; the stage then runs its rule-based
 * branch so later stages can still build their prompts. Prints the estimated calls, tokens and cost.
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
export const dryRun = process.argv.includes("--dry-run");
const RUN_AT = new Date().toISOString();
class DryRunSkip extends Error {}
export const isDryRun = (e: unknown) => e instanceof DryRunSkip;
const IMAGE_TOKENS = 560; // estimate per photo at medium media resolution
const estimates: { version: string; inTok: number; outTok: number; images: number }[] = [];
export const PIPELINE_MODEL = llm?.modelId ?? null;
export const useLlm = !!llm;
const fallbackLlm = llm ? pickFallbackLlm(llm) : null;
/** Models that actually produced output this run, per prompt version (the fallback only appears where it was used). */
const modelsByVersion = new Map<string, Set<string>>();
const noteModel = (version: string, model: string) => modelsByVersion.set(version, (modelsByVersion.get(version) ?? new Set()).add(model));
/** Stage stamp: that stage's models; enrichment includes its vision calls; a code-only stage lists every model that fed it. */
function stageModels(promptVersion: string) {
  const own = new Set([...(modelsByVersion.get(promptVersion) ?? []), ...(promptVersion === "enrich-v1" ? modelsByVersion.get("vision-v1") ?? [] : [])]);
  const all = new Set([...modelsByVersion.values()].flatMap((x) => [...x]));
  return [...(own.size ? own : all)].join(" + ") || PIPELINE_MODEL;
}
export const forceRefresh = process.argv.includes("--force");
const CACHE_DIR = join(process.cwd(), ".cache", "pipelines");
const run = { calls: 0, cacheHits: 0, costUsd: 0, unpriced: 0 };

export function printRunCost() {
  if (!useLlm) return;
  if (dryRun) {
    const price = estimateCostUsd(PIPELINE_MODEL!, 1e6, 0)!, priceOut = estimateCostUsd(PIPELINE_MODEL!, 0, 1e6)!;
    const by = new Map<string, { calls: number; inTok: number; outTok: number; images: number }>();
    for (const e of estimates) {
      const b = by.get(e.version) ?? { calls: 0, inTok: 0, outTok: 0, images: 0 };
      b.calls++; b.inTok += e.inTok; b.outTok += e.outTok; b.images += e.images;
      by.set(e.version, b);
    }
    console.log(`\n  DRY RUN (no API calls, nothing written) · model ${PIPELINE_MODEL} · $${price}/1M in, $${priceOut}/1M out`);
    let tin = 0, tout = 0, calls = 0;
    for (const [v, b] of by) {
      tin += b.inTok; tout += b.outTok; calls += b.calls;
      console.log(`    ${v.padEnd(12)} ${String(b.calls).padStart(3)} call(s) · ~${b.inTok.toLocaleString()} in${b.images ? ` (incl. ${b.images} photos)` : ""} · ~${b.outTok.toLocaleString()} out (incl. thinking)`);
    }
    const cost = (tin * price + tout * priceOut) / 1e6;
    console.log(`    total       ${String(calls).padStart(3)} call(s) · ~${tin.toLocaleString()} in · ~${tout.toLocaleString()} out · estimated $${cost.toFixed(3)} (allow up to ~$${(cost * 2).toFixed(3)}: thinking length varies)`);
    return;
  }
  console.log(`  LLM calls: ${run.calls} (cache hits: ${run.cacheHits}) · estimated cost this run: $${run.costUsd.toFixed(4)}${run.unpriced ? ` (+${run.unpriced} call(s) on a model without a recorded price)` : ""}`);
}

export function producer(stage: string, promptVersion: string) {
  return {
    stage,
    mode: (useLlm && !dryRun ? "ai" : "heuristic") as "ai" | "heuristic",
    model: useLlm && !dryRun ? stageModels(promptVersion) : null,
    prompt_version: promptVersion,
    run_at: useLlm && !dryRun ? RUN_AT : null,
    note: useLlm ? "AI output; attributes are unverified until the brand confirms them." : "Rule-based fallback (no API key). Add GOOGLE_GENERATIVE_AI_API_KEY to .env.local and re-run `npm run pipelines` for the AI version.",
  };
}

export async function llmObject<T extends z.ZodTypeAny>(promptVersion: string, schema: T, system: string, prompt: string, images: string[] = []): Promise<z.infer<T>> {
  const imageData = images.map((f) => readFileSync(join(process.cwd(), "public", f)));
  const imageHashes = imageData.map((b) => createHash("sha256").update(b).digest("hex"));
  const key = createHash("sha256").update(JSON.stringify([llm!.modelId, promptVersion, system, prompt, JSON.stringify(schema.def ?? schema), imageHashes])).digest("hex");
  const file = join(CACHE_DIR, `${key}.json`);
  if (!forceRefresh && existsSync(file)) {
    const hit = JSON.parse(readFileSync(file, "utf8")) as { model: string; output: z.infer<T> };
    run.cacheHits++;
    noteModel(promptVersion, hit.model);
    console.log(`    llm: cache hit (${hit.model}, ${promptVersion}) · $0`);
    return hit.output;
  }
  if (dryRun) {
    const inTok = Math.ceil((system.length + prompt.length) / 4) + images.length * IMAGE_TOKENS;
    estimates.push({ version: promptVersion, inTok, outTok: Math.min(PIPELINE.maxOutputTokens, Math.ceil(inTok * 0.35)) + 1500, images: images.length });
    throw new DryRunSkip(promptVersion);
  }
  const call = (m: Llm) => {
    const opts = llmSettings(m);
    if (images.length && m.provider === "google") (opts.providerOptions.google as Record<string, unknown>).mediaResolution = "MEDIA_RESOLUTION_MEDIUM";
    return images.length
      ? generateText({ model: m.model, system, messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageData.map((b) => ({ type: "file" as const, data: b, mediaType: "image/jpeg" }))] }], output: Output.object({ schema }), ...opts, maxOutputTokens: PIPELINE.maxOutputTokens, seed: PIPELINE.seed, maxRetries: PIPELINE.maxRetries })
      : generateText({ model: m.model, system, prompt, output: Output.object({ schema }), ...opts, maxOutputTokens: PIPELINE.maxOutputTokens, seed: PIPELINE.seed, maxRetries: PIPELINE.maxRetries });
  };
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
  noteModel(promptVersion, m.modelId);
  const cost = estimateCostUsd(m.modelId, res.usage.inputTokens ?? 0, res.usage.outputTokens ?? 0);
  run.calls++;
  if (cost === null) run.unpriced++;
  else run.costUsd += cost;
  console.log(`    llm: ${m.modelId} · ${res.usage.inputTokens ?? "?"} in / ${res.usage.outputTokens ?? "?"} out tokens · ~$${cost?.toFixed(4) ?? "?"}`);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify({ model: m.modelId, prompt_version: promptVersion, created: new Date().toISOString(), output: res.output }, null, 2));
  return res.output as z.infer<T>;
}
