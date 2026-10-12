/** Store navigation derived from the catalogue (no hardcoded category names). Pure, safe on server and client. */
import type { Product } from "./schemas";

export type NavCategory = {
  slug: string; // URL segment, from the product_type ("Necklaces" → "necklaces")
  label: string; // product_type as entered by the brand
  category: Product["metafields"]["jewellery"]["category"];
  count: number;
};

/** One entry per catalogue category, in the order categories first appear in products.json. */
export function categoriesFrom(products: Product[]): NavCategory[] {
  const out: NavCategory[] = [];
  for (const p of products) {
    const category = p.metafields.jewellery.category;
    const hit = out.find((c) => c.category === category);
    if (hit) hit.count++;
    else out.push({ slug: p.product_type.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: p.product_type, category, count: 1 });
  }
  return out;
}
