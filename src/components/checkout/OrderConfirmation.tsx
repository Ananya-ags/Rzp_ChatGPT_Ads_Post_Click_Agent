"use client";
/** Order confirmation, from the order saved in this session after the server confirmed it (signature or COD). */
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { findOrder } from "@/lib/orders";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const noop = () => () => {};

export default function OrderConfirmation({ id, support }: { id: string; support: { email: string; reply: string } }) {
  // read after hydration (the server has no session storage)
  const order = useSyncExternalStore(noop, () => JSON.stringify(findOrder(id)), () => "null");
  const o = JSON.parse(order) as ReturnType<typeof findOrder>;

  if (!o)
    return (
      <div className="min-h-full bg-ivory px-5 pt-10 text-center">
        <p className="font-display text-[22px]">Order {id}</p>
        <p className="mt-2 text-[13.5px] text-muted">This order&apos;s details are kept in the browser session it was placed in.</p>
        <p className="mt-4 text-[13px]">
          Questions? <a className="underline" href={`mailto:${support.email}`}>{support.email}</a>, we reply {support.reply}.
        </p>
        <Link href="/shop" className="mt-6 inline-grid h-12 place-items-center rounded-full bg-ink px-6 text-[14px] font-medium text-ivory">Continue shopping</Link>
      </div>
    );

  return (
    <div className="min-h-full bg-ivory px-4 pb-12 pt-6">
      <div className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success text-[22px] text-white" aria-hidden>✓</span>
        <h1 className="mt-3 font-display text-[26px]">{o.method === "cod" ? "Order placed" : "Payment received"}</h1>
        <p className="mt-1 text-[13px] text-muted">
          Order ID <span className="font-mono text-ink">{o.id}</span>
        </p>
        {o.kind === "mock" && <p className="mt-1 text-[11px] text-muted">Simulated payment (mock mode)</p>}
        {o.kind === "razorpay" && <p className="mt-1 text-[11px] text-muted">Razorpay Test Mode · no real money moved</p>}
      </div>

      <section className="mt-5 rounded-2xl border border-line bg-white p-4 text-[13.5px]">
        {o.arrives_label && (
          <p className="text-success">
            Arrives by <b>{o.arrives_label}</b> {o.city ? `in ${o.city} ${o.pincode}` : ""}
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {o.lines.map((l) => (
            <li key={l.sku} className="flex justify-between gap-3">
              <span>
                {l.qty} × {l.title}
              </span>
              <span className="shrink-0">{inr(l.line_inr)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3">
          {o.saved_inr > 0 && (
            <div className="flex justify-between text-success">
              <dt>You saved</dt>
              <dd>{inr(o.saved_inr)}</dd>
            </div>
          )}
          {o.cod_fee_inr > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">Cash on delivery fee</dt>
              <dd>{inr(o.cod_fee_inr)}</dd>
            </div>
          )}
          <div className="flex justify-between font-semibold">
            <dt>{o.method === "cod" ? "To pay on delivery" : "Paid"}</dt>
            <dd>{inr(o.payable_inr)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Payment</dt>
            <dd>{o.payment_method}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-white p-4">
        <h2 className="font-display text-[18px]">Care tips</h2>
        <ul className="mt-2 space-y-2 text-[13px] leading-snug">
          {o.lines.map((l) => (
            <li key={l.sku}>
              <b>{l.title}:</b> {l.care}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-4 text-[13px] leading-relaxed">
        Order updates come by SMS. Questions? <a className="underline" href={`mailto:${support.email}`}>{support.email}</a>, we reply {support.reply}.
      </p>
      <Link href="/shop" className="mt-6 grid h-12 place-items-center rounded-full bg-ink text-[14px] font-medium text-ivory">
        Continue shopping
      </Link>
    </div>
  );
}
