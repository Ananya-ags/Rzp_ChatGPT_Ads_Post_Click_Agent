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
  return Response.json({ ...publicQuote(q), payments_mode: paymentsMode(), magic_checkout_enabled: magicCheckoutEnabled(), key_id: paymentsMode() === "test" ? publicKeyId() : null });
}
