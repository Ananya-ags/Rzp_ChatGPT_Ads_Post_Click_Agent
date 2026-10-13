/**
 * "Pay ₹X": prices the bag on the server (never the client's total), then
 *   - online + test mode → a real Razorpay order (Orders API, amount in paise, receipt, attribution notes)
 *   - online + mock mode (no keys, or Checkout.js failed to load in the browser) → a simulated order
 *   - COD → no Razorpay call; the order is placed as cash on delivery
 * Returns a signed order record (src/lib/orderToken.ts) that /api/checkout/verify checks before confirming.
 */
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/data";
import { bagFromRequest, lineItems, predictKept, publicQuote, quote, type QuoteInput } from "@/lib/checkout";
import { createRazorpayOrder, magicCheckoutEnabled, paymentsMode, publicKeyId } from "@/lib/payments";
import { signRecord } from "@/lib/orderToken";
import { userFromRequest } from "@/lib/user";

type Body = Partial<QuoteInput> & { forceMock?: boolean; arm?: string; contact?: { name?: string; phone?: string; email?: string }; address?: { name?: string; line1?: string; city?: string; pincode?: string } };

const cookie = (req: Request, name: string) => (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1] ?? null;
const clip = (s: unknown, n = 120) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, n);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const db = getDb();
  const user = userFromRequest(req);
  const cart = bagFromRequest(req);
  if (!cart.length) return Response.json({ ok: false, error: "Your bag is empty." }, { status: 400 });
  const adGroupSlug = body.adGroupId && db.adGroups.some((g) => g.id === body.adGroupId) ? body.adGroupId : null;
  const q = quote(cart, user, { pincode: body.pincode ?? null, method: body.method === "cod" ? "cod" : "online", walletOn: body.walletOn !== false, bankCard: !!body.bankCard, coupon: body.coupon ?? null, adGroupId: adGroupSlug, giftWrap: !!body.giftWrap });
  if (q.method === "cod" && !q.cod.eligible) return Response.json({ ok: false, error: q.cod.note }, { status: 400 });

  const group = adGroupSlug ? db.adGroups.find((g) => g.id === adGroupSlug)! : null;
  const arm = ["A", "B", "C"].includes(String(body.arm)) ? String(body.arm) : "C";
  const oppref = cookie(req, "cosmos_oppref");
  const session = cookie(req, "cosmos_vid") ?? `s_${randomBytes(6).toString("hex")}`;
  const receipt = `csm_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
  const li = lineItems(q);
  const prediction = predictKept(q, adGroupSlug);

  // attribution hook: Razorpay notes (string values, ≤256 chars, ≤15 keys)
  const itemsCompact = JSON.stringify(li.line_items.map((i) => ({ sku: i.sku, name: i.name, price: i.price, offer_price: i.offer_price, quantity: i.quantity })));
  const notes: Record<string, string> = {
    ad_group_id: group?.ad_group_id ?? "direct",
    ad_group: group?.id ?? "direct",
    campaign_id: group?.campaign_id ?? "none",
    oppref: oppref ?? "none",
    session_id: session,
    arm,
    line_items_total: String(li.line_items_total),
    receipt,
  };
  for (let i = 0, part = 1; i < itemsCompact.length && part <= 5; i += 250, part++) notes[part === 1 ? "line_items" : `line_items_${part}`] = itemsCompact.slice(i, i + 250);

  const record = {
    receipt,
    method: q.method,
    lines: q.lines.map(({ sku, title, qty, unit_inr, line_inr, care }) => ({ sku, title, qty, unit_inr, line_inr, care })),
    payable_inr: q.payable_inr,
    saved_inr: q.saved_inr,
    cod_fee_inr: q.cod_fee_inr,
    arrives_label: q.arrives_label,
    city: q.city,
    pincode: q.pincode,
    contact: { name: clip(body.contact?.name ?? user?.firstName ?? "", 60), phone_last4: clip(body.contact?.phone, 20).replace(/\D/g, "").slice(-4) },
    attribution: { ad_group_id: notes.ad_group_id, ad_group: notes.ad_group, campaign_id: notes.campaign_id, oppref: oppref, arm, session_id: session },
    prediction,
    created_at: db.now.toISOString(),
  };

  if (q.method === "cod") {
    const id = `COD-${randomBytes(4).toString("hex").toUpperCase()}`;
    return Response.json({ ok: true, kind: "cod", order_id: id, token: signRecord({ ...record, kind: "cod", order_id: id }), quote: publicQuote(q) });
  }
  if (paymentsMode() === "mock" || body.forceMock) {
    const id = `order_mock_${randomBytes(6).toString("hex")}`;
    return Response.json({ ok: true, kind: "mock", order_id: id, amount: q.payable_inr * 100, token: signRecord({ ...record, kind: "mock", order_id: id }), quote: publicQuote(q), fallback: body.forceMock ? "checkout_js_unavailable" : "no_keys_or_mock_mode" });
  }
  try {
    // with Magic Checkout activated, line_items / line_items_total would go on the order itself (see BUILD_LOG)
    const order = await createRazorpayOrder(q.payable_inr * 100, receipt, notes);
    return Response.json({
      ok: true,
      kind: "razorpay",
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      notes: order.notes, // as Razorpay stored them (no secrets)
      key_id: publicKeyId(),
      magic_checkout_enabled: magicCheckoutEnabled(),
      // Razorpay wants the number with its country code
      prefill: { name: record.contact.name, contact: `+91${clip(body.contact?.phone, 20).replace(/\D/g, "").slice(-10)}`, email: clip(body.contact?.email, 80) },
      token: signRecord({ ...record, kind: "razorpay", order_id: order.id }),
      quote: publicQuote(q),
    });
  } catch (e) {
    console.error("checkout: order creation failed:", (e as Error).message); // never logs the key or secret
    return Response.json({ ok: false, error: "We couldn't start the payment. Please try again." }, { status: 502 });
  }
}
