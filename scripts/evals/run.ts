/**
 * `npm run evals`: runs evals/cases.json against the /api/chat handler directly (no browser, no server).
 *   1. Rule checks first: tools (and order), numbers/dates grounded in tool results, no banned or regulated words,
 *      sizes in cm only, no "ChatGPT", must / must-not text, care line, language, card vs text, input rejections.
 *   2. LLM judge (a different, Pro tier) only for tone and helpfulness, with a JSON verdict.
 * Writes evals/results/<out>.json and prints a summary by category plus every failure with its reason.
 * Regression gate: exits 1 if the rule checks for claim_safety, groundedness or no_chatgpt_mention pass below 100%.
 *
 * Flags: --model <agent model id>  --category a,b  --limit N  --no-judge  --out v1
 * Run with the react-server condition (see package.json) so server-only modules load outside Next.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
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
if (arg("model")) process.env.GEMINI_MODEL = arg("model"); // read when model.ts loads, so set before importing it

type Case = {
  id: string; category: string; page: string; ad_group: string | null; logged_in: boolean; pincode: string | null;
  messages: { role: "user" | "assistant"; content: string; attachment?: { media_type: string; filename: string } }[];
  expect: { tools: string[]; tools_ordered: boolean; must_include: string[]; must_include_any: string[][]; must_not_include: string[]; checks: ("offer_matches_tool" | "alternative_offered")[]; care_line: boolean; language: "en" | "hinglish_or_en"; format: "card" | "text" | "either" };
  judge: boolean; judge_rubric: string | null;
};
type Event = { type: string; [k: string]: unknown };
type JudgeVerdict = { tone: number; helpfulness: number; verdict: "pass" | "fail"; reason: string };

const ROOT = join(__dirname, "..", "..");
const CARE_EMAIL = "care@cosmosjewels.example";
const GATED = ["claim_safety", "groundedness", "no_chatgpt_mention"];
const HINGLISH = /\b(hai|hain|kya|mein|ke|ki|ka|liye|aap|aapke|nahi|toh|ye|yeh|haan|bhi|wale|sakte|chalega|kaan)\b/gi;
/** Phrase match on whole words: "3cm" doesn't match "13cm", "approved" doesn't match "unapproved". */
const has = (text: string, phrase: string) => {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${/^\w/.test(phrase) ? "(?<![\\w])" : ""}${esc}${/\w$/.test(phrase) ? "(?![\\w])" : ""}`, "i").test(text);
};
const rupees = (text: string) => (text.match(/₹\s?\d[\d,]*/g) ?? []).map((m) => Number(m.replace(/[₹,\s]/g, "")));
const CARD_TOOLS = new Set(["search_catalog", "check_delivery", "get_return_insight", "get_offer", "add_to_bag", "suggest_login", "handoff"]);
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0);

(async () => {
  const { POST } = await import("../../src/app/api/chat/route");
  const { generateText, Output } = await import("ai");
  const { z } = await import("zod");
  const { pickLlm, llmSettings, GEMINI_MODELS, estimateCostUsd } = await import("../../src/lib/ai/model");

  let cases = (JSON.parse(readFileSync(join(ROOT, "evals/cases.json"), "utf8")) as { cases: Case[] }).cases;
  const cats = arg("category")?.split(",");
  if (cats) cases = cases.filter((c) => cats.includes(c.category));
  if (arg("limit")) cases = cases.slice(0, Number(arg("limit")));
  const useJudge = !process.argv.includes("--no-judge");
  const judge = useJudge ? pickLlm("judge") : null;
  const out = arg("out") ?? "v1";
  console.log(`evals: ${cases.length} case(s) · agent ${GEMINI_MODELS.agent} (fallback ${GEMINI_MODELS.agent_fallback}) · judge ${judge?.modelId ?? "off"}`);

  const Verdict = z.object({ tone: z.number().min(1).max(5), helpfulness: z.number().min(1).max(5), verdict: z.enum(["pass", "fail"]), reason: z.string() });
  const results = [];
  for (const c of cases) {
    // one conversation per case: earlier turns are replayed with the assistant's actual replies
    const history: { id: string; role: "user" | "assistant"; parts: Record<string, unknown>[] }[] = [];
    const events: Event[] = [];
    let reply = "";
    const t0 = Date.now();
    for (const [i, m] of c.messages.entries()) {
      if (m.role !== "user") continue;
      const parts: Record<string, unknown>[] = [{ type: "text", text: m.content }];
      if (m.attachment) parts.push({ type: "file", mediaType: m.attachment.media_type, filename: m.attachment.filename, url: "data:image/jpeg;base64,/9j/4AAQ" });
      history.push({ id: `u${i}`, role: "user", parts });
      const cookie = [`cosmos_vid=eval-${c.id}-${Date.now()}`, c.logged_in ? "cosmos_user=ananya" : ""].filter(Boolean).join("; ");
      const req = new Request("http://evals.local/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ messages: history, context: { sku: c.page === "home" || c.page === "bag" ? null : c.page, adGroupId: c.ad_group, pincode: c.pincode, tier: c.logged_in ? 3 : 1, cart: [], loginOffered: false, path: c.page === "home" ? "/shop" : c.page === "bag" ? "/cart" : `/p/${c.page}` } }) });
      const raw = await (await POST(req)).text();
      const turn = raw.split("\n").filter((l) => l.startsWith("data: {")).map((l) => JSON.parse(l.slice(6)) as Event);
      events.push(...turn);
      reply = turn.filter((e) => e.type === "text-delta").map((e) => String(e.delta)).join("").replace(/\s+/g, " ").trim();
      history.push({ id: `a${i}`, role: "assistant", parts: [{ type: "text", text: reply }] });
    }
    const latency = Date.now() - t0;
    const tools = events.filter((e) => e.type === "tool-input-available").map((e) => String(e.toolName));
    const outputs = events.filter((e) => e.type === "tool-output-available").map((e) => e.output as Record<string, unknown>);
    const guards = events.filter((e) => e.type === "data-guard").map((e) => e.data as { name: string; pass: boolean; detail: string });
    const usage = events.filter((e) => e.type === "data-usage").map((e) => e.data as Record<string, unknown>).at(-1) ?? {};

    // ── rule checks ──
    const fails: string[] = [];
    const missing = c.expect.tools.filter((t) => !tools.includes(t));
    if (missing.length) fails.push(`tool not called: ${missing.join(", ")} (called: ${tools.join(", ") || "none"})`);
    else if (c.expect.tools_ordered) {
      const idx = c.expect.tools.map((t) => tools.indexOf(t));
      if (idx.some((v, k) => k > 0 && v < idx[k - 1])) fails.push(`tools out of order: ${tools.join(" → ")}`);
    }
    const g = (name: string) => guards.find((x) => x.name === name);
    if (g("claim check (numbers grounded)")?.pass === false) fails.push(`ungrounded: ${g("claim check (numbers grounded)")!.detail}`);
    if (g("verified claims only")?.pass === false) fails.push(`regulated claim: ${g("verified claims only")!.detail}`);
    if (g("banned phrases")?.pass === false) fails.push(`banned phrase: ${g("banned phrases")!.detail}`);
    if (/chatgpt/i.test(reply)) fails.push('names "ChatGPT"');
    if (/\b\d+(\.\d+)?\s?mm\b/i.test(reply)) fails.push("size in mm");
    for (const s of c.expect.must_include) if (!has(reply, s)) fails.push(`missing "${s}"`);
    for (const group of c.expect.must_include_any) if (!group.some((s) => has(reply, s))) fails.push(`missing one of ${group.map((s) => `"${s}"`).join(" / ")}`);
    for (const s of c.expect.must_not_include) if (has(reply, s)) fails.push(`contains "${s}"`);
    // groundedness: "we have / don't have / offer …" needs a lookup_policy result on that topic (route guard)
    if (g("honest lead")?.pass === false) fails.push(`self-contradiction: ${g("honest lead")!.detail}`);
    if (g("policy claims grounded")?.pass === false) fails.push(`unbacked policy claim: ${g("policy claims grounded")!.detail}`);
    // checks against tool results
    const out = (tool: string) => outputs[tools.lastIndexOf(tool)] as Record<string, unknown> | undefined;
    if (c.expect.checks.includes("offer_matches_tool")) {
      const o = out("get_offer") as { subtotal_inr: number; discount_inr: number; total_inr: number; shipping_inr: number; applied: { amount_inr: number; label: string }[]; wallet: { balance_inr: number; usable_inr: number }; cap: { max_flat_inr: number; cap_inr_for_this_cart: number } } | undefined;
      if (!o || "error" in o) fails.push("offer check: no get_offer result");
      else {
        // every ₹ amount the reply states must be one get_offer computed (saving, total, cap, wallet, a single offer)
        const allowed = new Set([o.subtotal_inr, o.discount_inr, o.discount_inr + o.wallet.usable_inr, o.total_inr, o.subtotal_inr - o.discount_inr, o.shipping_inr, o.wallet.balance_inr, o.wallet.usable_inr, o.cap.max_flat_inr, o.cap.cap_inr_for_this_cart, ...o.applied.map((a) => a.amount_inr), ...o.applied.flatMap((a) => rupees(a.label))]); // incl. amounts in an offer's own label ("over ₹1,999")
        const wrong = rupees(reply).filter((n) => !allowed.has(n));
        if (wrong.length) fails.push(`offer check: ₹${wrong.join(", ₹")} not in get_offer's result`);
      }
    }
    if (c.expect.checks.includes("alternative_offered")) {
      const alt = (out("get_return_insight") as { alternative?: { title: string; size: string | null } | null } | undefined)?.alternative;
      if (!alt) fails.push("alternative check: get_return_insight returned no alternative");
      else if (!has(reply, alt.title) && !(alt.size && has(reply, alt.size.replace(/ (across|long)$/, "")))) fails.push(`alternative check: reply doesn't offer the ${alt.title}`);
    }
    if (c.expect.care_line && !reply.includes(CARE_EMAIL)) fails.push("no care line");
    const hinglishWords = (reply.match(HINGLISH) ?? []).length;
    if (c.expect.language === "en" && hinglishWords >= 3) fails.push("replied in Hinglish to English");
    if (!reply) fails.push("empty reply");
    if (c.expect.format === "card" && !outputs.some((o, k) => CARD_TOOLS.has(tools[k]) && o && !("error" in o) && o.found !== false && o.show !== false)) fails.push("expected a card, got text only");

    // ── LLM judge: tone and helpfulness only ──
    let verdict: JudgeVerdict | null = null;
    let judgeCost: number | null = null;
    if (judge && c.judge && reply) {
      try {
        const r = await generateText({
          model: judge.model,
          system: JUDGE_RUBRIC,
          prompt: JSON.stringify({ category: c.category, shopper: c.messages.map((m) => m.content).join(" / "), assistant_reply: reply, tools_called: tools, case_rubric: c.judge_rubric }),
          output: Output.object({ schema: Verdict }),
          ...llmSettings(judge),
          seed: 7,
          maxOutputTokens: 2000,
          maxRetries: 1,
          timeout: 60000,
        });
        verdict = r.output as JudgeVerdict;
        judgeCost = estimateCostUsd(judge.modelId, r.usage.inputTokens ?? 0, r.usage.outputTokens ?? 0);
      } catch (e) {
        verdict = { tone: 0, helpfulness: 0, verdict: "fail", reason: `judge error: ${(e as Error).message.split("\n")[0].slice(0, 80)}` };
      }
    }
    const pass = fails.length === 0 && (verdict ? verdict.verdict === "pass" : true);
    results.push({ id: c.id, category: c.category, pass, rule_pass: fails.length === 0, rule_failures: fails, judge: verdict, tools, reply, latency_ms: latency, first_output_ms: usage.first_output_ms ?? null, model: usage.model ?? null, mode: usage.mode ?? null, tokens_in: usage.tokens_in ?? 0, tokens_out: usage.tokens_out ?? 0, cost_usd: (usage.cost_usd as number | null) ?? 0, judge_cost_usd: judgeCost, hinglish_words: hinglishWords });
    process.stdout.write(pass ? "." : "F");
  }
  console.log("");

  // ── summary ──
  const byCat = new Map<string, typeof results>();
  for (const r of results) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  const summary = [...byCat.entries()].map(([category, rs]) => ({
    category,
    cases: rs.length,
    pass_rate: +(rs.filter((r) => r.pass).length / rs.length).toFixed(3),
    rule_pass_rate: +(rs.filter((r) => r.rule_pass).length / rs.length).toFixed(3),
    p50_ms: pct(rs.map((r) => r.latency_ms), 50),
    p95_ms: pct(rs.map((r) => r.latency_ms), 95),
    cost_per_chat_usd: +(rs.reduce((s, r) => s + (r.cost_usd ?? 0), 0) / rs.length).toFixed(5),
  }));
  const total = {
    cases: results.length,
    pass_rate: +(results.filter((r) => r.pass).length / Math.max(1, results.length)).toFixed(3),
    p50_ms: pct(results.map((r) => r.latency_ms), 50),
    p95_ms: pct(results.map((r) => r.latency_ms), 95),
    agent_cost_usd: +results.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(4),
    judge_cost_usd: results.some((r) => r.judge && r.judge_cost_usd === null) ? null : +results.reduce((s, r) => s + (r.judge_cost_usd ?? 0), 0).toFixed(4),
  };
  let commit = "";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {}
  mkdirSync(join(ROOT, "evals/results"), { recursive: true });
  writeFileSync(join(ROOT, `evals/results/${out}.json`), JSON.stringify({ run: out, run_at: new Date().toISOString(), commit, agent_model: GEMINI_MODELS.agent, fallback_model: GEMINI_MODELS.agent_fallback, judge_model: judge?.modelId ?? null, total, by_category: summary, results }, null, 2) + "\n");

  console.log(`\n${"category".padEnd(26)} cases  pass   rules  p50ms  p95ms  $/chat`);
  for (const s of summary) console.log(`${s.category.padEnd(26)} ${String(s.cases).padStart(5)}  ${(s.pass_rate * 100).toFixed(0).padStart(3)}%  ${(s.rule_pass_rate * 100).toFixed(0).padStart(4)}%  ${String(s.p50_ms).padStart(5)}  ${String(s.p95_ms).padStart(5)}  ${s.cost_per_chat_usd.toFixed(5)}`);
  console.log(`${"TOTAL".padEnd(26)} ${String(total.cases).padStart(5)}  ${(total.pass_rate * 100).toFixed(0).padStart(3)}%         ${String(total.p50_ms).padStart(5)}  ${String(total.p95_ms).padStart(5)}  agent $${total.agent_cost_usd} · judge ${total.judge_cost_usd === null ? "price not recorded" : `$${total.judge_cost_usd}`}`);
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    console.log(`\nFailures (${failed.length}):`);
    for (const r of failed) console.log(`  ✗ ${r.id} [${r.category}] ${[...r.rule_failures, ...(r.judge?.verdict === "fail" ? [`judge: ${r.judge.reason}`] : [])].join(" · ")}`);
  }
  console.log(`\nwrote evals/results/${out}.json`);

  // ── regression gate ──
  // gated on the rule checks (deterministic); the judge's tone verdicts still count in the pass rates above
  const gateFail = summary.filter((s) => GATED.includes(s.category) && s.rule_pass_rate < 1);
  if (gateFail.length) {
    console.log(`\nREGRESSION GATE FAILED: ${gateFail.map((s) => `${s.category} ${(s.rule_pass_rate * 100).toFixed(0)}% of rule checks`).join(", ")} (must be 100%)`);
    process.exitCode = 1;
  } else console.log("\nRegression gate: claim_safety, groundedness and no_chatgpt_mention at 100% ✓");
})();
