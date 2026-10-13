/**
 * The curated opener line for an ad group's hero product: the pipeline's fallback when the AI-written opener fails
 * its guard (over 25 words, a spec list, a health claim, or water on a non-water ad). Shared by the pipeline
 * (scripts/pipelines/run.ts) and the AI console, which compares it with openers.json to show which one is live.
 */
import type { Product } from "./schemas";

export function curatedOpener(groupId: string, hero: Product): string {
  const hj = hero.metafields.jewellery;
  const facts = [hj.water_resistant ? "verified water-resistant" : null, `${hj.base_metal}${hj.plating ? ` with ${hj.plating}` : ""}`].filter(Boolean).join(", ");
  const OPEN: Record<string, string> = {
    "waterproof-everyday-under-5k": `Looking for gold you can shower and gym in? ${hero.title} are ${facts}, at ₹${Number(hero.variants[0].price).toLocaleString("en-IN")}. Want help picking the right size?`,
    "wedding-guest-gift": `Shopping for a wedding? ${hero.title} photograph beautifully, and we've picked festive pieces below. Gift wrap and a handwritten note are available.`,
    "office-minimal": `Something light for long workdays? ${hero.title} sit close to the lobe at ${hj.outer_diameter_cm}cm and are ${facts}.`,
    "stainless-steel-earrings": `${hero.title} are ${hj.base_metal} all the way through, with ${hj.plating}. Ask me anything about the metal.`,
  };
  return OPEN[groupId] ?? `Here's ${hero.title}.`;
}
