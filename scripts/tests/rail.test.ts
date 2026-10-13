import assert from "node:assert/strict";
import { loadDb } from "../../src/lib/data/disk";
import { applyRailPreferences, type RailItem } from "../../src/lib/rail-preferences";
import { PreferencesSchema, readPreferencesCookie } from "../../src/lib/preferences";

const db = loadDb();
const office = db.adGroups.find((g) => g.id === "office-minimal")!;
const wedding = db.adGroups.find((g) => g.id === "wedding-guest-gift")!;
const item = (sku: string): RailItem => ({ sku, reason: "", pinned: false });
const product = (sku: string) => db.products.find((p) => p.handle === sku)!;
const options = { hero: "ciel-hoops-40mm", candidates: office.candidate_skus, groupId: office.id, pincode: "411038", size: db.rules.rail_size };
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

check("chat budget, occasion and category apply together within the ad pool", () => {
  const rows = applyRailPreferences(db, office.candidate_skus.map(item), { budget_max_inr: 2000, occasion: "office", category: "earrings" }, options);
  assert.ok(rows.length > 0);
  assert.ok(rows.length <= db.rules.rail_size);
  for (const row of rows) {
    const p = product(row.sku);
    assert.ok(office.candidate_skus.includes(row.sku));
    assert.ok(Number(p.variants[0].price) <= 2000);
    assert.equal(p.metafields.jewellery.category, "earrings");
    assert.ok(p.metafields.jewellery.occasions.includes("office"));
  }
});

check("matching candidates refill a filtered rail, without leaving the pool", () => {
  const rows = applyRailPreferences(db, [item("ciel-hoops-30mm")], { budget_max_inr: 2000 }, options);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.sku !== "ciel-hoops-30mm" && office.candidate_skus.includes(row.sku)));
});

check("impossible and zero budgets return an empty rail, not unrelated fallback items", () => {
  for (const budget of [0, 1]) assert.deepEqual(applyRailPreferences(db, office.candidate_skus.map(item), { budget_max_inr: budget }, options), []);
});

check("base items outside the ad pool cannot leak into the updated rail", () => {
  const rows = applyRailPreferences(db, [item("lia-flower-studs")], { budget_max_inr: 5000 }, options);
  assert.ok(!rows.some((row) => row.sku === "lia-flower-studs"));
});

check("hero, owned products and merchant exclusions remain excluded", () => {
  const candidates = [...office.candidate_skus, "luna-heart-pendant", "ciel-hoops-40mm"];
  const rows = applyRailPreferences(db, candidates.map(item), {}, { ...options, candidates, ownedSkus: ["ciel-huggies-20mm", "luna-coin-pendant"], size: 35 });
  assert.ok(rows.every((row) => !["ciel-hoops-40mm", "ciel-huggies-20mm", "luna-coin-pendant", "luna-heart-pendant"].includes(row.sku)));
});

check("login size preferences remain enforced when the rail changes", () => {
  const rows = applyRailPreferences(db, wedding.candidate_skus.map(item), {}, { ...options, candidates: wedding.candidate_skus, groupId: wedding.id, maxEarringCm: 3 });
  assert.ok(rows.every((row) => {
    const j = product(row.sku).metafields.jewellery;
    return j.category !== "earrings" || (j.outer_diameter_cm ?? j.drop_length_cm ?? 0) <= 3;
  }));
});

check("brand pins keep their slot only while meeting the shopper's constraints", () => {
  const pin = db.rules.pinned[wedding.id][0];
  const opts = { ...options, candidates: wedding.candidate_skus, groupId: wedding.id };
  const rows = applyRailPreferences(db, wedding.candidate_skus.map(item), {}, opts);
  assert.equal(rows[pin.slot - 1].sku, pin.sku);
  const price = Number(product(pin.sku).variants[0].price);
  assert.ok(!applyRailPreferences(db, rows, { budget_max_inr: price - 1 }, opts).some((row) => row.sku === pin.sku));
});

check("delivery deadlines use the deterministic delivery tool", () => {
  const candidates = ["ciel-hoops-30mm", "aria-hoops-28mm"];
  const rows = applyRailPreferences(db, candidates.map(item), { deadline: "2026-10-18" }, { ...options, candidates });
  assert.deepEqual(rows.map((row) => row.sku), ["aria-hoops-28mm"]);
  assert.match(rows[0].reason, /16 Oct/);
});

check("out-of-stock and low-margin products cannot refill the rail", () => {
  const copy = structuredClone(db);
  const soldOut = copy.products.find((p) => p.handle === "tara-solitaire-studs")!;
  soldOut.variants.forEach((v) => { v.inventory_quantity = 0; });
  const lowMargin = copy.products.find((p) => p.handle === "elle-bezel-studs")!;
  lowMargin.metafields.jewellery.margin_band = "low";
  const rows = applyRailPreferences(copy, office.candidate_skus.map(item), {}, options);
  assert.ok(rows.every((row) => row.sku !== soldOut.handle && row.sku !== lowMargin.handle));
});

check("style matching changes ranking without inventing a hard exclusion", () => {
  const candidates = ["tara-solitaire-studs", "noor-mini-jhumkas"];
  const rows = applyRailPreferences(db, candidates.map(item), { style: "ethnic fusion" }, { ...options, candidates, groupId: undefined });
  assert.equal(rows[0].sku, "noor-mini-jhumkas");
  assert.equal(rows.length, 2);
});

check("both raw and Next-decoded preference cookies are supported", () => {
  const prefs = { budget_max_inr: 0, category: "earrings", style: "50% statement" };
  const raw = JSON.stringify(prefs);
  assert.deepEqual(readPreferencesCookie(raw), prefs);
  assert.deepEqual(readPreferencesCookie(encodeURIComponent(raw)), prefs);
  assert.deepEqual(readPreferencesCookie(undefined), {});
});

check("malformed constraints cannot affect the rail", () => {
  assert.equal(PreferencesSchema.safeParse({ budget_max_inr: -1 }).success, false);
  assert.equal(PreferencesSchema.safeParse({ category: "watches" }).success, false);
  assert.equal(PreferencesSchema.safeParse({ deadline: "2026-02-30" }).success, false);
  assert.equal(PreferencesSchema.safeParse({ deadline: "2026-10-18" }).success, true);
});

console.log(`${passed} rail checks passed`);
