/**
 * `npm run test:payments`: Razorpay signature verification. The expected HMAC is computed here from the key secret
 * in the environment (never printed); the verifier must accept it and reject every tampered variant.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {}
}

(async () => {
  const { verifyPaymentSignature } = await import("../../src/lib/payments");
  const { readRecord, signRecord } = await import("../../src/lib/orderToken");
  if (!process.env.RAZORPAY_KEY_SECRET) {
    console.log("RAZORPAY_KEY_SECRET not set: skipped (mock mode)");
    return;
  }
  const order = "order_TEST123", payment = "pay_TEST456";
  const good = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${order}|${payment}`).digest("hex");
  const flip = (s: string) => s.slice(0, -1) + (s.at(-1) === "0" ? "1" : "0");
  const cases: [string, boolean][] = [
    ["valid signature accepted", verifyPaymentSignature(order, payment, good)],
    ["one hex digit changed → rejected", !verifyPaymentSignature(order, payment, flip(good))],
    ["other payment id → rejected", !verifyPaymentSignature(order, "pay_OTHER", good)],
    ["other order id → rejected", !verifyPaymentSignature("order_OTHER", payment, good)],
    ["empty signature → rejected", !verifyPaymentSignature(order, payment, "")],
    ["signed order record round-trips", readRecord<{ a: number }>(signRecord({ a: 1 }))?.a === 1],
    ["tampered order record → null", readRecord(flip(signRecord({ a: 1 }))) === null],
  ];
  for (const [name, ok] of cases) {
    assert.ok(ok, name);
    console.log(`  ✓ ${name}`);
  }
  console.log(`${cases.length} passed`);
})();
