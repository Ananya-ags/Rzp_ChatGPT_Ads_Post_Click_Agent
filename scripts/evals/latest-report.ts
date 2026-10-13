import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CATEGORY_CHECKS, GATED, HIDE_TEXT } from "./narrative";

const ResultSchema = z.object({
  id: z.string(), category: z.string(), pass: z.boolean(), rule_pass: z.boolean(),
  rule_failures: z.array(z.string()), reply: z.string(), latency_ms: z.number().nonnegative(),
  model: z.string().nullable(), mode: z.string().nullable(),
  judge: z.object({ verdict: z.enum(["pass", "fail"]), reason: z.string() }).nullable(),
  judge_error: z.string().nullable().optional(),
});
export const ReportRunSchema = z.object({
  run: z.string(), run_at: z.string(), commit: z.string(),
  agent_model: z.string(), fallback_model: z.string(), judge_model: z.string().nullable(),
  total: z.object({ agent_cost_usd: z.number(), judge_cost_usd: z.number().nullable() }),
  results: z.array(ResultSchema).min(1),
});
export const ReportCasesSchema = z.object({
  cases: z.array(z.object({
    id: z.string(), category: z.string(), judge: z.boolean(),
    messages: z.array(z.object({ content: z.string() })),
  })),
});
type Run = z.infer<typeof ReportRunSchema>;
type Case = z.infer<typeof ReportCasesSchema>["cases"][number];
const read = (root: string, file: string): unknown => JSON.parse(readFileSync(join(root, file), "utf8"));
const percent = (n: number, total: number) => total ? `${(100 * n / total).toFixed(1)}%` : "n/a";
const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()).replace(/chatgpt/i, "ChatGPT");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const money = (n: number | null) => n === null ? "unknown" : `$${n.toFixed(4)}`;
const fraction = (pass: number, total: number) => `${pass}/${total}`;
const quantile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];

export function summarizeReportRun(run: Run, cases: Case[]) {
  const ids = run.results.map((r) => r.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate result IDs");
  if (new Set(cases.map((c) => c.id)).size !== cases.length) throw new Error("Duplicate case IDs");
  for (const r of run.results) {
    const c = cases.find((c) => c.id === r.id);
    if (!c || c.category !== r.category) throw new Error(`Missing or mismatched case snapshot for ${r.id}`);
  }
  const categories = [...new Set(run.results.map((r) => r.category))].map((category) => {
    const rows = run.results.filter((r) => r.category === category);
    return {
      category, cases: rows.length, pass: rows.filter((r) => r.pass).length,
      rule_pass: rows.filter((r) => r.rule_pass).length,
      judged: rows.filter((r) => r.judge).length,
      what_this_checks: CATEGORY_CHECKS[category] ?? "See the case definitions.",
    };
  });
  const gate = GATED.map((category) => {
    const rows = run.results.filter((r) => r.category === category);
    return { category, cases: rows.length, rule_pass: rows.filter((r) => r.rule_pass).length, status: !rows.length ? "not run" : rows.every((r) => r.rule_pass) ? "passing" : "FAILING" };
  });
  const judgeMissing = run.results.filter((r) => !r.judge && cases.find((c) => c.id === r.id)!.judge);
  return {
    source_run: run.run,
    completed_at: run.run_at,
    cases: run.results.length,
    pass: run.results.filter((r) => r.pass).length,
    rule_pass: run.results.filter((r) => r.rule_pass).length,
    judged: run.results.filter((r) => r.judge).length,
    judge_pass: run.results.filter((r) => r.judge?.verdict === "pass").length,
    not_judged_by_design: run.results.filter((r) => !cases.find((c) => c.id === r.id)!.judge && !r.judge).length,
    judge_missing: judgeMissing.map((r) => ({ id: r.id, reason: r.judge_error ?? (run.judge_model ? "No judge verdict recorded" : "Judge disabled") })),
    categories, gate,
    gate_status: gate.some((g) => g.status === "FAILING") ? "FAILING" : gate.some((g) => g.status === "not run") ? "incomplete" : "passing",
    p50_ms: quantile(run.results.map((r) => r.latency_ms), 0.5),
    p95_ms: quantile(run.results.map((r) => r.latency_ms), 0.95),
    costs: { agent_usd: run.total.agent_cost_usd, judge_usd: run.total.judge_cost_usd, total_usd: run.total.judge_cost_usd === null ? null : run.total.agent_cost_usd + run.total.judge_cost_usd },
    modes: [...new Set(run.results.map((r) => r.mode ?? "unknown"))].map((mode) => ({ mode, cases: run.results.filter((r) => (r.mode ?? "unknown") === mode).length })),
    failures: run.results.filter((r) => !r.pass),
  };
}

export function writeLatestReport(root: string, name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) throw new Error("Run name must contain only letters, numbers, underscores and hyphens");
  const runFile = `evals/results/${name}.json`, casesFile = `evals/results/${name}-cases.json`;
  const run = ReportRunSchema.parse(read(root, runFile));
  const cases = ReportCasesSchema.parse(read(root, casesFile)).cases;
  const s = summarizeReportRun(run, cases);
  const previous = ["v1", "v2"].map((id) => ReportRunSchema.parse(read(root, `evals/results/${id}.json`)));
  const currentIds = new Set(run.results.map((r) => r.id));
  const tableRuns = [...previous, run];
  const stamp = new Date(run.run_at).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const md = [
    "# How we test Cosmos AI — latest run",
    "",
    `_Generated by \`npm run evals:report -- --run ${name}\` from [the saved run](../${runFile}) and its [case snapshot](../${casesFile}). Do not edit by hand._`,
    "",
    "## Summary",
    "",
    `- **${s.cases} cases across ${s.categories.length} categories**, completed ${stamp} IST.`,
    `- Run: \`${name}\`. ${run.commit ? `Commit: \`${run.commit}\`.` : "Commit unavailable: this workspace is a downloaded copy without Git metadata."}`,
    `- Agent: \`${run.agent_model}\`; fallback: \`${run.fallback_model}\`; judge: ${run.judge_model ? `\`${run.judge_model}\`` : "**disabled**"}.`,
    `- **Recorded passes: ${fraction(s.pass, s.cases)} (${percent(s.pass, s.cases)}).** Deterministic checks: ${fraction(s.rule_pass, s.cases)}. Judge passes: ${fraction(s.judge_pass, s.judged)} scored cases.`,
    `- Judge coverage: **${s.judged}/${s.cases}**; ${s.not_judged_by_design} intentionally unjudged fixed-response cases; **${s.judge_missing.length} eligible cases missing a verdict**.`,
    `- Safety gate: **${s.gate_status}**. Estimated recorded cost: **${money(s.costs.total_usd)}**.`,
    "",
    "A recorded pass uses the rule checks plus the judge when available. An unavailable judge is not a pass verdict: those cases are assessed on rules only. This report preserves that distinction.",
    "",
    "## Historical comparison",
    "",
    "| Run | Cases | Recorded passes | Rule checks | Judge coverage |",
    "|---|---:|---:|---:|---:|",
    ...tableRuns.map((r) => `| ${r === run ? "Latest" : r.run} | ${r.results.length} | ${fraction(r.results.filter((x) => x.pass).length, r.results.length)} | ${fraction(r.results.filter((x) => x.rule_pass).length, r.results.length)} | ${fraction(r.results.filter((x) => x.judge).length, r.results.length)} |`),
    "",
    `The latest run shares ${previous[1].results.filter((r) => currentIds.has(r.id)).length} case IDs with v2. These are historical snapshots, not a controlled experiment: agent code, guardrails and checks have changed, and judge coverage differs. In particular, month-name equivalence and unverified-water wording checks were corrected after v2. See [the original v1/v2 report](EVALS.md) for its reworded-case caveat.`,
    "",
    "## By category",
    "",
    "| Category | v1 | v2 | Latest | Latest rules | What this checks |",
    "|---|---:|---:|---:|---:|---|",
    ...s.categories.map((c) => {
      const historical = previous.map((r) => {
        const rows = r.results.filter((x) => x.category === c.category);
        return rows.length ? fraction(rows.filter((x) => x.pass).length, rows.length) : "not run";
      });
      return `| ${label(c.category)}${GATED.includes(c.category) ? " 🔒" : ""} | ${historical.join(" | ")} | ${fraction(c.pass, c.cases)} | ${fraction(c.rule_pass, c.cases)} | ${cell(c.what_this_checks)} |`;
    }),
    "",
    "## Safety gate",
    "",
    "| Gated category | Rule checks | Status |",
    "|---|---:|---|",
    ...s.gate.map((g) => `| ${label(g.category)} | ${fraction(g.rule_pass, g.cases)} | ${g.status} |`),
    "",
    "These categories require 100% rule-check passes. Missing categories are **not run**, not passing. The runner's exit status only enforces this gate; inspect all recorded failures too.",
    "",
    "## Failures and remaining gaps",
    "",
    ...(s.failures.length ? [
      "| Case | Category | Rule failures | Judge verdict |",
      "|---|---|---|---|",
      ...s.failures.map((r) => `| \`${r.id}\` | ${label(r.category)} | ${HIDE_TEXT.has(r.category) ? (r.rule_pass ? "none" : "See saved result; text withheld") : cell(r.rule_failures.join("; ") || "none")} | ${r.judge ? `${r.judge.verdict}${HIDE_TEXT.has(r.category) ? "" : `: ${cell(r.judge.reason)}`}` : "not judged"} |`),
      "",
      ...s.failures.filter((r) => !HIDE_TEXT.has(r.category)).flatMap((r) => [
        `### \`${r.id}\``, "",
        `**Shopper:** ${cell(cases.find((c) => c.id === r.id)!.messages.map((m) => m.content).join(" / "))}`, "",
        `> ${r.reply.replace(/\s+/g, " ").trim()}`, "",
      ]),
    ] : ["No recorded failures in this run.", ""]),
    "## Judge coverage",
    "",
    `${s.judged} cases received a verdict; ${s.not_judged_by_design} deliberately have no judge. ${s.judge_missing.length} eligible cases were not scored. No new human/judge agreement study was performed for this run.`,
    "",
    ...(s.judge_missing.length ? [
      "| Missing verdict | Recorded reason |", "|---|---|",
      ...s.judge_missing.map((r) => `| \`${r.id}\` | ${cell(r.reason)} |`),
      "",
    ] : []),
    "## Latency and cost",
    "",
    `- Case latency: p50 **${(s.p50_ms / 1000).toFixed(2)}s**, p95 **${(s.p95_ms / 1000).toFixed(2)}s**, excluding judge calls.`,
    `- Recorded agent cost: **${money(s.costs.agent_usd)}**; judge: **${money(s.costs.judge_usd)}**; average agent cost per case: **${money(s.costs.agent_usd / s.cases)}**.`,
    "- Costs are estimates from recorded token usage and repository price constants, not invoices. Failed/unrecorded calls may add cost. The Pro alias uses a conservative price estimate.",
    "",
    "| Response mode | Cases |", "|---|---:|",
    ...s.modes.map((m) => `| ${m.mode} | ${m.cases} |`),
    "",
    "Code/template answers are part of the agent architecture but are not live LLM reasoning. The mode breakdown prevents a fast-path-heavy run being mistaken for pure model latency.",
    "",
    "## What changed since the historical report",
    "",
    "- Unverified water benefits are withheld from shopper tools; conservative care guidance is shared with order confirmations.",
    "- General design discovery uses catalogue and photo-derived appearance evidence, hard constraints and repeatable pagination.",
    "- Saved chat preferences refresh eligible product-page recommendations without losing the conversation or bag.",
    "- Checkout discount breakdowns and paise allocation reconcile, and quote readiness prevents stale-price payment.",
    "- Website sanity fixes cover gift suggestions, saved-state recovery, payment-method eligibility and complete demo reset.",
    "",
    `These implementation changes are documented in [BUILD_LOG.md](../BUILD_LOG.md). Their separate unit/browser checks are **not** added to the ${s.cases}-case agent score.`,
    "",
    "## Method and limits",
    "",
    "- The runner calls the actual `/api/chat` handler without a browser, using fictional authored cases and the fixed demo clock.",
    "- Deterministic checks inspect expected tools, wording and output guards. The separate Pro-tier judge assesses tone and helpfulness, not an independent factual oracle.",
    "- A flagged answer needs review: rule checks can produce false positives, and a passing tone/helpfulness verdict does not override a factual guard failure.",
    "- This is one recorded run, not repeated-trial stability or real-shopper accuracy evidence. No claim of conversion or kept-revenue uplift follows from it.",
    "- The agent score does not measure browser layout, payment execution, full catalogue-retrieval recall or offline pipeline accuracy.",
    "- Existing browser/unit suites cover additional behaviour separately; see `test:discovery`, `test:rail`, `test:checkout-math`, `test:chat-browser` and `test:sanity-browser` in package.json.",
    "- Original v1/v2 results and their report remain unchanged. Failures and missing judge verdicts are reported, not silently rerun away.",
    "- Abuse and prompt-injection case text is withheld here; only identifiers, categories and outcomes are shown.",
    "",
    "## Reproduce",
    "",
    "```powershell",
    "npm run evals -- --out <new-run-name>",
    "npm run evals:report -- --run <new-run-name>",
    "```",
    "",
    "The runner saves a case-definition snapshot alongside each new run. Report generation reads those artifacts and makes no model calls. The original `npm run evals:report` command still regenerates only the historical v1/v2 report.",
    "",
  ];
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "evals", "results", "latest-summary.json"), JSON.stringify({ sources: { run: runFile, cases: casesFile }, ...s }, null, 2) + "\n");
  writeFileSync(join(root, "docs", "EVALS-LATEST.md"), md.join("\n"));
  console.log(`wrote docs/EVALS-LATEST.md and evals/results/latest-summary.json: ${s.pass}/${s.cases}, gate ${s.gate_status}, ${s.judge_missing.length} missing judge verdict(s)`);
}
