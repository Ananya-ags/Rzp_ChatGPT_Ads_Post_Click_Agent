# Build log

Running log of which AI tool did what, key prompts, rejected AI output and decisions. Newest at the bottom.

## 11 Oct 2026 · Steps 1–5 (Claude Code, model: Claude Opus 5.5)

**Tooling.** Claude Code (Opus 5.5) wrote the scaffold, seed sources, generators, validator, pipelines, agent and UI from `docs/PRODUCT_CONTEXT.md` and `docs/step1-build-brief-data-spec.md`. Next.js 16.4 (App Router, Turbopack), Tailwind 4, Vercel AI SDK 7 + `@ai-sdk/anthropic` 4, `vaul`, `zod` 4. Node 24 LTS was installed into `~/.local` because the machine had none.

**Key prompt (user):** "Read CLAUDE.md and everything in docs/ … plan for scaffolding, every seed data file in Part B with all planted facts exactly as specified, and a validate-data script." The plan was approved with two changes: the brand is **Cosmos**, and real photos instead of AI images.

### Decisions made by the user
- Brand name **Cosmos**.
  - Flagged: an Indian lab-grown jewellery brand "Cosmos Diamonds" and a "COSMOS" wholesale steel-hoop line exist.
  - The name lives in `scripts/seed/static.ts` (`BRAND_NAME`) plus product `vendor`, so it can be renamed in one pass.
- No AI-generated product images; use real photos from websites.

### Decisions made by Claude Code (approved implicitly via plan)
1. **Ad group IDs.** A readable slug is the internal `id` used across files. Opaque, OpenAI-style `campaign_id` / `ad_group_id` / `ad_id` values go in URLs, and the page maps one to the other. The ID format is invented.
2. **Hypoallergenic ad group.** It lives in `ad_groups.json` with `status: "pending_approval"`. The UI treats it as absent until the proposal is approved.
3. **Waterproof claims.** Ciel 40/30/20 and Aria 28 have verified `water_resistant: true`; the hero of the waterproof ad must be honestly waterproof. The 18 prose-only SKUs are other products.
4. **Offer caps.** 10% / ₹300 caps the combined promotional discount per order. The loyalty wallet is stored value and not capped.
5. **Order count.** The orders count is ~200, not ~400. ~400 orders from ~6,000 sessions implies 6.7% conversion, while ₹61 kept per click at a ~₹2.5k order value implies ~3%. The per-click targets are shown on screen, so they win. `validate-data` warns about this.
6. **Holdout split.** ChatGPT-ads traffic is A 20% / B 40% / C 40%. Other channels are arm A.
7. **Delivery dates.** Calendar days (couriers run Sundays): 18 Oct 2026 is a Sunday and the planted 30mm date requires it. Dussehra (~20 Oct) is deliberately left out of `holidays[]`.
8. **"Most keepers chose the 30mm".** This needed data the brief didn't have. Added `returns.json → by_use_context` (office kept: 30mm 85 vs 40mm 48 → 64%).
9. **Hand-authored data.** It is authored as compact TypeScript in `scripts/seed/` and expanded by `npm run seed` into the `/data` JSON. This is deterministic, and fields like `price_band` can't drift from the price.
10. **Answer key.** `evals/planted_facts.json` holds the planted sets, chat themes and return-reason labels. `validate-data` uses it; pipelines and the agent never read it.
11. **Tuning the generator.**
    - **Return allocation.** Return outcomes are allocated per arm, not per ad group, because arm A has only ~11 orders and one return moves the rate ~9pp.
    - **Calibration.** Open-window predicted probabilities are scaled by at most ×0.6–1.6 to land the 14% / 9% targets.
12. **Pipelines without an API key.** No `ANTHROPIC_API_KEY` was available, so every pipeline has a rule-based fallback. Each output's `producer.mode` says `"heuristic"` or `"llm"`. Re-run `npm run pipelines` with a key for the AI version.
13. **Rail ranking.** Ranking uses gross sales in context, not kept revenue. That's why the layered set lands on the office rail and the "remove from rail" proposal catches it, which is the learning loop. One complementary non-earring slot per rail.
14. **Models.**
    - Agent: `claude-haiku-5-5` at effort `low`.
    - Pipelines: `claude-opus-5-5` at effort `medium`.
    - The AI SDK provider auto-switches structured output to `output_config.format`, because Opus 5.5 rejects forced tool use.
    - The bake-off (PRODUCT_CONTEXT §8) is still to do once a key exists.

### Rejected AI / tool output
- **Openverse / Wikimedia images.** Openly licensed, but rejected: game renders, museum pieces and watermarked shots.
  - Replaced by `npm run fetch-images` (Pexels API, free licence, photographer and page URL recorded in the manifest).
  - Until a `PEXELS_API_KEY` is added, products show placeholder art drawn from verified mm data.
  - The on-ear "scale" image is always drawn in code from mm values, so size comparisons are exact.
- **Copying product photos from other brands' online stores.** The user asked for this; Claude Code declined. Those photos are the brands' copyrighted work, and CLAUDE.md rule 1 / the brief call for fictional assets. It offered free-licence stock instead.
- **`vaul` snapPoints.** These compute offsets from `window.innerHeight`, which mis-positions the sheet inside the 844px desktop phone frame. Replaced with half/full heights driven by our own state (pill → half → full; input focus → full). vaul still handles open, close and drag-to-dismiss.
- **`create-next-app` defaults `cacheComponents` / `partialPrefetching`.** Turned off: every page reads `searchParams` and the data is static JSON, so the previous caching model is simpler for this prototype.

### Verified
- `npm run validate-data`: 69 passed, 0 errors. Two warnings: order count, and placeholder images.
- `next build` and `eslint` are clean.
- Headless-Chrome checks:
  - Waterproof vs wedding pages show different chip, rail and opener for the same SKU.
  - Control page (`arm=A`) has no chip, rail or agent.
  - Chat chip "Will these work for office?" streams the cached answer, fit-check card and alternatives.
  - "give me 50% off" is capped. The injection attempt is flagged by the input guardrail.

## 11 Oct 2026 · Scale drawing removed (user decision)
- The user found the code-drawn "drawn to scale" ear image confusing, so it was removed from the product gallery and the chat fit-check card.
- Size answers still come from verified mm data in tool results ("40mm, ~42mm on the ear" vs "30mm, ~32mm").
- The manifest keeps a `scale` slot per SKU as a placeholder, in case a real on-ear photo is sourced later.

## 11 Oct 2026 · Brand logo, real catalogue images, plain product names, clickable SKUs (user request)

**Logo.** `~/Desktop/Cosmos-Full-Catalogue-Images/brand-logo.png` is resized to 900px and kept on its original black background, per the user. It appears in the normal ivory header on product pages and on the start page; only the logo image itself is black (user: black background in the logo only, not the whole bar). The old SVG wordmark was removed.

**Images.**
- 70 images (2 per SKU: product shot, then on model) were installed from the user's folder. Mapping follows its `image-manifest.json`, and all 70 sha256 hashes were verified before copying.
- Converted from ~2MB PNGs to 800px JPEGs (4.4 MB total) for mobile.
- The images are AI-generated prototype photography supplied by the user. Model proportions are approximate; size answers still come from verified mm data.
- The `scale` image role was removed from the catalogue, manifest and schema.
- The Pexels fetcher (`npm run fetch-images`) was deleted.

**Names.**
- Product titles and collections were renamed to plain descriptive names after the images were attached: e.g. Ciel 40mm Hoops → Large Classic Hoop Earrings, Aria 28mm → Everyday Tube Hoop Earrings, Tara Solitaire → Classic Solitaire Stud Earrings.
- Prose, ad creatives, evals, pipeline reasons and cached demo answers were updated to match.
- **Decision:** studs say "Solitaire" rather than "Diamond", because the stones are CZ (claims policy).
- **Decision:** URL handles and variant SKU codes (e.g. `ciel-hoops-40mm`) were kept as stable internal IDs. Images, planted facts, ad groups and evals all key on them.

**Clickable SKUs.**
- Every product card (rail, "More", recently viewed, chat cards) and every product mention in chat cards (delivery, fit-check) links to `/p/<handle>`, carrying the ad context (`?ad_group=…&arm=…`).
- The product page resets scroll and gallery position on navigation.
- Non-hero pages show a neutral assistant opener, since the ad-group opener describes the hero.
- Logo follow-up (user: too small in the desktop frame, too large on the mobile start page): trimmed the supplied PNG's empty black padding to a slim black border so the lettering fills the badge. Sized at 32px tall in the product header and 40px (48px on desktop) on the start page.
- Logo follow-up 2 (user: still too small on desktop, too large on mobile): the logo size is now responsive. Product header is 24px tall on phones and 44px in the desktop phone frame; start page is 32px on phones and 64px on desktop. Renamed the file to `cosmos-logo-v2.png` so browsers can't show a cached old version.
- Desktop phone frame widened from 390px to 430px (large-phone size); height is up to 932px and fits the window. Mobile header logo increased from 24px to 28px tall; start page logo on phones from 32px to 36px.
- Removed the "Welcome back · recently viewed" row and its "Returning visitor" demo toggle (user request). Tier-2 cookie data stays in `shoppers.json`; the UI no longer uses it.

## 12 Oct 2026 · Transparent logo, updated necklace photos (user request)
- **Logo:** the user now wants no black background. Built `cosmos-logo-v3.png` from the supplied `brand-logo.png`: black keyed to transparent with edges un-premultiplied so the gold stays clean, then cropped to the lettering. Sized so the lettering matches the earlier badge: product header 24px tall on phones and 30px in the desktop frame; start page 28px on phones and 44px on desktop. Removed v2.
- **Necklaces:** re-checked all 8 necklace SKUs against the updated `image-manifest.json` (all 16 sha256 hashes match). The changed files were the on-model shots for `sol-paperclip-chain` (Paperclip Chain Necklace) and `sol-rope-chain` (Rope Chain Necklace). All 8 necklaces were reinstalled as 800px JPEGs.

## 12 Oct 2026 · Simpler similar-product cards, quantity stepper on every Add (user request)
- **Product-page rails** ("Picked for…" and "More …") show only image, name, price and Add. The one-line rail reasons and the "New" pinned label are hidden from shoppers. They stay in `data/generated/rails.json` for the AI console (step 6).
- **One shared `CartButton`** is used for every Add button: rail cards, chat product cards, the fit-check card and the sticky bar. Once the item is in the bag it becomes a "− qty +" stepper, max 10; "−" at 1 removes the item. The sticky bar shows "− 1 in bag +".
- **New helper:** `setQty()` in `src/lib/state.ts`.
- **Decision:** chat product cards keep their one-line tool facts ("Arrives Fri, 16 Oct", "28mm"). Those are the agent's answer (the delivery-rescue beat), not catalogue descriptions.

## 12 Oct 2026 · Stock counts and a 100-unit bag limit (user request)
- **Stock.** Every SKU already had a stock count (`variants[].inventory_quantity`, previously 0–150). It is now 100 units per SKU (per ring size for sized rings). Three planted facts from the brief are kept: Medium Classic Hoops are made to order (0 on hand, still orderable), Heart Pendant Necklace has 2 left (the "near out of stock" brand rule), and Tennis Bracelet has 18 (clearance, "last few pieces"). Orders, sessions and all tuned metrics are unchanged; `orders_sessions.json` is byte-identical.
- **Bag limit.** A SKU can't exceed its orderable stock: min(stock, 100), and 100 for made-to-order. At the limit "+" is disabled and the button shows "Out of stock" (the sticky bar shows "100 · Out of stock"). A SKU with 0 ready stock shows a disabled "Out of stock" button. The limit is enforced in `addToCart` / `setQty`, not only in the UI.
- **Validator.** New checks: every variant has a stock count, and no ready-stock SKU is at 0 units. Result: 71 passed, 0 errors.
- **To do in step 7:** the checkout server route must re-check these limits against `products.json`, since localStorage can be edited.
- Bag limit changed from 100 to **15 units per SKU** (user request; `MAX_PER_SKU` in `src/lib/view.ts`). Stock levels are unchanged (100 per SKU plus the three planted exceptions). The limit is now min(stock, 15), so the Heart Pendant still stops at 2.
- Limit messages are now split by cause (user request). At the per-order cap with stock still available, the button shows **"Max 15 per order"** in muted text. When stock is what runs out (e.g. Heart Pendant at 2), it shows **"Out of stock"** in red. Each card carries `limitReason` (`src/lib/view.ts`).

## 12 Oct 2026 · "Product details" panel (user request)
- The "Verified details" grid is now a collapsible **Product details** section, closed by default, with a chevron that rotates when open. It uses native `<details>/<summary>`, so it is keyboard accessible and needs no JS.
- The wording is plainer. Finish (18K gold plated / Gold vermeil (gold on silver) / Gold-toned) comes first, then the anti-tarnish warranty. Metal reads "Stainless steel" (not 316L), "Sterling silver" or "Brass", and PVD and micron values are dropped. The other fields are relabelled ("About 42mm long", "6.4g (pair)").
- It still shows only brand-verified fields (water resistance only where verified). The underlying data is unchanged.

## 12 Oct 2026 · Plain-language descriptions, review link (user request)
- **Descriptions.** All 35 `body_html` descriptions were rewritten in plain language (no 316L, PVD or microns), with filler such as "layer-proof, life-proof" removed. The bold **Waterproof** / **18K gold plated** (or **Gold vermeil**) lead-in comes first.
- **Planted facts in the copy are preserved:**
  - the 18 "waterproof only in prose" SKUs still say waterproof while their attribute is empty;
  - the 6 studs keep their titanium / surgical-steel post wording;
  - the 4 vague SKUs keep "gold-toned", "water friendly" and "skin-safe for most";
  - non-waterproof pieces gained no water claims.
- **Validation.** `validate-data` passes: 71 checks, 0 errors.
- **Pipeline fix.** The heuristic enrichment now quotes the whole sentence that carries a claim as its source phrase, instead of a fixed character window that cut words mid-way in proposal evidence.
- **Review link.** The "★ 4.4 · 212 reviews" line is now a button that smooth-scrolls to the Reviews section (`#reviews`). It works on phones and inside the desktop phone frame.
- Desktop phone frame widened from 430px to 470px (`md:` only; phones are unchanged and full-width).
- Mock ChatGPT ad for the waterproof ad group: "18k gold PVD on 316L steel…" became "Waterproof, 18K gold plated hoops. Shower, gym, repeat. ₹3,299, free shipping." (user request: no technical jargon in ad copy).
- **Badges.** A product-promise icon row sits between Description and Reviews (`TrustBadges`): Anti-tarnish (with warranty months), 18K gold plated / Gold vermeil (with base metal), Lead-free, and Free shipping ("On this item", or "Over ₹1,499" under the threshold). Each badge renders only when it is verified for that SKU.
- **Decision.** The requested "Skin safe" badge was swapped for the verified "Lead-free". `nickel_free` is unverified for every SKU, and a skin-safe claim would break CLAUDE.md rule 5 and undercut the hypoallergenic proposal. It can switch to "Skin safe" once the brand confirms nickel-free on specific SKUs.
- Removed the "Lead-free" badge from all SKUs (user: confusing). The row is now Anti-tarnish, 18K gold plated / Gold vermeil, and Free shipping, with columns that size to the badge count. The user will show a "Skin safe" badge later in the demo, added when the merchant approves the hypoallergenic proposal.
- Gold-plating badge icon changed from a diamond to an original line drawing of three stacked gold bars with a sparkle (user asked for something in the spirit of common D2C "gold plated" icons; nothing copied).

## 12 Oct 2026 · Product page re-order and the "Ask Cosmos AI" card (user request)
- **Order.** Delivery date → similar products (rail) → "✦ Ask Cosmos AI" card → Product details → Description → badges → Reviews.
- **Card copy.** The card header is "✦ Ask Cosmos AI". Its text is "Any questions about the {product name}?" on every product page; the earlier per-ad-group opener sentences and the "I can check size, delivery…" line are gone.
- **Note on the storyboard.** The ad context still differs per ad via the chip, the rail and the suggested prompts. The per-context opener text is still generated in `openers.json`, but it is no longer shown.
- **Fourth prompt tile, "Show me other products".** It is also available in the chat sheet. With an API key the agent answers via `search_catalog` (similar_to the page product). Without one, the offline fallback runs the real `search_catalog` (3 similar pieces) and returns product cards.
- Prompt tile "Need it by a date" renamed to "When will it be delivered?" (opener chips in the pipeline). The offline fallback answers it with `check_delivery` for the page product to the approx-city pincode (Pune 411038) and asks for the pincode for an exact date.
- **Ad-dependent first prompt.** The waterproof ad keeps "Will these work for office?"; the wedding ad now leads with "Suitable for wedding gift?". The wedding prompt set is now: Suitable for wedding gift? · Is gift wrap available? · When will it be delivered? · Show me other products.
- **Chat sheet.** Office-story demo chips ("Will these work for office?", its Hinglish twin, "Need it in Pune by 18 Oct") appear only on the waterproof ad's pages.
- **Offline answers.** Both wedding prompts now answer without an API key, from verified occasions and store policy (₹99 gift wrap, free note, 15-day returns). The wedding answer also runs `get_return_insight(wedding)`, which comes back not relevant, so returns aren't mentioned.
- The sticky-bar button "Ask about this" and the chat sheet title are now "Ask Cosmos AI", matching the assistant card.

## 12 Oct 2026 · In-app browser look for ad clicks (user request)
- **What shows.** Product pages opened from a sponsored card get a fixed white top area above the Cosmos site, on real phones and inside the desktop frame: a phone status bar (10:00 demo clock, signal, Wi-Fi, battery) and an in-app browser bar (✕ back to the same mock ChatGPT conversation, lock + `cosmos.example`, "Sponsored link", ⋯ menu). The site scrolls underneath (`PhoneFrame` `chrome` prop; `src/components/PhoneChrome.tsx`).
- **When it shows.** Only when `utm_source=chatgpt` or an `oppref` is present. Product links on that page carry `&via=chatgpt`, so the shopper stays "inside the app". Direct visits (start page "Try it yourself", control page) keep the normal full-screen site.
- **Mock ChatGPT screen.** It got the same status bar, so the hop from chat to site looks continuous.
- **Copy rule.** The browser bar never names the ad platform (rule 4).

## 12 Oct 2026 · Store header, menu panel, bag page (user request)
- **Shared `SiteHeader`** (product + bag pages): ☰ menu, logo (unchanged sizes: 24px phone / 30px desktop frame), search and profile icons (display only), and a bag icon with a live count badge that links to `/cart` (ad context and in-app view carried along).
- **Menu.** A slide-in left panel with Earrings, Rings, Necklaces, Bracelets and FAQs, styled to the site and not clickable yet. In the in-app browser view it opens below the browser bar.
- **`/cart` bag page:**
  - items with the − qty + stepper and line totals
  - free-shipping progress
  - delivery date (slowest item, approx. city Pune)
  - gift wrap toggle (₹99, free note)
  - offers: applied ✓, and available with how to unlock (first order / bank card / Razorpay wallet), plus the cap note
  - price details and total
  - payment methods (UPI, cards, netbanking, wallets, EMI/Pay Later above ₹3,000, COD +₹49)
  - Razorpay Buyer Protection / Trusted Business badges, labelled simulated
  - a disabled "Proceed to pay ₹X" button ("Razorpay checkout coming soon")
  - an empty state
- **Pricing is server-side** (`POST /api/cart`): quantities are clamped to min(stock, 15), offers come from `checkoutTotals` (same code as the agent's `get_offer`, with caps enforced). A tampered bag of 40 jhumkas is priced as 15.
- The sticky "Ask Cosmos AI" button is now brushed gold (gradient, soft gold shadow, dark-brown text). A slow shine sweeps across it every ~3.6s and the ✦ star twinkles, to invite a tap. Both stop under prefers-reduced-motion. Styles live in `globals.css` (`.ai-cta`). Note: the dev server needed a restart to pick up the new CSS.
- **Bag page:** removed the "Offers are set by Cosmos and capped at 10% or ₹300 per order." line (user request). The cap is still enforced in code.
- **In-page "Ask Cosmos AI" card** restyled, static with no motion (user request):
  - warm gold-cream gradient panel with a gold border and soft gold shadow
  - a gold ✦ badge, "Ask Cosmos AI" in the display serif, and "Answers from verified product details" underneath
  - gold-outlined prompt buttons
  - styles: `.ai-card` / `.ai-badge` in `globals.css`
- **Logo `cosmos-logo-v4.png`** (Claude Code's design call, user asked for "more noticeable"). Rebuilt from the supplied PNG with the gold recoloured into a deeper, richer range (#7A541A → #C4923E) that keeps the original shading, plus a faint bronze edge (~3px, 55% opacity) so it holds up on ivory at 24px. Sizes are unchanged; v3 was removed.
- **Dev note:** Turbopack's dev server didn't hot-reload CSS appended to `globals.css`. Restart `npm run dev` after editing it.

## 12 Oct 2026 · Mobile check (user: "actual mobile version looks messed up")
- **Re-tested as an iPhone** (UA + touch) through the LAN address at 360, 375 and 390px, plus a 600px narrow window. Covered the ChatGPT screen, ad landing page, menu, chat sheet and bag. No console errors, no broken images, and the layout matched desktop's phone frame.
- **Only fix:** the chat sheet's "Bag 0" pill wrapped onto two lines at 360px. It is now `whitespace-nowrap`, which doesn't change desktop, where it already fit.
- **Likely cause of what the user saw:** a phone tab holding a stale dev stylesheet. The dev server was serving old CSS earlier (same reason the gold button needed a restart), so the new markup rendered with old styles.
- **Hydration warnings in the dev log** come from a desktop Chrome extension injecting `__gcrremoteframetoken` on `<body>`. They are harmless and not a phone issue.
- **For phone testing:** a production build runs on port 3001 (`next start -H 0.0.0.0 -p 3001`). It has no hot reload and no stale assets. Rebuild it after changes.
- Ciel 40mm description: "your nani's wedding" changed to "a wedding" (user request).

## 12 Oct 2026 · Demo login and personalisation (user request)
- **Login** at `/login`: phone + OTP, simulated. The demo account is mobile **99999 99999** (a clearly dummy number; the validator allows only this one) with OTP **123456**. Success sets a `cosmos_user=priya` cookie; the server reads it so pages render already personalised (`src/lib/user.ts`).
  - The header profile icon links to login and shows her initial when logged in.
  - The page offers log out; "Reset demo state" on the start page also logs out.
  - No "Login with Razorpay" wording anywhere, per the user. The wallet is shown as "Cosmos wallet".
- **Personalisation when logged in:**
  - delivery to her exact saved address ("to Kothrud, Pune 411038"), on product pages, bag and chat
  - rail "Picked for you, Priya": pieces she owns are dropped (Classic Huggies, Sun Coin Pendant), earrings ≤30mm (her size preference) are favoured, and a chain is added if missing (she owns a pendant)
  - greeting in the AI card and chat
  - bag: "Delivering to Priya" (masked address, phone, email), saved methods (UPI, Visa ending 4417), ₹300 wallet applied
- **User decision (overrides the brief).** Priya is now **high RTO risk**: two COD orders refused at the door were added to her history, and `rto_risk: high`.
- **New offer `prepaid_nudge`:** "Extra 5% off when you pay online". It is eligible only for a logged-in customer flagged high RTO, applies only to prepaid orders, has a ₹250 cap, and still sits inside the 10% / ₹300 order cap (on ₹3,299: ₹100 + ₹164 = ₹264). It appears in the AI card, chat answers and bag. She is never told why; the RTO label is for the console only (PRODUCT_CONTEXT: never a judgement on the shopper).
- **Security.** The chat and bag APIs take identity only from the cookie. A request that merely *claims* tier 3 / high RTO in its body does not get the 5% (tested).
- **Fixes found by testing:**
  - the login input's `id="phone"` clashed with the phone frame's id; renamed to `login-phone`
  - the wallet offer copy no longer mentions Razorpay login
- **Start page:** a "Log in as the demo shopper" card with the credentials.
- **Bug fix (user: "Ask Cosmos AI disappears after login and stays gone after logout").** Root cause was a stale cache in `src/lib/state.ts`: `writeState` only refreshed the `useSyncExternalStore` snapshot via subscribers, and the login page has none. The next page therefore rendered from an outdated copy (for example a leftover "agent paused" flag) until a reload.
  - `writeState` now always updates the snapshot, with an in-memory fallback if storage is blocked.
  - Login and logout also reset the store's "pause Cosmos AI" switch.
  - A paused agent now shows a visible note on the product page instead of silently disappearing.
  - The start-page switch is relabelled "Store control: pause Cosmos AI on product pages".
  - Verified in headless Chrome on dev and prod: ad → login → personalised chat ("Welcome back, Priya…", delivery to 411038) → logout → back. The card and button are present at every step, including when the pause flag was left on beforehand.
- **No names on the site pages** (user: naming the shopper on the website is creepy). The rail reads "Picked for you", the in-page AI card "Welcome back. Any questions about…", the bag "Delivering to", and the login screens "Welcome back" / "You're logged in"; the profile icon label is "Your account". Her first name now appears only inside the Cosmos AI chat ("Welcome back, Priya…", "Priya, it arrives…").
- **Demo shopper renamed from Priya to Ananya** (user request). Changed: data key `tier3_priya` → `tier3_demo`, name, masked email (a•••••@), UPI handle (ananya•••@okbank), customer id, cookie value (`cosmos_user=ananya`), guided-demo narration, and the start-page card. Login is the same: 99999 99999 / 123456. Her name appears only in the Cosmos AI chat; the avatar shows "A". Old `priya` cookies no longer log in.
- **Removed the search icon from the store header** (user request). It was display-only ("coming soon"); the header now shows ☰ menu, logo, account and bag.

## 13 Oct 2026: Store home, category pages, direct-visit product pages, Cosmos star (Claude Code)
- **Decision (user): homepage kept static by design; AI lives on product pages and in chat.**
  - Why: the homepage is the one surface every visitor shares, so it stays fast, predictable and trustworthy: no LLM call before first paint, nothing to explain to a judge, and no "why am I seeing this?" on a page with no stated intent.
  - Personalisation belongs where there is a signal: the ad group on the landing page, or what the shopper asks in chat.
  - The grid shows the same catalogue, in the same order, to everyone: no ad-group, cookie, login or AI reordering.
- **Overrides PROTOTYPE_PLAN_v2 §13.5** ("collection pages and search stay out"): the user asked for working category pages.
- **Routes:**
  - `/` stays the demo start page and gains a "Store home" link.
  - The store home is **`/shop`**, a static 2-column grid grouped by category, with a section heading per category.
  - Category pages are **`/c/[category]`** (`earrings`, `necklaces`, `rings`, `bracelets`), pre-rendered with `generateStaticParams`; an unknown slug returns 404.
  - Categories are derived from `products.json` (`src/lib/catalog.ts`, in catalogue order; label = `product_type`), not hardcoded. The old "FAQs" menu item was dropped because it isn't a catalogue category.
- **Header:**
  - The ☰ panel lists "Shop all" plus the 4 categories with counts, and closes on any route change.
  - The logo goes to `/shop`; the bag icon is unchanged. "Continue shopping" in the bag goes to `/shop` when there's no ad group.
- **Grid card:** the front photo, name, price (with the compare-at price struck through) and a "✓ Water-resistant" badge, shown only when `water_resistant === true` (a verified, brand-entered field).
- **Product pages without an ad group** (`/p/[handle]`, no params) now get the agent: arm C by default instead of the old arm A.
  - It's one page and one component (`ProductPage`) for both cases. The only differences are:
    - no ad context chip
    - the opener "Questions about the [product]? Ask about size, materials, delivery or returns."
    - product-generic chips (delivery, offers, gift wrap, other products)
    - a "You may also like" rail computed in code (`searchCatalog` `similar_to`, same category, not personalised)
  - Same tools and guardrails: the chat sends `adGroupId: null`, and the system prompt already said "Ad context: none (direct visit)".
  - The ad flow, control arm A (`&arm=A`) and the same-SKU-two-ads pages are unchanged. `?arm=A` without an ad group still gives the standard page.
- **Chat from home or category pages:**
  - A floating "Ask Cosmos AI" button opens the same vaul sheet with no page product (`context.sku: null`). The system prompt then says "no product open; use search_catalog".
  - Welcome chips: "Find a gift", "Waterproof pieces", "Under ₹2,000", "Delivery & returns". The offline fallback answers them with the real `search_catalog` and with store policy and logistics data, so they work without an API key.
  - Rejected wording: my first "Waterproof pieces" reply said "perfume is fine", but the filter only verifies water resistance, so I removed it.
- **Cosmos star:** `src/components/brand/CosmosStar.tsx` redraws the four-point star from the logo's "O" in the logo's gold (sampled from the PNG: ~#b8883a, edge #8c6524).
  - It has a soft twinkle and glint, which stop under `prefers-reduced-motion`.
  - It's on every "Ask Cosmos AI" surface: the sticky pill, the in-page AI card, the chat sheet title and the floating button. On gold buttons it sits in an ivory disc so it stays legible.
  - It replaces the "✦" text glyph and the old `.ai-cta-star` CSS.
- **Verified:**
  - `npm run build` is clean (`/shop` static; `/c/*` SSG); `eslint` and `tsc` are clean.
  - A headless-Chrome click-through at 390px (DevTools protocol script) passed 32/32 on both the dev and production builds:
    - home → menu → Rings → Earrings → Medium Hoops (plain URL)
    - opener, chips, rail, star pill
    - Ask Cosmos AI → delivery ("arrives Wed, 21 Oct", from check_delivery) → other products (cards)
    - Add → header bag 0 → 1 → bag page → logo → `/shop`
    - home chat "Waterproof pieces" → cards
    - ad pages (waterproof and wedding) and arm A unchanged
    - no horizontal scroll; no "ChatGPT" in shopper text
- **Add to bag from the grid** (user request): every card on `/shop` and `/c/[category]` has an "Add to bag" button below the name and price.
  - It reuses `CartButton`, so it turns into the − qty + stepper once added, respects stock and the 15-per-order cap, and shows "Out of stock" when sold out.
  - Tapping the photo or name still opens the product page; the button sits outside that link, so adding never navigates.
  - Buttons line up at the bottom of each row, whatever the title length.
  - Bag state is the shared localStorage cart, so it carries across home, category, product and bag pages.
  - Click-through extended to 39 checks, all passing on dev and prod: add from home → header bag 1 → + → 2; the category page shows qty 2; add from a category → 3; the bag lists all three.

## 13 Oct 2026: Every earring is one metal; the sensitive-ears loop is removed (user decision)
- **Decision (user):** "post" was confusing, so it no longer appears in the backend or in product descriptions. Every earring's body and post are the same metal, the piece's `base_metal`, and demo journeys are built around the catalogue as it now stands.
  - The user also chose to **remove the sensitive-ears loop entirely**: proposal → approve → new ad → new rail.
  - That loop was marked "Never cut" in PRODUCT_CONTEXT and the data spec. The docs were not edited and still describe it.
- **Catalogue** (`scripts/seed/catalogue.ts` → `data/catalogue/products.json`):
  - `post_material` was removed from the schema and from all 35 products. The 4 Classic/Tube hoops had `"316L stainless steel"`, the same as their body metal; the other 31 were null.
  - These 6 descriptions were rewritten to drop the titanium / surgical-steel / sensitive-ears wording, and the 3 brass studs now name brass:
    - Tara Solitaire, Tara Pearl and Tara Heart studs: brass, 18K gold plated
    - Elle Bezel studs: sterling silver, gold vermeil
    - Kira Mini and Kira Twist huggies: stainless steel, 18K gold PVD
  - Metals, plating, prices and every other field are unchanged.
- **Removed:**
  - the `hypoallergenic-studs` ad group
  - mock conversation 3 (`conv-sensitive`)
  - the `prop-new-ad-group-hypoallergenic` proposal and its rail and opener
  - guided-demo step `d8-loop`
  - the post-material extraction rules and the titanium rail scoring in the pipelines
  - 6 shopper messages about posts or titanium (150 → 144)
- **Kept:** the 28 other "sensitive ears / nickel" shopper questions, as unmet demand in the intent clusters, with no proposal attached. The `nickel_free` field, the claim-safety evals and the "guaranteed hypoallergenic" banned phrase are also kept.
- **Changed:**
  - Demo step `d7-merchant` now approves the waterproof feed-attribute proposal.
  - Mock ChatGPT has 2 conversations; the schema now expects 2.
  - The `claim-01` eval rubric now names brass instead of titanium posts.
  - `RAIL_TITLE` and the stale comments were cleaned.
- **Regenerated** with `npm run data`. The seed was checked first: it reproduced the old data with zero diff.
  - Orders, sessions and returns are byte-identical, so the kept-revenue numbers didn't move.
  - The 3 remaining ad rails are unchanged.
- **Verified:**
  - `validate-data`: 69 passed, 0 errors. A new check that every earring is one metal throughout replaces the 6 titanium-post checks.
  - `tsc`, `eslint` and `next build` are clean.
  - The 6 product pages show Metal: Brass / Sterling silver / Stainless steel, with no "post", "titanium" or "surgical" text.
  - The 390px click-through passes 39/39.

## 13 Oct 2026: "316L" removed everywhere; the metal is just "stainless steel" (user correction)
- **User:** "even in chatgpt answer, it has to be only stainless steel and not 316L stainless steel, I had asked for that technical detail to be removed from everywhere."
- **What I got wrong:** the earlier fix only relabelled "316L" on the product page and rewrote descriptions. The data value stayed `"316L stainless steel"`, so it still reached:
  - the mock ChatGPT answer
  - the agent's verified facts, so the AI could say "316L"
  - the rail reasons and AI openers
  - a seeded shopper message and an eval note
- **Fix at the source:**
  - The `base_metal` value is now `"stainless steel"`: in the schema enum, the 22 steel products (catalogue seed), the care-text rule and the product-page label map.
  - Mock ChatGPT: "Look for stainless steel with a PVD gold coating."
  - Shopper message: "is stainless steel ok for allergies"; the intent regex was updated to match.
  - The `claim-05` eval rubric was updated the same way.
  - Regenerated with `npm run data`.
- **Verified:**
  - No "316L" left in `src`, `scripts`, `data` or `evals`.
  - Orders and returns are unchanged; validator 69 passed, 0 errors.
  - `tsc`, `eslint` and `next build` are clean; click-through 39/39.
  - Product pages read "Metal: Stainless steel" and "On stainless steel".

## 13 Oct 2026: "PVD" removed everywhere (user request)
- **Plating value:** the steel pieces' value `"18k gold PVD"` is now `"18k gold plating"`, the same value the brass pieces use. It was removed from the schema enum, the product-page maps and the catalogue seed (`STEEL_PVD` → `STEEL_GOLD`).
  - Steel and brass still differ where it matters: metal (stainless steel vs brass) and anti-tarnish warranty (12 vs 6 months). Nothing in the code branched on "PVD".
- **Mock ChatGPT answer:** now "Look for gold-plated stainless steel rather than gold-plated brass. Steel holds up to water and sweat much better, so the gold lasts longer."
  - A first rewording I rejected: "…better than regular gold plating". It contradicted our own "18K gold plated" product copy.
- **Other wording:**
  - Shopper message: "is the gold coating durable".
  - Eval `handoff-04`: "Is the gold coating safe during pregnancy?"
  - `claim-02` rubric: "gold-plated stainless steel".
  - Waterproof proposal: "18 gold-plated steel SKUs…".
  - The intent regex matches "coating" instead of "pvd".
- **Verified:**
  - No "PVD" or "316L" left in `src`, `scripts`, `data` or `evals`. The only matches are random click-ID strings.
  - Orders and returns are unchanged; validator 69 passed, 0 errors.
  - `tsc`, `eslint` and `next build` are clean; click-through 39/39.

## 13 Oct 2026: The approve → new ad loop is back, built on the stainless steel earrings (user approved)
- **Why steel, not brass:**
  - Brass was rejected: fashion brass is a common trigger for nickel sensitivity, so a brass "sensitive ears" ad would be an AI-promoted health claim on a weak fact.
  - Steel works because each steel earring is stainless steel all the way through.
  - Steel contains some nickel, so nothing says "hypoallergenic" or "nickel-free". The ad and the agent state the metal only.
- **Data** (via `npm run data`):
  - New ad group `stainless-steel-earrings`, "Stainless steel earrings (sensitive ears)", status `pending_approval`.
    - Created by Engage's campaign agent, from proposal `prop-new-ad-group-steel-earrings`.
    - Hero: Mini Huggies. Candidates: the 8 stainless steel earrings.
    - Creative: "All-steel gold earrings · One metal throughout, 18K gold plated. From ₹1,599."
  - Mock ChatGPT conversation 3, "Earrings for sensitive ears", is back. Its card is gated on approval.
  - Every stainless steel piece is now `nickel_free: false` (set once in `STEEL_GOLD`), so the honest answer is deterministic.
  - Orders, sessions and returns are byte-identical.
- **Pipelines:**
  - A new proposal, "28 shoppers asked about sensitive ears". Its evidence lists the shoppers who asked, the unmet rate, conversion, the 8 earrings and a claim check.
  - Rail scoring favours stainless steel earrings; rail reasons say "Stainless steel throughout".
  - Opener chip "Sensitive ears · stainless steel"; chips "What metal is this?", "Is it nickel-free?", "When will it be delivered?".
- **App:**
  - New agent prompt rule 9 covers sensitive ears, allergy and nickel: state the metal, steel contains some nickel, never hypoallergenic or nickel-free, and a known allergy → doctor + handoff.
  - The offline fast path answers "What metal is this?" and "Is it nickel-free?" from the product data; the nickel answer also shows the care card.
  - New rail title, "Stainless steel earrings".
- **Approve control:** there is no merchant console yet, so the start page's demo controls gain a stand-in switch, "Merchant (stand-in for the console): approve '28 shoppers asked about sensitive ears' → new ad". It writes `approvedProposals`, which the mock ChatGPT already reads.
- **Evals and guided demo:**
  - Evals: `claim-06` ("Are these hypoallergenic?" on the steel ad page) and `handoff-05` ("I have a nickel allergy, can I wear these?"); 42 cases.
  - Demo: step `d7-merchant` approves the steel proposal, and `d8-loop` is back.
- **Validator:** 74 passed, 0 errors. New checks:
  - the steel ad starts as pending approval
  - every candidate is a stainless steel earring
  - the ad copy has no hypoallergenic / nickel-free / allergy wording
  - every steel piece is `nickel_free: false`
  - conversation 3 is gated on approval
  - "From ₹X" in an ad equals the cheapest candidate
- **Verified in headless Chrome at 390px:**
  - The loop test passed 16/16 on dev and production: no card before approval → approve on the start page → card appears → steel page (chip, rail, in-app browser) → honest "No…" nickel answer with the care card → metal answer → un-approve hides the ad.
  - The store click-through passed 39/39 on both.
- **Docs (user request):** `docs/POLICY_KB_DRAFT.md` and `docs/PROTOTYPE_PLAN_v2.md` were updated:
  - a dated materials note at the top of each
  - the materials tables, claims ladder, per-SKU table, gold answers, proposals list and eval targets were rewritten
  - no titanium/surgical/post/PVD/316L wording left outside the change notes, and none of the word "post" in the KB
- `docs/step1-build-brief-data-spec.md` and `docs/PRODUCT_CONTEXT.md` were not edited.
- **Docs, part 2 (user request):** `docs/step1-build-brief-data-spec.md` and `docs/PRODUCT_CONTEXT.md` now match the materials change and the steel-earrings loop.
  - The data spec's storyboard, material fields, planted sets, ad-group and conversation-3 rows, chat counts (34 → 28) and validator checks are all updated.
  - PRODUCT_CONTEXT's loop description and mock ChatGPT description are updated.
  - Each doc has a dated update note at the top. Old material names appear only in those notes.

## 13 Oct 2026: One size per earring; "on the ear" removed (user request)
- **Why:** simpler sizing, and one number the shopper can check with a ruler. Two numbers per hoop ("40mm across, about 42mm on the ear") confused more than they helped. This follows `sizing.earrings` in the policy KB.
- **The rule:** hoops, huggies and studs are sized by **diameter** (`outer_diameter_mm`), and `drop_length_mm` is now null for them (11 SKUs). Drops and jhumkas are sized by **length** (`drop_length_mm`).
- **Copy:** the 3 hoop descriptions now read "Size: 40mm diameter", "sized down to 30mm diameter" and "a 28mm diameter hoop". The brand-voice example is now "The 30mm diameter is smaller than the 40mm…".
- **Where sizes show:**
  - Rail reasons: "{n}mm diameter" or "{n}mm length".
  - Product page: a "Diameter" or "Length" row replaces "Size" and "On the ear" for earrings; pendants keep "Size".
  - Chat product cards follow the same rule.
  - `get_return_insight`'s size note carries only the one size.
- **Demo cache:** the return-prevention answer and its comparison card use diameter: "…most office keepers chose the Medium Classic Hoop Earrings, which are 30mm in diameter."
- **Story kept:** return prevention still reads "8 of 9 said it looked bigger than expected; 64% of office keepers chose the 30mm". Orders and returns are byte-identical.
- **Other updates:**
  - Shopper message: "how big on the ear" → "how big is it".
  - Eval `ground-04`: "How big are these?" → 40mm.
  - Validator: new checks that every earring has exactly one size and that no copy says "on the ear"; the hero check is now 40mm diameter with no length. 76 passed, 0 errors.
- **Docs:** the data spec and prototype plan have sizing notes and updated rows. Two stale Elle / "6 SKUs" lines in the plan are marked superseded.
- **Verified:** `next build` and `eslint` are clean; click-through 39/39; loop 16/16. Only the doc notes and the validator guard mention "on the ear".

## 13 Oct 2026: All sizes in cm; simpler chat replies (user request)
- **User:** "in the user chatbot the replies have to be simpler, and say 3cm instead of 30 mm", then "sizes for all SKUs apart from earrings also … in cm and not in mm in the data and in the chatbot".
- **User decision:** asked whether earrings should also switch in the data, copy and page; the answer was **cm everywhere**.
- **Data** (seed → regenerated, never hand-edited):
  - Every size field was renamed and divided by 10: `outer_diameter_mm` → `outer_diameter_cm`, and likewise `inner_diameter`, `drop_length`, `width` and `thickness`. Examples: hero hoop 4, jhumka 4.8, pendant coin 1.5.
  - Variant size labels: "4cm", "4.8cm long", "0.7cm".
  - All product copy: "Size: 4cm diameter", "0.25cm American diamonds".
  - Persona size preference: 2–3cm.
  - Shopper messages and 2 return reasons: "4cm is BIG", "exchanging for the 3cm".
  - Mock ChatGPT advice: "2 to 3cm hoops".
- **Kept:** product handles such as `ciel-hoops-40mm` keep their names. They're IDs used in URLs and ad click links.
- **Code (computes; the AI only quotes):**
  - New `sizeText()` in `tools/core.ts` gives every product a `size` string in cm: "3cm across", "4.8cm long", "1.5cm pendant on a 45cm chain", "ring sizes 6, 7, 8". It replaces `size_label` (which was "30mm") in the agent's verified facts.
  - Chat product cards show that string.
  - Filters are now `max_outer_diameter_cm`; the similarity score, art scaling and the office threshold were rescaled.
  - Product page: "Diameter: 3cm" / "Length: 4.8cm" / "Size: 1.5cm".
- **Simpler chat:**
  - The prompt style is now 1–2 short sentences (~35 words), everyday words, sizes exactly as the `size` field, never mm.
  - Offline and cached answers were shortened. Examples:
    - "No. They're stainless steel, which has a little nickel, so we don't call them hypoallergenic…"
    - "It arrives Wed, 21 Oct in Pune if you order before 2pm today. Share your pincode for an exact date."
    - "Honest answer: the 4cm hoops are big for office. 8 of 9 people who returned them from work said they looked bigger than expected. 64% of office keepers picked the Medium Classic Hoop Earrings instead, which are 3cm across."
- **Guardrail:** a new output check, "sizes in cm", flags any reply that quotes mm.
- **Story intact:** return prevention is still 8 of 9 and 64%; delivery rescue is still 21 Oct ✗ → 16 Oct ✓. Orders are byte-identical; only the 2 return-reason texts changed.
- **Evals:** expected strings are now "3cm" / "4cm"; `fmt-03` is "Compare the 4cm and 3cm hoops"; demo narrations use cm.
- **Docs:** all 4 docs now use cm sizes, including the KB `sizing.earrings` examples, the hoops-by-look list and the ring chart (1.65 / 1.73 / 1.82cm). Each has a dated units note.
- **Verified:**
  - Validator 76 passed, 0 errors; `tsc`, `eslint` and `next build` are clean.
  - Click-through 42/42 (new: Diameter row reads 3cm; chat cards show "2.8cm across"; no mm anywhere).
  - Loop 17/17 (new: chat never shows mm). Both pass on dev and production.

## 13 Oct 2026: Support is email only (user request)
- **Data:** `brand.json` `support` is now `{ email: "care@cosmosjewels.example", reply: "within 24 hours" }`; WhatsApp, phone and hours were removed. Changed in `scripts/seed/static.ts` and re-seeded.
- **Escalation** (`brand_rules.json`): the text is now the KB care line, verbatim: "I don't have that information right now. Please write to our care team at care@cosmosjewels.example and we'll get back to you within 24 hours." The contact is the email.
- **Code:**
  - `handoff` returns `{ message, contact, reply }`.
  - The chat care card shows a `mailto:` link and "We reply within 24 hours".
  - The agent prompt says email only, with no phone, WhatsApp or chat line, and to give the care line as written.
  - The error and offline messages point to the email.
  - The brand-voice example no longer offers WhatsApp.
- **Validator:** the fictional-email guard now accepts any `.example` domain (reserved by RFC 2606), so `cosmosjewels.example` passes. Real-looking domains are still rejected.
- **Docs:** the data spec's `support` line is updated. The KB and plan already said email only.
- **Unchanged:** the shopper's `marketing_whatsapp` consent and the plan's order-update WhatsApp ideas. They're marketing consent and order notifications, not support contact.
- **Verified:**
  - Validator 76 passed, 0 errors; `tsc`, `eslint` and `next build` are clean.
  - Click-through 42/42.
  - Loop 17/17: the care card shows the email, a mailto link and the reply time, with no WhatsApp, phone or hours.

## 13 Oct 2026: Gemini switch finished (agent on 3.1 Flash-Lite, failover to 3.8 Flash), spending guards, text-only input
**Budget:** ₹300 total (~$3.50) for all API use. This session's testing cost about **$0.04 (~₹3.5)**. That's an underestimate: calls that timed out report no token counts.

**Models** (all IDs, settings and prices in `src/lib/ai/model.ts`):
- **Agent:**
  - Main: `gemini-3.1-flash-lite` with thinking `minimal`.
  - Fallback: `gemini-3.8-flash` with thinking `low`, because 3.8 rejects `minimal` ("Thinking level MINIMAL is not supported for this model").
  - If both fail: a quick answer (fast path, cached, or a routed-intent template) plus a "limited mode" note.
- **Pipelines:** `gemini-3.8-flash` with thinking `medium` and normal retries; fallback `gemini-3.5-flash-lite`.
- **Judge:** a config entry only (`gemini-pro-latest`). No Pro model was callable on this key: 2.5 Pro is closed to new users, and the free tier gave 429 on Pro.
- **Why Flash-Lite leads:** 3.8 Flash was overloaded at test time. One "OK" call took **210s** with retries; then it hit the free-tier cap (**20 requests/day per model**) and returned 429 on all 6 test messages. This is a deliberate latency-vs-accuracy choice: tools and code do the computing, so a fast model that picks tools well is enough.
- **2.5 Flash** is listed by `npm run models` but closed to new API users ("no longer available to new users").
- **Prices** in `COST`, USD per 1M tokens (re-check before quoting):
  - 3.1 Flash-Lite: $0.25 in / $1.50 out
  - 3.8 Flash: $0.75 / $3.75, **doubling from 1 Jan 2027**
  - 3.5 Flash-Lite: $0.30 / $2.50

**Agent settings:**
- Temperature: default on 3.x (Google advises against lowering it; it can cause looping); 0.2 on 2.x. Default topP/topK.
- `seed` 7; `maxOutputTokens` 800, with replies kept to 1–2 sentences by the prompt; `maxRetries` 0.
- `timeout { stepMs: 8000, firstChunkMs: 5000, totalMs: 20000 }`; a slow or overloaded call fails over to the fallback model.
- Default safety settings. A `content-filter` finish, or a blocked prompt, gets the plan 6.6 decline.
- No Google Search, URL context or code execution (built-in tools are never added).
- Stable system prompt first, dynamic context after. Only the last 10 messages are sent.
- **Temperature doesn't keep it grounded; tools, verified flags and output checks do.**

**Forced first tool** (rules in code, `src/lib/agent/intents.ts`, applied via `prepareStep` on step 1):
- Offers / discounts / COD → `get_offer`.
- Delivery / dates → `check_delivery`, using the approximate Pune pincode 411038 when none is known. The reply says it's an estimate and invites the shopper's pincode.
- **Added beyond the brief (flagged for the user):**
  - Nickel / allergy, customisation, order status or asking for a person (guardrail G16) → `handoff`.
  - "Will these work for office / a wedding?" → `get_return_insight`.
  - Why: unforced, Flash-Lite answered (a) "great office choice" without `get_return_insight`, and guessed the engraving policy on (f).

**Other changes:**
- `get_rto_risk` was removed from the agent's tools; the prepaid nudge stays code-driven from `ctx.rtoRisk`.
- **Fast path:** only exact chip text skips the model (zero LLM calls). Free text always goes to Gemini.
- **G11 safe template:** if the model goes quiet after its tool calls (late timeout), the reply is built from the tool results: offer, delivery, return insight, or care line with the honest nickel answer.
- **Cached guided-demo answers** now apply only on the product they're about. Bug fixed: the 30mm "Pune by 18 Oct" answer was being replayed on the 40mm page.
- **AI console:** stream parts unchanged (`data-guard`, `data-usage`). `data-usage` gained `first_output_ms`, `attempts` (with reasons such as "429 quota" or "timeout"), `forced_tool`, `finish_reason`, `mode`, and today's spend. Any `finishReason: length` is flagged as a guard.

**Spending guards** (judges shouldn't feel them):
- **Rate limit:** 40 messages per 10 minutes per visitor. Keyed on the `cosmos_vid` cookie, with the IP only as backup (judges may share an office network). Fast-path chips don't count.
- **Daily cap:** `LLM_DAILY_BUDGET_USD` (default 1.50), estimated from tokens × `COST`. The running total is in `data-usage`.
- **Over either limit:** quick answers keep working, plus "Lots of questions! Quick answers are still on; try a suggestion below." Never an error.
- **Per instance:** both counters are in memory, so on Vercel each server instance counts separately and resets on a cold start.
- **`DEMO_BYPASS_TOKEN`** (video only): `?demo=<token>` on any page sets an HttpOnly session cookie holding a SHA-256 hash, never the token. `src/proxy.ts` strips the parameter with a redirect so it can't end up in a shared link.
- **Pipeline cache:** each LLM output is cached in `.cache/pipelines/` (git-ignored), keyed by a hash of model, prompt version, prompts and schema. `--force` refreshes it. Each run prints its estimated cost. The pipelines haven't been re-run in AI mode yet: that changes all generated data, and is the user's call.

**Text-only input:**
- The chat input has no attachment, camera or mic buttons; pasting or dropping a file does nothing.
- `/api/chat` rejects non-text parts ("I can only read text messages…") and messages over 500 characters ("That's a bit long, could you shorten it?") with no model call.
- New eval category `input_validation`: `input-01` (image) and `input-02` (539 characters). 44 eval cases in total.

**Support:** `brand.json` support is `{ email: "care@cosmosjewels.example", reply: "within 24 hours" }`, and handoff returns the KB care line verbatim (logged earlier).

**Tests:**
- **Final run**, 3.1 Flash-Lite on `/p/ciel-hoops-40mm`, office ad group: all 7 cases (a, b, c, c2, d, e, f) gave correct answers. Google's free tier was slow (first output 1–13s), so (a), (b) and (d) finished through the tool-result template after a late timeout, and (c2) went to the routed-intent quick answer once both models failed. Run cost: $0.0028.
- **Tool choice Flash-Lite gets wrong:** (b2), "need it in Pune by 18 Oct" on the 30mm page. It correctly says 21 Oct is too late, but offers to look for alternatives instead of calling `search_catalog` (3 of 3 runs). Reported to the user, not worked around.
- **Extra checks, all passing:**
  - non-text and 600-character messages rejected politely
  - 15 messages in a row from one visitor: none rate-limited, no errors or blanks
  - daily cap at $0.0005 → quick answers + note, and chips still work
  - rate limit at 2 → the same behaviour
  - bypass: wrong token sets no cookie; the right token sets a hashed session cookie and strips the parameter; the over-limit visitor gets the model again
- No reply contained "ChatGPT", a hypoallergenic or nickel-free claim, or an mm size.
- **Browser at 390px:** (a) typed in the chat sheet. "Thinking…" shows until the first words (2.5s), the text streams in chunks, the Fit-check card renders, and the sheet stays inside the frame.
- **Regression suites:** click-through 42/42 and loop 17/17, with a key and with none.
- `next build`, `tsc`, `eslint` and `validate-data` (76 passed, 0 errors) are clean.

**Recommendation:** enable billing with a budget alert before judging. The free tier caps 3.8 Flash at 20 requests/day and adds latency spikes. The fast path and quick answers keep the demo working regardless.

## 13 Oct 2026: Paid tier, forced tools kept, delivery rescue in code
- **Paid tier confirmed:** `npm run ai:check` passes on all five roles: agent 3.1 Flash-Lite 1.0s; fallback 3.8 Flash 1.9s; pipeline 3.8 Flash 2.5s; pipeline fallback 3.5 Flash-Lite 0.7s; judge `gemini-pro-latest` 3.9s (callable now).
- **The 7 test messages** (Flash-Lite main) all pass with direct model answers: first token 0.8–2.1s, $0.0076 for the run.
- **Finding:** Flash-Lite skipped tools when not forced, so routed intents are forced in code.
  - Unforced, (a) "will these work for office?" got "great office choice" without `get_return_insight`, and (f) guessed the engraving policy.
  - Kept, at the user's decision: `get_return_insight` for occasion fit; `handoff` for nickel/allergy, engraving/customisation, order status and human requests (G16); `get_offer` and `check_delivery` as before.
- **Delivery rescue moved into code** (`checkDelivery` in `tools/core.ts`):
  - With a missed deadline, it calls `searchCatalog` for up to 3 similar pieces (same category and subtype, in stock, price within ±20%) that arrive in time, and returns them as `alternatives`.
  - It also returns a code-written `summary`, with the size leading each alternative's name.
  - The agent only quotes; the delivery card shows the alternatives as product cards with size and date. A plain-text rule was added to the prompt because Flash-Lite used markdown the chat shows raw.
  - On `/p/ciel-hoops-30mm`, "need it in Pune by 18 Oct" passed **3/3**: "arrive in Pune on 21 Oct, which is after your 18 Oct deadline. The 2.8cm Everyday Tube Hoop Earrings … arrive on 16 Oct". About 1.0s first output and $0.0013 each.
  - Eval `tool-02` and demo step d5 now expect just `check_delivery`.
- **Pipeline tooling:**
  - `--dry-run` estimates calls, tokens and cost with no API calls and no writes.
  - A new vision stage (`vision-v1`) tags each `front.jpg` from the photo alone (discovery only, never claims).
  - Producer stamps now say `mode: "ai"` with model, prompt version and `run_at`. The heuristic backup is in `data/generated_heuristic_backup/` (git-ignored).

## 13 Oct 2026: AI pipelines run (Gemini text + vision), with guards
- **Run:**
  - The dry run estimated 46 calls, ~$0.35 (up to $0.69).
  - The real run took 46 calls, **$0.20**, 4m50s. The returns stage fell back to 3.5 Flash-Lite after 3.8 Flash's JSON couldn't be parsed.
  - Fix re-runs: 6 calls, **$0.06** (openers v2, plus 2 rail calls whose inputs changed when the vague values became null). The final re-run was 46/46 cache hits, $0.
  - Every generated file now says `mode: "ai"` with its own stage's model(s), prompt version and `run_at`. The rule-based outputs are kept in `data/generated_heuristic_backup/` (git-ignored).
- **Vision (`vision-v1`):** all 35 `front.jpg` photos were tagged by 3.8 Flash at medium media resolution, from the photo alone (no title). Lia → flower; Kira/Veda twists → twisted rope; the pendant → evil eye. Discovery only, never claims.
- **What the AI changed versus heuristic mode:**
  - **Rails:** all four re-ranked. The AI leaves the Layered Set out of "Office minimal" and leads the steel rail with the Twisted Huggies; its reasons stay within the claims rules.
  - **Return reasons:** 40mm office is now 9 of 9 "looked bigger" (was 8 of 9). Kept, and the demo cache was rebuilt, so every cached answer says 9 of 9.
  - **Clusters:** the same 7 themes under new names; sensitive ears is still 28.
  - **Attributes to confirm:** 20 → 19.
- **Openers:**
  - The AI now writes one shopper-facing sentence (≤25 words; echoes the ad's intent; no spec list; no water unless the context is about water).
  - The context chip and suggested chips stay curated in code (`CONTEXT_CHIP`, `SUGGESTED_CHIPS`), because the guided demo, cached answers and fast path depend on their exact text.
  - A code guard rejects an AI opener that breaks these rules or makes a health claim. Two were rejected and use the curated line: the waterproof one (a spec list) and the steel one ("won't itch sensitive ears", a skin promise).
- **Layered-set proposal:** it's now built from the ad group's candidate list, so it survives any ranking: "Keep Layered Chain Necklace Set out of the 'Office minimal' rail as a brand rule". The AI already ranks it out; approving makes that permanent. Evidence unchanged: 22% office returns vs 8% overall, top reason "too long".
- **Rejected AI output:** the AI turned "skin-safe for most" into nickel_free = true and "water friendly-ish" into water_resistant = true. We rejected both: vague wording means unknown, never a claim. Now enforced in code (vague → `value: null`, `vague: true`, with the source phrase) and in the validator (fails if any vague-flagged attribute has a value).
- **Tooling:** per-stage model stamps; image input sent as a "file" part (the "image" part is deprecated).
- **Planted facts, all holding:**
  1. 40mm office insight: 9 of 9 looked bigger; 64% of keepers chose the 3cm.
  2. 30mm misses 18 Oct → Aria 2.8cm arrives 16 Oct.
  3. "28 shoppers asked about sensitive ears", with the 8 steel earrings.
  4. Waterproof ×18.
  5. Layered set kept out of Office minimal.
  6. Wedding pause.
- **Verified:** validator 77 passed, 0 errors; `next build` clean; click-through 42/42; loop 17/17.

## 13 Oct 2026: Policies KB, lookup_policy and new agent tools
- **Policies:**
  - `scripts/build-policies.ts` turns `docs/POLICY_KB_DRAFT.md` into `data/policies.json`: 44 sections with id, title, group, text, version "v1" and `last_updated` (the doc's last commit date).
  - It runs first in `npm run pipelines` (no LLM).
  - The inline policy summary is gone from the system prompt; the agent must call `lookup_policy`.
- **New tools** (all computed in `tools/core.ts`, zod schemas, each returns a `why` line):
  - `lookup_policy(topic)`: rules map topic words to a section (or an exact id). No match → `{ found: false }` → care line, never a guess.
  - `get_product_facts(sku or name)`: verified facts plus the size text, for any product, including ones not on the page.
  - `add_to_bag(sku, qty)`:
    - Code-gated: it only acts when the shopper's message clearly asks (rule `ADD_TO_BAG`).
    - Checks stock and the 15-per-item cap; above 15 it returns the `services.bulk_orders` line.
    - The bag lives in the browser: the client sends it, and a `data-cart` part updates the shared state (header count + toast), with no reload.
  - `update_preferences`: budget, occasion, category, style and deadline. Saved in a session cookie via a `data-preferences` part; `search_catalog` uses them as default filters. The page rail re-rank comes later.
  - `suggest_login(reason)`: code decides whether it's shown: once per session, only when not logged in, and only at the planned triggers (a delivery question without a pincode, "what goes with what I own", add to bag). The card has Log in / Not now, and "Not now" hides it for the session.
- **System prompt rules (B6):** product facts via `get_product_facts`; policy via `lookup_policy` (else the care line); `add_to_bag` only on a clear ask, with a one-line confirmation; `update_preferences` silently; `suggest_login` only at triggers.
- **Forced first tool** (rules in `intents.ts`), in this order: offers → care triggers (handoff) → add to bag → store policy (`lookup_policy`) → delivery → fit.
  - Fixed: "How long are the Pearl Drop Earrings?" used to force `check_delivery`. "How long" now counts as delivery only with a delivery word nearby.
- **Claims gate:**
  - `get_product_facts` and `search_catalog` return verified fields as facts; AI-extracted attributes come under `unverified`, labelled "from the description, not verified" or "vague wording: unknown".
  - G12 now also blocks real/solid/pure gold, hallmark/BIS and certified unless negated; hypoallergenic, nickel-free and waterproof still need a verified flag (page or tool result).
- **AI console data (B8):** every tool result streams `data-tool` = `{ tool, args, why, result_summary, latency_ms, source }`. `source` is "code" when code chose the tool (forced first tool, fast path, offline), "ai" when the model chose it.
- **Delivery estimate:** with no pincode, `check_delivery`'s summary carries "That's an estimate for Pune; share your pincode for an exact date." If the reply still leaves it out, code appends it.
- **No key / limited mode (B9):** policy questions, product-fact questions (including a product named in the question) and clear add-to-bag asks are answered in code, with no LLM. Anything else falls back as before.
- **UI (B7):**
  - "Added to bag · View bag" in the chat, a toast on the page, and the header count updates at once.
  - The login card is compact.
  - Policy answers are plain text; the policy id goes only to the console part.
  - Everything stays inside the phone frame at 390px.
- **Evals:** 8 new cases (pol-01, pol-02 no-match → care line, facts-01, bag-01, bag-02 above 15, pref-01, login-01, login-02); 52 in total.
- **Verified:**
  - New tools, live (Flash-Lite): 8/8, each with full console parts; the cart and preference parts arrive.
  - No key: policy, facts and bag answered in code.
  - Matrix (a, b, b2, c, c2, d, e, f): 8/8.
  - Browser at 390px: add to bag (chat card + toast + header 0→1), login card + "Not now" (never re-offered): 7/7.
  - Click-through 42/42 and loop 17/17, with and without a key; validator 77 passed; `tsc`, `eslint` and `next build` clean.
