"use client";
/** Tool results rendered as UI (product cards with Add, delivery badges, return insight, offers, handoff). */
import Link from "next/link";
import ProductImage from "./ProductImage";
import { useLinkQuery, useProductHref } from "./productLink";
import { useEffect } from "react";
import { useDemoState } from "@/lib/state";
import CartButton from "./CartButton";
import { inr, type CardVM } from "@/lib/view";

type Cards = Record<string, CardVM>;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CARE_EMAIL = "care@cosmosjewels.example";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function MiniProduct({ card, note, view = false }: { card: CardVM; note?: React.ReactNode; view?: boolean }) {
  const href = useProductHref();
  return (
    <div className={`flex shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-white ${view ? "w-[168px]" : "w-[148px]"}`}>
      <Link href={href(card.handle)} className="block">
        <ProductImage card={card} className="rounded-none" />
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <Link href={href(card.handle)} className="text-[13px] font-medium leading-tight">
          {card.title}
        </Link>
        <p className="text-[12px] text-muted">{inr(card.price)}</p>
        {note && <div className="text-[11px] leading-snug text-muted">{note}</div>}
        {view ? (
          <div className="mt-auto flex gap-1.5">
            <Link href={href(card.handle)} className="grid h-11 w-12 shrink-0 place-items-center rounded-full border border-line text-[12.5px] focus-visible:outline-2 focus-visible:outline-gold" aria-label={`View ${card.title}`}>
              View
            </Link>
            <CartButton sku={card.handle} max={card.maxQty} limitReason={card.limitReason} size="touch" className="min-w-0 flex-1" />
          </div>
        ) : (
          <CartButton sku={card.handle} max={card.maxQty} limitReason={card.limitReason} className="mt-auto w-full" />
        )}
      </div>
    </div>
  );
}

export function ToolCard({ name, output, cards }: { name: string; output: Any; cards: Cards }) {
  const href = useProductHref();
  if (!output || output.error) return null;
  switch (name) {
    case "search_catalog": {
      const rows = (output.results ?? []).filter((r: Any) => cards[r.sku]);
      if (!rows.length) return <p className="text-[12px] text-muted">No matching pieces in the catalogue.</p>;
      return (
        <div className="flex min-w-0 gap-2.5 overflow-x-auto pb-1 no-scrollbar">
          {rows.map((r: Any) => (
            <MiniProduct
              view
              key={r.sku}
              card={cards[r.sku]}
              note={
                r.arrives_label ? (
                  <span className={r.meets_deadline === false ? "text-danger" : "text-success"}>Arrives {r.arrives_label}</span>
                ) : (
                  r.size ?? null // computed in code, in cm
                )
              }
            />
          ))}
        </div>
      );
    }
    case "check_delivery": {
      const ok = output.meets_deadline !== false;
      return (
        <div className="space-y-2">
          <div className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${ok ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
            <span className={`grid size-7 place-items-center rounded-full text-[13px] text-white ${ok ? "bg-success" : "bg-danger"}`}>{ok ? "✓" : "✕"}</span>
            <div className="text-[12.5px] leading-snug">
              <p className="font-medium">
                <Link href={href(output.sku)} className="underline underline-offset-2">{output.title}</Link>: arrives {output.arrives_label}
              </p>
              <p className="text-muted">
                {output.city} {output.pincode} · ships {output.ships_label}
                {output.made_to_order ? " · made to order" : ""}
                {output.deadline ? ` · need by ${new Date(`${output.deadline}T00:00:00Z`).getUTCDate()} ${MONTHS[new Date(`${output.deadline}T00:00:00Z`).getUTCMonth()]}` : ""}
              </p>
            </div>
          </div>
          {output.alternatives?.length > 0 && (
            <div className="flex min-w-0 gap-2.5 overflow-x-auto pb-1 no-scrollbar">
              {output.alternatives.filter((a: Any) => cards[a.sku]).map((a: Any) => (
                <MiniProduct view key={a.sku} card={cards[a.sku]} note={<span className="text-success">{a.size ? `${a.size} · ` : ""}Arrives {a.arrives_label}</span>} />
              ))}
            </div>
          )}
        </div>
      );
    }
    case "get_return_insight": {
      if (!output.relevant) return null;
      const keeper = output.keepers;
      const alt = output.alternative; // computed in code: the better fit, with its size
      const kc = alt ? cards[alt.sku] : keeper ? cards[keeper.sku] : null;
      return (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <div className="flex gap-3 p-3">
            <div className="text-[12.5px] leading-snug">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gold-deep">Fit check · {output.context}</p>
              <p className="mt-1">
                Top return reason: <b>{output.top_reason?.label.toLowerCase()}</b> ({output.top_reason?.count} of {output.top_reason?.of})
              </p>
              {output.typical_quote && <p className="mt-1 italic text-muted">“{output.typical_quote}”</p>}
              {keeper && (
                <p className="mt-1">
                  <b>{Math.round(keeper.share_of_keepers * 100)}%</b> of {output.context} keepers chose {keeper.title}
                </p>
              )}
            </div>
          </div>
          {kc && (
            <div className="flex items-center justify-between gap-2 border-t border-line bg-sand/50 px-3 py-2 text-[12px]">
              <Link href={href(kc.handle)} className="min-w-0 flex-1 break-words underline underline-offset-2">
                Better fit: {alt?.size ? `${alt.size} · ` : ""}{kc.title} · {inr(kc.price)}
              </Link>
              <CartButton sku={kc.handle} max={kc.maxQty} limitReason={kc.limitReason} size="touch" className="w-[96px] shrink-0" />
            </div>
          )}
        </div>
      );
    }
    case "get_offer":
      return (
        <div className="rounded-2xl border border-gold/40 bg-gold/5 px-3 py-2.5 text-[12.5px]">
          {output.applied?.length ? (
            output.applied.map((a: Any) => (
              <p key={a.id}>
                ✦ {a.label} <span className="text-muted">(−{inr(a.amount_inr)})</span>
              </p>
            ))
          ) : (
            <p>No offers apply to this cart right now.</p>
          )}
          <p className="mt-1 text-muted">
            You pay {inr(output.total_inr)} · offers capped at {output.cap?.max_pct}% / {inr(output.cap?.max_flat_inr ?? 0)} by the store
          </p>
        </div>
      );
    case "add_to_bag":
      return output.added ? <BagAdded /> : null; // not added (bulk order, stock): the reply text explains
    case "suggest_login":
      return output.show ? <LoginCard href={output.href} /> : null;
    // get_product_facts, update_preferences, a matched lookup_policy: plain text only (ids go to the AI console)
    case "lookup_policy":
      return output.found === false ? <CareCard /> : null;
    case "handoff":
      return <CareCard contact={output.contact} />;
    default:
      return null;
  }
}

/** The care line as a card: the email as a mailto link and the reply time. */
function CareCard({ contact = CARE_EMAIL }: { contact?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white px-3 py-2.5 text-[12.5px]">
      <p className="font-medium">Cosmos care team</p>
      <a href={`mailto:${contact}`} className="mt-0.5 inline-flex min-h-11 items-center break-all text-ink underline underline-offset-2">
        {contact}
      </a>
      <p className="text-muted">We&apos;ll get back to you within 24 hours</p>
    </div>
  );
}

/** add_to_bag confirmation in the chat; the bag count and toast update from the data-cart part. */
function BagAdded() {
  const q = useLinkQuery();
  return (
    <p className="flex items-center gap-2 rounded-2xl border border-success/30 bg-success/5 px-3 py-2 text-[12.5px]">
      <span className="grid size-5 place-items-center rounded-full bg-success text-[11px] text-white">✓</span>
      Added to bag ·{" "}
      <Link href={`/cart${q}`} className="font-medium underline underline-offset-2">
        View bag
      </Link>
      ·
      <Link href={`/checkout${q}`} className="font-medium underline underline-offset-2">
        Checkout
      </Link>
    </p>
  );
}

/** Login offer: at most once per session (code enforces it); "Not now" hides it for the rest of the session. */
function LoginCard({ href }: { href: string }) {
  const [state, write] = useDemoState();
  useEffect(() => {
    if (!state.loginOffered) write({ loginOffered: true }); // shown once → never offered again this session
  }, [state.loginOffered, write]);
  if (state.loggedIn || state.loginDismissed) return null;
  return (
    <div className="rounded-2xl border border-gold/40 bg-gold/5 px-3 py-2.5 text-[12.5px]">
      <p className="font-medium">Log in for your saved address and exact delivery date</p>
      <div className="mt-2 flex gap-2">
        <Link href={href} className="inline-flex min-h-11 items-center rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-ivory">
          Log in
        </Link>
        <button onClick={() => write({ loginOffered: true, loginDismissed: true })} className="min-h-11 rounded-full border border-line bg-white px-3.5 py-1.5 text-[12px]">
          Not now
        </button>
      </div>
    </div>
  );
}
