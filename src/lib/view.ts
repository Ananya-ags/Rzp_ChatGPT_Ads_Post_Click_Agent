/** Small serialisable view models passed from server components to client components. */
import type { Manifest, Product } from "./schemas";

/** Most units of one SKU a shopper can put in the bag (stock levels are separate and unchanged). */
export const MAX_PER_SKU = 15;

export type CardVM = {
  handle: string;
  title: string;
  price: number;
  compare: number | null;
  category: string;
  subtype: string;
  outer: number | null;
  drop: number | null;
  stone: string;
  finish: string;
  rating: number;
  reviews: number;
  front: string | null; // photo path when sourced
  onModel: string | null;
  sizeLabel: string;
  stock: number; // units on hand across variants
  maxQty: number; // orderable units: made-to-order ignores stock; capped at MAX_PER_SKU
  limitReason: "stock" | "order"; // what stops the shopper at maxQty: stock running out, or the per-order cap
};

export function toCard(p: Product, manifest: Manifest): CardVM {
  const j = p.metafields.jewellery;
  const m = manifest.products[p.handle];
  const stock = p.variants.reduce((s, v) => s + v.inventory_quantity, 0);
  return {
    handle: p.handle,
    title: p.title,
    price: Number(p.variants[0].price),
    compare: p.variants[0].compare_at_price ? Number(p.variants[0].compare_at_price) : null,
    category: j.category,
    subtype: j.subtype,
    outer: j.outer_diameter_mm,
    drop: j.drop_length_mm,
    stone: j.stone_type,
    finish: j.finish,
    rating: j.rating,
    reviews: j.review_count,
    front: m?.front.kind === "photo" ? m.front.file : null,
    onModel: m?.on_model.kind === "photo" ? m.on_model.file : null,
    sizeLabel: p.variants[0].option1,
    stock,
    maxQty: j.made_to_order ? MAX_PER_SKU : Math.min(stock, MAX_PER_SKU),
    limitReason: !j.made_to_order && stock < MAX_PER_SKU ? "stock" : "order",
  };
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
