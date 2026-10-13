import Link from "next/link";
import DemoToggles from "@/components/DemoToggles";
import proposalsJson from "../../data/generated/proposals.json";
import { ProposalsSchema } from "@/lib/schemas";

/** Proposals whose approval launches a new ad (the approve → new ad → new page loop). */
const NEW_AD_PROPOSALS = ProposalsSchema.parse(proposalsJson).proposals.filter((p) => p.type === "new_ad_group").map(({ id, title }) => ({ id, title }));

const LINKS = [
  { href: "/shop", title: "Store home", body: "The Cosmos shop: every piece by category, the same for every visitor. Open any product to ask Cosmos AI." },
  { href: "/demo", title: "Guided demo with the under-the-hood view (desktop)", body: "The shop in a phone on the left, and on the right a live log of every decision: page curation, chat tools and guardrails, checkout and the order outcome." },
  { href: "/chatgpt", title: "Guided demo", body: "Start in the mock ChatGPT, tap a sponsored card and land on the adapted page." },
  { href: "/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k", title: "Try it yourself", body: "The waterproof-everyday ad's page, with the agent." },
  { href: "/p/ciel-hoops-40mm?ad_group=wedding-guest-gift", title: "Same SKU, wedding ad", body: "Same product, different context, rail and opener." },
  { href: "/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k&arm=A", title: "Standard page (control)", body: "No context, no curation, no agent: arm A of the holdout." },
  { href: "/login?next=%2Fp%2Fciel-hoops-40mm%3Fad_group%3Dwaterproof-everyday-under-5k", title: "Log in as the demo shopper", body: "Mobile 99999 99999 · OTP 123456. The page, bag and assistant personalise for Ananya (simulated)." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/cosmos-logo-v4.png" alt="Cosmos" className="h-7 w-auto md:h-11" />
      <h1 className="mt-6 font-display text-[32px] leading-tight">The page that remembers why they clicked.</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        A post-click AI agent for D2C brands running ChatGPT Ads through Razorpay Engage. Prototype for the Razorpay × ISB AI PM Build Challenge.
        Cosmos is a fictional brand; all shopper, order and ad data is simulated.
      </p>
      <ul className="mt-8 space-y-3">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block rounded-2xl border border-line bg-white p-4 transition hover:border-gold">
              <p className="font-medium">{l.title} →</p>
              <p className="mt-1 text-[14px] text-muted">{l.body}</p>
            </Link>
          </li>
        ))}
      </ul>
      <DemoToggles proposals={NEW_AD_PROPOSALS} />
      <p className="mt-8 text-[13px] text-muted">Best viewed on a phone. On desktop the shopper site runs inside a phone frame.</p>
    </main>
  );
}
