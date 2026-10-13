/**
 * Judge re-check (C8): re-score replies from a saved run with the current rubric, without calling the agent.
 *   npm run evals:rejudge -- --from v1 --ids claim-01,hing-01
 *   --write: store the new verdicts in that run file (e.g. cases the judge couldn't score because of a quota),
 *   then npm run evals:report rebuilds the summary and docs/EVALS.md
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JUDGE_RUBRIC } from "./rubric";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const ROOT = join(__dirname, "..", "..");

type Result = { id: string; reply: string; tools: string[]; pass: boolean; rule_pass: boolean; judge: { verdict: string; tone: number; helpfulness: number; reason: string } | null; judge_error?: string | null; judge_cost_usd?: number | null };
type Case = { id: string; category: string; messages: { content: string }[]; judge_rubric: string | null };

(async () => {
  const { generateText, Output } = await import("ai");
  const { z } = await import("zod");
  const { pickLlm, llmSettings, estimateCostUsd } = await import("../../src/lib/ai/model");
  const from = arg("from") ?? "v1";
  const ids = (arg("ids") ?? "").split(",").filter(Boolean);
  const run = JSON.parse(readFileSync(join(ROOT, `evals/results/${from}.json`), "utf8")) as { results: Result[] };
  const cases = (JSON.parse(readFileSync(join(ROOT, "evals/cases.json"), "utf8")) as { cases: Case[] }).cases;
  const judge = pickLlm("judge");
  if (!judge) throw new Error("no judge model (API key missing)");
  const Verdict = z.object({ tone: z.number().min(1).max(5), helpfulness: z.number().min(1).max(5), verdict: z.enum(["pass", "fail"]), reason: z.string() });
  let cost = 0;
  for (const id of ids) {
    const r = run.results.find((x) => x.id === id);
    const c = cases.find((x) => x.id === id);
    if (!r || !c) {
      console.log(`${id}: not found`);
      continue;
    }
    const out = await generateText({
      model: judge.model,
      system: JUDGE_RUBRIC,
      prompt: JSON.stringify({ category: c.category, shopper: c.messages.map((m) => m.content).join(" / "), assistant_reply: r.reply, tools_called: r.tools, case_rubric: c.judge_rubric }),
      output: Output.object({ schema: Verdict }),
      ...llmSettings(judge),
      seed: 7,
      maxOutputTokens: 2000,
      maxRetries: 1,
      timeout: 60000,
    });
    const caseCost = estimateCostUsd(judge.modelId, out.usage.inputTokens ?? 0, out.usage.outputTokens ?? 0) ?? 0;
    cost += caseCost;
    const v = out.output;
    if (process.argv.includes("--write")) {
      r.judge = v;
      r.judge_error = null;
      r.judge_cost_usd = caseCost;
      r.pass = r.rule_pass && v.verdict === "pass";
    }
    console.log(`${id} (${from} reply): ${r.reply}\n  ${from} judge: ${r.judge ? `${r.judge.verdict} tone ${r.judge.tone} / help ${r.judge.helpfulness}: ${r.judge.reason}` : "none"}\n  current rubric: ${v.verdict} tone ${v.tone} / help ${v.helpfulness}: ${v.reason}`);
  }
  if (process.argv.includes("--write")) {
    writeFileSync(join(ROOT, `evals/results/${from}.json`), JSON.stringify(run, null, 2) + "\n");
    console.log(`updated evals/results/${from}.json; run npm run evals:report`);
  }
  console.log(`judge ${judge.modelId} · $${cost.toFixed(4)}`);
})();
