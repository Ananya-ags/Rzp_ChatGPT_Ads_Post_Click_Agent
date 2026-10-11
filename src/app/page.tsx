import Link from "next/link";
import DemoToggles from "@/components/DemoToggles";

const LINKS = [
  { href: "/chatgpt", title: "Guided demo", body: "Start in the mock ChatGPT, tap a sponsored card and land on the adapted page." },
  { href: "/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k", title: "Try it yourself", body: "The waterproof-everyday ad's page, with the agent." },
  { href: "/p/ciel-hoops-40mm?ad_group=wedding-guest-gift", title: "Same SKU, wedding ad", body: "Same product, different context, rail and opener." },
  { href: "/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k&arm=A", title: "Standard page (control)", body: "No context, no curation, no agent: arm A of the holdout." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/cosmos-logo-v3.png" alt="Cosmos" className="h-7 w-auto md:h-11" />
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
      <DemoToggles />
      <p className="mt-8 text-[13px] text-muted">Best viewed on a phone. On desktop the shopper site runs inside a phone frame.</p>
    </main>
  );
}
