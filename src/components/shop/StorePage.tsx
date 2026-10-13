"use client";
/**
 * Store home and category pages. Static by design: every visitor sees the same catalogue in the same order
 * (no ad-group, cookie, login or AI reordering). Cosmos AI is offered as a floating star button (AskCosmos) that opens
 * the session's conversation, with chips for this page from chips.ts.
 */
import Link from "next/link";
import { useEffect } from "react";
import SiteHeader from "./SiteHeader";
import AskCosmos from "./AskCosmos";
import ProductGrid from "./ProductGrid";
import { browseOpener } from "@/lib/agent/chips";
import type { CardVM } from "@/lib/view";

export type StoreSection = { slug: string; label: string; cards: CardVM[] };

type Props = {
  title: string;
  intro: string;
  sections: StoreSection[];
  showSectionHeads: boolean; // home: one heading per category; category page: the page title is enough
  categories: { slug: string; label: string }[];
  activeSlug: string | null;
  cards: Record<string, CardVM>;
  simulatedNote: string;
  path: string; // this page, so login returns here
};

export default function StorePage(p: Props) {
  useEffect(() => {
    document.getElementById("phone-scroll")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="relative pb-24">
      <SiteHeader loginHref={`/login?next=${encodeURIComponent(p.path)}`} />

      <section className="px-4 pb-1 pt-5">
        <h1 className="font-display text-[28px] leading-tight">{p.title}</h1>
        <p className="mt-1 text-[13.5px] text-muted">{p.intro}</p>
      </section>

      {/* category shortcuts, same order as the menu */}
      <nav aria-label="Categories" className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        {[{ slug: null, label: "All" }, ...p.categories].map((c) => {
          const active = c.slug === p.activeSlug;
          return (
            <Link
              key={c.label}
              href={c.slug ? `/c/${c.slug}` : "/shop"}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] ${active ? "border-ink bg-ink text-ivory" : "border-line bg-white text-ink active:bg-sand"}`}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      {p.sections.map((s) => (
        <section key={s.slug} aria-labelledby={`sec-${s.slug}`} className="mt-6">
          {p.showSectionHeads ? (
            <div className="mb-3 flex items-baseline justify-between px-4">
              <h2 id={`sec-${s.slug}`} className="font-display text-[20px]">
                {s.label}
              </h2>
              <Link href={`/c/${s.slug}`} className="text-[12.5px] text-muted underline decoration-line underline-offset-2">
                See all {s.cards.length}
              </Link>
            </div>
          ) : (
            <h2 id={`sec-${s.slug}`} className="sr-only">
              {s.label}
            </h2>
          )}
          <ProductGrid cards={s.cards} />
        </section>
      ))}

      <p className="mx-4 mt-8 text-[11px] text-muted">{p.simulatedNote}</p>

      <AskCosmos
        fab
        page={{
          kind: p.activeSlug ? "category" : "home",
          sku: null,
          title: p.activeSlug ? p.title : null,
          pincode: null,
          loggedIn: false,
          // the opener follows the session's ad (set on the ad's product page); see browseOpener
          opener: browseOpener(p.activeSlug ? "category" : "home", null),
          linkQuery: "",
        }}
      />
    </div>
  );
}
