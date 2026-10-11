"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ProductImage from "./ProductImage";
import ChatSheet from "./ChatSheet";
import { MiniProduct } from "./ToolCards";
import { ProductLinkProvider } from "./productLink";
import { useDemoState } from "@/lib/state";
import CartButton from "./CartButton";
import TrustBadges, { type Badge } from "./TrustBadges";
import { inr, type CardVM } from "@/lib/view";

export type ProductPageProps = {
  arm: "A" | "B" | "C";
  hero: CardVM;
  bodyHtml: string;
  facts: { label: string; value: string }[];
  badges: Badge[];
  reviews: { author: string; rating: number; text: string }[];
  arrives: { label: string; city: string; madeToOrder: boolean; dispatchDays: number };
  context: null | { adGroupId: string; chip: string; opener: string; chips: string[]; sheetChips: string[]; railTitle: string; pending: boolean };
  rail: { card: CardVM; reason: string; pinned: boolean }[];
  more: CardVM[]; // uncurated list for the standard page
  cards: Record<string, CardVM>;
  simulatedNote: string;
  linkQuery: string; // carried to product links so the ad context follows the shopper
};

export default function ProductPage(p: ProductPageProps) {
  const [state] = useDemoState();
  const [open, setOpen] = useState(false);
  // new product (rail / chat link): start at the top, inside the desktop phone frame too
  useEffect(() => {
    document.getElementById("phone-scroll")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, []);
  const [pending, setPending] = useState<string | null>(null);
  const [slide, setSlide] = useState(0);
  const agentOn = p.arm === "C" && !!p.context && !state.agentPaused;
  const cartCount = state.cart.reduce((s, l) => s + l.qty, 0);
  const ask = (q?: string) => {
    if (q) setPending(q);
    setOpen(true);
  };

  return (
    <ProductLinkProvider value={p.linkQuery}>
    <div className="relative pb-28">
      {/* header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-ivory/90 px-4 py-2 backdrop-blur">
        <Link href="/" aria-label="Cosmos home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/cosmos-logo-v3.png" alt="Cosmos" className="h-6 w-auto md:h-[30px]" />
        </Link>
        <span className="relative rounded-full bg-sand px-3 py-1 text-[12px]">
          Bag <b>{cartCount}</b>
        </span>
      </header>

      {p.context && p.arm !== "A" && (
        <div className="px-4 pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[12px] font-medium text-gold-deep">
            <span aria-hidden>✦</span> {p.context.chip}
          </span>
        </div>
      )}

      {/* gallery: front, on model */}
      <div className="mt-3">
        <div
          className="flex snap-x snap-mandatory overflow-x-auto no-scrollbar"
          onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          <div className="w-full shrink-0 snap-center px-4">
            <ProductImage card={p.hero} className="rounded-3xl" />
          </div>
          <div className="w-full shrink-0 snap-center px-4">
            <ProductImage card={p.hero} role="on_model" className="rounded-3xl" />
          </div>
        </div>
        <div className="mt-2 flex justify-center gap-1.5">
          {[0, 1].map((i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${slide === i ? "w-4 bg-ink" : "w-1.5 bg-line"}`} />
          ))}
        </div>
      </div>

      {/* title / price / delivery */}
      <section className="px-4 pt-3">
        <h1 className="font-display text-[26px] leading-tight">{p.hero.title}</h1>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[18px] font-semibold">{inr(p.hero.price)}</span>
          {p.hero.compare && <span className="text-[13px] text-muted line-through">{inr(p.hero.compare)}</span>}
          <button
            onClick={() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="ml-auto text-[12px] text-muted underline decoration-line underline-offset-2"
            aria-label={`Rated ${p.hero.rating} out of 5 from ${p.hero.reviews} reviews. Go to reviews`}
          >
            ★ {p.hero.rating} · {p.hero.reviews} reviews
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[13px]">
          <span className="text-success">●</span> Arrives by <b>{p.arrives.label}</b>
          <span className="text-muted">to {p.arrives.city} (approx.)</span>
        </p>
        {p.arrives.madeToOrder && <p className="mt-0.5 text-[12px] text-muted">Made to order · dispatches in {p.arrives.dispatchDays} days</p>}
      </section>

      {/* curated rail (arms B, C) or uncurated list (arm A) */}
      {p.arm !== "A" && p.rail.length > 0 ? (
        <section className="mt-6">
          <h2 className="px-4 font-display text-[18px]">{p.context?.railTitle ?? "Picked for you"}</h2>
          <div className="mt-2.5 flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar">
            {p.rail.map((r) => (
              <MiniProduct key={r.card.handle} card={r.card} />
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-6">
          <h2 className="px-4 font-display text-[18px]">More {p.hero.category}</h2>
          <div className="mt-2.5 flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar">
            {p.more.map((c) => (
              <MiniProduct key={c.handle} card={c} />
            ))}
          </div>
        </section>
      )}

      {/* agent opener */}
      {agentOn && p.context && (
        <section className="mx-4 mt-6 rounded-2xl border border-line bg-white p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-gold-deep">
            <span aria-hidden className="text-[13px]">✦</span> Ask Cosmos AI
          </p>
          <p className="mt-1 text-[14px] leading-relaxed">{p.context.opener}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {p.context.chips.map((c) => (
              <button key={c} onClick={() => ask(c)} className="rounded-full border border-line bg-ivory px-3 py-1.5 text-[12px]">
                {c}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* product details: collapsed by default, tap to expand */}
      <details className="group mx-4 mt-4 rounded-2xl border border-line bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="text-[15px] font-medium">Product details</span>
          <svg viewBox="0 0 20 20" aria-hidden className="size-5 text-muted transition-transform duration-200 group-open:rotate-180">
            <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-line px-4 pb-4 pt-3 text-[13px]">
          {p.facts.map((f) => (
            <div key={f.label}>
              <dt className="text-[11px] text-muted">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </details>

      {/* description + reviews */}
      <section className="mx-4 mt-6">
        <h2 className="font-display text-[18px]">Description</h2>
        <div className="prose-sm mt-1.5 space-y-2 text-[14px] leading-relaxed text-ink/85" dangerouslySetInnerHTML={{ __html: p.bodyHtml }} />
      </section>
      <TrustBadges badges={p.badges} />
      <section id="reviews" className="mx-4 mt-6 scroll-mt-16">
        <h2 className="font-display text-[18px]">Reviews</h2>
        <ul className="mt-2 space-y-2">
          {p.reviews.map((r) => (
            <li key={r.author} className="rounded-xl border border-line bg-white p-3 text-[13px]">
              <p className="text-gold">{"★".repeat(r.rating)}</p>
              <p className="mt-0.5">{r.text}</p>
              <p className="mt-1 text-[11px] text-muted">{r.author}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted">{p.simulatedNote}</p>
      </section>

      {/* sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="flex gap-2.5">
          {agentOn && (
            <button onClick={() => ask()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-ink/80 text-[14px] font-medium">
              <span aria-hidden>✦</span> Ask about this
            </button>
          )}
          <CartButton sku={p.hero.handle} max={p.hero.maxQty} limitReason={p.hero.limitReason} label={`Add · ${inr(p.hero.price)}`} size="lg" className="flex-1" />
        </div>
      </div>

      {agentOn && p.context && (
        <ChatSheet
          open={open}
          onOpenChange={setOpen}
          pending={pending}
          clearPending={() => setPending(null)}
          context={{ sku: p.hero.handle, adGroupId: p.context.adGroupId, pincode: null, tier: state.returningVisitor ? 2 : 1 }}
          hero={p.hero}
          cards={p.cards}
          chips={p.context.sheetChips}
          opener={null}
        />
      )}
    </div>
    </ProductLinkProvider>
  );
}
