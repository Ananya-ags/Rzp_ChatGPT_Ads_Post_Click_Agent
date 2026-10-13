/** App-side data access (server components and route handlers). Static JSON imports, validated once. */
import "server-only";
import type { z } from "zod";
import * as S from "../schemas";
import type { Db, ReturnsClassified } from "../tools/core";
import { demoNow } from "../../config/demo";

import brandJson from "../../../data/brand.json";
import productsJson from "../../../data/catalogue/products.json";
import adGroupsJson from "../../../data/ad_groups.json";
import rulesJson from "../../../data/brand_rules.json";
import offersJson from "../../../data/offers.json";
import logisticsJson from "../../../data/logistics.json";
import returnsJson from "../../../data/returns.json";
import shoppersJson from "../../../data/shoppers.json";
import mockJson from "../../../data/mock_chatgpt.json";
import demoJson from "../../../data/demo_script.json";
import manifestJson from "../../../data/images/manifest.json";
import railsJson from "../../../data/generated/rails.json";
import openersJson from "../../../data/generated/openers.json";
import enrichedJson from "../../../data/generated/enriched_catalogue.json";
import returnsClsJson from "../../../data/generated/returns_classified.json";
import razorpayJson from "../../../data/razorpay.json";
import policiesJson from "../../../data/policies.json";

let cached: (Db & { razorpay: z.infer<typeof S.RazorpayConfigSchema>; mock: z.infer<typeof S.MockChatgptSchema>; demo: S.DemoScript; manifest: S.Manifest; rails: S.Rails; openers: S.Openers; enriched: S.Enriched }) | null = null;

export function getDb() {
  if (cached) return cached;
  cached = {
    brand: S.BrandSchema.parse(brandJson),
    products: S.ProductsFileSchema.parse(productsJson).products,
    adGroups: S.AdGroupsFileSchema.parse(adGroupsJson).ad_groups,
    rules: S.BrandRulesSchema.parse(rulesJson),
    offers: S.OffersFileSchema.parse(offersJson).offers,
    logistics: S.LogisticsSchema.parse(logisticsJson),
    returns: S.ReturnsFileSchema.parse(returnsJson).skus,
    shoppers: S.ShoppersSchema.parse(shoppersJson),
    returnsClassified: returnsClsJson as unknown as ReturnsClassified,
    now: demoNow(),
    razorpay: S.RazorpayConfigSchema.parse(razorpayJson),
    mock: S.MockChatgptSchema.parse(mockJson),
    demo: S.DemoScriptSchema.parse(demoJson),
    manifest: S.ManifestSchema.parse(manifestJson),
    rails: S.RailsSchema.parse(railsJson),
    openers: S.OpenersSchema.parse(openersJson),
    enriched: S.EnrichedSchema.parse(enrichedJson),
    policies: S.PoliciesFileSchema.parse(policiesJson).policies,
  };
  return cached;
}

/** Resolve the ad context from URL params: OpenAI's opaque ad_group_id, or our readable slug. */
export function resolveAdGroup(params: { ad_group_id?: string; ad_group?: string }) {
  const db = getDb();
  return db.adGroups.find((g) => (params.ad_group_id && g.ad_group_id === params.ad_group_id) || (params.ad_group && g.id === params.ad_group)) ?? null;
}
