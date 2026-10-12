/** Hand-authored small seed files. All people, numbers and addresses are fictional. */
export const BRAND_NAME = "Cosmos";

export const brand = {
  name: BRAND_NAME,
  tagline: "Gold that keeps up.",
  positioning: "modern anti-tarnish demi-fine jewellery for everyday wear",
  voice: {
    tone: "Warm, concise, no hype. Talks like a knowledgeable friend at the counter, not a salesperson.",
    do: ["Lead with the answer", "Use exact numbers from tools", "Say 'I'm not sure' and offer support when unsure", "Describe unverified features as materials, not benefits"],
    dont: ["Exclamation-mark stacks", "Superlatives like 'best ever'", "Pressure tactics or fake scarcity", "Medical claims about skin"],
    examples: [
      "The 30mm sits about 32mm on the ear, which most people find easier for long office days.",
      "That one arrives Fri, 16 Oct in Pune if you order before 2pm today.",
      "I'm not certain about that. Want me to connect you with our care team on WhatsApp?",
    ],
  },
  palette: { ivory: "#FBF7F2", sand: "#F1E8DD", ink: "#1F1A17", muted: "#6F655C", gold: "#B8893B", gold_deep: "#8C6524", blush: "#E9D8CF", success: "#2F7D5B", danger: "#B4483A" },
  fonts: { display: "Fraunces", body: "Inter" },
  logo: { wordmark: "COSMOS", file: "/brand/cosmos-logo-v4.png" },
  policies: {
    return_window_days: 15,
    exchange_allowed: true,
    anti_tarnish_warranty_months: 12,
    free_shipping_threshold_inr: 1499,
    shipping_fee_inr: 79,
    cod_allowed: true,
    cod_fee_inr: 49,
    gift_wrap_inr: 99,
    gift_note: true,
    care_guide: "Steel pieces: rinse, pat dry, done. Brass and silver pieces: keep dry, skip perfume on the metal, wipe after wear and store in the pouch.",
  },
  support: { email: "care@cosmos.example", whatsapp: "+91 55555 01234 (simulated)", hours: "Mon to Sat, 10am to 7pm IST" },
  warehouse: { city: "Jaipur", pincode: "302013", dispatch_cutoff_ist: "14:00" },
};

const LANDING = "/p/{hero_sku_handle}?utm_source=chatgpt&utm_medium=cpc&campaign_id={campaign_id}&ad_group_id={ad_group_id}&ad_id={ad_id}";
const CAMPAIGN = "cmp_7f3a9c21d84e";

export const adGroups = {
  advertiser: BRAND_NAME,
  campaign_name: "Cosmos · Always-on · Managed by Engage",
  ad_groups: [
    {
      id: "waterproof-everyday-under-5k", campaign_id: CAMPAIGN, ad_group_id: "adg_2b81e6f0c4a7", ad_id: "ad_e93f1b6d20c8",
      name: "Waterproof everyday earrings under ₹5k", status: "active", created_by: "engage_campaign_agent", origin_proposal: null, daily_budget_inr: 4000,
      context_hints: ["waterproof everyday earrings", "under ₹5,000", "low-maintenance", "shower and gym safe", "won't tarnish"],
      hero_sku: "ciel-hoops-40mm",
      candidate_skus: ["ciel-hoops-40mm", "ciel-hoops-30mm", "aria-hoops-28mm", "ciel-huggies-20mm", "kira-mini-huggies", "kira-twist-huggies", "mira-teardrop-drops", "sana-chain-threaders", "sol-paperclip-chain", "luna-coin-pendant", "lia-flower-studs", "luna-heart-pendant"],
      ad_creative: { title: "Classic gold hoops that survive the shower", body: "Waterproof, 18K gold plated hoops. Shower, gym, repeat. ₹3,299, free shipping.", image: "/images/products/ciel-hoops-40mm/front.jpg", cta: "Shop hoops" },
      landing_url_template: LANDING,
    },
    {
      id: "wedding-guest-gift", campaign_id: CAMPAIGN, ad_group_id: "adg_91d4c7a35e02", ad_id: "ad_4c2d8e71a9b5",
      name: "Wedding guest & gifting", status: "active", created_by: "engage_campaign_agent", origin_proposal: null, daily_budget_inr: 3000,
      context_hints: ["wedding guest outfit", "gift for a friend's wedding", "festive", "statement", "gift-wrapped"],
      hero_sku: "ciel-hoops-40mm",
      candidate_skus: ["ciel-hoops-40mm", "noor-kundan-jhumkas", "noor-pearl-jhumkas", "noor-temple-jhumkas", "noor-mini-jhumkas", "mira-pearl-drops", "maya-pearl-choker", "kaya-tennis-bracelet", "tara-solitaire-studs", "kaya-hammered-cuff"],
      ad_creative: { title: "Wedding-guest gold, gift-wrapped", body: "Statement hoops and new kundan jhumkas. Free gift note, ships from Jaipur.", image: "/images/products/ciel-hoops-40mm/on_model.jpg", cta: "See the edit" },
      landing_url_template: LANDING,
    },
    {
      id: "office-minimal", campaign_id: CAMPAIGN, ad_group_id: "adg_5e0c2a7b19f3", ad_id: "ad_b18a6f3e0d27",
      name: "Office minimal", status: "active", created_by: "engage_campaign_agent", origin_proposal: null, daily_budget_inr: 2500,
      context_hints: ["office-friendly earrings", "minimal", "lightweight", "all-day comfort", "meetings and video calls"],
      hero_sku: "ciel-huggies-20mm",
      candidate_skus: ["ciel-huggies-20mm", "ciel-hoops-30mm", "aria-hoops-28mm", "tara-solitaire-studs", "elle-bezel-studs", "mira-teardrop-drops", "sol-layered-chain-set", "sol-snake-chain", "luna-coin-pendant", "veda-band-ring"],
      ad_creative: { title: "Classic huggies · desk to dinner", body: "Featherlight gold huggies you can sleep in. ₹2,199.", image: "/images/products/ciel-huggies-20mm/front.jpg", cta: "Shop huggies" },
      landing_url_template: LANDING,
    },
    {
      id: "hypoallergenic-studs", campaign_id: CAMPAIGN, ad_group_id: "adg_c47f18e2d6b9", ad_id: "ad_7d05e2c9b4f1",
      name: "Studs for sensitive ears", status: "pending_approval", created_by: "engage_campaign_agent", origin_proposal: "prop-new-ad-group-hypoallergenic", daily_budget_inr: 1500,
      context_hints: ["sensitive ears", "nickel-free", "titanium posts", "everyday studs", "gift for someone with allergies"],
      hero_sku: "tara-solitaire-studs",
      candidate_skus: ["tara-solitaire-studs", "tara-pearl-studs", "tara-heart-studs", "elle-bezel-studs", "kira-mini-huggies", "kira-twist-huggies"],
      ad_creative: { title: "Studs on titanium posts", body: "Everyday sparkle on titanium and surgical-steel posts. From ₹1,199.", image: "/images/products/tara-solitaire-studs/front.jpg", cta: "Shop studs" },
      landing_url_template: LANDING,
    },
  ],
};

export function clickUrl(adGroupId: string, oppref: string): string {
  const g = adGroups.ad_groups.find((a) => a.id === adGroupId)!;
  return (
    g.landing_url_template
      .replace("{hero_sku_handle}", g.hero_sku)
      .replace("{campaign_id}", g.campaign_id)
      .replace("{ad_group_id}", g.ad_group_id)
      .replace("{ad_id}", g.ad_id) + `&oppref=${oppref}`
  );
}

function card(adGroupId: string, oppref: string) {
  const g = adGroups.ad_groups.find((a) => a.id === adGroupId)!;
  return { label: "Sponsored" as const, advertiser: BRAND_NAME, ...g.ad_creative, click_url: clickUrl(adGroupId, oppref), oppref };
}

export const mockChatgpt = {
  conversations: [
    {
      id: "conv-waterproof", title: "Waterproof office earrings", ad_group: "waterproof-everyday-under-5k", requires_approval_of: null,
      turns: [
        { role: "user", text: "I want gold earrings I never have to take off. Shower, gym, office. Under ₹5k." },
        { role: "assistant", text: "Look for 316L stainless steel or titanium with a PVD gold coating. PVD bonds much harder than regular plating, so it holds up to water and sweat. Hoops and huggies are the easiest shapes to sleep and shower in." },
        { role: "user", text: "What size hoop works for both office and weekends?" },
        { role: "assistant", text: "Most people find 20 to 30mm hoops versatile enough for work. 40mm and above reads more as a statement. If you're unsure, check how far the hoop drops below the lobe." },
      ],
      sponsored_card: card("waterproof-everyday-under-5k", "opp_8Hc2kQ1vZx9T"),
    },
    {
      id: "conv-wedding", title: "Wedding guest gift", ad_group: "wedding-guest-gift", requires_approval_of: null,
      turns: [
        { role: "user", text: "My college friend's wedding is in Jaipur next month. Gift ideas around ₹3–4k? She likes gold jewellery." },
        { role: "assistant", text: "Jewellery is a lovely wedding-guest gift. Statement hoops or jhumkas work well across sangeet and reception looks. Pick something versatile she can re-wear, and check the return or exchange policy in case of duplicates." },
        { role: "user", text: "Something that'll look good in photos but she can also wear later?" },
        { role: "assistant", text: "Polished gold hoops photograph well and stay wearable after the wedding. Kundan or pearl jhumkas are more festive. A gift note and wrap make it feel special." },
      ],
      sponsored_card: card("wedding-guest-gift", "opp_3Wm7pR5dLa2N"),
    },
    {
      id: "conv-sensitive", title: "Earrings for sensitive ears", ad_group: "hypoallergenic-studs", requires_approval_of: "hypoallergenic-studs",
      turns: [
        { role: "user", text: "My ears itch with most fashion earrings. What should I look for in studs?" },
        { role: "assistant", text: "Itching is often a reaction to nickel. Look for posts in implant-grade titanium, niobium or solid gold, and avoid unspecified 'gold-toned' metals. Ask the brand what the post is made of, not just the front." },
        { role: "user", text: "Any everyday gold studs like that?" },
        { role: "assistant", text: "Simple studs with titanium posts are a good start. Check that the brand states the post material clearly." },
      ],
      sponsored_card: card("hypoallergenic-studs", "opp_9Ks4tY8bQe6V"),
    },
  ],
};

export const brandRules = {
  margin_floor_band: "medium",
  pinned: { "wedding-guest-gift": [{ sku: "noor-kundan-jhumkas", slot: 1 }] },
  excluded_skus: [
    { sku: "luna-heart-pendant", reason: "Near out of stock (2 left)" },
    { sku: "kaya-tennis-bracelet", reason: "Clearance; not promoted in ads" },
  ],
  rail_size: 5,
  offer_caps: { max_pct: 10, max_flat_inr: 300, applies_to: "Combined promotional discount per order. Loyalty wallet redemption is stored value and not counted." },
  claims_policy: "Only verified attributes (metafields.jewellery, entered by the brand) are stated as claims. AI-extracted attributes are described as materials, never as benefits.",
  banned_phrases: ["ChatGPT", "guaranteed hypoallergenic", "100% waterproof forever"],
  escalation: { text: "I'd rather not guess on that. Our care team can help on WhatsApp, Mon to Sat, 10am to 7pm.", contact: "care@cosmos.example · +91 55555 01234 (simulated)" },
  holdout_pct: 20,
  arms: { A: "Standard product page (holdout)", B: "Curated rail, no agent", C: "Curated rail + agent" },
  arm_split: { A: 0.2, B: 0.4, C: 0.4 },
  agent_enabled: true,
  coverage: { chatgpt_ads: "on", ai_referrals: "beta", meta_ads: "available", google_ads: "available", whole_site: "talk_to_us" },
};

export const offers = {
  engine: "Razorpay Offers Engine (simulated)",
  offers: [
    { id: "prepaid_bonus", type: "flat", label: "₹100 off on prepaid orders over ₹1,999", value: 100, eligibility: { min_cart_inr: 1999, first_order_only: false, channels: ["all"], prepaid_only: true, requires: null }, cap_inr: 100, valid_till: "2026-10-31", cofunded: false, stackable: true },
    { id: "first_order", type: "percent", label: "10% off your first order (up to ₹300)", value: 10, eligibility: { min_cart_inr: 0, first_order_only: true, channels: ["all"], prepaid_only: false, requires: null }, cap_inr: 300, valid_till: "2026-10-31", cofunded: false, stackable: false },
    { id: "bank_offer", type: "flat", label: "₹200 off with select bank cards over ₹2,499", value: 200, eligibility: { min_cart_inr: 2499, first_order_only: false, channels: ["all"], prepaid_only: true, requires: "Select bank credit cards (simulated issuer)" }, cap_inr: 200, valid_till: "2026-10-31", cofunded: true, stackable: true },
    { id: "prepaid_nudge", type: "percent", label: "Extra 5% off when you pay online", value: 5, eligibility: { min_cart_inr: 0, first_order_only: false, channels: ["all"], prepaid_only: true, requires: "Customer flagged for a prepaid nudge (Magic Checkout RTO risk: high)" }, cap_inr: 250, valid_till: "2026-10-31", cofunded: false, stackable: true },
    { id: "loyalty", type: "wallet", label: "Use your Cosmos wallet (up to 20% of the bag)", value: 20, eligibility: { min_cart_inr: 0, first_order_only: false, channels: ["all"], prepaid_only: false, requires: "Logged-in customer (wallet held by Engage Loyalty)" }, cap_inr: null, valid_till: "2026-12-31", cofunded: false, stackable: true },
  ],
};

export const logistics = {
  warehouses: [{ id: "jaipur-1", city: "Jaipur", pincode: "302013", cutoff_ist: "14:00" }],
  zones: [
    { prefix: "411", city: "Pune", zone: "west-metro", transit_days: 3 },
    { prefix: "400", city: "Mumbai", zone: "west-metro", transit_days: 2 },
    { prefix: "560", city: "Bengaluru", zone: "south-metro", transit_days: 3 },
    { prefix: "110", city: "Delhi", zone: "north-metro", transit_days: 2 },
    { prefix: "302", city: "Jaipur", zone: "local", transit_days: 1 },
    { prefix: "845", city: "Rural Bihar (simulated)", zone: "rural-east", transit_days: 6 },
    { prefix: "1", city: "North India", zone: "north", transit_days: 3 },
    { prefix: "2", city: "North India", zone: "north", transit_days: 3 },
    { prefix: "3", city: "West India", zone: "west", transit_days: 2 },
    { prefix: "4", city: "West India", zone: "west", transit_days: 3 },
    { prefix: "5", city: "South India", zone: "south", transit_days: 4 },
    { prefix: "6", city: "South India", zone: "south", transit_days: 4 },
    { prefix: "7", city: "East and North-East India", zone: "east", transit_days: 5 },
    { prefix: "8", city: "East India", zone: "east", transit_days: 5 },
  ],
  default_transit_days: 5,
  day_counting: "calendar",
  holidays: [
    { date: "2026-11-08", name: "Diwali break (warehouse closed)" },
    { date: "2026-11-09", name: "Diwali break (warehouse closed)" },
    { date: "2026-12-25", name: "Christmas (warehouse closed)" },
  ],
  rto_risk: [
    { pincode: "411038", risk: "low", score: 0.06, prepay_nudge_text: null },
    { pincode: "400050", risk: "low", score: 0.08, prepay_nudge_text: null },
    { pincode: "560034", risk: "low", score: 0.07, prepay_nudge_text: null },
    { pincode: "110001", risk: "medium", score: 0.24, prepay_nudge_text: null },
    { pincode: "845401", risk: "high", score: 0.61, prepay_nudge_text: "Pay online to skip the ₹49 COD fee. Prepaid orders over ₹1,999 also get ₹100 off." },
  ],
  demo_pincodes: ["411038", "400050", "560034", "110001", "845401"],
};

export const shoppers = {
  tier0_examples: [
    { id: "t0-pune-ios", device: "mobile", os: "iOS 19", in_app_webview: false, approx_city: "Pune", local_time: "2026-10-13T10:00:00+05:30", language: "en-IN", referrer: "chatgpt.com", utm: { utm_source: "chatgpt", utm_medium: "cpc" }, ab_arm: "C" },
    { id: "t0-delhi-android", device: "mobile", os: "Android 16", in_app_webview: true, approx_city: "Delhi", local_time: "2026-10-13T10:00:00+05:30", language: "en-IN", referrer: "chatgpt.com", utm: { utm_source: "chatgpt", utm_medium: "cpc" }, ab_arm: "C" },
  ],
  tier1_shape: ["chips_tapped", "questions_asked", "products_viewed", "cart", "constraints.budget_inr", "constraints.deadline", "constraints.occasion", "constraints.pincode"],
  tier2_cookie: {
    cookie_id: "csm_ck_5f2a91", first_seen: "2026-09-02", last_visit: "2026-10-04",
    recently_viewed_skus: ["ciel-hoops-40mm", "ciel-huggies-20mm", "sol-paperclip-chain"], wishlist_skus: ["luna-coin-pendant"],
    category_affinity: { earrings: 0.7, necklace: 0.2, ring: 0.05, bracelet: 0.05 }, tone_preference: "yellow gold", last_utm_source: "instagram",
  },
  tier3_demo: {
    rzp_customer_id: "cust_SIMananya0001", name: "Ananya", phone_masked: "+91 99XXXX9999", email_masked: "a•••••@example.com", otp_for_demo: "123456",
    demo_login_phone: "9999999999",
    saved_addresses: [{ label: "Home", line1_masked: "Flat •••, •••••• Society, Kothrud", city: "Pune", pincode: "411038", default: true }],
    saved_payment_methods: [{ type: "upi", display: "ananya•••@okbank (simulated)" }, { type: "card", display: "Visa ending 4417" }],
    consent: { marketing_whatsapp: true, scope: ["order_updates", "personalised_recommendations"], timestamp: "2026-06-09T18:22:00+05:30", source: "login_with_razorpay" },
    brand_order_history: [
      { order_id: "CSM-1042", sku: "ciel-huggies-20mm", date: "2026-08-14", status: "kept", payment: "UPI" },
      { order_id: "CSM-0931", sku: "noor-mini-jhumkas", date: "2026-07-20", status: "rto", payment: "COD" },
      { order_id: "CSM-0877", sku: "luna-coin-pendant", date: "2026-06-09", status: "kept", payment: "card" },
      { order_id: "CSM-0712", sku: "mira-teardrop-drops", date: "2026-04-28", status: "rto", payment: "COD" },
    ],
    preferences: { tone: "yellow gold", sizes: "small to medium (huggies, 20 to 30mm hoops)" },
    loyalty_wallet_inr: 300,
    rto_risk: "high", // user decision (12 Oct): two COD orders refused at the door; drives the pay-online nudge, never shown to her
    cod_history: "2 of 2 COD orders returned to origin (refused at the door); prepaid orders all delivered",
  },
  extra: [
    { id: "arjun", label: "Arjun, anonymous gift buyer", tier: 0, city: "Delhi", pincode: "110001", ad_group: "wedding-guest-gift", payment_preference: "UPI", notes: "Buying for a friend's wedding; no login." },
    { id: "high-rto", label: "Anonymous visitor, rural pincode", tier: 0, city: "Rural Bihar (simulated)", pincode: "845401", ad_group: "waterproof-everyday-under-5k", payment_preference: "COD", notes: "Chooses COD; triggers the prepay nudge." },
  ],
  tier4: "not_built",
};

export const razorpay = {
  mode: "test",
  env_keys: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "NEXT_PUBLIC_RAZORPAY_KEY_ID"],
  order_route: "/api/checkout/order",
  checkout_prefill_from: "shoppers.tier3_demo (only after the simulated login)",
  magic_checkout_simulated: {
    login_with_razorpay: {
      otp_length: 6,
      consent_text: "Share your saved address, order history with Cosmos and loyalty balance with this store. You can withdraw consent anytime. (Simulated)",
      offered_at: ["delivery_date_question", "past_purchase_request", "add_to_cart"],
      max_per_session: 1,
    },
    rto_risk: { source: "logistics.json#rto_risk", prepay_nudge_threshold: "high" },
    cod_eligibility: { max_cart_inr: 5000, blocked_risk: [] },
    buyer_protection_badge: "Razorpay Buyer Protection (simulated): full refund if your order doesn't arrive.",
    trusted_business_badge: "Trusted Business (simulated): verified by Razorpay.",
    affordability: { emi_min_inr: 3000, pay_later_min_inr: 3000, copy: "EMI and Pay Later available on orders above ₹3,000 (display only)." },
  },
  kept_revenue: {
    predicted_return_source: "returns.json (per SKU × ad group; falls back to SKU-level rate)",
    return_window_days: 15,
    true_up: "Predicted returns are replaced by actuals once the 15-day window closes after delivery.",
  },
};

export const merchant = {
  merchant_name: BRAND_NAME,
  user: "Growth lead",
  engage_plan: "ChatGPT Ads (managed)",
  notification_prefs: { proposals: "instant", weekly_digest: true, channel: "email + dashboard (simulated)" },
};
