import Link from "next/link";
import ApproveSteelAd from "@/components/home/ApproveSteelAd";

export const metadata = { title: "ChatGPT Ads Post-Click Agent" };

// Razorpay-inspired palette, the same tokens as the /demo console (no Razorpay logo or wordmark)
const EXPERIENCE = [
  { href: "/demo", title: "Guided demo with the agent's under-the-hood view (desktop)", body: "The shop in a phone, beside a live log of every decision the agent and the code make." },
  { href: "/chatgpt", title: "Guided demo", body: "Start in a mock ChatGPT conversation, tap the sponsored card and land on the adapted page." },
  { href: "/shop", title: "Store home", body: "Use Cosmos AI to search the catalogue, or open any product and ask Cosmos AI about it." },
  { href: "/merchant", title: "Merchant console", body: "See what shoppers asked and approve the agent's suggestions." },
];

const SAME_PRODUCT = [
  { href: "/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k", title: "Waterproof ad", body: "The 40mm hoops, landed from a waterproof-everyday ad: matching rail, opener and questions." },
  { href: "/p/ciel-hoops-40mm?ad_group=wedding-guest-gift", title: "Same product, wedding ad", body: "The same hoops from a wedding-guest ad: a different rail, opener and questions." },
];

function Arrow() {
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-[#EAF3FF] text-[#3395FF] transition group-hover:translate-x-0.5 group-hover:bg-[#3395FF] group-hover:text-white">
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </span>
  );
}

function Card({ href, title, body, index }: { href: string; title: string; body: string; index?: number }) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-2xl border border-[#DCE3EE] bg-white p-5 transition hover:border-[#3395FF] hover:shadow-[0_6px_24px_rgba(7,38,84,0.08)] focus-visible:outline-2 focus-visible:outline-[#3395FF]"
    >
      <span className="flex items-start justify-between gap-4">
        <span className="text-[16px] font-semibold leading-snug text-[#072654]">
          {index !== undefined && <span className="mr-2 text-[#3395FF]">{index}.</span>}
          {title}
        </span>
        <Arrow />
      </span>
      <span className="mt-2 text-[14px] leading-relaxed text-[#4A5A72]">{body}</span>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F4F7FB] text-[#0B1F3A]">
      <header className="border-b border-[#DCE3EE] bg-[linear-gradient(180deg,#FFFFFF_0%,#EEF4FF_100%)]">
        <div className="mx-auto max-w-5xl px-4 pb-12 pt-14 md:px-8 md:pb-16 md:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#CFE2FF] bg-white px-3 py-1 text-[12px] font-medium uppercase tracking-wider text-[#3395FF]">
            <span aria-hidden className="size-1.5 rounded-full bg-[#3395FF]" /> Prototype
          </p>
          <h1 className="mt-5 text-[38px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[#072654] md:text-[64px]">
            ChatGPT Ads <span className="whitespace-nowrap text-[#3395FF]">Post&#8209;Click</span> Agent
          </h1>
          <p className="mt-4 text-[19px] font-medium leading-snug text-[#0B1F3A] md:text-[24px]">Turns ChatGPT ad clicks into orders, inside Razorpay Engage</p>
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-[#4A5A72] md:text-[16.5px]">
            A post-click AI agent for D2C brands running ChatGPT Ads through Razorpay Engage. It personalises the landing page with products that match the ad, helps shoppers
            decide in a conversation, and takes them to checkout, lifting conversion from ad click to purchase.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
        <section aria-labelledby="experience">
          <h2 id="experience" className="text-[22px] font-bold tracking-[-0.01em] text-[#072654] md:text-[26px]">
            Experience the post-click agent
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {EXPERIENCE.map((c, i) => (
              <li key={c.href}>
                <Card {...c} index={i + 1} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="same-product" className="mt-12 md:mt-14">
          <h2 id="same-product" className="text-[22px] font-bold tracking-[-0.01em] text-[#072654] md:text-[26px]">
            The same product&apos;s landing page, from different ads
          </h2>
          <ul className="mt-5 grid gap-4 md:grid-cols-3">
            {SAME_PRODUCT.map((c) => (
              <li key={c.href}>
                <Card {...c} />
              </li>
            ))}
            <li>
              <ApproveSteelAd />
            </li>
          </ul>
        </section>

        <p className="mt-10">
          <Link
            href="/login?next=%2Fp%2Fciel-hoops-40mm%3Fad_group%3Dwaterproof-everyday-under-5k"
            className="text-[14px] font-medium text-[#3395FF] underline decoration-[#3395FF]/40 underline-offset-4 hover:decoration-[#3395FF]"
          >
            Log in as the demo shopper
          </Link>
        </p>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-6 md:px-8">
        <p className="border-t border-[#DCE3EE] pt-6 text-[12px] leading-relaxed text-[#8090A6]">
          Prototype for the Razorpay × ISB AI PM Build Challenge. Cosmos is a fictional brand; all shopper, order and ad data is simulated.
        </p>
      </footer>
    </div>
  );
}
