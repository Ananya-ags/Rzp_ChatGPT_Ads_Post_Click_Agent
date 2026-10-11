# CLAUDE.md: build rules for this repo

## What we're building (2 lines)
A post-click AI agent for D2C brands running ChatGPT Ads through Razorpay Engage. When a shopper clicks a ChatGPT ad, the brand's mobile product page adapts to the ad's context, an AI agent answers questions from verified catalogue facts and steers to Razorpay checkout, and what shoppers ask flows back to the merchant as approvable proposals, all measured on kept revenue (revenue net of returns and RTO).

This is a prototype for the Razorpay x ISB AI PM Build Challenge (Track 2: Recover and Grow with AI). **Deadline: 13 Oct 2026, 11:59 PM IST.** Speed and a polished core demo beat breadth.

## Source of truth
- `docs/PRODUCT_CONTEXT.md`: product, AI decisions, tools, guardrails, UI, evals, build order.
- `docs/step1-build-brief-data-spec.md`: storyboard and the complete data spec (every planted fact).
- If anything conflicts, ask me before choosing.

## Stack
- Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel (Hobby).
- Vercel AI SDK for the agent (tool calling + streaming); API keys server-side only.
- `vaul` for the mobile bottom sheet (snap points: pill, half, full).
- Data as JSON in `/data`; pipeline outputs in `/data/generated` (never hand-edited).
- No database, no auth. Shared demo state in localStorage (wrapped in try/catch).
- Razorpay **Test Mode** for checkout (order created in a server route).

## Non-negotiable rules
1. **All data is fictional.** No real brand names, people, phone numbers, addresses or card numbers. Label simulated data "Simulated" in the UI.
2. **Secrets only in `.env`.** Commit `.env.example`, never real keys.
3. **AI talks and decides; code computes and acts.** The LLM never computes or invents a price, date, discount, stock level or return rate. It calls tools and explains their results.
4. **Never name ChatGPT in shopper-facing copy.** Shopper copy echoes the ad ("Waterproof everyday · under ₹5k"). "ChatGPT" appears only in the AI console, merchant console, docs and video.
5. **Only verified attributes are stated as claims.** AI-extracted attributes carry `verified: false` and are described as materials, not benefits.
6. **Offer caps are enforced in code.** The agent cannot create or change discounts.
7. **Demo clock:** "today" is fixed at **Tue 13 Oct 2026, 10:00 IST** (config), so delivery dates are deterministic.
8. **Mobile-first.** The shopper site is designed for ~390px width inside a phone frame; desktop layout is optional.
9. **Log as you go** in `BUILD_LOG.md`: which AI tool did what, key prompts, any AI output we rejected and why, decisions I made myself.
10. Keep each step demoable; don't start the next step until the current one runs.

## Working style
- Plan first for anything multi-file; wait for my approval before large changes.
- Prefer small, readable components and typed data loaders.
- When unsure about product behaviour, check docs/ first, then ask.
