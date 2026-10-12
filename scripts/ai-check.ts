/**
 * `npm run ai:check`: shows which model each role uses (agent, agent fallback, pipeline, judge) and sends one tiny
 * prompt to each, with the same settings the app uses. Never prints the key.
 */
import { generateText } from "ai";
import { llmSettings, pickFallbackLlm, pickLlm, type Llm } from "../src/lib/ai/model";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}

(async () => {
  const agent = pickLlm("agent");
  const roles: [string, Llm | null][] = [
    ["agent", agent],
    ["agent fallback", agent ? pickFallbackLlm(agent) : null],
    ["pipeline", pickLlm("pipeline")],
    ["pipeline fallback", (() => { const p = pickLlm("pipeline"); return p ? pickFallbackLlm(p) : null; })()],
    ["judge", pickLlm("judge")],
  ];
  if (!agent) console.log("No API key found (or still the placeholder): the agent uses fast-path/cached answers and pipelines run in heuristic mode.");
  for (const [label, llm] of roles) {
    if (!llm) continue;
    const t = Date.now();
    try {
      const { text, usage } = await generateText({ model: llm.model, prompt: "Reply with the single word OK.", maxOutputTokens: 800, seed: 7, maxRetries: 0, timeout: 30000, ...llmSettings(llm) });
      console.log(`${label.padEnd(18)} ${llm.provider} ${llm.modelId.padEnd(22)} → "${text.trim()}" in ${Date.now() - t}ms · ${usage.inputTokens ?? "?"} in / ${usage.outputTokens ?? "?"} out ✓`);
    } catch (e) {
      console.log(`${label.padEnd(18)} ${llm.provider} ${llm.modelId.padEnd(22)} → FAILED after ${Date.now() - t}ms: ${(e as Error).message.split("\n")[0].slice(0, 140)}`);
      process.exitCode = 1;
    }
  }
})();
