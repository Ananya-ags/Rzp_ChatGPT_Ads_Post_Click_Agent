/**
 * `npm run demo-cache`: fills data/demo_script.json cached responses by running the real tools
 * (fallback when the API is slow or unavailable). Every number in the text comes from a tool result.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadDb, readJson } from "../src/lib/data/disk";
import { DemoScriptSchema } from "../src/lib/schemas";
import { getReturnInsight, searchCatalog, checkDelivery, getOffer, findProduct, sizeText } from "../src/lib/tools/core";

const db = loadDb();
const demo = DemoScriptSchema.parse(readJson("data/demo_script.json"));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

type Cached = NonNullable<(typeof demo.steps)[number]["cached_response"]>;

function returnPrevention(hinglish: boolean): Cached {
  const ins = getReturnInsight(db, "ciel-hoops-40mm", "office");
  if ("error" in ins || !ins.relevant || !ins.top_reason || !ins.keepers) throw new Error("return insight not relevant; check pipelines");
  const alt = searchCatalog(db, "hoops office", { similar_to: "ciel-hoops-40mm", category: "earrings", max_outer_diameter_cm: 3, limit: 3 });
  const keep = ins.keepers;
  const sharedOfKeepers = pct(keep.share_of_keepers);
  const keeperFacts = alt.results.find((r) => r.sku === keep.sku)!;
  const heroCm = ins.size_note?.outer_diameter_cm;
  const text = hinglish
    ? `Sach bataun toh ${heroCm}cm hoops office ke liye bade lagte hain. Office se return karne wale ${ins.top_reason.of} mein se ${ins.top_reason.count} ne kaha "looked bigger than expected". Office ke ${sharedOfKeepers} keepers ne ${keeperFacts.outer_diameter_cm}cm wale ${keep.title} chune.`
    : `Honest answer: the ${heroCm}cm hoops are big for office. ${ins.top_reason.count} of ${ins.top_reason.of} people who returned them from work said they looked bigger than expected. ${sharedOfKeepers} of office keepers picked the ${keep.title} instead, which are ${keeperFacts.outer_diameter_cm}cm across.`;
  return {
    text,
    cards: [
      { kind: "comparison", skus: ["ciel-hoops-40mm", keep.sku], data: { metric: "outer_diameter_cm", values: { "ciel-hoops-40mm": ins.size_note?.outer_diameter_cm, [keep.sku]: keeperFacts.outer_diameter_cm }, keepers_share: keep.share_of_keepers } },
      { kind: "product", skus: alt.results.slice(0, 2).map((r) => r.sku), data: {} },
    ],
    trace: [
      { tool: "get_return_insight", args: { sku: "ciel-hoops-40mm", context: "office" }, summary: `relevant · office returns ${pct(ins.context_return_rate ?? 0)} vs ${pct(ins.overall_return_rate)} overall · top reason "${ins.top_reason.label}" ${ins.top_reason.count}/${ins.top_reason.of} · keepers ${sharedOfKeepers} chose ${keep.sku}` },
      { tool: "search_catalog", args: { query: "hoops office", similar_to: "ciel-hoops-40mm", category: "earrings", max_outer_diameter_cm: 3, limit: 3 }, summary: alt.results.map((r) => `${r.sku} (${r.size}, ${inr(r.price_inr)})`).join(" · ") },
    ],
  };
}

function deliveryRescue(): Cached {
  const first = checkDelivery(db, "ciel-hoops-30mm", "411038", "2026-10-18");
  if ("error" in first) throw new Error(first.error);
  const alt = searchCatalog(db, "hoops", { similar_to: "ciel-hoops-30mm", category: "earrings", max_outer_diameter_cm: 3, deliver_to_pincode: "411038", deliver_by: "2026-10-18", limit: 3 });
  const pick = alt.results[0];
  const second = checkDelivery(db, pick.sku, "411038", "2026-10-18");
  if ("error" in second) throw new Error(second.error);
  return {
    text: `The ${findProduct(db, "ciel-hoops-30mm")!.metafields.jewellery.outer_diameter_cm}cm hoops are made to order, so they'd reach Pune on ${first.arrives_label}, after 18 Oct. The ${second.title} are in stock and arrive ${second.arrives_label}: a similar everyday hoop, ${sizeText(findProduct(db, pick.sku)!.metafields.jewellery)}, ${inr(pick.price_inr)}.`,
    cards: [{ kind: "delivery", skus: ["ciel-hoops-30mm", pick.sku], data: { pincode: "411038", deadline: "2026-10-18", results: { "ciel-hoops-30mm": { arrives: first.arrives_on, meets: first.meets_deadline }, [pick.sku]: { arrives: second.arrives_on, meets: second.meets_deadline } } } }],
    trace: [
      { tool: "check_delivery", args: { sku: "ciel-hoops-30mm", pincode: "411038", deadline: "2026-10-18" }, summary: `✗ ships ${first.ships_label}, arrives ${first.arrives_label} (made to order, ${first.dispatch_days}-day dispatch); deadline 18 Oct` },
      { tool: "search_catalog", args: { query: "hoops", similar_to: "ciel-hoops-30mm", category: "earrings", max_outer_diameter_cm: 3, deliver_to_pincode: "411038", deliver_by: "2026-10-18", limit: 3 }, summary: alt.results.map((r) => `${r.sku} arrives ${r.arrives_label}`).join(" · ") },
      { tool: "check_delivery", args: { sku: pick.sku, pincode: "411038", deadline: "2026-10-18" }, summary: `✓ ships ${second.ships_label}, arrives ${second.arrives_label} · ${inr(pick.price_inr)}` },
    ],
  };
}

function offerAbuse(): Cached {
  const o = getOffer(db, [{ sku: "ciel-hoops-40mm", qty: 1 }], { requested_discount_pct: 50, prepaid: true });
  const best = o.applied[0];
  return {
    text: `I can't create discounts; the store caps offers at ${o.cap.max_pct}% or ${inr(o.cap.max_flat_inr)}. What you do get: ${best.label.charAt(0).toLowerCase() + best.label.slice(1)}, so you'd pay ${inr(o.total_inr)}.`,
    cards: [{ kind: "offer", skus: ["ciel-hoops-40mm"], data: { applied: o.applied, total_inr: o.total_inr, cap: o.cap } }],
    trace: [{ tool: "get_offer", args: { cart: [{ sku: "ciel-hoops-40mm", qty: 1 }], requested_discount_pct: 50, prepaid: true }, summary: `requested 50% → not allowed · cap ${o.cap.max_pct}% / ${inr(o.cap.max_flat_inr)} · applied "${best.label}" ${inr(best.amount_inr)} · total ${inr(o.total_inr)} (subtotal ${inr(o.subtotal_inr)})` }],
  };
}

const builders: Record<string, () => Cached> = {
  "d4-return-prevention": () => returnPrevention(false),
  "d5-delivery-rescue": deliveryRescue,
  "d9-trust": offerAbuse,
  "d10-hinglish": () => returnPrevention(true),
};
for (const s of demo.steps) if (builders[s.id]) s.cached_response = builders[s.id]();
writeFileSync(join(ROOT, "data/demo_script.json"), JSON.stringify(demo, null, 2) + "\n");
for (const s of demo.steps.filter((x) => x.cached_response)) console.log(`${s.id}: ${s.cached_response!.text}\n`);
