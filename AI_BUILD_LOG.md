# AI Build Log · ChatGPT Ads Post-Click Agent 

**ISB × Razorpay AI PM Build Challenge · Track 2: Recover & Grow with AI**
Ananya Agarwal · PGP 2027 · submitted 13 Oct 2026

- Live prototype: https://rzp-build-cosmos.vercel.app
- Code: https://github.com/Ananya-ags/Rzp_build_cosmos
- Day-by-day engineering log (every change, test and rejected output): earlier versions of this file, in its [git history](https://github.com/Ananya-ags/Rzp_build_cosmos/commits/main/BUILD_LOG.md)
- Eval reports: [`docs/EVALS.md`](https://github.com/Ananya-ags/Rzp_build_cosmos/blob/main/docs/EVALS.md) (v1 → v2) and [`docs/EVALS-LATEST.md`](https://github.com/Ananya-ags/Rzp_build_cosmos/blob/main/docs/EVALS-LATEST.md) (latest run, failures included)

**What it is, in one line:** when a shopper clicks a ChatGPT sponsored ad, Razorpay Engage lands them on a page tailored to that ad's context, with a grounded shopping agent, Magic Checkout-style checkout and a merchant loop that turns what shoppers asked into new ads the merchant approves. Cosmos is a fictional jewellery brand; all shopper, order and ad data is simulated.

---

## 1. AI tools and models used

| Tool / model | What I used it for |
|---|---|
| **Claude Opus 5.5** (Claude chat, inside a Claude Project) | Research and thinking partner: Razorpay product mapping, idea generation and devil's-advocate reviews, market evidence, competitor and overlap checks, the data spec, the policy knowledge base, the prototype plan (v1 → v2), eval design, the one-pager and video script. |
| **Claude Code (Claude Opus 5.5)** | Main coding agent: scaffold, seed data, offline AI pipelines, the agent and its tools, guardrails, checkout with Razorpay Test Mode, the AI console, the merchant console, the eval runner and most browser tests. |
| **OpenAI Codex** | Fallback coding agent when my Claude token limits ran out. Mainly used for the chat front-end repairs (sheet inside the phone frame, snap points, session persistence, focus handling) and its browser regression suite. |
| **GitHub Copilot** | Improving evals: full eval runs, fixing failed eval cases (e.g. the unverified "safe with water" reassurance), eval report generation, plus late QA and bug-fix passes. |
| **ChatGPT (image generation)** | All 70 product images (a product shot and an on-model shot for each of 35 SKUs) for the fictional brand. Disclosed in the app and the repo. |
| **Google Gemini API** (inside the product) | The shopper agent, the offline AI pipelines and the eval judge (details below). |

### Gemini inside the product

| Role | Model | Settings | Why |
|---|---|---|---|
| Shopper agent (main) | `gemini-3.1-flash-lite` | thinking `minimal`, seed 7, max retries 0, 8s step / 20s total timeout | Fast first token (≈0.8–2s). Tools and code do the computing, so a fast model that picks tools well is enough. |
| Shopper agent (fallback) | `gemini-3.8-flash` | thinking `low` | Fails over on timeout, overload or quota. |
| Offline pipelines (text + vision) | `gemini-3.8-flash` (fallback `gemini-3.5-flash-lite`) | structured output (zod schema), cached per prompt version | Catalogue enrichment, photo tagging, rails, return-reason classification, intent clustering, proposals, openers. |
| Eval judge | `gemini-pro-latest` (Gemini 3.1 Pro) | JSON verdict | A different, stronger tier than the agent, so the agent doesn't grade itself. Judges tone and helpfulness only; safety is checked by code. |

Google Search grounding, URL context and code execution are **off** for every role: the agent must never pull facts from the web. Total API spend for the whole build stayed well inside a ₹300 (≈$3.50) budget; the agent costs about **$0.0013 per chat**.

### Tools the shopper agent can call

Every tool is computed in code (`src/lib/tools/core.ts`) with a zod schema, and returns a one-line `why` that the AI console shows. The model chooses and quotes; it never computes a price, date or size itself.

| Tool | What it does |
|---|---|
| `search_catalog` | Discovery by budget, occasion, category, deadline and photo-derived design tags; code validates every SKU, applies merchant exclusions and paginates 3 at a time. |
| `get_product_facts` | Verified facts for any product, plus a size string computed in code ("3cm across"). Unverified AI-extracted attributes are withheld. |
| `check_delivery` | Date by pincode; if a deadline is missed, code finds in-stock alternatives that arrive in time. |
| `get_offer` | Best eligible offer combination, capped in code at 10% or ₹300. The agent can't create or raise a discount. |
| `get_return_insight` | Return reasons for this product in this context ("bigger than expected for office") plus a better-fit alternative and a code-set fit verdict. |
| `lookup_policy` | Exact section from a 44-section policy knowledge base, with ID and version. No match → the fixed care line, never a guess. |
| `add_to_bag` | Acts only when the shopper clearly asks; checks stock and the per-order cap. |
| `update_preferences` | Saves budget/occasion/style from the chat; the product-page rail re-ranks ("Updated from your chat"). |
| `suggest_login` | Shown at most once a session, only at value moments (delivery date, add to bag, "what goes with what I own"). |
| `handoff` | Care-team line for medical, allergy, order-status, customisation or "talk to a person". |

RTO risk is deliberately **not** a tool: the agent never sees the score, only whether to nudge prepaid.

---

## 2. Key prompts, workflows and agent setup

### Workflow

1. **Research and decide (Claude chat, Claude Project).** Every research output was saved as a dated doc in the project (27 docs: idea comparisons, reality checks, evidence sprints, a devil's-advocate review, the final call), so each later conversation started from the same context instead of re-explaining it.
2. **Write the brief before any code.** Two docs became the coding agents' source of truth: a storyboard + complete data spec (`docs/step1-build-brief-data-spec.md`) with "planted facts" the AI had to find, and the prototype plan v2 (`docs/PROTOTYPE_PLAN_v2.md`): what AI does vs what rules do, grounding, checkout, agent journeys, guardrails G1–G17, evals, and a P0/P1/P2 priority table with hour estimates.
3. **Build with coding agents against the brief.** Claude Code as the main agent; Codex when Claude tokens ran out; Copilot for evals and QA. Each agent logged its decisions and rejected outputs in a running engineering log, and every change ended with the same checks: validator, type-check, lint, build, unit suites and headless-browser click-throughs.
4. **Measure, fix, re-measure.** Eval v1 → read every failure by hand → sort into checker bugs, test wording and real agent bugs → fix in that order → v2. Never tuned prompts against eval answers.

### Key prompts (paraphrased; the full prompts and plans are in the repo docs)

- **Idea stress test:** *"Play devil's advocate on this idea as a Razorpay PM on the Engage team would. What already exists at Razorpay or competitors, what's the real merchant pain, what data proves it, and why does this need AI rather than a rule?"*
- **Pre-build reality check:** *"Before I build, verify how ChatGPT ads actually work: what the landing page can and can't know about the user's chat, the ad formats, and what advertisers get back for measurement."* (Answer: the page knows the ad's context via URL parameters, never the conversation, which shaped the whole design.)
- **Data brief to Claude Code:** *"Read CLAUDE.md and everything in docs/ … plan the scaffolding, every seed data file with all planted facts exactly as specified, and a validate-data script."*
- **Plan v2:** *"For each of personalisation, ground truth, the agent, checkout, the consoles and evals, tell me what AI should do vs what rules should do, where AI is natural rather than forced, and what to cut to fit 24 hours."*
- **Front-end chat prompt rule I set:** suggested chips must match the ad context (no "Can I shower in these?" on a wedding-gift ad), and must never show prompt-injection or discount-abuse prompts such as "give me 50% off". Those live only in the eval cases.
- **Design prompt rule I set:** the AI console uses Razorpay-inspired colours; the shop and merchant console use the Cosmos brand; no Razorpay logos copied.

### Agent setup (how it stays grounded)

The principle from plan v2: **AI handles understanding and matching** where inputs are fuzzy (language, photos, conversation); **rules handle hard constraints**, merchant controls and identity data, where outputs must be exact and auditable.

- **Offline (Gemini, cached):** catalogue enrichment from prose → claims "awaiting merchant confirmation"; vision tags from each product photo (e.g. flower, twisted rope, evil eye) for discovery only, never as claims; ad group → product rails with a reason per item; return-reason themes; shopper-intent clusters; merchant proposals. Every output is stamped with model, prompt version and run time.
- **At render time (code, deterministic):** start from the AI rail for the ad group, then apply exclusions and stock → margin floor → pins → merchant boost (only if AI relevance ≥ 0.6) → identity filters → session preferences. Each step writes a decision entry to the AI console.
- **At chat time:** stable system prompt first, dynamic context after; only the last 10 messages sent. Intents that must not be guessed (offers, delivery, policy, fit-for-occasion, medical/allergy, add to bag) **force the first tool in code**. Exact chip taps go through a **fast path** (tool + template, zero LLM calls, ₹0); free text goes to Gemini.
- **Output checks** on every reply: numbers and dates must appear in tool results; regulated words (hypoallergenic, nickel-free, waterproof, real gold, hallmark, certified, medical) need a verified flag; product names must exist; sizes in cm only; no "ChatGPT" in shopper text.
- **Temperature doesn't keep it grounded; the architecture does** (tools, policy IDs, verified flags, output checks).

---

## 3. AI outputs I rejected, corrected or significantly improved

### 3.1 The north-star metric and pricing: click-to-order conversion, not "kept revenue"

**What the AI pushed:** price and measure the product on *kept revenue per ad click* (paid revenue minus refunds and RTO), and it kept coming back to this as the headline metric and the billing basis.

**What I decided:** sell and bill on **ad-click-to-order conversion** (lift measured against a holdout of ad traffic that sees the standard page). Kept revenue stays as a supporting, reported metric, and RTO/return-reduction features are supporting features, not the selling point.

**Why:** kept revenue is also a function of things the agent doesn't control: the merchant's product quality, changing consumer behaviour, competitors' offers, courier performance and the return window itself. Pricing a product on an outcome the vendor can't control is a commercial risk for Razorpay and makes every invoice disputable. Conversion from click to order is what the post-click experience directly moves, it's observable within the session, and it's clean to A/B against a holdout.

### 3.2 The B2B receivables recovery agent: dropped after merchant interviews and data

**What the AI pushed:** early on, it strongly recommended a domestic B2B receivables recovery agent (invoice follow-ups, the MSME 45-day payment rule, document reconciliation) as the best fit for "revenue recovery".

**What I found by talking to merchants:** I interviewed two SME owners, one selling to other SMEs and one supplying a large institution.
- Both were comfortable extending credit; it's part of how they win and keep business, not a problem they want a tool to "fix".
- Neither would invoke the 45-day rule against a buyer. The risk of losing the relationship (and future orders) outweighs the interest they'd recover.
- Where delays happen, the cause is usually the buyer's bargaining power or cash cycle. Software can't solve a power-imbalance equation.
- Appetite to pay for a collections tool was low.

**What the data showed** (MCA MSME Form-1 reasons for late payment, ~1.09 lakh reasons, as analysed in the GAME Delayed Payments Report, May 2022):
- ~61% of delays come from buyer power or buyer cash: credit terms beyond 45 days "mutually agreed" (44.0%) and the buyer's own cash shortage (16.7%).
- Only ~24% comes from paperwork or process, where software genuinely helps: late invoice submission (14.1%), reconciliation in progress (3.6%), incomplete GST compliance (3.6%), buyer unaware of MSME status (2.7%).
- Fewer than 1% of registered MSMEs have ever filed on Samadhaan, the government's delayed-payment portal, mainly for fear of losing orders, which matched what I heard in the interviews.

**Decision:** a tool that addresses roughly a quarter of the problem, for a segment with low willingness to pay, wasn't worth building. I moved to the growth side of the brief, evaluated international-payments ideas, and chose the ChatGPT Ads post-click agent.

### 3.3 Other AI outputs rejected or corrected during the build (from the day-by-day engineering log)

- **Health claims from vague copy.** The enrichment pipeline turned "skin-safe for most" into `nickel_free = true` and "water friendly-ish" into `water_resistant = true`. Rejected: vague wording means *unknown*, never a claim. Now enforced in code (vague → null with the source phrase) and in the validator.
- **A "sensitive ears" ad on the wrong metal.** Brass was rejected for the sensitive-ears ad because fashion brass is a common nickel trigger. The ad was rebuilt on the 8 stainless-steel earrings, stating the metal only, never "hypoallergenic" or "nickel-free" (steel contains some nickel). The AI opener for that ad ("won't itch sensitive ears") was rejected by a code guard and replaced with the curated line.
- **Agent skipped tools.** Unforced, Flash-Lite answered "great office choice" without checking return data, and guessed an engraving policy. Fix: those intents now force the right tool in code.
- **Paraphrased safety lines.** The model reworded "I can't give medical advice" and the care line. Medical and "talk to a person" handoffs are now answered word for word in code, with no model call.
- **A loyalty programme the brand never stated.** The agent said "we do not have a loyalty points programme" when the knowledge base was silent. A new guard requires any "we have / don't have" claim to be backed by a policy section on that topic; unknown topics get the fixed care line.
- **Language leak.** A Hinglish example placed in a tool description made English replies come back in Hinglish. Moved it to the Hinglish-only context.
- **Copying other brands' product photos.** Declined (their copyright); all imagery is generated for the fictional brand.
- **Jargon.** "316L", "PVD" and mm sizes reached the agent's facts and the mock ChatGPT answer even after I asked for plain language; fixed at the data source, and a "sizes in cm" output check now flags any reply quoting mm.

---

## 4. What AI did vs what I decided or built

| Area | What AI did | What I decided / added |
|---|---|---|
| Problem choice | Proposed many directions, including B2B receivables (pushed hard) and international-payments ideas. | Ran merchant interviews, read the data, dropped B2B receivables, shortlisted two ideas and chose the ChatGPT Ads post-click agent. |
| Core concept | Suggested customising the landing page's suggested products from the ad group ID, plus a chatbot. | **Extended personalisation beyond the ad:** suggested products also adapt to what is known about the shopper: logged-in data via the Razorpay network (RTO risk, saved address, past orders, size preference), brand cookies on desktop (recently viewed, category affinity), and preferences stated in the chat that re-rank the page. High-RTO shoppers get a prepaid nudge, never shown the reason, and COD is never blocked. |
| Metric and pricing | Recommended kept revenue per click. | Chose click-to-order conversion vs a holdout (section 3.1). |
| Trust and claims | Generated attributes, openers and ad copy. | Set the claims ladder: only verified attributes are stated; no hypoallergenic/nickel-free anywhere; the AI finds demand and products, but the merchant approves every public-facing change. |
| Merchant loop | Clustered 28 sensitive-ears questions, matched 8 steel earrings and drafted the ad. | Designed approve → new ad appears in mock ChatGPT → its own page. Approvals act in code, never through the model. |
| Chips | — | Chips are rules, not AI: context-matched, fast, testable, and never unsafe. |
| UX calls | Built the pages and components. | Store homepage stays static (no LLM before first paint); shopper's name appears only inside the chat, never on site pages; support is email only; one size per earring, in cm; no "on the ear" measurements; no holdout arms visible to viewers. |
| Checkout | Implemented Orders API, Checkout.js and HMAC verification. | Chose "simulated Magic Checkout steps + real Razorpay Standard Checkout in Test Mode", labelled as simulated, over a fully mocked or plain-Standard flow. |
| Evals | Wrote the runner, checkers and report generator. | Decided what "pass" means, sorted v1 failures into checker / wording / real bugs, set the fix order, and hand-checked the judge on 10 cases. |
| Budget | — | Set a ₹300 total API budget, chose Flash-Lite for latency over 3.8 Flash, and asked for rate limits and a daily spend cap that degrade to quick answers instead of errors. |

---

## 5. Verification steps, known limitations and risks

### Verification built into the prototype

- **Evals:** 70 cases across tool use, groundedness, claim safety, handoff, return-insight relevance, offer-cap abuse, prompt injection, Hinglish, abuse, input validation and format. **v1 → v2: 39/52 → 52/52 on the same cases (75% → 100%), plus 18 new cases passing.** Rule checks run first; the Gemini Pro judge scores tone and helpfulness only. A regression gate fails the build if claim safety, groundedness or "no ChatGPT mention" drop below 100%. Judge agreement with my own reading: 8/10 on the v1 rubric, 10/10 after fixing the rubric.
- **Later runs reported honestly, not re-run until green:** a fresh full run (`docs/EVALS-LATEST.md`) recorded 66/70; the four flagged cases were fixed and passed 4/4 in a targeted re-run. The final rules-only run after the last feature changes was 68/70, with the claim-safety gate red on two replies that are actually safe ("not solid gold…", "hasn't verified this necklace as water-resistant…") but trip the substring checker. I left the checker strict rather than loosen it to force a pass.
- **Unit suites:** claim checker (must-pass safe hedges, must-flag unsafe replies), abuse filter (including no false positives on eval and chip text), all 105 chip answers on the fast path, rail rules, discovery, payment signature checks, and checkout arithmetic across 11,392 quote combinations.
- **Browser suites** at 360/390/1440px: store click-through, chat journeys with and without an API key, checkout with a real Razorpay Test Mode payment and signature verification, AI console, merchant approvals, and a sanity pass for corrupted state and stale totals.
- **Data validator:** checks every reference and the planted facts (e.g. 30mm hoop misses an 18 Oct deadline, 2.8cm alternative arrives 16 Oct; 18 waterproof-in-prose SKUs; 28 sensitive-ears questions), so AI pipeline re-runs can't silently break the demo story.
- **AI console (`/demo`, desktop):** a structured decision log for every step (trigger → tool and arguments → result → checks → latency), with AI / code / rule / login / session badges. Shows what was decided and why, never raw model reasoning or the system prompt.

### Known limitations and risks

- **Prompt injection.** Detection is a pattern list (English + Hinglish) plus layered defences: tools are allow-listed and read-only except `add_to_bag` and `update_preferences`, discounts are capped in code, and outputs are checked. A sophisticated or novel injection may still get past the detector and influence wording, though it can't change prices, payments or orders.
- **Claim checker is lexical.** It catches listed words and phrases; a new paraphrase of an unverified claim can slip through until added (this happened once with "safe with water", which an eval caught).
- **Model tool choice isn't guaranteed.** Model-chosen tools have flipped between runs; that's why high-stakes intents are forced in code. 100% on evals means "passes today's checks", not "can't fail".
- **The judge has limits:** its daily quota ran out on some runs (those cases were scored by rules only and are listed as not judged).
- **Simulated pieces:** ChatGPT ads and ad IDs, Razorpay network login, RTO scores, Magic Checkout steps, the Offers Engine, orders, sessions and returns. The only real external calls are Gemini and Razorpay Test Mode (no real money). Merchant metrics are computed from seeded synthetic data, so the conversion lift is a hypothesis to test with a real holdout, not a result.
- **Spending guards are per server instance** (in memory), so they reset on a cold start.
- **Not verified:** physical iPhone/Safari keyboard behaviour; live re-ranking at scale; cross-merchant network signals (deliberately not built: needs explicit consent and legal review).
- **Attribution:** the ad group and click reference ride in the Razorpay order notes; real ChatGPT ads reporting may differ from the simulated format.

### Privacy and secrets

No API keys, credentials or real personal data are in this log or the repository (`.env.example` holds placeholders only; secrets live in environment variables). Shopper identities, addresses and payment methods are fictional and masked; the support email uses a reserved `.example` domain; chat logs shown to the merchant pass through the abuse and injection filters first.
