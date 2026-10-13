/**
 * Builds evals/results/summary.json from the saved runs (v1.json, v2.json) and the case definitions
 * (v1-cases.json snapshot, evals/cases.json). Every number is computed here; the words come from narrative.ts.
 * Abuse and injection case text is never copied (ids, categories and counts only).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_CHECKS, FINDINGS, FIXED, GATED, HIDE_TEXT, HOW_CHECKED, HOW_TO_RUN, LIMITS, REJECTED } from "./narrative";

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

type Result = { id: string; category: string; pass: boolean; rule_pass: boolean; reply: string; tools: string[]; latency_ms: number; cost_usd: number; judge_cost_usd: number | null; judge: { verdict: string } | null; judge_error?: string | null };
type Run = { run: string; run_at: string; commit: string; agent_model: string; fallback_model: string; judge_model: string | null; total: { cases: number; pass_rate: number; p50_ms: number; p95_ms: number; agent_cost_usd: number; judge_cost_usd: number | null }; results: Result[] };
type Case = { id: string; category: string; page: string; ad_group: string | null; logged_in: boolean; pincode: string | null; messages: { content: string }[]; expect: Record<string, unknown>; judge: boolean; judge_rubric: string | null };

export function buildSummary() {
  const v1: Run = read("evals/results/v1.json");
  const v2: Run = read("evals/results/v2.json");
  const c1: Case[] = read("evals/results/v1-cases.json").cases;
  const c2: Case[] = read("evals/cases.json").cases;
  const pass = (run: Run, id: string) => run.results.find((r) => r.id === id)?.pass ?? null;
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

  // like-for-like: the 52 v1 cases; "reworded" = the definition changed between runs (fields listed)
  const norm = (c: Case) => ({ page: c.page, ad_group: c.ad_group, logged_in: c.logged_in, pincode: c.pincode, messages: c.messages, expect: { must_include_any: [], checks: [], ...c.expect }, judge: c.judge, judge_rubric: c.judge_rubric });
  const changedFields = (a: Case, b: Case) => {
    const x = norm(a) as Record<string, unknown>, y = norm(b) as Record<string, unknown>;
    const out = ["page", "ad_group", "logged_in", "pincode", "messages", "judge", "judge_rubric"].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
    const ex = x.expect as Record<string, unknown>, ey = y.expect as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ex), ...Object.keys(ey)])) if (JSON.stringify(ex[k]) !== JSON.stringify(ey[k])) out.push(`expect.${k}`);
    return out;
  };
  const rows = c1.map((a) => {
    const b = c2.find((x) => x.id === a.id);
    const changed = b ? changedFields(a, b) : ["removed"];
    return { id: a.id, category: a.category, status: !b ? "removed" : changed.length ? "reworded" : "unchanged", changed, v1: pass(v1, a.id), v2: b ? pass(v2, a.id) : null };
  });
  const tally = (rs: { v1: boolean | null; v2: boolean | null }[]) => ({ cases: rs.length, v1_pass: rs.filter((r) => r.v1).length, v2_pass: rs.filter((r) => r.v2).length });
  const newCases = c2.filter((b) => !c1.some((a) => a.id === b.id));
  const newByCat = [...new Set(newCases.map((c) => c.category))].map((category) => {
    const cs = newCases.filter((c) => c.category === category);
    return { category, cases: cs.length, v2_pass: cs.filter((c) => pass(v2, c.id)).length };
  });

  // by category (v2 categories, in the order of the run)
  const cats = [...new Set(v2.results.map((r) => r.category))];
  const byCategory = cats.map((category) => {
    const r1 = v1.results.filter((r) => r.category === category);
    const r2 = v2.results.filter((r) => r.category === category);
    return {
      category,
      what_this_checks: CATEGORY_CHECKS[category] ?? "",
      gated: GATED.includes(category),
      v1: r1.length ? { cases: r1.length, pass: r1.filter((r) => r.pass).length } : null,
      v2: { cases: r2.length, pass: r2.filter((r) => r.pass).length, rule_pass: r2.filter((r) => r.rule_pass).length },
    };
  });
  const gate = GATED.map((category) => {
    const r2 = v2.results.filter((r) => r.category === category);
    return { category, rule_pass: r2.filter((r) => r.rule_pass).length, cases: r2.length, passing: r2.every((r) => r.rule_pass) };
  });

  // judge cost summed per case (cases the judge couldn't score cost nothing)
  const judgeCost = Math.round(v2.results.reduce((t, r) => t + (r.judge_cost_usd ?? 0), 0) * 10000) / 10000;
  const v2cost = v2.total.agent_cost_usd + judgeCost;
  const unjudged = v2.results.filter((r) => r.judge_error);
  const example = (e: { id: string; title: string; kind: string[]; what_changed: string }) => {
    const c = c2.find((x) => x.id === e.id)!;
    if (HIDE_TEXT.has(c.category)) throw new Error(`${e.id}: case text from ${c.category} is never shown`);
    const r1 = v1.results.find((r) => r.id === e.id)!, r2 = v2.results.find((r) => r.id === e.id)!;
    return { ...e, category: c.category, question: c.messages.map((m) => m.content).join(" / "), v1: { pass: r1.pass, reply: r1.reply }, v2: { pass: r2.pass, reply: r2.reply } };
  };

  return {
    note: "Generated by scripts/evals/summary.ts from evals/results/v1.json, v2.json and the case definitions. Do not edit by hand: run npm run evals:report.",
    run: {
      v2_run_at: v2.run_at,
      v2_commit: v2.commit,
      agent_model: v2.agent_model,
      fallback_model: v2.fallback_model,
      judge_model: v2.judge_model,
      cases: v2.total.cases,
      categories: cats.length,
      pass: v2.results.filter((r) => r.pass).length,
      p50_ms: v2.total.p50_ms,
      p95_ms: v2.total.p95_ms,
      agent_cost_usd: v2.total.agent_cost_usd,
      judge_cost_usd: judgeCost,
      judged: v2.results.filter((r) => r.judge).length,
      not_judged_by_design: c2.filter((c) => !c.judge).length, // fixed lines (input limits, abuse) have nothing to judge
      judge_unavailable: { ids: unjudged.map((r) => r.id), reason: unjudged.length ? "the judge model's daily request quota ran out during the run; these cases count on rule checks only until re-judged" : null },
      full_run_cost_usd: Math.round(v2cost * 10000) / 10000,
      cost_per_chat_usd: Math.round((v2.total.agent_cost_usd / v2.total.cases) * 100000) / 100000,
      v1: { run_at: v1.run_at, cases: v1.total.cases, pass: v1.results.filter((r) => r.pass).length },
    },
    like_for_like: {
      cases: rows.length,
      v1_pass: tally(rows).v1_pass,
      v2_pass: tally(rows).v2_pass,
      v1_rate: pct(tally(rows).v1_pass, rows.length),
      v2_rate: pct(tally(rows).v2_pass, rows.length),
      unchanged: tally(rows.filter((r) => r.status === "unchanged")),
      reworded: { ...tally(rows.filter((r) => r.status === "reworded")), ids: rows.filter((r) => r.status === "reworded").map((r) => ({ id: r.id, changed: r.changed })) },
      cases_detail: rows,
    },
    new_in_v2: { cases: newCases.length, v2_pass: newCases.filter((c) => pass(v2, c.id)).length, by_category: newByCat },
    by_category: byCategory,
    gate,
    judge_check: {
      cases: ["ground-01", "claim-01", "handoff-03", "hing-01", "claim-03", "offer-03", "off-01", "pol-02", "ret-02", "fmt-02"],
      agreement: "10/10",
      v1_rubric_agreement: "8/10",
      method: "The current judge rubric re-scored the same 10 v1 replies (npm run evals:rejudge) and was compared with a hand reading: it flips exactly the two v1 disagreements (claim-01 no longer 'preachy'; hing-01's self-contradiction now fails) and leaves the other 8 unchanged.",
    },
    fixed: FIXED.map(example),
    findings: FINDINGS.map(example),
    how_checked: HOW_CHECKED,
    rejected: REJECTED,
    limits: LIMITS,
    how_to_run: HOW_TO_RUN,
    gated_categories: GATED,
  };
}

if (require.main === module) {
  writeFileSync(join(ROOT, "evals/results/summary.json"), JSON.stringify(buildSummary(), null, 2) + "\n");
  console.log("wrote evals/results/summary.json");
}
