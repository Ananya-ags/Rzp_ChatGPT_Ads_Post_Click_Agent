/**
 * Confirms an order. Razorpay: the HMAC-SHA256 signature of "order_id|payment_id" must match (key secret, server
 * only); anything else is rejected and logged, and no confirmation is shown. COD: placed without payment.
 * Mock: only for an order the server created as mock. The order record comes from the signed token, so what the
 * confirmation shows is what the server computed.
 */
import { readRecord } from "@/lib/orderToken";
import { verifyPaymentSignature } from "@/lib/payments";

type Record_ = { kind: "razorpay" | "mock" | "cod"; order_id: string; [k: string]: unknown };
type Body = { token?: string; razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Body;
  const rec = readRecord<Record_>(b.token ?? "");
  if (!rec) return Response.json({ ok: false, error: "We couldn't confirm the payment." }, { status: 400 });

  if (rec.kind === "razorpay") {
    const ok = b.razorpay_order_id === rec.order_id && verifyPaymentSignature(rec.order_id, b.razorpay_payment_id ?? "", b.razorpay_signature ?? "");
    if (!ok) {
      console.warn(`checkout: payment signature rejected for order ${rec.order_id}`); // ids only, never the secret
      return Response.json({ ok: false, error: "We couldn't confirm the payment." }, { status: 400 });
    }
    return Response.json({ ok: true, order: { ...rec, id: b.razorpay_payment_id, payment_id: b.razorpay_payment_id, payment_method: "Paid online (Razorpay Test Mode)" } });
  }
  if (rec.kind === "mock") {
    const id = `pay_mock_${rec.order_id.slice(-8)}`;
    return Response.json({ ok: true, order: { ...rec, id, payment_id: id, payment_method: "Simulated payment" } });
  }
  return Response.json({ ok: true, order: { ...rec, id: rec.order_id, payment_id: null, payment_method: "Cash on delivery" } });
}
