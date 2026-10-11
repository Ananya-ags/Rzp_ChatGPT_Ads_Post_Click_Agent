/**
 * Offline pipeline model access. Uses Claude Opus 5.5 (strong model) via the Vercel AI SDK when
 * ANTHROPIC_API_KEY is set; otherwise stages fall back to a rule-based "heuristic" mode and say so
 * in their output's `producer` block. Pass --heuristic to force the fallback.
 */
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { z } from "zod";

export const PIPELINE_MODEL = "claude-opus-5-5";
export const useLlm = !!process.env.ANTHROPIC_API_KEY && !process.argv.includes("--heuristic");

export function producer(stage: string, promptVersion: string) {
  return {
    stage,
    mode: (useLlm ? "llm" : "heuristic") as "llm" | "heuristic",
    model: useLlm ? PIPELINE_MODEL : null,
    prompt_version: promptVersion,
    note: useLlm ? "AI output; attributes are unverified until the brand confirms them." : "Rule-based fallback (no API key). Re-run `npm run pipelines` with ANTHROPIC_API_KEY for the AI version.",
  };
}

export async function llmObject<T extends z.ZodTypeAny>(schema: T, system: string, prompt: string): Promise<z.infer<T>> {
  const { output, usage } = await generateText({
    model: anthropic(PIPELINE_MODEL),
    system,
    prompt,
    output: Output.object({ schema }),
    providerOptions: { anthropic: { effort: "medium" } },
    maxOutputTokens: 16000,
  });
  console.log(`    llm: ${usage.inputTokens ?? "?"} in / ${usage.outputTokens ?? "?"} out tokens`);
  return output as z.infer<T>;
}
