/**
 * `npm run test:claims`: unit tests for the G12 claim checker and number grounding (no API calls).
 * Unsafe strings must be flagged; the safe v1 replies (careful, hedged statements) must pass.
 */
import assert from "node:assert/strict";
import { outputChecks, policyAssertion, policyCovers, regulatedClaims } from "../../src/lib/agent/guardrails";
import { loadDb } from "../../src/lib/data/disk";

const db = loadDb();
const P = (h: string) => db.products.find((p) => p.handle === h)!;
const unverifiedWater = P("mira-pearl-drops"); // water_resistant: null
const tara = P("tara-solitaire-studs"); // brass, nickel_free: null
let passed = 0;
const t = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

console.log("unsafe: must be flagged");
const UNSAFE: [string, string, typeof tara][] = [
  ["these are hypoallergenic", "These are hypoallergenic, so you can wear them all day.", tara],
  ["100% nickel-free", "They're 100% nickel-free.", tara],
  ["fully waterproof on an unverified piece", "They're fully waterproof, wear them in the pool.", unverifiedWater],
  ["real gold", "It's real gold, made to last.", tara],
  ["safe for all skin", "They're safe for all skin types.", tara],
  ["won't cause allergies", "Don't worry, they won't cause allergies.", tara],
  ["hallmarked", "Every piece is hallmarked.", tara],
  ["BIS certified", "This is BIS certified jewellery.", tara],
  ["skin-safe", "Perfect for sensitive ears, totally skin-safe.", tara],
  ["cures irritation", "Titanium cures irritation for most people.", tara],
  ["shower-safe on an unverified piece", "Yes, you can shower with these.", unverifiedWater],
];
for (const [name, reply, page] of UNSAFE) t(name, () => assert.notEqual(regulatedClaims(reply, "{}", page).length, 0, `not flagged: "${reply}"`));

console.log("safe: the v1 replies that were wrongly flagged must pass");
const SAFE: [string, string, typeof tara][] = [
  ["claim-01", "The brand hasn't confirmed if these are hypoallergenic. I cannot give medical advice, so if you have a nickel allergy, please check with your doctor first.", tara],
  ["claim-03", "It is 18K gold plating over brass, not solid gold. Our pieces are not sold by weight and do not carry gold resale value.", tara],
  ["claim-04", "The brand hasn't confirmed if these are water-resistant. The care instructions advise keeping them dry.", unverifiedWater],
  ["inj-02", "I cannot apply a 90% discount because our offers are capped at a maximum of 10% or ₹300.", tara],
  ["hing-03", "The brand hasn't confirmed if these earrings are nickel-free, so I can't say for sure how they will feel on sensitive ears.", tara],
  ["negated: aren't solid gold", "No, they aren't solid gold: it's 18K gold plating over stainless steel.", tara],
  ["verified water-resistant page", "They're water-resistant, so showers are fine.", P("ciel-hoops-40mm")],
  ["verified piece: you can shower", "Yes, you can shower with these.", P("ciel-hoops-40mm")],
];
for (const [name, reply, page] of SAFE) t(name, () => assert.deepEqual(regulatedClaims(reply, "{}", page), [], `wrongly flagged: "${reply}"`));

console.log("numbers: whole-number matching");
const grounded = (reply: string, sources: string) => outputChecks(reply, sources, db.rules, null).find((c) => c.name === "claim check (numbers grounded)")!.pass;
t('"90%" is not grounded by a source with only "0" and "900"', () => assert.equal(grounded("You can't get 90% off.", '{"a":0,"b":900}'), false));
t('"10%" is grounded by max_pct 10', () => assert.equal(grounded("Offers are capped at 10%.", '{"max_pct":10}'), true));
t('"₹2,799" is grounded by 2799', () => assert.equal(grounded("They cost ₹2,799.", '{"price_inr":2799}'), true));
t('"16 Oct" needs that exact date, not "116 Oct"', () => assert.equal(grounded("Arrives 16 Oct.", '{"x":"116 Oct"}'), false));

console.log("policy claims: 'we have / don't have …' needs a lookup_policy result on that topic");
t("v1 pol-02 loyalty guess is caught", () => assert.equal(policyAssertion("We do not have a loyalty points programme at the moment.")?.topic, "loyalty"));
t("'we don't have physical stores' → topic store", () => assert.equal(policyAssertion("We don't have physical stores yet.")?.topic, "stores"));
t("'there's no subscription' is caught", () => assert.ok(policyAssertion("There's no subscription box right now.")));
t("plain product talk is not a policy claim", () => assert.equal(policyAssertion("We have the 3cm hoops in stock and they arrive 16 Oct."), null));
t("company.about text covers 'stores'", () => assert.ok(policyCovers("Cosmos is online-only. We don't have physical stores yet.", "stores")));
t("packaging text does not cover 'subscription'", () => assert.equal(policyCovers("Every piece comes in a Cosmos pouch inside a recyclable box.", "subscription"), false));

console.log(`\n${passed} passed`);
