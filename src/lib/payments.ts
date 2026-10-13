/**
 * Razorpay (Test Mode) on the server: create an order with the Orders API and verify the payment signature.
 * The key secret never leaves this module: it's only used for Basic auth and the HMAC, never logged or returned.
 *
 * PAYMENTS_MODE=test → real Razorpay Test Mode; "mock" → no Razorpay call, a simulated payment. Missing keys force
 * mock. MAGIC_CHECKOUT_ENABLED=true would switch the payment step to Magic Checkout for a merchant that has it
 * activated (same order, plus line_items; see BUILD_LOG); it's false here, so our simulated steps + Standard Checkout.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentsMode = "test" | "mock";

export function paymentsMode(): PaymentsMode {
  const keys = !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET;
  return process.env.PAYMENTS_MODE === "test" && keys ? "test" : "mock";
}
export const magicCheckoutEnabled = () => process.env.MAGIC_CHECKOUT_ENABLED === "true";
/** The only key that reaches the browser. */
export const publicKeyId = () => process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? "";

export type RazorpayOrder = { id: string; amount: number; currency: string; receipt: string; status: string; notes: Record<string, string> };

/** Orders API: amount in paise, computed by the caller on the server. Notes are strings (Razorpay: max 15 keys, 256 chars each). */
export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>): Promise<RazorpayOrder> {
  const id = process.env.RAZORPAY_KEY_ID!, secret = process.env.RAZORPAY_KEY_SECRET!;
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
  });
  const body = (await res.json().catch(() => ({}))) as RazorpayOrder & { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay order failed (${res.status}): ${body.error?.description ?? "no description"}`);
  return body;
}

/** HMAC-SHA256 of "order_id|payment_id" with the key secret, compared in constant time. */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret || !orderId || !paymentId || !/^[a-f0-9]{64}$/i.test(signature ?? "")) return false;
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
