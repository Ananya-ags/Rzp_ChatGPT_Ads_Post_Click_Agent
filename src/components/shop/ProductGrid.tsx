"use client";
/**
 * Two-column product grid for the store home and category pages. Same cards for every visitor (no personalisation).
 * Tapping the card opens the product page; the button below adds to the bag in place (qty stepper once added).
 */
import { useProductHref } from "./productLink";
import Link from "next/link";
import ProductImage from "./ProductImage";
import CartButton from "./CartButton";
import { inr, type CardVM } from "@/lib/view";

export function GridCard({ card }: { card: CardVM }) {
  const href = useProductHref();
  return (
    <div className="flex h-full min-w-0 flex-col">
      <Link href={href(card.handle)} className="group block min-w-0 active:opacity-80">
        <div className="relative overflow-hidden rounded-2xl border border-line/70 bg-white">
          <ProductImage card={card} className="transition-transform duration-300 group-hover:scale-[1.03]" />
          {card.badge && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-success backdrop-blur">
              <span aria-hidden>✓</span> {card.badge}
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-[13.5px] font-medium leading-snug">{card.title}</p>
        <p className="mt-0.5 flex items-baseline gap-1.5 text-[13px]">
          <span className="font-semibold">{inr(card.price)}</span>
          {card.compare && <span className="text-[11.5px] text-muted line-through">{inr(card.compare)}</span>}
        </p>
      </Link>
      {/* bottom-aligned across the row, whatever the title length */}
      <div className="mt-auto pt-2.5">
        <CartButton sku={card.handle} max={card.maxQty} limitReason={card.limitReason} label="Add to bag" size="md" className="w-full" />
      </div>
    </div>
  );
}

export default function ProductGrid({ cards }: { cards: CardVM[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4">
      {cards.map((c) => (
        <li key={c.handle} className="min-w-0">
          <GridCard card={c} />
        </li>
      ))}
    </ul>
  );
}
