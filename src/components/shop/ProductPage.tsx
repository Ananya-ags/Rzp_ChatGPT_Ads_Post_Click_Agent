"use client";
import { useEffect, useState } from "react";
import ProductImage from "./ProductImage";
import ChatSheet from "./ChatSheet";
import { MiniProduct } from "./ToolCards";
import { ProductLinkProvider } from "./productLink";
import { useDemoState } from "@/lib/state";
import CartButton from "./CartButton";
import SiteHeader from "./SiteHeader";
import TrustBadges, { type Badge } from "./TrustBadges";
import { inr, type CardVM } from "@/lib/view";
import { CosmosStarBadge } from "../brand/CosmosStar";

export type ProductPageProps = {
  arm: "A" | "B" | "C";
  hero: CardVM;
  bodyHtml: string;
  facts: { label: string; value: string }[];
  badges: Badge[];
  reviews: { author: string; rating: number; text: string }[];
  arrives: { label: string; where: string; madeToOrder: boolean; dispatchDays: number };
  user: null | { firstName: string; nudgePrepaid: boolean; pincode: string };
  loginHref: string;
  // agent context: from an ad group (chip + ad opener + curated rail), or a direct visit (adGroupId/chip null,
  // product-generic opener, "You may also like" rail). Null on the standard page (arm A).
  context: null | { adGroupId: string | null; chip: string | null; opener: string; sheetOpener: string | null; chips: string[]; sheetChips: string[]; railTitle: string; pending: boolean };
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
  const ask = (q?: string) => {
    if (q) setPending(q);
    setOpen(true);
  };

  return (
    <ProductLinkProvider value={p.linkQuery}>
    <div className="relative pb-28">
      <SiteHeader user={p.user ? { firstName: p.user.firstName } : null} loginHref={p.loginHref} />

      {p.context?.chip && p.arm !== "A" && (
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
          <span className="text-muted">to {p.arrives.where}</span>
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
      {p.arm === "C" && p.context && state.agentPaused && (
        <p className="mx-4 mt-6 rounded-2xl border border-dashed border-line px-4 py-3 text-[12.5px] text-muted">
          Cosmos AI is paused by the store right now (demo control on the start page).
        </p>
      )}
      {agentOn && p.context && (
        <section className="ai-card mx-4 mt-6 rounded-2xl p-4">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="ai-badge grid size-9 shrink-0 place-items-center rounded-full">
              <CosmosStarBadge className="size-7" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-[18px] text-ink">Ask Cosmos AI</p>
              <p className="text-[11px] text-gold-deep">Answers from verified product details</p>
            </div>
          </div>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink">{p.context.opener}</p>
          {p.user?.nudgePrepaid && (
            <p className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-[12.5px] text-gold-deep">
              ✦ Pay online at checkout and get an <b>extra 5% off</b> your order.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {p.context.chips.map((c) => (
              <button
                key={c}
                onClick={() => ask(c)}
                className="rounded-full border border-gold/45 bg-white/85 px-3 py-1.5 text-[12.5px] text-ink shadow-[0_1px_0_rgba(140,101,36,0.08)] hover:border-gold active:bg-[#f6ecd6]"
              >
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
            <button onClick={() => ask()} className="ai-cta relative flex h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-full text-[14px] font-semibold text-[#3a2a10] active:scale-[0.98]">
              <CosmosStarBadge /> Ask Cosmos AI
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
          context={{ sku: p.hero.handle, adGroupId: p.context.adGroupId, pincode: p.user?.pincode ?? null, tier: p.user ? 3 : 1 }}
          hero={p.hero}
          cards={p.cards}
          chips={p.context.sheetChips}
          opener={p.user?.nudgePrepaid ? `Welcome back, ${p.user.firstName}. Tip: pay online at checkout and you get an extra 5% off your order.` : p.context.sheetOpener}
        />
      )}
    </div>
    </ProductLinkProvider>
  );
}
