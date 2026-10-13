import assert from "node:assert/strict";
import { getDb } from "../../src/lib/data";
import { lineItems, quote, type Quote, type QuoteInput } from "../../src/lib/checkout";
import { userFromRequest } from "../../src/lib/user";
import { getOffer } from "../../src/lib/tools/core";

const db = getDb();
const user = userFromRequest(new Request("http://test.local", { headers: { cookie: "cosmos_user=ananya" } }))!;
const input: QuoteInput = { pincode: "411038", method: "online", walletOn: false, bankCard: false, coupon: null, adGroupId: null, giftWrap: false };
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

function reconciles(q: Quote) {
  assert.equal(q.applied.reduce((sum, offer) => sum + offer.amount_inr, 0), q.discount_inr, "offer rows must sum to the capped discount");
  assert.ok(q.applied.every((offer) => offer.amount_inr > 0), "zero-value offers must not appear applied");
  assert.ok(q.discount_inr <= q.cap.cap_inr_for_this_cart);
  assert.equal(q.payable_inr, q.subtotal_inr - q.discount_inr - (q.wallet.on ? q.wallet.usable_inr : 0) + q.shipping_inr + q.gift_wrap_inr + q.cod_fee_inr);
  const li = lineItems(q);
  assert.equal(li.line_items_total, q.payable_inr * 100);
  assert.equal(li.line_items.reduce((sum, item) => sum + item.offer_price * item.quantity, 0), li.line_items_total, "every payment paise must be allocated");
  assert.ok(li.line_items.every((item) => Number.isSafeInteger(item.offer_price) && item.offer_price >= 0 && Number.isInteger(item.quantity) && item.quantity > 0));
  for (const line of q.lines) {
    const items = li.line_items.filter((item) => item.sku === line.sku);
    assert.equal(items.reduce((sum, item) => sum + item.quantity, 0), line.qty, "allocation must preserve quantity");
    assert.ok(items.length <= 2, "at most two unit-price groups per SKU");
    assert.ok(Math.max(...items.map((item) => item.offer_price)) - Math.min(...items.map((item) => item.offer_price)) <= 1);
    assert.ok(items.every((item) => item.price === line.unit_inr * 100 && item.variant_id === line.variant_id && item.name === line.title));
  }
}

check("bank/prepaid rows reconcile at the percentage cap without changing the payable amount", () => {
  const q = quote([{ sku: "sol-paperclip-chain", qty: 1 }], null, { ...input, bankCard: true });
  assert.equal(q.discount_inr, 249);
  assert.equal(q.payable_inr, 2250);
  assert.deepEqual(q.applied.map((o) => [o.id, o.amount_inr]), [["prepaid_bonus", 100], ["bank_offer", 149]]);
  reconciles(q);
});

check("a fully exhausted cap does not promise an additional nudge discount", () => {
  const q = quote([{ sku: "sol-paperclip-chain", qty: 2 }], user, { ...input, bankCard: true });
  assert.equal(q.discount_inr, 300);
  assert.equal(q.payable_inr, 4698);
  assert.ok(!q.applied.some((o) => o.id === "prepaid_nudge"));
  assert.ok(q.prepaid_nudge);
  assert.ok(q.prepaid_nudge.text.includes(`₹${(q.cod_payable_inr - q.online_payable_inr).toLocaleString("en-IN")}`));
  assert.match(q.prepaid_nudge.text, /compared with cash on delivery/);
  assert.doesNotMatch(q.prepaid_nudge.text, /extra 5%|₹249/);
  reconciles(q);
});

check("a partially capped nudge uses only its remaining allocation", () => {
  const q = quote([{ sku: "ciel-hoops-40mm", qty: 2 }], user, input);
  assert.equal(q.discount_inr, 300);
  assert.equal(q.applied.find((o) => o.id === "prepaid_nudge")?.amount_inr, 200);
  assert.ok(q.prepaid_nudge);
  assert.doesNotMatch(q.prepaid_nudge.text, /compared with cash on delivery/, "do not compare against unavailable COD");
  reconciles(q);
});

check("non-stackable first-order offers stay non-stackable", () => {
  const q = quote([{ sku: "tara-pearl-studs", qty: 1 }], user, { ...input, coupon: "WELCOME10", walletOn: true });
  assert.deepEqual(q.applied.map((o) => o.id), ["first_order"]);
  assert.equal(q.payable_inr, 1015);
  assert.equal(q.wallet.usable_inr, 234);
  reconciles(q);
});

check("chat offer summary labels both totals without changing checkout arithmetic", () => {
  const cart = [{ sku: "ciel-hoops-40mm", qty: 1 }];
  const offer = getOffer(db, cart, { prepaid: true, logged_in: true, rto_risk: "high" });
  assert.equal(offer.total_before_wallet_inr, 3035);
  assert.equal(offer.total_inr, 2735);
  assert.match(offer.payment_summary, /₹3,035 before wallet credit/);
  assert.match(offer.payment_summary, /₹2,735 if you use ₹300 from your wallet/);
  const guest = getOffer(db, cart, { prepaid: true });
  assert.equal(guest.total_before_wallet_inr, guest.total_inr);
  assert.doesNotMatch(guest.payment_summary, /wallet/);
});

check("COD reports its own cap state, not the unused online offer combination", () => {
  const q = quote([{ sku: "sol-paperclip-chain", qty: 1 }], user, { ...input, bankCard: true, method: "cod" });
  assert.equal(q.discount_inr, 0);
  assert.equal(q.cap.clamped, false);
  assert.equal(q.cod_fee_inr, 49);
  reconciles(q);
});

check("three units receive the remaining two paise without changing the charge", () => {
  const q = quote([{ sku: "tara-pearl-studs", qty: 3 }], null, input);
  assert.equal(q.payable_inr, 3797);
  const items = lineItems(q).line_items;
  assert.deepEqual(items.map((i) => [i.quantity, i.offer_price]), [[1, 126566], [2, 126567]]);
  reconciles(q);
});

check("invalid allocation input is rejected rather than returning an unbalanced order", () => {
  const empty = quote([], null, input);
  assert.throws(() => lineItems(empty), /allocate/i);
});

check("offer labels and charges remain unchanged when no cap reduces an offer", () => {
  const o = getOffer(db, [{ sku: "sol-paperclip-chain", qty: 1 }], { prepaid: true });
  assert.equal(o.applied[0].label, db.offers.find((offer) => offer.id === "prepaid_bonus")!.label);
  assert.equal(o.applied[0].amount_inr, 100);
  assert.equal(o.total_inr, 2399);
});

check("order care instructions use the same verified-claim rules as chat", () => {
  const q = quote([{ sku: "sol-paperclip-chain", qty: 1 }, { sku: "ciel-hoops-40mm", qty: 1 }], null, input);
  assert.match(q.lines[0].care, /Keep dry/);
  assert.doesNotMatch(q.lines[0].care, /Safe with water/);
  assert.equal(q.lines[1].care, db.products.find((p) => p.handle === "ciel-hoops-40mm")!.metafields.jewellery.care);
});

check("all catalogue prices and checkout options reconcile exactly", () => {
  let count = 0;
  const carts = db.products.flatMap((p) => [1, 2, 3, 7, 15].map((qty) => [{ sku: p.handle, qty }]));
  carts.push(
    [{ sku: "tara-pearl-studs", qty: 3 }, { sku: "sol-paperclip-chain", qty: 6 }],
    [{ sku: "tara-solitaire-studs", qty: 2 }, { sku: "kira-twist-huggies", qty: 7 }],
    [{ sku: "ciel-hoops-30mm", qty: 1 }, { sku: "tara-pearl-studs", qty: 3 }, { sku: "kira-mini-huggies", qty: 5 }],
  );
  for (const cart of carts)
    for (const loggedIn of [false, true])
      for (const method of ["online", "cod"] as const)
        for (const bankCard of [false, true])
          for (const walletOn of [false, true])
            for (const giftWrap of [false, true])
              for (const coupon of [null, "WELCOME10"]) {
                const q = quote(cart, loggedIn ? user : null, { ...input, method, bankCard, walletOn, giftWrap, coupon });
                reconciles(q);
                count++;
              }
  console.log(`  ${count} pure quote combinations; no orders or payments`);
});

console.log(`${passed} checkout arithmetic checks passed`);
