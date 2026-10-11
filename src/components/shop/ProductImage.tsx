import ProductArt from "../art/ProductArt";
import type { CardVM } from "@/lib/view";

/** Real photo when sourced, otherwise data-drawn placeholder art. */
export default function ProductImage({ card, role = "front", className = "" }: { card: CardVM; role?: "front" | "on_model"; className?: string }) {
  const src = role === "front" ? card.front : card.onModel ?? card.front;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={card.title} loading="lazy" className={`aspect-square w-full object-cover ${className}`} />;
  }
  return <ProductArt subtype={card.subtype} outer={card.outer} drop={card.drop} stone={card.stone} finish={card.finish} className={`aspect-square w-full ${className}`} label={card.title} />;
}
