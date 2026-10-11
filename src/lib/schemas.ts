import { z } from "zod";

/* ───────────────────────── shared ───────────────────────── */

export const AdGroupSlug = z.string().regex(/^[a-z0-9-]+$/);
export const Handle = z.string().regex(/^[a-z0-9-]+$/);
export const Pincode = z.string().regex(/^\d{6}$/);
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const IsoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/);

/* ───────────────────────── 1. brand.json ───────────────────────── */

export const BrandSchema = z.object({
  name: z.string(),
  tagline: z.string(),
  positioning: z.string(),
  voice: z.object({ tone: z.string(), do: z.array(z.string()), dont: z.array(z.string()), examples: z.array(z.string()).length(3) }),
  palette: z.record(z.string(), z.string()),
  fonts: z.object({ display: z.string(), body: z.string() }),
  logo: z.object({ wordmark: z.string(), file: z.string() }),
  policies: z.object({
    return_window_days: z.number(),
    exchange_allowed: z.boolean(),
    anti_tarnish_warranty_months: z.number(),
    free_shipping_threshold_inr: z.number(),
    shipping_fee_inr: z.number(),
    cod_allowed: z.boolean(),
    cod_fee_inr: z.number(),
    gift_wrap_inr: z.number(),
    gift_note: z.boolean(),
    care_guide: z.string(),
  }),
  support: z.object({ email: z.string(), whatsapp: z.string(), hours: z.string() }),
  warehouse: z.object({ city: z.string(), pincode: Pincode, dispatch_cutoff_ist: z.string().regex(/^\d{2}:\d{2}$/) }),
});
export type Brand = z.infer<typeof BrandSchema>;

/* ───────────────────────── 2. catalogue/products.json ───────────────────────── */

export const Category = z.enum(["earrings", "necklace", "ring", "bracelet"]);
export const Subtype = z.enum(["hoop", "huggie", "stud", "drop", "jhumka", "chain", "pendant", "layered set", "choker", "band", "cuff", "bracelet"]);
export const PriceBand = z.enum(["under_1500", "1500_3000", "3000_5000"]);
export const Occasion = z.enum(["everyday", "office", "festive", "wedding guest", "gifting"]);

export const JewelleryMetafields = z.object({
  // identity
  category: Category,
  subtype: Subtype,
  collection: z.string(),
  // price
  price_band: PriceBand,
  // size and fit
  outer_diameter_mm: z.number().nullable(),
  inner_diameter_mm: z.number().nullable(),
  drop_length_mm: z.number().nullable(),
  width_mm: z.number().nullable(),
  thickness_mm: z.number().nullable(),
  chain_length_cm: z.number().nullable(),
  extender_cm: z.number().nullable(),
  ring_size: z.string().nullable(),
  adjustable: z.boolean().nullable(),
  weight_g: z.number().nullable(),
  // material
  base_metal: z.enum(["316L stainless steel", "925 silver", "brass"]),
  plating: z.enum(["18k gold PVD", "gold vermeil", "rhodium", "18k gold plating"]).nullable(),
  plating_microns: z.number().nullable(),
  post_material: z.string().nullable(),
  nickel_free: z.boolean().nullable(),
  lead_free: z.boolean().nullable(),
  // durability
  water_resistant: z.boolean().nullable(),
  sweat_resistant: z.boolean().nullable(),
  perfume_safe: z.boolean().nullable(),
  anti_tarnish_warranty_months: z.number().nullable(),
  // closure
  closure: z.enum(["push back", "screw back", "hinged huggie", "latch back", "lobster clasp", "adjustable", "hook", "slip-on"]).nullable(),
  // stones
  stone_type: z.enum(["CZ / American diamond", "pearl", "kundan", "none"]),
  setting: z.string().nullable(),
  stone_count: z.number(),
  // style
  shape: z.string().nullable(),
  finish: z.enum(["polished", "textured", "hammered"]),
  tone: z.enum(["yellow gold", "rose gold", "silver"]),
  style_tags: z.array(z.enum(["minimal", "statement", "ethnic fusion", "layering", "classic"])),
  // occasion
  occasions: z.array(Occasion),
  // care
  care: z.string(),
  // logistics
  dispatch_days: z.number().int().min(0),
  made_to_order: z.boolean(),
  // merchandising
  margin_band: z.enum(["high", "medium", "low"]),
  pinned: z.boolean(),
  excluded: z.boolean(),
  launch_date: IsoDate,
  // social proof (synthetic)
  rating: z.number().min(1).max(5),
  review_count: z.number().int(),
  review_snippets: z.array(z.object({ author: z.string(), rating: z.number(), text: z.string() })).min(3).max(4),
});
export type Jewellery = z.infer<typeof JewelleryMetafields>;

export const VariantSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  title: z.string(),
  price: z.string().regex(/^\d+\.\d{2}$/), // Shopify sends prices as strings
  compare_at_price: z.string().regex(/^\d+\.\d{2}$/).nullable(),
  option1: z.string(), // size
  option2: z.string(), // tone
  inventory_quantity: z.number().int(),
  grams: z.number().int(),
});

export const ProductSchema = z.object({
  id: z.number().int(),
  handle: Handle,
  title: z.string(),
  body_html: z.string(),
  vendor: z.string(),
  product_type: z.string(),
  tags: z.array(z.string()),
  created_at: IsoDateTime,
  variants: z.array(VariantSchema).min(1),
  images: z.array(z.object({ src: z.string(), alt: z.string(), role: z.enum(["front", "on_model"]) })),
  metafields: z.object({ jewellery: JewelleryMetafields }),
});
export type Product = z.infer<typeof ProductSchema>;
export const ProductsFileSchema = z.object({ products: z.array(ProductSchema) });

/* ───────────────────────── 3. images/manifest.json ───────────────────────── */

export const ImageSource = z.object({
  provider: z.string(), // "pexels" | "unsplash" | "wikimedia" | "placeholder"
  page_url: z.string().nullable(),
  photographer: z.string().nullable(),
  license: z.string(),
});
export const ManifestImage = z.object({
  file: z.string(),
  kind: z.enum(["photo", "placeholder"]),
  query: z.string().nullable(), // stock search used to source it
  source: ImageSource.nullable(),
});
export const ManifestSchema = z.object({
  style_note: z.string(),
  products: z.record(Handle, z.object({ front: ManifestImage, on_model: ManifestImage })),
  lifestyle: z.record(z.string(), ManifestImage),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/* ───────────────────────── 4. ad_groups.json ───────────────────────── */

export const AdGroupSchema = z.object({
  id: AdGroupSlug, // readable internal key used across all files
  campaign_id: z.string(),
  ad_group_id: z.string(), // OpenAI-style opaque id carried in the URL
  ad_id: z.string(),
  name: z.string(),
  status: z.enum(["active", "pending_approval", "paused"]),
  created_by: z.literal("engage_campaign_agent"),
  origin_proposal: z.string().nullable(),
  daily_budget_inr: z.number(),
  context_hints: z.array(z.string()).min(3),
  hero_sku: Handle,
  candidate_skus: z.array(Handle).min(4),
  ad_creative: z.object({ title: z.string(), body: z.string(), image: z.string(), cta: z.string() }),
  landing_url_template: z.string(),
});
export type AdGroup = z.infer<typeof AdGroupSchema>;
export const AdGroupsFileSchema = z.object({ advertiser: z.string(), campaign_name: z.string(), ad_groups: z.array(AdGroupSchema) });

/* ───────────────────────── 5. mock_chatgpt.json ───────────────────────── */

export const MockConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  ad_group: AdGroupSlug,
  requires_approval_of: AdGroupSlug.nullable(),
  turns: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).min(3),
  sponsored_card: z.object({
    label: z.literal("Sponsored"),
    advertiser: z.string(),
    title: z.string(),
    body: z.string(),
    image: z.string(),
    cta: z.string(),
    click_url: z.string(),
    oppref: z.string(),
  }),
});
export const MockChatgptSchema = z.object({ conversations: z.array(MockConversationSchema).length(3) });

/* ───────────────────────── 6. brand_rules.json ───────────────────────── */

export const BrandRulesSchema = z.object({
  margin_floor_band: z.enum(["high", "medium", "low"]),
  pinned: z.record(AdGroupSlug, z.array(z.object({ sku: Handle, slot: z.number().int().min(1) }))),
  excluded_skus: z.array(z.object({ sku: Handle, reason: z.string() })),
  rail_size: z.number().int(),
  offer_caps: z.object({ max_pct: z.number(), max_flat_inr: z.number(), applies_to: z.string() }),
  claims_policy: z.string(),
  banned_phrases: z.array(z.string()),
  escalation: z.object({ text: z.string(), contact: z.string() }),
  holdout_pct: z.number(),
  arms: z.object({ A: z.string(), B: z.string(), C: z.string() }),
  arm_split: z.object({ A: z.number(), B: z.number(), C: z.number() }),
  agent_enabled: z.boolean(),
  coverage: z.object({
    chatgpt_ads: z.literal("on"),
    ai_referrals: z.literal("beta"),
    meta_ads: z.literal("available"),
    google_ads: z.literal("available"),
    whole_site: z.literal("talk_to_us"),
  }),
});
export type BrandRules = z.infer<typeof BrandRulesSchema>;

/* ───────────────────────── 7. offers.json ───────────────────────── */

export const OfferSchema = z.object({
  id: z.string(),
  type: z.enum(["flat", "percent", "wallet"]),
  label: z.string(),
  value: z.number(), // ₹ for flat, % for percent, % of cart redeemable for wallet
  eligibility: z.object({
    min_cart_inr: z.number(),
    first_order_only: z.boolean(),
    channels: z.array(z.string()),
    prepaid_only: z.boolean(),
    requires: z.string().nullable(),
  }),
  cap_inr: z.number().nullable(),
  valid_till: IsoDate,
  cofunded: z.boolean(),
  stackable: z.boolean(),
});
export type Offer = z.infer<typeof OfferSchema>;
export const OffersFileSchema = z.object({ engine: z.string(), offers: z.array(OfferSchema) });

/* ───────────────────────── 8. logistics.json ───────────────────────── */

export const LogisticsSchema = z.object({
  warehouses: z.array(z.object({ id: z.string(), city: z.string(), pincode: Pincode, cutoff_ist: z.string() })),
  zones: z.array(z.object({ prefix: z.string().regex(/^\d{1,6}$/), city: z.string(), zone: z.string(), transit_days: z.number().int() })),
  default_transit_days: z.number().int(),
  day_counting: z.literal("calendar"),
  holidays: z.array(z.object({ date: IsoDate, name: z.string() })),
  rto_risk: z.array(z.object({
    pincode: Pincode,
    risk: z.enum(["low", "medium", "high"]),
    score: z.number().min(0).max(1),
    prepay_nudge_text: z.string().nullable(),
  })),
  demo_pincodes: z.array(Pincode),
});
export type Logistics = z.infer<typeof LogisticsSchema>;

/* ───────────────────────── 9. returns.json ───────────────────────── */

export const UseContext = z.enum(["office", "everyday", "wedding", "gifting", "festive"]);
export const ReturnsEntrySchema = z.object({
  sku: Handle,
  units_sold: z.number().int(),
  returns: z.number().int(),
  rto: z.number().int(),
  return_rate: z.number(),
  rto_rate: z.number(),
  by_ad_group: z.record(AdGroupSlug, z.object({ units: z.number().int(), returns: z.number().int(), return_rate: z.number() })),
  by_use_context: z.partialRecord(UseContext, z.object({ units: z.number().int(), returns: z.number().int(), kept: z.number().int() })),
  reasons_raw: z.array(z.object({ id: z.string(), text: z.string(), date: IsoDate, ad_group_id: AdGroupSlug.nullable(), use_context: UseContext.nullable() })),
});
export type ReturnsEntry = z.infer<typeof ReturnsEntrySchema>;
export const ReturnsFileSchema = z.object({ window_days: z.number(), as_of: IsoDate, skus: z.array(ReturnsEntrySchema) });

/* ───────────────────────── 10. shoppers.json ───────────────────────── */

export const ShoppersSchema = z.object({
  tier0_examples: z.array(z.object({
    id: z.string(), device: z.string(), os: z.string(), in_app_webview: z.boolean(), approx_city: z.string(),
    local_time: z.string(), language: z.string(), referrer: z.string(), utm: z.record(z.string(), z.string()), ab_arm: z.enum(["A", "B", "C"]),
  })),
  tier1_shape: z.array(z.string()),
  tier2_cookie: z.object({
    cookie_id: z.string(), first_seen: IsoDate, last_visit: IsoDate, recently_viewed_skus: z.array(Handle), wishlist_skus: z.array(Handle),
    category_affinity: z.record(z.string(), z.number()), tone_preference: z.string(), last_utm_source: z.string(),
  }),
  tier3_priya: z.object({
    rzp_customer_id: z.string(), name: z.string(), phone_masked: z.string(), email_masked: z.string(), otp_for_demo: z.string(),
    saved_addresses: z.array(z.object({ label: z.string(), line1_masked: z.string(), city: z.string(), pincode: Pincode, default: z.boolean() })),
    saved_payment_methods: z.array(z.object({ type: z.enum(["upi", "card"]), display: z.string() })),
    consent: z.object({ marketing_whatsapp: z.boolean(), scope: z.array(z.string()), timestamp: IsoDateTime, source: z.literal("login_with_razorpay") }),
    brand_order_history: z.array(z.object({ order_id: z.string(), sku: Handle, date: IsoDate, status: z.enum(["kept", "returned"]) })),
    preferences: z.object({ tone: z.string(), sizes: z.string() }),
    loyalty_wallet_inr: z.number(),
    rto_risk: z.enum(["low", "medium", "high"]),
    cod_history: z.string(),
  }),
  extra: z.array(z.object({ id: z.string(), label: z.string(), tier: z.number(), city: z.string(), pincode: Pincode, ad_group: AdGroupSlug, payment_preference: z.string(), notes: z.string() })),
  tier4: z.literal("not_built"),
});
export type Shoppers = z.infer<typeof ShoppersSchema>;

/* ───────────────────────── 11. razorpay.json ───────────────────────── */

export const RazorpayConfigSchema = z.object({
  mode: z.literal("test"),
  env_keys: z.array(z.string()),
  order_route: z.string(),
  checkout_prefill_from: z.string(),
  magic_checkout_simulated: z.object({
    login_with_razorpay: z.object({ otp_length: z.number(), consent_text: z.string(), offered_at: z.array(z.string()), max_per_session: z.number() }),
    rto_risk: z.object({ source: z.string(), prepay_nudge_threshold: z.enum(["medium", "high"]) }),
    cod_eligibility: z.object({ max_cart_inr: z.number(), blocked_risk: z.array(z.string()) }),
    buyer_protection_badge: z.string(),
    trusted_business_badge: z.string(),
    affordability: z.object({ emi_min_inr: z.number(), pay_later_min_inr: z.number(), copy: z.string() }),
  }),
  kept_revenue: z.object({ predicted_return_source: z.string(), return_window_days: z.number(), true_up: z.string() }),
});

/* ───────────────────────── 12. orders_sessions.json ───────────────────────── */

export const Channel = z.enum(["chatgpt_ads", "google_search", "google_shopping", "meta", "organic"]);
export const SessionSchema = z.object({
  session_id: z.string(),
  date: IsoDate,
  channel: Channel,
  ad_group_id: AdGroupSlug.nullable(),
  oppref: z.string().nullable(),
  gclid: z.string().nullable(),
  arm: z.enum(["A", "B", "C"]),
  device: z.enum(["mobile", "desktop"]),
  chat_opened: z.boolean(),
  login_offered: z.boolean(),
  login_accepted: z.boolean(),
  converted: z.boolean(),
});
export type Session = z.infer<typeof SessionSchema>;
export const OrderSchema = z.object({
  order_id: z.string(),
  session_id: z.string(),
  date: IsoDate,
  items: z.array(z.object({ sku: Handle, variant_sku: z.string(), qty: z.number().int(), price_inr: z.number() })),
  amount: z.number(),
  payment_method: z.enum(["UPI", "card", "COD"]),
  pincode: Pincode,
  predicted_return_prob: z.number(),
  status: z.enum(["delivered", "returned", "RTO", "refunded", "in_transit"]),
  window_closed: z.boolean(),
  refund_amount: z.number(),
  kept_revenue: z.number(),
});
export type Order = z.infer<typeof OrderSchema>;
export const OrdersSessionsSchema = z.object({
  generated_by: z.string(),
  seed: z.number(),
  period: z.object({ from: IsoDate, to: IsoDate }),
  sessions: z.array(SessionSchema),
  orders: z.array(OrderSchema),
});
export type OrdersSessions = z.infer<typeof OrdersSessionsSchema>;

/* ───────────────────────── 13. chat_logs_seed.json ───────────────────────── */

export const ChatLogSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  ad_group_id: AdGroupSlug,
  timestamp: IsoDateTime,
  message: z.string(),
  language: z.enum(["en-IN", "hi-Latn"]),
  converted: z.boolean(),
  unmet: z.boolean(),
});
export const ChatLogsSchema = z.object({ messages: z.array(ChatLogSchema) });

/* ───────────────────────── 14. merchant.json ───────────────────────── */

export const MerchantSchema = z.object({
  merchant_name: z.string(),
  user: z.string(),
  engage_plan: z.string(),
  notification_prefs: z.object({ proposals: z.string(), weekly_digest: z.boolean(), channel: z.string() }),
});

/* ───────────────────────── 15. demo_script.json ───────────────────────── */

export const CardSchema = z.object({
  kind: z.enum(["product", "comparison", "delivery", "return_insight", "offer"]),
  skus: z.array(Handle),
  data: z.record(z.string(), z.unknown()),
});
export const DemoStepSchema = z.object({
  id: z.string(),
  surface: z.enum(["mock_chatgpt", "product_page", "chat", "checkout", "merchant", "evals"]),
  ad_group: AdGroupSlug.nullable(),
  pincode: Pincode.nullable(),
  chip: z.string().nullable(),
  narration: z.string(),
  expected_tools: z.array(z.string()),
  cached_response: z.object({ text: z.string(), cards: z.array(CardSchema), trace: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()), summary: z.string() })) }).nullable(),
});
export const DemoScriptSchema = z.object({ steps: z.array(DemoStepSchema), try_it_chips: z.array(z.object({ text: z.string(), purpose: z.string() })) });
export type DemoScript = z.infer<typeof DemoScriptSchema>;

/* ───────────────────────── 16. evals/cases.json ───────────────────────── */

export const EvalCategory = z.enum([
  "tool_use", "groundedness", "claim_safety", "handoff", "return_insight_relevance",
  "offer_cap_abuse", "prompt_injection", "hinglish", "card_vs_text", "off_topic", "no_chatgpt_mention",
]);
export const EvalCaseSchema = z.object({
  id: z.string(),
  category: EvalCategory,
  setup: z.object({ ad_group: AdGroupSlug, tier: z.number().int().min(0).max(3), pincode: Pincode.nullable(), demo_time: IsoDateTime, page_sku: Handle }),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1),
  expected_tools: z.array(z.string()),
  tools_ordered: z.boolean(),
  must_include: z.array(z.string()),
  must_not_include: z.array(z.string()),
  expected_format: z.enum(["card", "text", "either"]),
  judge_rubric: z.string().nullable(),
});
export const EvalCasesSchema = z.object({ version: z.string(), cases: z.array(EvalCaseSchema) });

/* ───────────────────────── answer key (never read by pipelines) ───────────────────────── */

export const PlantedFactsSchema = z.object({
  note: z.string(),
  waterproof_prose_only: z.array(Handle),
  hypoallergenic_posts_prose_only: z.array(Handle),
  vague_wording: z.array(z.object({ sku: Handle, phrase: z.string() })),
  hero: Handle,
  keeper: Handle,
  rescue: Handle,
  layered_set: Handle,
  delivery_pune: z.array(z.object({ sku: Handle, ships: IsoDate, arrives: IsoDate })),
  chat_themes: z.record(z.string(), z.string()), // chat message id -> theme
  return_reason_labels: z.record(z.string(), z.string()), // reason id -> label (planted SKUs only)
  metric_targets: z.record(z.string(), z.number()),
});

/* ───────────────────────── generated (pipeline outputs, never hand-edited) ───────────────────────── */

export const ProducerSchema = z.object({ stage: z.string(), mode: z.enum(["llm", "heuristic"]), model: z.string().nullable(), prompt_version: z.string(), note: z.string() });

export const ExtractedAttribute = z.object({
  attribute: z.string(),
  value: z.union([z.string(), z.boolean(), z.number()]),
  source: z.object({ type: z.enum(["text", "image"]), phrase: z.string() }),
  confidence: z.number().min(0).max(1),
  verified: z.literal(false),
  vague: z.boolean(),
});
export const EnrichedSchema = z.object({ producer: ProducerSchema, skus: z.record(z.string(), z.object({ attributes: z.array(ExtractedAttribute) })) });
export type Enriched = z.infer<typeof EnrichedSchema>;

export const AttributesToConfirmSchema = z.object({
  producer: ProducerSchema,
  items: z.array(z.object({ id: z.string(), sku: z.string(), title: z.string(), attribute: z.string(), proposed_value: z.union([z.string(), z.boolean(), z.number()]), source_phrase: z.string(), confidence: z.number(), unlocks: z.array(z.string()) })),
});
export type AttributesToConfirm = z.infer<typeof AttributesToConfirmSchema>;

export const RailsSchema = z.object({
  producer: ProducerSchema,
  rails: z.record(z.string(), z.object({
    items: z.array(z.object({ rank: z.number(), sku: z.string(), reason: z.string(), pinned: z.boolean() })),
    rules_applied: z.array(z.object({ sku: z.string(), action: z.enum(["pinned", "removed"]), why: z.string() })),
  })),
});
export type Rails = z.infer<typeof RailsSchema>;

export const OpenersSchema = z.object({
  producer: ProducerSchema,
  openers: z.record(z.string(), z.object({ chip: z.string(), opener: z.string(), suggested_chips: z.array(z.string()).min(2).max(3) })),
});
export type Openers = z.infer<typeof OpenersSchema>;

export const IntentClustersSchema = z.object({
  producer: ProducerSchema,
  total_messages: z.number(),
  clusters: z.array(z.object({
    id: z.string(), label: z.string(), count: z.number(), sessions: z.number(), sample_wordings: z.array(z.string()),
    conversion_rate: z.number(), unmet_rate: z.number(), hinglish_count: z.number(), message_ids: z.array(z.string()), catalogue_gap: z.boolean(),
  })),
});
export type IntentClusters = z.infer<typeof IntentClustersSchema>;

export const ProposalSchema = z.object({
  id: z.string(),
  type: z.enum(["new_ad_group", "feed_attribute", "remove_from_rail", "pause_context"]),
  title: z.string(),
  summary: z.string(),
  evidence: z.array(z.object({ label: z.string(), value: z.string() })),
  examples: z.array(z.string()),
  confidence: z.number(),
  impact: z.string(),
  apply: z.record(z.string(), z.unknown()),
});
export const ProposalsSchema = z.object({ producer: ProducerSchema, proposals: z.array(ProposalSchema) });
export type Proposal = z.infer<typeof ProposalSchema>;
