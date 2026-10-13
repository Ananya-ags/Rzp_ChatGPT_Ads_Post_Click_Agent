# Step 1 build brief: storyboard and complete data spec (11 Oct 2026)

Hand this file to Claude Code (or Codex) as the brief for step 1. Everything in the prototype reads from these files. All brands, people, phone numbers, addresses and payment details are **fictional**; label the data "Simulated" wherever it appears in the UI.

> **Materials update, 13 Oct 2026 (built):**
> - Every earring is **one metal throughout**; the titanium and surgical-steel parts, the `post_material` field, "PVD" and "316L" are gone. Steel pieces are "stainless steel" with "18k gold plating".
> - The loop's new ad is now **"Stainless steel earrings (sensitive ears)"**: 28 sensitive-ears chats are matched to the 8 stainless steel earrings. It states the metal only and never says hypoallergenic or nickel-free, because steel contains some nickel.
> - **Sizing (13 Oct):** each earring has exactly one size: `outer_diameter_cm` for hoops, huggies and studs (`drop_length_cm` is null), and `drop_length_cm` for drops and jhumkas. There's no "on the ear" measurement.
> - **Units (13 Oct):** all size fields and copy are in **cm** (`*_cm` fields, e.g. `outer_diameter_cm: 3`); handles such as `ciel-hoops-40mm` keep their original names as IDs.
> - The rows below are updated to match.

**Brand name:** use a placeholder (e.g. "Lumi") and search the name quickly to confirm it isn't an existing Indian jewellery brand before generating assets.

**Demo clock:** fix "today" at **Tue 13 Oct 2026, 10:00 IST** in config, so delivery dates are the same in every recording and evaluation run.

---

## Part A: the storyboard (the data must support every shot)

| Time | Shot | Left: phone | Right: AI console |
|---|---|---|---|
| 0–10s | Problem | ChatGPT chat ("waterproof office earrings under ₹5k") → sponsored ad → a generic product page | Overlay: "OpenAI shares no query. Pages are static." |
| 10–16s | Same SKU, two ads | Tap the "waterproof everyday" ad, then the "wedding guest gift" ad: two different chips, rails and openers | Ad group → context hints → a reason for each rail item; brand rules applied |
| 16–28s | Return-prevention wow | "Will these work for office?" → "Buyers who returned this mostly said it looked bigger… most keepers chose the 3cm" (card) | Tool trace: `get_return_insight` → `search_catalog`; claim check passes |
| 28–36s | Delivery rescue | "Need it in Pune by 18 Oct" → the 3cm misses (21 Oct) → Aria 2.8cm arrives 16 Oct (card) | `check_delivery` ✗ → `search_catalog` with the constraint → `check_delivery` ✓ |
| 36–46s | Login and checkout | Add → "Log in with Razorpay" → "Welcome back, Priya", exact date to her saved address, ₹300 rewards → Razorpay test checkout succeeds | Personalisation tier 0 → 3; predicted kept revenue |
| 46–74s | Merchant console and the loop | Ad-click-to-order conversion and kept revenue → proposal "28 shoppers asked about sensitive ears" (evidence: 8 stainless steel earrings, claim check) → Approve → back to mock ChatGPT: the "All-steel gold earrings" ad → its page | Full-screen console, then the new ad's context |
| 74–84s | Trust | `/evals`: v1 → v2 pass rates; "give me 50% off" politely declined | Guardrail: offer cap enforced in code |
| 84–90s | Close | "Proven on ChatGPT ads, then AI and paid traffic, then the whole site. Measured on revenue that sticks." | — |

---

## Part B: data files

**Layout:** all hand-authored seed data lives in `/data`; files produced by the offline AI pipelines (step 2) go in `/data/generated` and are never edited by hand. Use a fixed random seed for any generated numbers, and add a `validate-data` script that checks every reference (SKU IDs, ad group IDs, pincodes) resolves.

### Real vs simulated
| Data | Status |
|---|---|
| Razorpay checkout | **Real Test Mode** (test keys, no real money) |
| LLM calls (agent, pipelines, judge) | **Real** |
| ChatGPT ads, ad groups, `oppref` | Simulated, using OpenAI's real URL macro format |
| Login With Razorpay, saved addresses, loyalty balance | Simulated (mocked OTP) |
| Magic Checkout RTO risk, Offers Engine | Simulated (seeded tables behind the tools) |
| Orders, returns, sessions, chat logs, reviews | Synthetic, labelled "Simulated" |
| Product images | AI-generated for a fictional brand, disclosed in the build log |

---

### 1. `brand.json`: brand and policies
- `name`, `tagline`, `positioning` ("modern anti-tarnish demi-fine jewellery for everyday wear")
- `voice`: tone guide for the agent (warm, concise, no hype), 3 example sentences
- `palette`, `fonts`, `logo` (for the website design)
- `policies`:
  - `return_window_days: 15`, `exchange_allowed: true`
  - `anti_tarnish_warranty_months: 12`
  - `free_shipping_threshold_inr: 1499`, `shipping_fee_inr: 79`
  - `cod_allowed: true`, `cod_fee_inr: 49`
  - `gift_wrap_inr: 99`, `gift_note: true`
  - `care_guide` (short text)
- `support`: `{ email: "care@cosmosjewels.example", reply: "within 24 hours" }` (fictional; email only, no phone, WhatsApp or hours)
- `warehouse`: Jaipur, pincode 302013, dispatch cutoff 14:00 IST

### 2. `catalogue/products.json`: about 35 products, Shopify `products.json` shape
Three layers per product (see "Layers" below).

**Shopify fields (raw layer):**
- `id`, `handle`, `title`, `body_html` (**messy, brand-style prose**), `vendor`, `product_type`, `tags[]`, `created_at`
- `variants[]`: `id`, `sku`, `title`, `price`, `compare_at_price`, `option1` (size), `option2` (tone), `inventory_quantity`, `grams`
- `images[]`: `src`, `alt`, `role` (`front` | `on_model` | `scale`)

**`metafields.jewellery` (verified layer, brand-entered):**
| Group | Fields |
|---|---|
| Identity | `category` (earrings / necklace / ring / bracelet), `subtype` (hoop, huggie, stud, drop, jhumka, chain, pendant, layered set, band, cuff), `collection` |
| Price | `price_band` (`under_1500`, `1500_3000`, `3000_5000`) |
| Size and fit | `outer_diameter_cm`, `inner_diameter_cm`, `drop_length_cm`, `width_cm`, `thickness_cm`, `chain_length_cm`, `extender_cm`, `ring_size` or `adjustable`, `weight_g`. **Earrings carry one size only:** diameter (`outer_diameter_cm`) for hoops, huggies and studs; length (`drop_length_cm`) for drops and jhumkas |
| Material | `base_metal` (stainless steel, 925 silver, brass; the whole earring is this metal), `plating` (18k gold plating, gold vermeil, rhodium), `plating_microns`, `nickel_free` (`false` on every stainless steel piece), `lead_free` |
| Durability | `water_resistant`, `sweat_resistant`, `perfume_safe`, `anti_tarnish_warranty_months` |
| Closure | `closure` (push back, screw back, hinged huggie, latch back, lobster clasp, adjustable) |
| Stones | `stone_type` (CZ / American diamond, pearl, none), `setting`, `stone_count` |
| Style | `shape`, `finish` (polished, textured, hammered), `tone` (yellow gold, rose gold, silver), `style_tags[]` (minimal, statement, ethnic fusion, layering) |
| Occasion | `occasions[]` (everyday, office, festive, wedding guest, gifting) |
| Care | `care` |
| Logistics | `dispatch_days`, `made_to_order` |
| Merchandising | `margin_band` (high, medium, low), `pinned`, `excluded`, `launch_date` |
| Social proof | `rating`, `review_count`, `review_snippets[]` (3–4 each, synthetic) |

Nullable fields are deliberate: `null` means "the brand hasn't entered it", which the AI may fill only as an unverified extraction.

**Catalogue mix (₹999–₹4,999):**
| Category | Count | Must include |
|---|---|---|
| Earrings | ~18 | **Ciel 4cm hoops** (hero), **Ciel 3cm hoops** (keeper), Ciel 2cm huggies, **Aria 2.8cm hoops** (fast-shipping alternative), studs, drops, **3–4 ethnic-fusion jhumkas** (wedding rail), **8 stainless steel earrings** (hoops, huggies, teardrops, threaders), which feed the sensitive-ears ad |
| Necklaces | ~8 | Chains, pendants, a **"Layered chain set"** (high office-context returns: "too long") |
| Rings | ~5 | Adjustable and sized |
| Bracelets | ~4 | Cuffs, chain bracelets |

**Hero and planted SKUs:**
| SKU | Role | Key planted facts |
|---|---|---|
| Ciel 4cm hoops | Hero in both "waterproof everyday" and "wedding guest gift" ads | `outer_diameter_cm: 4` (4cm diameter, its one size); in stock (arrives 16 Oct to Pune); high "looked bigger than expected" returns in office context |
| Ciel 3cm hoops | Keeper alternative | Low returns; **made-to-order, `dispatch_days: 5`** → arrives **21 Oct** to Pune |
| Aria 2.8cm hoops | Delivery-rescue alternative | Similar style, in stock → arrives **16 Oct** to Pune |
| 8 stainless steel earrings | Feed the new ad group | `base_metal: stainless steel`, `nickel_free: false`; one metal throughout |
| Layered chain set | "Remove from rail" proposal | 22% returns via office context vs 8% overall; reason "too long" |

### Layers (the planted gaps the AI must find)
- **~18 SKUs** are waterproof only in `body_html` ("shower-proof", "goes in the pool with you"); `water_resistant` is `null`. Drives the **"add 'waterproof' to 18 SKUs"** feed proposal.
- **8 earrings** are stainless steel all the way through. Together with the 28 sensitive-ears chats, they drive the **new ad group** proposal. The ad states the metal only (no hypoallergenic or nickel-free claim).
- **~4 SKUs** have vague or conflicting wording ("gold-toned", "water friendly", "skin-safe for most") to test that the claim checker refuses to overstate.

### 3. `images/manifest.json`
- Per SKU: `front`, `on_model`, `scale` (on-model or on-hand, for size questions) file names
- Per image: the generation prompt and model used (for the build log)
- 2 lifestyle images (office, wedding) for the page header only, never altered product shots
- One consistent style prompt prefix (background, lighting, angle) so the catalogue looks coherent

### 4. `ad_groups.json`: simulated ChatGPT Ads account
Per ad group:
- `campaign_id`, `ad_group_id`, `ad_id` (OpenAI-style IDs)
- `name`, `status` (`active`), `created_by: "engage_campaign_agent"`, `daily_budget_inr`
- `context_hints[]` (natural language, e.g. "waterproof everyday earrings", "under ₹5,000", "low-maintenance", "office-friendly")
- `hero_sku`, `candidate_skus[]`
- `ad_creative`: title, body, image, CTA
- `landing_url_template`: `/p/{hero_sku_handle}?utm_source=chatgpt&utm_medium=cpc&campaign_id={campaign_id}&ad_group_id={ad_group_id}&ad_id={ad_id}` (the page also reads `oppref`, which OpenAI appends automatically)

**Ad groups:**
| ID (name) | Context | Hero |
|---|---|---|
| `waterproof-everyday-under-5k` | Waterproof, everyday, under ₹5k, low-maintenance | Ciel 4cm |
| `wedding-guest-gift` | Wedding guest, gifting, festive, statement | Ciel 4cm |
| `office-minimal` | Office, minimal, lightweight, all-day comfort | Ciel 2cm huggies |
| `stainless-steel-earrings` | **Absent at start** (`pending_approval`). Created by approving the proposal | Mini Huggies (`kira-mini-huggies`); creative "All-steel gold earrings · One metal throughout, 18K gold plated. From ₹1,599." |

### 5. `mock_chatgpt.json`: the ChatGPT mock screens
- **Conversation 1** (waterproof everyday): 2–3 user prompts and generic, hand-written assistant replies, then a sponsored card for the waterproof ad group
- **Conversation 2** (wedding guest gift): same structure, sponsored card for the wedding ad group
- **Conversation 3** (sensitive ears): a user asking about earrings for sensitive ears; shows the stainless steel earrings card **only after** the proposal is approved
- Each card: title, body, image, "Sponsored" label, and a generated click URL including a fake `oppref`

### 6. `brand_rules.json`: merchant controls
- `margin_floor_band: "medium"`
- `pinned` per ad group (e.g. new jhumka pinned in slot 1 for wedding)
- `excluded_skus[]` (one near out-of-stock, one clearance)
- `rail_size: 5`
- `offer_caps`: `max_pct: 10`, `max_flat_inr: 300`
- `claims_policy`: only verified attributes are stated as claims; unverified ones are described as materials
- `banned_phrases[]`: "ChatGPT", "guaranteed hypoallergenic", "100% waterproof forever"
- `escalation`: support handoff text and contact
- Measurement in production: a holdout of ChatGPT ad traffic would see the standard page, so the lift in ad-click-to-order conversion is measured directly. The prototype shows the agent experience only.
- `agent_enabled: true` (the Pause switch)
- `coverage`: ChatGPT ads **on**; AI referrals **beta**; Meta and Google ads **available**; whole site **"Talk to us"**

### 7. `offers.json`: simulated Offers Engine
- `prepaid_bonus`: ₹100 off prepaid orders over ₹1,999
- `first_order`: 10% off, capped at ₹300
- `bank_offer`: ₹200 off with select bank cards over ₹2,499 (generic bank, co-funded flag)
- `loyalty`: wallet balance redeemable up to 20% of cart
- Per offer: `id`, `type`, `eligibility` (min cart, first order, channel, prepaid only), `cap`, `valid_till`, `cofunded`, `stackable`

### 8. `logistics.json`: delivery and RTO
- `warehouses`: Jaipur 302013, cutoff 14:00
- `zones`: pincode prefix → city, zone, transit days
- **Demo pincodes:**
  | Pincode | City | Transit | RTO risk |
  |---|---|---|---|
  | 411038 | Pune | 3 days | Low (Priya's saved address) |
  | 400050 | Mumbai | 2 days | Low |
  | 560034 | Bengaluru | 3 days | Low |
  | 110001 | Delhi | 2 days | Medium |
  | 8xxxxx (one rural pincode) | — | 6 days | **High** (triggers the prepay nudge) |
- `holidays[]` (none that interfere with the demo window)
- `get_rto_risk` table: pincode → `risk` (low / medium / high), `score`, `prepay_nudge_text`

**Planted delivery facts (demo today = 13 Oct):**
| SKU | To Pune 411038 |
|---|---|
| Ciel 4cm (in stock) | Ships 13 Oct → arrives **16 Oct** |
| Ciel 3cm (made-to-order, 5 days) | Ships 18 Oct → arrives **21 Oct** (misses 18 Oct) |
| Aria 2.8cm (in stock) | Ships 13 Oct → arrives **16 Oct** |

### 9. `returns.json`: return and RTO history (90 days)
Per SKU:
- `units_sold`, `returns`, `rto`, `return_rate`, `rto_rate`
- `by_ad_group`: return rate per context
- `reasons_raw[]`: free-text return reasons

**Planted:**
- **Ciel 4cm:** ~20 reasons, mostly size ("way bigger than the photo", "too big for office", "looked huge on me"), a few others (gift not liked, changed mind)
- **Ciel 3cm:** low return rate; reasons scattered
- **Layered chain set:** office-context return rate 22% vs 8% overall; reasons mostly "too long", "tangles"
- Other SKUs: 3–8 reasons each, mixed

### 10. `shoppers.json`: personalisation tiers
**Tier 0, anonymous (built at runtime from request; seed examples here):**
- `device` (mobile, iOS/Android, in-app webview), `approx_city` from IP (e.g. Pune), `local_time`, `language` (en-IN), `referrer`, `utm` and ad parameters, `ab_arm`

**Tier 1, in-session (built at runtime):**
- chips tapped, questions asked, products viewed, cart, constraints extracted (budget, deadline, occasion, pincode)

**Tier 2, brand first-party cookie (no personal data):**
- `cookie_id`, `first_seen`, `last_visit`
- `recently_viewed_skus[]`, `wishlist_skus[]`
- `category_affinity` (e.g. earrings 0.7, necklaces 0.2), `tone_preference` (yellow gold)
- `last_utm_source`

**Tier 3, Login With Razorpay (simulated): Priya**
- `rzp_customer_id` (fake), `name: "Priya"` (first name only in UI)
- `phone_masked: "+91 98XXXX1234"`, `email_masked`
- `otp_for_demo: "123456"`
- `saved_addresses[]`: Home, Pune 411038 (address lines masked)
- `saved_payment_methods[]`: masked UPI handle, "Visa ending 4417"
- `consent`: `marketing_whatsapp: true`, `scope`, `timestamp`, `source: "login_with_razorpay"`
- `brand_order_history[]`: e.g. Ciel 2cm huggies (Aug, kept), a pendant (Jun, kept)
- `preferences` (from past orders): tone yellow gold, prefers small/medium sizes
- `loyalty_wallet_inr: 300` (Engage Loyalty Wallet)
- `rto_risk: "low"`, `cod_history`: prepaid only

**Extra demo shoppers:**
- **Arjun:** anonymous gift buyer from Delhi (wedding context, no login)
- **High-RTO visitor:** anonymous, rural high-risk pincode, chooses COD → prepay nudge

**Tier 4 (cross-merchant network signals):** **not created.** Stated in the one-pager as a future step that needs explicit consent and legal review.

### 11. `razorpay.json`: Razorpay configuration and simulated Magic Checkout features
- **Test Mode:** `key_id` and `key_secret` in environment variables only (never in the repo); server route creates orders; Checkout.js prefilled from the tier-3 profile
- **Simulated Magic Checkout features:**
  - `login_with_razorpay`: mocked OTP flow and consent text
  - `rto_risk` lookup (from `logistics.json`) and prepay nudge
  - `cod_eligibility` rules
  - `buyer_protection_badge`, `trusted_business_badge` copy
  - `affordability`: EMI and Pay Later shown above ₹3,000 (display only)
- **Kept revenue settings:** predicted return probability per SKU and context (from `returns.json`), return window 15 days, true-up after the window

### 12. `orders_sessions.json`: synthetic performance data (30 days) for the merchant console
Generated by a seeded script, not typed by hand.
- **Sessions (~6,000):** `session_id`, `date`, `channel` (chatgpt_ads / google_search / google_shopping / meta / organic), `ad_group_id`, `oppref` or `gclid`, `device`, `chat_opened`, `login_offered`, `login_accepted`, `converted`
- **Orders (~400):** `order_id`, `session_id`, `items`, `amount`, `payment_method` (UPI / card / COD), `predicted_return_prob`, `status` (delivered / returned / RTO / refunded / in transit), `refund_amount`, `kept_revenue`
- **Tuned so that:**
  - Kept revenue per click with the agent ≈ ₹61
  - Return and RTO rate with the agent ≈ 9%
  - `wedding-guest-gift` is the weak row (≈ ₹31 per click)
  - Chat open rate about 15–25%
- Console numbers are **computed from this file**, not hard-coded

### 13. `chat_logs_seed.json`: past shopper questions (for intent clusters and proposals)
About 150 entries: `session_id`, `ad_group_id`, `timestamp`, `message`, `language`, `converted`, `unmet` (catalogue couldn't satisfy)
| Theme | Count | Examples |
|---|---|---|
| Hypoallergenic / sensitive ears | **28** | "sensitive ears", "nickel-free?", "my ears itch with fake gold", "kaan mein allergy hoti hai" |
| Waterproof / shower | ~30 | "can I shower with it", "pool safe?" |
| Delivery by date | ~25 | "will it reach before Diwali", "need by Friday" |
| Size and fit | ~20 | "how big is it", "too heavy?" |
| Gifting | ~15 | "gift wrap?", "gift for my sister's wedding" |
| Returns and trust | ~10 | "can I return if it tarnishes" |
| Other / off-topic | ~16 | mixed |
Include ~15 Hinglish messages across themes.

### 14. `merchant.json`: console user and settings
- `merchant_name` (the fictional brand), `user: "Growth lead"`
- `engage_plan: "ChatGPT Ads (managed)"`
- `notification_prefs`

### 15. `demo_script.json`: guided demo
- Ordered steps, each with the suggested chip text, the expected tool sequence, and a **cached response** used if the API is slow or fails
- Includes the Hinglish chip ("Ye office mein pehen sakte hain?") and the "give me 50% off" injection chip (for Try it yourself)

### 16. `evals/cases.json`: evaluation set (detailed in step 9)
About 40 cases: `id`, `category`, `setup` (ad group, tier, pincode, demo time), `messages[]`, `expected_tools[]` (and order where it matters), `must_include[]`, `must_not_include[]` (e.g. "ChatGPT", unverified claims), `judge_rubric`
Categories: tool use, groundedness, claim safety, handoff, return insight relevance, offer-cap abuse, prompt injection, Hinglish, card vs text format, off-topic.

---

## Part C: files generated by the offline AI pipelines (step 2; never hand-edited)
| File | Produced by | Contents |
|---|---|---|
| `generated/enriched_catalogue.json` | Enrichment (text + image) | Per SKU: extracted attributes, each with `value`, `source` (phrase or image), `confidence`, `verified: false` |
| `generated/rails.json` | Rail ranking | Per ad group: 5 SKUs, rank, one-line reason, brand rules applied (pinned, removed and why) |
| `generated/openers.json` | Copy generation | Per ad group: context chip text, agent opening line, 2–3 suggested chips |
| `generated/returns_classified.json` | Return-reason classification | Per SKU and context: reason themes, shares, a typical quote, better-fit SKU |
| `generated/intent_clusters.json` | Chat clustering | Themes with counts, sample wordings, conversion and unmet rates |
| `generated/proposals.json` | Proposal generation | New ad group, remove from rail, feed attribute, pause context; each with evidence, confidence and a ready-to-apply object |
| `generated/attributes_to_confirm.json` | Enrichment | Unverified claims awaiting brand approval |

## Part D: runtime data (created while the app runs)
- **Traces:** per conversation, each tool call (name, arguments, result summary, latency) and each guardrail check (claim check, offer cap, banned phrases), streamed to the AI console
- **Usage:** tokens and cost per conversation (feeds cost per chat)
- **Console state (localStorage):** approved proposals, agent paused, rule changes, login state, coverage
- **Evaluation runs:** `evals/results/v1.json`, `v2.json` with pass rates per category, latency p50 and p95, and failures

---

## Instructions for the coding agent
1. Create every file in Part B with realistic, internally consistent data. Prose in `body_html` and `reasons_raw` should read like real Indian D2C brand copy and customer comments: varied, imperfect, some Hinglish.
2. Respect every planted fact in this brief exactly (SKU roles, delivery dates, counts, return rates, tuned metrics).
3. Never use real brand names, real people or real contact details.
4. Write a `validate-data` script that checks references, planted counts (28 sensitive-ears chats, 18 waterproof-only-in-prose SKUs, every earring one metal throughout, every steel piece `nickel_free: false`), and the planted delivery dates for the demo clock.
5. Keep secrets in environment variables; commit an `.env.example` only.
6. Log prompts and any rejected outputs in `BUILD_LOG.md` as you go.
