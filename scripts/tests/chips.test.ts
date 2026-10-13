/**
 * `npm run test:chips`: every fast chip, in every context it can appear in, goes through the real /api/chat
 * handler and must be answered on the fast path (no model call), with text and no failed output guard.
 * Follow-ups that refine an earlier answer ("Show more", "Show faster options") run after that answer.
 */
import assert from "node:assert/strict";
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}
process.env.GOOGLE_GENERATIVE_AI_API_KEY = ""; // never call a model from this test

type Part = Record<string, unknown>;
type Msg = { id: string; role: "user" | "assistant"; parts: Part[] };
type Ctx = { sku: string | null; adGroupId: string | null; pincode: null; tier: 1; cart: { sku: string; qty: number }[]; path: string };

(async () => {
  const { POST } = await import("../../src/app/api/chat/route");
  const { allChipTexts, fastKey, starterChips } = await import("../../src/lib/agent/chips");
  const { loadDb } = await import("../../src/lib/data/disk");
  const db = loadDb();

  async function ask(history: Msg[], text: string, context: Ctx, loggedIn = false) {
    const messages: Msg[] = [...history, { id: `u${history.length}`, role: "user", parts: [{ type: "text", text }] }];
    const req = new Request("http://test.local/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie: `cosmos_vid=chips-${Date.now()}${loggedIn ? "; cosmos_user=ananya" : ""}` }, body: JSON.stringify({ messages, context }) });
    const ev = (await (await POST(req)).text()).split("\n").filter((l) => l.startsWith("data: {")).map((l) => JSON.parse(l.slice(6)) as Part);
    const reply = ev.filter((e) => e.type === "text-delta").map((e) => String(e.delta)).join("");
    const tools = ev.filter((e) => e.type === "tool-input-available");
    const outputs = ev.filter((e) => e.type === "tool-output-available");
    const parts: Part[] = tools.map((t, i) => ({ type: `tool-${t.toolName}`, toolCallId: t.toolCallId, state: "output-available", input: t.input, output: outputs[i]?.output }));
    const usage = ev.find((e) => e.type === "data-usage")?.data as { mode: string } | undefined;
    const failed = ev.filter((e) => e.type === "data-guard" && (e.data as { pass: boolean }).pass === false).map((e) => (e.data as { name: string }).name);
    return { reply, mode: usage?.mode, failed, history: [...messages, { id: `a${history.length}`, role: "assistant" as const, parts: [...parts, { type: "text", text: reply }] }] };
  }

  const products = db.products.filter((p) => !p.metafields.jewellery.excluded).map((p) => ({ handle: p.handle, title: p.title, waterResistant: p.metafields.jewellery.water_resistant === true }));
  const cart = [{ sku: "ciel-hoops-30mm", qty: 1 }];
  const ctxFor = (where: string, product: { handle: string } | null): Ctx => ({
    sku: product?.handle ?? null,
    adGroupId: where.split(" · ")[1]?.replace("direct", "") || null,
    pincode: null,
    tier: 1,
    cart: where.startsWith("bag") ? cart : [],
    path: where.startsWith("bag") ? "/cart" : product ? `/p/${product.handle}` : "/shop",
  });

  // starters: one representative product per ad group (+ every water-resistant product for the shower chip)
  const seen = new Set<string>();
  const cases: { text: string; ctx: Ctx; where: string }[] = [];
  for (const r of allChipTexts(products)) {
    if (!r.chip || r.chip.via !== "fast") continue;
    const key = `${r.text}|${r.where.split(" · ").slice(0, 2).join(" · ").replace(/^product \S+/, "product")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push({ text: r.text, ctx: ctxFor(r.where.replace(/^product \S+/, "product"), r.product), where: r.where });
  }
  let n = 0;
  const fails: string[] = [];
  for (const c of cases) {
    const r = await ask([], c.text, c.ctx, c.where.endsWith("logged in"));
    n++;
    if (process.env.VERBOSE) console.log(`${c.where.padEnd(48).slice(0, 48)} ${c.text.padEnd(28)} → ${r.reply}`);
    if (r.mode !== "fast_path" || !r.reply.trim() || r.failed.length) fails.push(`${c.where}: "${c.text}" → mode ${r.mode}, ${r.failed.length ? `guards failed: ${r.failed}` : `"${r.reply.slice(0, 80)}"`}`);
  }

  // follow-ups after the answers they refine
  const flows: [string, string, Ctx][] = [
    ["Gift under ₹2,000", "Show more", ctxFor("home · direct", null)],
    ["Gift under ₹2,000", "Under ₹2,000", ctxFor("home · direct", null)],
    ["Show me similar pieces", "Under ₹2,000", ctxFor("product · direct", products.find((p) => p.handle === "ciel-hoops-40mm")!)],
    ["Need it in Pune by 18 Oct", "Show faster options", ctxFor("product · direct", products.find((p) => p.handle === "ciel-hoops-30mm")!)],
    ["Which size for daily wear?", "Compare sizes", ctxFor("product · direct", products.find((p) => p.handle === "ciel-hoops-40mm")!)],
    ["Show me similar pieces", "Add the Medium Classic Hoop Earrings to bag", ctxFor("product · direct", products.find((p) => p.handle === "ciel-hoops-40mm")!)],
  ];
  for (const [first, then, ctx] of flows) {
    const a = await ask([], first, ctx);
    const b = await ask(a.history, then, ctx);
    n++;
    if (process.env.VERBOSE) console.log(`follow-up ${first} → ${then}: ${b.reply}`);
    if (b.mode !== "fast_path" || !b.reply.trim() || b.failed.length) fails.push(`follow-up "${first}" → "${then}": mode ${b.mode}, ${b.failed.length ? `guards failed: ${b.failed}` : `"${b.reply.slice(0, 80)}"`}`);
  }

  // safety: the wedding ad never shows a water chip; the 40mm (verified) direct page does; the brass studs don't
  const chipsOf = (adGroupId: string | null, handle: string) => starterChips({ kind: "product", adGroupId, loggedIn: false, product: products.find((p) => p.handle === handle)! }).map((c) => c.text);
  assert.ok(!chipsOf("wedding-guest-gift", "ciel-hoops-40mm").some((t) => /shower|water|gym/i.test(t)), "wedding ad shows a water chip");
  assert.ok(chipsOf("waterproof-everyday-under-5k", "ciel-hoops-40mm").includes("Can I shower in these?"), "verified product misses the shower chip");
  assert.ok(!chipsOf("waterproof-everyday-under-5k", "tara-solitaire-studs").some((t) => /shower/i.test(t)), "unverified product shows a shower chip");
  assert.equal(fastKey("give me 50% off"), null);

  if (fails.length) {
    console.log(fails.join("\n"));
    console.log(`\n${n - fails.length}/${n} chips answered on the fast path`);
    process.exitCode = 1;
  } else console.log(`${n}/${n} chips answered on the fast path (no model call), no failed guards; safety asserts ok`);
})();
