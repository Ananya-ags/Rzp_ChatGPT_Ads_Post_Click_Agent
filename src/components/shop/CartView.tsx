"use client";
/**
 * Bag page: items with the qty stepper, free-shipping progress, delivery date, gift wrap, offers (applied and
 * available), price summary and payment methods. All money is computed on the server (/api/cart); the pay
 * button is a placeholder until Razorpay checkout is connected.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import SiteHeader from "./SiteHeader";
import AskCosmos from "./AskCosmos";
import CartButton from "./CartButton";
import ProductImage from "./ProductImage";
import { ProductLinkProvider } from "./productLink";
import { useDemoState } from "@/lib/state";
import { inr, type CardVM } from "@/lib/view";

type Quote = {
  lines: { sku: string; qty: number; unit_inr: number; line_inr: number; made_to_order: boolean }[];
  count: number;
  subtotal_inr: number;
  applied: { id: string; label: string; amount_inr: number }[];
  discount_inr: number;
  cap: { max_pct: number; max_flat_inr: number; clamped: boolean };
  shipping_inr: number;
  gift_wrap_inr: number;
  payable_inr: number;
  to_free_shipping_inr: number;
  free_shipping_threshold_inr: number;
  gift_wrap_price_inr: number;
  cod_fee_price_inr: number;
  arrives_label: string | null;
  emi_available: boolean;
  available_offers: { id: string; label: string; applied: boolean }[];
  wallet: { balance_inr: number; usable_inr: number };
  user: null | { firstName: string; phone: string; email: string; address: { label: string; line1: string; city: string; pincode: string }; paymentMethods: string[]; nudgePrepaid: boolean };
};

const OFFER_NAME: Record<string, string> = { prepaid_bonus: "Prepaid offer", prepaid_nudge: "Pay-online offer", first_order: "First-order offer", bank_offer: "Bank offer" };

const UNLOCK: Record<string, string> = {
  first_order: "Log in to check if this is your first order",
  bank_offer: "Pay with a select bank card at checkout",
  loyalty: "Log in to use your Cosmos wallet",
  prepaid_bonus: "Pay online to unlock",
};

export default function CartView({ cards, linkQuery, continueHref, trust, user: ssrUser, loginHref }: { cards: Record<string, CardVM>; linkQuery: string; continueHref: string; trust: string[]; user: { firstName: string } | null; loginHref: string }) {
  const [state, , ready] = useDemoState();
  const [giftWrap, setGiftWrap] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const cartKey = JSON.stringify(state.cart);

  useEffect(() => {
    let live = true;
    fetch("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cart: JSON.parse(cartKey), giftWrap }) })
      .then((r) => r.json())
      .then((q: Quote) => live && setQuote(q))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [cartKey, giftWrap]);

  const empty = ready && state.cart.length === 0;

  return (
    <ProductLinkProvider value={linkQuery}>
      <div className="relative pb-32">
        <SiteHeader user={ssrUser} loginHref={loginHref} />
        <div className="flex items-baseline justify-between px-4 pt-4">
          <h1 className="font-display text-[26px]">Your bag{quote && quote.count > 0 ? ` (${quote.count})` : ""}</h1>
          <Link href={continueHref} className="text-[13px] text-muted underline underline-offset-2">
            Continue shopping
          </Link>
        </div>

        {empty ? (
          <div className="mx-4 mt-8 rounded-2xl border border-line bg-white px-5 py-10 text-center">
            <p className="font-display text-[19px]">Your bag is empty</p>
            <p className="mt-1 text-[13px] text-muted">Pieces you add will show up here.</p>
            <Link href={continueHref} className="mt-5 inline-block rounded-full bg-ink px-6 py-2.5 text-[14px] font-medium text-ivory">
              Start shopping
            </Link>
          </div>
        ) : (
          <>
            {/* free shipping progress */}
            {quote && (
              <div className="mx-4 mt-3 rounded-xl bg-sand/70 px-3.5 py-2.5 text-[12.5px]">
                {quote.to_free_shipping_inr > 0 ? (
                  <>
                    Add <b>{inr(quote.to_free_shipping_inr)}</b> more for free shipping
                  </>
                ) : (
                  <>✓ You&apos;ve unlocked <b>free shipping</b></>
                )}
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${Math.min(100, (quote.subtotal_inr / quote.free_shipping_threshold_inr) * 100)}%` }} />
                </div>
              </div>
            )}

            {/* who and where: saved details when logged in, a login prompt otherwise */}
            {quote?.user ? (
              <section className="mx-4 mt-3 rounded-2xl border border-line bg-white p-3.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-medium">Delivering to</h2>
                  <span className="text-[11px] text-muted">{quote.user.address.label}</span>
                </div>
                <p className="mt-1 text-ink/85">
                  {quote.user.address.line1}, {quote.user.address.city} {quote.user.address.pincode}
                </p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {quote.user.phone} · {quote.user.email}
                </p>
              </section>
            ) : (
              ready && (
                <Link href={loginHref} className="mx-4 mt-3 flex items-center justify-between rounded-2xl border border-gold/40 bg-[#fbf3e2] px-3.5 py-3 text-[13px]">
                  <span>
                    <b>Log in</b> for your saved address and offers
                  </span>
                  <span aria-hidden className="text-gold-deep">
                    →
                  </span>
                </Link>
              )
            )}

            {/* items */}
            <ul className="mx-4 mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
              {state.cart.map((l) => {
                const c = cards[l.sku];
                if (!c) return null;
                return (
                  <li key={l.sku} className="flex gap-3 p-3">
                    <Link href={`/p/${c.handle}${linkQuery}`} className="size-[76px] shrink-0 overflow-hidden rounded-xl">
                      <ProductImage card={c} />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <Link href={`/p/${c.handle}${linkQuery}`} className="text-[14px] font-medium leading-snug">
                        {c.title}
                      </Link>
                      <p className="text-[12px] text-muted">
                        {inr(c.price)} each{quote?.lines.find((x) => x.sku === l.sku)?.made_to_order ? " · made to order" : ""}
                      </p>
                      <div className="mt-auto flex items-end justify-between pt-2">
                        <CartButton sku={c.handle} max={c.maxQty} limitReason={c.limitReason} size="md" />
                        <span className="text-[14px] font-medium">{inr(c.price * l.qty)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* delivery + gift wrap */}
            <div className="mx-4 mt-3 space-y-0 divide-y divide-line rounded-2xl border border-line bg-white text-[13px]">
              {quote?.arrives_label && (
                <p className="flex items-center gap-2 px-3.5 py-3">
                  <span className="text-success">●</span> Arrives by <b>{quote.arrives_label}</b>
                  <span className="text-muted">{quote.user ? `to ${quote.user.address.line1.split(",").pop()!.trim()}, ${quote.user.address.city} ${quote.user.address.pincode}` : "to Pune (approx.)"}</span>
                </p>
              )}
              <label className="flex items-center justify-between px-3.5 py-3">
                <span>
                  Gift wrap + handwritten note <span className="text-muted">({inr(quote?.gift_wrap_price_inr ?? 99)}, note free)</span>
                </span>
                <input type="checkbox" checked={giftWrap} onChange={(e) => setGiftWrap(e.target.checked)} className="size-4 accent-[#1f1a17]" />
              </label>
            </div>

            {/* offers */}
            {quote && (
              <section className="mx-4 mt-3 rounded-2xl border border-line bg-white p-3.5">
                <h2 className="text-[13px] font-medium">Offers</h2>
                <ul className="mt-2 space-y-2 text-[12.5px]">
                  {quote.available_offers.map((o) => (
                    <li key={o.id} className="flex items-start gap-2">
                      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${o.applied ? "bg-success text-white" : "border border-line text-muted"}`}>{o.applied ? "✓" : ""}</span>
                      <span>
                        {o.label}
                        {o.applied ? (
                          <span className="text-success"> · applied</span>
                        ) : (
                          <span className="block text-[11.5px] text-muted">{UNLOCK[o.id] ?? "Not eligible for this bag"}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* price summary */}
            {quote && (
              <section className="mx-4 mt-3 rounded-2xl border border-line bg-white p-3.5 text-[13px]">
                <h2 className="text-[13px] font-medium">Price details</h2>
                <dl className="mt-2 space-y-1.5">
                  <Row label={`Subtotal (${quote.count} item${quote.count === 1 ? "" : "s"})`} value={inr(quote.subtotal_inr)} />
                  {quote.applied.map((a) => (
                    <Row key={a.id} label={OFFER_NAME[a.id] ?? "Offer"} value={`−${inr(a.amount_inr)}`} green />
                  ))}
                  {quote.cap.clamped && <Row label="Offer cap applied" value={`max ${inr(quote.discount_inr)}`} />}
                  {quote.wallet.usable_inr > 0 && <Row label="Cosmos wallet" value={`−${inr(quote.wallet.usable_inr)}`} green />}
                  <Row label="Shipping" value={quote.shipping_inr ? inr(quote.shipping_inr) : "Free"} green={!quote.shipping_inr} />
                  {quote.gift_wrap_inr > 0 && <Row label="Gift wrap" value={inr(quote.gift_wrap_inr)} />}
                </dl>
                <div className="mt-2.5 flex justify-between border-t border-line pt-2.5 text-[15px] font-semibold">
                  <span>Total</span>
                  <span>{inr(quote.payable_inr)}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">Prices include taxes. Pay online price; cash on delivery adds {inr(quote.cod_fee_price_inr)} and removes the prepaid offer.</p>
              </section>
            )}

            {/* payment methods (display) */}
            {quote && (
              <section className="mx-4 mt-3 rounded-2xl border border-line bg-white p-3.5">
                {quote.user?.nudgePrepaid && (
                  <p className="mb-3 rounded-lg bg-[#fbf3e2] px-3 py-2 text-[12.5px] text-gold-deep">
                    ✦ Eligible online offers are already included in your total, subject to the store cap.
                  </p>
                )}
                {quote.user && (
                  <div className="mb-3">
                    <h2 className="text-[13px] font-medium">Your saved methods</h2>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                      {quote.user.paymentMethods.map((m) => (
                        <span key={m} className="rounded-full border border-gold/50 bg-white px-2.5 py-1">
                          {m.replace(" (simulated)", "")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <h2 className="text-[13px] font-medium">Pay securely with</h2>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
                  {["UPI", "Cards", "Netbanking", "Wallets", ...(quote.emi_available ? ["EMI", "Pay Later"] : []), quote.user?.nudgePrepaid ? `Cash on delivery (+${inr(quote.cod_fee_price_inr)}, no online offers)` : `Cash on delivery (+${inr(quote.cod_fee_price_inr)})`].map((m) => (
                    <span key={m} className="rounded-full border border-line bg-ivory px-2.5 py-1">
                      {m}
                    </span>
                  ))}
                </div>
                {!quote.emi_available && <p className="mt-1.5 text-[11px] text-muted">EMI and Pay Later on bags above ₹3,000.</p>}
                <ul className="mt-3 space-y-1 text-[11.5px] text-muted">
                  {trust.map((t) => (
                    <li key={t} className="flex gap-1.5">
                      <span className="text-success">🛡</span>
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-muted">Payments by Razorpay (Test Mode)</p>
              </section>
            )}
          </>
        )}

        {/* sticky pay bar → checkout */}
        {!empty && quote && quote.count > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
            <Link href={`/checkout${linkQuery}${giftWrap ? `${linkQuery ? "&" : "?"}gift=1` : ""}`} className="grid h-12 w-full place-items-center rounded-full bg-ink text-[14px] font-medium text-ivory">
              Proceed to pay · {inr(quote.payable_inr)}
            </Link>
            <p className="mt-1 text-center text-[11px] text-muted">Secure checkout · payment by Razorpay (Test Mode)</p>
          </div>
        )}

        {/* Cosmos AI on the bag: floating star above the pay bar (never in checkout itself) */}
        <AskCosmos fab lift={!empty && !!quote && quote.count > 0} page={{ kind: "bag", sku: null, title: null, pincode: null, loggedIn: !!ssrUser, opener: "", linkQuery }} />
      </div>
    </ProductLinkProvider>
  );
}

function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className={green ? "text-success" : ""}>{value}</dd>
    </div>
  );
}
