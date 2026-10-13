/** Checkout quote: the bag from the cookie, priced on the server (see src/lib/checkout.ts). */
import { bagFromRequest, publicQuote, quote, type QuoteInput } from "@/lib/checkout";
import { magicCheckoutEnabled, paymentsMode, publicKeyId } from "@/lib/payments";
import { userFromRequest } from "@/lib/user";

export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as Partial<QuoteInput>;
  const q = quote(bagFromRequest(req), userFromRequest(req), {
    pincode: input.pincode ?? null,
    method: input.method === "cod" ? "cod" : "online",
    walletOn: input.walletOn !== false,
    bankCard: !!input.bankCard,
    coupon: input.coupon ?? null,
    adGroupId: input.adGroupId ?? null,
    giftWrap: !!input.giftWrap,
  });
  // the AI console (/demo) asks for the internal RTO reasoning with a header; shoppers never see it
  const forConsole = req.headers.get("x-cosmos-console") === "1" ? { console: { rto_risk: q._risk, pincode_risk_score: q._pin_score, from_history: userFromRequest(req)?.rtoRisk ?? null, nudge: q.prepaid_nudge ? "High RTO risk → prepaid nudge (COD stays available)" : "No nudge (risk not high)" } } : {};
  return Response.json({ ...publicQuote(q), ...forConsole, payments_mode: paymentsMode(), magic_checkout_enabled: magicCheckoutEnabled(), key_id: paymentsMode() === "test" ? publicKeyId() : null });
}
