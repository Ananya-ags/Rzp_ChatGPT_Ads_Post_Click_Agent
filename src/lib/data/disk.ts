/** Load and validate data from disk (scripts: pipelines, demo cache, evals). The app uses ./index.ts. */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as S from "../schemas";
import type { Db, ReturnsClassified } from "../tools/core";
import { demoNow } from "../../config/demo";

export const ROOT = join(__dirname, "..", "..", "..");
export const readJson = (rel: string) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
export const readJsonIf = <T,>(rel: string): T | null => (existsSync(join(ROOT, rel)) ? (readJson(rel) as T) : null);

export function loadDb(): Db {
  return {
    brand: S.BrandSchema.parse(readJson("data/brand.json")),
    products: S.ProductsFileSchema.parse(readJson("data/catalogue/products.json")).products,
    adGroups: S.AdGroupsFileSchema.parse(readJson("data/ad_groups.json")).ad_groups,
    rules: S.BrandRulesSchema.parse(readJson("data/brand_rules.json")),
    offers: S.OffersFileSchema.parse(readJson("data/offers.json")).offers,
    logistics: S.LogisticsSchema.parse(readJson("data/logistics.json")),
    returns: S.ReturnsFileSchema.parse(readJson("data/returns.json")).skus,
    shoppers: S.ShoppersSchema.parse(readJson("data/shoppers.json")),
    returnsClassified: readJsonIf<ReturnsClassified>("data/generated/returns_classified.json"),
    now: demoNow(),
    policies: readJsonIf<{ policies: S.Policy[] }>("data/policies.json")?.policies ?? [],
    enriched: readJsonIf<S.Enriched>("data/generated/enriched_catalogue.json"),
  };
}
