/**
 * `npm run validate-data`: schemas, references, planted counts, planted delivery dates, tuned metrics,
 * copy rules and fictional-data guards. Exits 1 on any error; warnings don't fail.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import * as S from "../src/lib/schemas";
import { estimateDelivery, zoneFor } from "../src/lib/delivery";
import { slice, byArm, byAdGroup } from "../src/lib/metrics";
import { WATERPROOF_PROSE, HYPO_POST_PROSE } from "./seed/catalogue";
import { DEMO_NOW_ISO } from "../src/config/demo";

const ROOT = join(__dirname, "..");
const errors: string[] = [];
const warnings: string[] = [];
const ok: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);
const check = (cond: boolean, pass: string, fail = pass) => (cond ? ok.push(pass) : err(fail));

function load<T extends z.ZodTypeAny>(rel: string, schema: T): z.infer<T> {
  const p = join(ROOT, rel);
  if (!existsSync(p)) {
    err(`missing file ${rel}`);
    return undefined as never;
  }
  const res = schema.safeParse(JSON.parse(readFileSync(p, "utf8")));
  if (!res.success) {
    err(`${rel}: schema errors\n    ` + res.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n    "));
    return undefined as never;
  }
  ok.push(`schema ok: ${rel}`);
  return res.data;
}

const brand = load("data/brand.json", S.BrandSchema);
const { products } = load("data/catalogue/products.json", S.ProductsFileSchema) ?? { products: [] };
const manifest = load("data/images/manifest.json", S.ManifestSchema);
const ag = load("data/ad_groups.json", S.AdGroupsFileSchema);
const mock = load("data/mock_chatgpt.json", S.MockChatgptSchema);
const rules = load("data/brand_rules.json", S.BrandRulesSchema);
const offers = load("data/offers.json", S.OffersFileSchema);
const logistics = load("data/logistics.json", S.LogisticsSchema);
const returns = load("data/returns.json", S.ReturnsFileSchema);
const shoppers = load("data/shoppers.json", S.ShoppersSchema);
const rzp = load("data/razorpay.json", S.RazorpayConfigSchema);
const os = load("data/orders_sessions.json", S.OrdersSessionsSchema);
const chats = load("data/chat_logs_seed.json", S.ChatLogsSchema);
load("data/merchant.json", S.MerchantSchema);
const demo = load("data/demo_script.json", S.DemoScriptSchema);
const evals = load("evals/cases.json", S.EvalCasesSchema);
const planted = load("evals/planted_facts.json", S.PlantedFactsSchema);

if (errors.length) finish();

/* ───────── references ───────── */
const handles = new Set(products.map((p) => p.handle));
const agIds = new Set(ag.ad_groups.map((g) => g.id));
const sku = (h: string, where: string) => handles.has(h) || err(`unknown SKU "${h}" in ${where}`);
const agRef = (id: string | null, where: string) => id === null || agIds.has(id) || err(`unknown ad group "${id}" in ${where}`);
const pin = (p: string | null, where: string) => {
  if (!p) return;
  const z = zoneFor(p, logistics);
  if (z.zone === "national") err(`pincode ${p} in ${where} doesn't resolve to a zone`);
};

check(new Set(products.map((p) => p.handle)).size === products.length, "product handles unique", "duplicate product handles");
check(new Set(products.flatMap((p) => p.variants.map((v) => v.sku))).size === products.flatMap((p) => p.variants).length, "variant SKUs unique", "duplicate variant SKUs");
for (const g of ag.ad_groups) {
  sku(g.hero_sku, `ad_groups.${g.id}.hero_sku`);
  g.candidate_skus.forEach((s) => sku(s, `ad_groups.${g.id}.candidate_skus`));
  if (!g.candidate_skus.includes(g.hero_sku)) err(`${g.id}: hero not in candidates`);
  const hero = products.find((p) => p.handle === g.hero_sku)!;
  if (!g.ad_creative.title.includes(" ") || /chatgpt/i.test(g.ad_creative.title + g.ad_creative.body)) err(`${g.id}: ad creative must not name ChatGPT`);
  const priceInCreative = g.ad_creative.body.match(/₹([\d,]+)/);
  if (priceInCreative && g.id !== "hypoallergenic-studs" && Number(priceInCreative[1].replace(/,/g, "")) !== Number(hero.variants[0].price)) err(`${g.id}: creative price ₹${priceInCreative[1]} ≠ hero price ${hero.variants[0].price}`);
}
check(ag.ad_groups.filter((g) => g.status === "active").length === 3, "3 active ad groups at start");
check(ag.ad_groups.find((g) => g.id === "hypoallergenic-studs")?.status === "pending_approval", "hypoallergenic-studs absent at start (pending_approval)");
check(ag.ad_groups.find((g) => g.id === "waterproof-everyday-under-5k")?.hero_sku === "ciel-hoops-40mm" && ag.ad_groups.find((g) => g.id === "wedding-guest-gift")?.hero_sku === "ciel-hoops-40mm", "same hero SKU in waterproof + wedding ads");

for (const c of mock.conversations) {
  agRef(c.ad_group, `mock_chatgpt.${c.id}`);
  const g = ag.ad_groups.find((x) => x.id === c.ad_group)!;
  const u = new URL(c.sponsored_card.click_url, "https://cosmos.example");
  if (u.pathname !== `/p/${g.hero_sku}`) err(`mock ${c.id}: click URL path ${u.pathname} ≠ hero /p/${g.hero_sku}`);
  if (u.searchParams.get("ad_group_id") !== g.ad_group_id || u.searchParams.get("campaign_id") !== g.campaign_id || u.searchParams.get("ad_id") !== g.ad_id) err(`mock ${c.id}: click URL ids don't match ad group`);
  if (u.searchParams.get("oppref") !== c.sponsored_card.oppref) err(`mock ${c.id}: oppref mismatch`);
  if (/chatgpt/i.test(c.sponsored_card.title + c.sponsored_card.body)) err(`mock ${c.id}: card copy names ChatGPT`);
}
check(mock.conversations.find((c) => c.id === "conv-sensitive")?.requires_approval_of === "hypoallergenic-studs", "conversation 3 card gated on approval");

Object.entries(rules.pinned).forEach(([g, pins]) => { agRef(g, "brand_rules.pinned"); pins.forEach((p) => sku(p.sku, "brand_rules.pinned")); });
rules.excluded_skus.forEach((e) => sku(e.sku, "brand_rules.excluded_skus"));
returns.skus.forEach((r) => { sku(r.sku, "returns"); Object.keys(r.by_ad_group).forEach((g) => agRef(g, `returns.${r.sku}.by_ad_group`)); r.reasons_raw.forEach((x) => agRef(x.ad_group_id, `returns.${r.sku}.reasons`)); });
check(returns.skus.length === products.length, "returns.json covers every SKU", `returns.json has ${returns.skus.length} SKUs, catalogue has ${products.length}`);
[...shoppers.tier2_cookie.recently_viewed_skus, ...shoppers.tier2_cookie.wishlist_skus].forEach((s) => sku(s, "shoppers.tier2"));
shoppers.tier3_priya.brand_order_history.forEach((o) => sku(o.sku, "shoppers.priya.history"));
shoppers.tier3_priya.saved_addresses.forEach((a) => pin(a.pincode, "shoppers.priya"));
shoppers.extra.forEach((x) => { pin(x.pincode, `shoppers.${x.id}`); agRef(x.ad_group, `shoppers.${x.id}`); });
logistics.demo_pincodes.forEach((p) => pin(p, "logistics.demo_pincodes"));
logistics.rto_risk.forEach((r) => pin(r.pincode, "logistics.rto_risk"));
check(logistics.rto_risk.some((r) => r.pincode.startsWith("8") && r.risk === "high"), "one rural 8xxxxx pincode is high RTO risk");

const sessionIds = new Set(os.sessions.map((s) => s.session_id));
os.sessions.forEach((s) => agRef(s.ad_group_id, `session ${s.session_id}`));
os.orders.forEach((o) => {
  if (!sessionIds.has(o.session_id)) err(`order ${o.order_id}: unknown session`);
  o.items.forEach((i) => sku(i.sku, `order ${o.order_id}`));
  pin(o.pincode, `order ${o.order_id}`);
  const expectedKept = o.window_closed ? (o.status === "delivered" ? o.amount - o.refund_amount : 0) : Math.round(o.amount * (1 - o.predicted_return_prob));
  if (Math.abs(expectedKept - o.kept_revenue) > 1) err(`order ${o.order_id}: kept_revenue ${o.kept_revenue} ≠ ${expectedKept}`);
});
const sessById = new Map(os.sessions.map((s) => [s.session_id, s]));
chats.messages.forEach((m) => {
  const s = sessById.get(m.session_id);
  if (!s) return err(`chat ${m.id}: unknown session`);
  if (!s.chat_opened || s.arm !== "C" || s.ad_group_id !== m.ad_group_id) err(`chat ${m.id}: session isn't an arm-C chat session for ${m.ad_group_id}`);
  if (s.converted !== m.converted) err(`chat ${m.id}: converted flag disagrees with session`);
});
demo.steps.forEach((s) => { agRef(s.ad_group, `demo ${s.id}`); pin(s.pincode, `demo ${s.id}`); s.cached_response?.cards.forEach((c) => c.skus.forEach((x) => sku(x, `demo ${s.id} card`))); });
evals.cases.forEach((c) => { agRef(c.setup.ad_group, `eval ${c.id}`); pin(c.setup.pincode, `eval ${c.id}`); sku(c.setup.page_sku, `eval ${c.id}`); });
check(new Set(evals.cases.map((c) => c.id)).size === evals.cases.length, "eval ids unique");

/* ───────── catalogue facts ───────── */
const cat = (c: string) => products.filter((p) => p.metafields.jewellery.category === c).length;
check(products.length >= 33 && products.length <= 37, `~35 products (${products.length})`);
check(cat("earrings") === 18 && cat("necklace") === 8 && cat("ring") === 5 && cat("bracelet") === 4, `category mix 18/8/5/4 (${cat("earrings")}/${cat("necklace")}/${cat("ring")}/${cat("bracelet")})`);
const jh = products.filter((p) => p.metafields.jewellery.subtype === "jhumka").length;
check(jh >= 3 && jh <= 4, `3–4 jhumkas (${jh})`);
for (const p of products) {
  const pr = Number(p.variants[0].price), j = p.metafields.jewellery;
  if (pr < 999 || pr > 4999) err(`${p.handle}: price ${pr} outside ₹999–₹4,999`);
  const band = pr < 1500 ? "under_1500" : pr < 3000 ? "1500_3000" : "3000_5000";
  if (j.price_band !== band) err(`${p.handle}: price_band ${j.price_band} ≠ ${band}`);
  p.variants.forEach((v) => { if (v.compare_at_price && Number(v.compare_at_price) < Number(v.price)) err(`${p.handle}: compare_at < price`); });
  if (/chatgpt/i.test(p.body_html)) err(`${p.handle}: body_html names ChatGPT`);
  for (const b of rules.banned_phrases) if (p.body_html.toLowerCase().includes(b.toLowerCase())) err(`${p.handle}: banned phrase "${b}" in body_html`);
}
const P = (h: string) => products.find((p) => p.handle === h)!;
const noStock = products.filter((p) => p.variants.some((v) => !Number.isInteger(v.inventory_quantity) || v.inventory_quantity < 0));
check(noStock.length === 0, "every SKU variant has a stock count", `missing/invalid stock: ${noStock.map((p) => p.handle).join(", ")}`);
const outOfStock = products.filter((p) => !p.metafields.jewellery.made_to_order && p.variants.every((v) => v.inventory_quantity === 0));
check(outOfStock.length === 0, "no ready-stock SKU is at 0 units", `0 units: ${outOfStock.map((p) => p.handle).join(", ")}`);
const hero = P(planted.hero).metafields.jewellery;
check(hero.outer_diameter_mm === 40 && hero.drop_length_mm === 42, "hero (large hoops): outer 40mm, drop 42mm");
check(P(planted.hero).variants.every((v) => v.inventory_quantity > 0), "hero in stock");
const keeper = P(planted.keeper).metafields.jewellery;
check(keeper.made_to_order && keeper.dispatch_days === 5, "keeper (medium hoops) made-to-order, dispatch_days 5");
check(P(planted.rescue).variants.every((v) => v.inventory_quantity > 0), "rescue (tube hoops) in stock");
check(P("ciel-hoops-40mm").metafields.jewellery.water_resistant === true, "hero has verified water_resistant: true");
const pinnedWedding = rules.pinned["wedding-guest-gift"]?.[0];
check(pinnedWedding?.sku === "noor-kundan-jhumkas" && P("noor-kundan-jhumkas").metafields.jewellery.subtype === "jhumka", "new jhumka pinned slot 1 for wedding");
const near = rules.excluded_skus.find((e) => /stock/i.test(e.reason)), clr = rules.excluded_skus.find((e) => /clearance/i.test(e.reason));
check(!!near && P(near.sku).variants.reduce((s, v) => s + v.inventory_quantity, 0) <= 3 && !!clr && P(clr.sku).tags.includes("clearance"), "excluded: one near out-of-stock, one clearance");

// planted gaps, computed independently of the answer key, then compared with it
const wpComputed = products.filter((p) => p.metafields.jewellery.water_resistant === null && WATERPROOF_PROSE.test(p.body_html)).map((p) => p.handle).sort();
check(wpComputed.length === 18, `18 SKUs waterproof only in prose (${wpComputed.length})`);
check(JSON.stringify(wpComputed) === JSON.stringify([...planted.waterproof_prose_only].sort()), "waterproof-prose set matches answer key", `waterproof-prose set differs from answer key: ${wpComputed.filter((h) => !planted.waterproof_prose_only.includes(h)).join(",")} / ${planted.waterproof_prose_only.filter((h) => !wpComputed.includes(h)).join(",")}`);
const hyComputed = products.filter((p) => HYPO_POST_PROSE.test(p.body_html)).map((p) => p.handle).sort();
check(hyComputed.length === 6, `6 SKUs with titanium/surgical-steel posts in prose (${hyComputed.length})`);
check(JSON.stringify(hyComputed) === JSON.stringify([...planted.hypoallergenic_posts_prose_only].sort()), "hypo-post set matches answer key");
for (const h of planted.hypoallergenic_posts_prose_only) {
  const j = P(h).metafields.jewellery;
  if (j.nickel_free !== null || j.post_material !== null) err(`${h}: nickel_free/post_material must be null`);
  if (!["stud", "huggie"].includes(j.subtype)) err(`${h}: hypo-post SKU must be a stud or huggie`);
}
check(planted.vague_wording.length === 4, "4 vague-wording SKUs");
for (const v of planted.vague_wording) {
  const p = P(v.sku);
  if (!p.body_html.toLowerCase().includes(v.phrase)) err(`${v.sku}: vague phrase "${v.phrase}" not in prose`);
  if (WATERPROOF_PROSE.test(p.body_html) || HYPO_POST_PROSE.test(p.body_html)) err(`${v.sku}: vague SKU also matches a strong-claim pattern`);
}

/* ───────── planted delivery dates ───────── */
const now = new Date(DEMO_NOW_ISO);
for (const d of planted.delivery_pune) {
  const e = estimateDelivery(P(d.sku), "411038", logistics, now);
  check(e.ships_on === d.ships && e.arrives_on === d.arrives, `delivery ${d.sku} → Pune: ships ${d.ships}, arrives ${d.arrives}`, `delivery ${d.sku} → Pune: got ships ${e.ships_on} arrives ${e.arrives_on}, expected ${d.ships}/${d.arrives}`);
}
check(estimateDelivery(P(planted.keeper), "411038", logistics, now, "2026-10-18").meets_deadline === false && estimateDelivery(P(planted.rescue), "411038", logistics, now, "2026-10-18").meets_deadline === true, "deadline 18 Oct: 30mm misses, Aria meets");
const winHolidays = logistics.holidays.filter((h) => h.date >= "2026-10-13" && h.date <= "2026-10-25");
check(winHolidays.length === 0, "no holidays in the 13–25 Oct demo window");

/* ───────── returns ───────── */
for (const r of returns.skus) {
  if (Math.abs(r.return_rate - r.returns / r.units_sold) > 0.0011) err(`${r.sku}: return_rate inconsistent`);
  if (Math.abs(r.rto_rate - r.rto / r.units_sold) > 0.0011) err(`${r.sku}: rto_rate inconsistent`);
  for (const [g, v] of Object.entries(r.by_ad_group)) if (Math.abs(v.return_rate - v.returns / v.units) > 0.0011) err(`${r.sku}.${g}: by_ad_group rate inconsistent`);
  const ucUnits = Object.values(r.by_use_context).reduce((s, v) => s + v.units, 0);
  const ucRet = Object.values(r.by_use_context).reduce((s, v) => s + v.returns, 0);
  if (ucUnits !== r.units_sold - r.rto || ucRet !== r.returns) err(`${r.sku}: by_use_context doesn't sum to delivered units/returns`);
  Object.values(r.by_use_context).forEach((v) => { if (v.kept !== v.units - v.returns) err(`${r.sku}: kept ≠ units − returns`); });
  if (![planted.hero, planted.keeper, planted.layered_set].includes(r.sku) && (r.reasons_raw.length < 3 || r.reasons_raw.length > 8)) err(`${r.sku}: expected 3–8 reasons, got ${r.reasons_raw.length}`);
}
const R = (h: string) => returns.skus.find((r) => r.sku === h)!;
const heroReasons = R(planted.hero).reasons_raw;
const sizeShare = heroReasons.filter((x) => planted.return_reason_labels[x.id] === "size_bigger").length / heroReasons.length;
check(heroReasons.length >= 18 && heroReasons.length <= 22 && sizeShare >= 0.6, `hero: ~20 reasons, mostly size (${heroReasons.length}, ${Math.round(sizeShare * 100)}% size)`);
check(R(planted.keeper).return_rate < 0.05, `keeper low return rate (${R(planted.keeper).return_rate})`);
const lay = R(planted.layered_set);
check(Math.abs(lay.by_ad_group["office-minimal"].return_rate - 0.22) < 0.005 && Math.abs(lay.return_rate - 0.08) < 0.005, `layered set: office 22% vs overall 8% (${lay.by_ad_group["office-minimal"].return_rate} / ${lay.return_rate})`);
const layReasons = lay.reasons_raw.filter((x) => ["too_long", "tangles"].includes(planted.return_reason_labels[x.id])).length / lay.reasons_raw.length;
check(layReasons >= 0.7, `layered set reasons mostly "too long"/"tangles" (${Math.round(layReasons * 100)}%)`);
const officeKeep = (h: string) => R(h).by_use_context.office?.kept ?? 0;
check(officeKeep(planted.keeper) > officeKeep(planted.hero), `office keepers favour 30mm (${officeKeep(planted.keeper)} vs ${officeKeep(planted.hero)})`);

/* ───────── chats ───────── */
const themeOf = (id: string) => planted.chat_themes[id];
const hypo = chats.messages.filter((m) => themeOf(m.id) === "hypoallergenic");
check(hypo.length === 34 && new Set(hypo.map((m) => m.session_id)).size === 34, `34 hypoallergenic chats from 34 distinct sessions (${hypo.length}, ${new Set(hypo.map((m) => m.session_id)).size})`);
check(chats.messages.length >= 140 && chats.messages.length <= 160, `~150 chat messages (${chats.messages.length})`);
const hing = chats.messages.filter((m) => m.language === "hi-Latn").length;
check(hing >= 12 && hing <= 18, `~15 Hinglish messages (${hing})`);
const counts = Object.values(planted.chat_themes).reduce<Record<string, number>>((a, t) => ((a[t] = (a[t] ?? 0) + 1), a), {});
ok.push(`chat themes: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`);

/* ───────── metrics (computed exactly as the merchant console will) ───────── */
const A = slice(os, byArm("A")), B = slice(os, byArm("B")), C = slice(os, byArm("C"));
const wed = slice(os, byAdGroup("wedding-guest-gift"));
const t = planted.metric_targets;
const near2 = (x: number, y: number, tol: number) => Math.abs(x - y) <= tol;
check(near2(C.keptPerClick, t.kept_per_click_C, 2.5), `kept/click arm C ≈ ₹${t.kept_per_click_C} (₹${C.keptPerClick.toFixed(1)})`);
check(near2(A.keptPerClick, t.kept_per_click_A, 2.5), `kept/click arm A ≈ ₹${t.kept_per_click_A} (₹${A.keptPerClick.toFixed(1)})`);
check(B.keptPerClick > A.keptPerClick && B.keptPerClick < C.keptPerClick, `arm B between (₹${B.keptPerClick.toFixed(1)})`);
check(near2(wed.keptPerClick, t.kept_per_click_wedding, 3), `wedding row ≈ ₹${t.kept_per_click_wedding} (₹${wed.keptPerClick.toFixed(1)})`);
check(near2(C.returnRtoRate, t.return_rto_C, 0.025), `return+RTO arm C ≈ 9% (${(C.returnRtoRate * 100).toFixed(1)}%)`);
check(near2(A.returnRtoRate, t.return_rto_A, 0.03), `return+RTO arm A ≈ 14% (${(A.returnRtoRate * 100).toFixed(1)}%)`);
check(C.chatOpenRate >= t.chat_open_C_min && C.chatOpenRate <= t.chat_open_C_max, `chat open rate arm C 15–25% (${(C.chatOpenRate * 100).toFixed(1)}%)`);
ok.push(`sessions ${os.sessions.length}, orders ${os.orders.length}`);
if (os.orders.length < 250) warn(`orders = ${os.orders.length} (brief said ~400; per-click targets take priority, see BUILD_LOG)`);

/* ───────── policies & offers ───────── */
check(rzp.kept_revenue.return_window_days === brand.policies.return_window_days, "return window consistent (brand ↔ razorpay)");
check(offers.offers.filter((o) => o.type !== "wallet").every((o) => (o.type === "percent" ? o.value <= rules.offer_caps.max_pct : (o.cap_inr ?? o.value) <= rules.offer_caps.max_flat_inr)), "each offer within caps");
check(offers.offers.find((o) => o.id === "first_order")?.cap_inr === 300, "first order 10% capped at ₹300");

/* ───────── demo script & evals ───────── */
const cats = new Set(evals.cases.map((c) => c.category));
check(evals.cases.length >= 38 && evals.cases.length <= 45, `~40 eval cases (${evals.cases.length})`);
check(S.EvalCategory.options.every((c) => cats.has(c)), "every eval category covered");
check(demo.try_it_chips.some((c) => /office mein/i.test(c.text)) && demo.try_it_chips.some((c) => /50% off/.test(c.text)), "Hinglish + 50%-off chips present");
for (const s of demo.steps) {
  if (s.surface === "chat" && !s.cached_response) warn(`demo step ${s.id} has no cached response yet (run npm run demo-cache)`);
  if (s.cached_response && /chatgpt/i.test(s.cached_response.text)) err(`demo ${s.id}: cached response names ChatGPT`);
  // groundedness: every date / ₹ amount in a cached reply must appear in its own trace
  if (s.cached_response) {
    const traceText = JSON.stringify(s.cached_response.trace) + JSON.stringify(s.cached_response.cards);
    for (const m of s.cached_response.text.match(/\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|₹\d[\d,]*\d|\d+%/g) ?? []) {
      if (!traceText.includes(m) && !traceText.includes(m.replace(/[₹,]/g, ""))) err(`demo ${s.id}: "${m}" not grounded in its tool trace`);
    }
  }
}

/* ───────── images ───────── */
for (const p of products) {
  const m = manifest.products[p.handle];
  if (!m) { err(`manifest missing ${p.handle}`); continue; }
  for (const role of ["front", "on_model"] as const) {
    if (m[role].kind === "photo" && !existsSync(join(ROOT, "public", m[role].file))) err(`${p.handle}.${role}: photo file missing`);
  }
}
const placeholders = Object.values(manifest.products).filter((m) => m.front.kind !== "photo").length;
if (placeholders) warn(`${placeholders} products still use placeholder art`);

/* ───────── fictional-data guard ───────── */
const allText = ["data/brand.json", "data/shoppers.json", "data/catalogue/products.json", "data/returns.json", "data/chat_logs_seed.json", "data/razorpay.json"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
if (/\b\d{13,19}\b/.test(allText.replace(/"id": \d+/g, ""))) err("found a long digit string that looks like a card number");
const phoneHit = allText.replace(/"id": \d+/g, "").replace(/\d{11,}/g, "").match(/\b[6-9]\d{9}\b/);
if (phoneHit) err(`found an unmasked Indian mobile number: ${phoneHit[0]}`);
for (const e of allText.match(/[\w.•-]+@[\w-]+\.[\w.]+/g) ?? []) if (!/@(cosmos\.example|example\.com|okbank)/.test(e)) err(`non-fictional-looking email ${e}`);

finish();

function finish(): never {
  for (const m of ok) console.log("  ✓", m);
  for (const m of warnings) console.log("  ⚠", m);
  for (const m of errors) console.log("  ✗", m);
  console.log(`\n${ok.length} passed, ${warnings.length} warnings, ${errors.length} errors`);
  process.exit(errors.length ? 1 : 0);
}
