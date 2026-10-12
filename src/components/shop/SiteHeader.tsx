"use client";
/**
 * Store header: ☰ menu (slide-in category panel, display only), logo, profile (→ login),
 * and the bag (links to the bag page, with a live count).
 */
import Link from "next/link";
import { useState } from "react";
import { useDemoState } from "@/lib/state";
import { useLinkQuery } from "./productLink";

const MENU = ["Earrings", "Rings", "Necklaces", "Bracelets", "FAQs"];

const Icon = ({ d, className = "size-[22px]" }: { d: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const MENU_ICON = <path d="M4 7h16M4 12h16M4 17h16" />;
const USER_ICON = (
  <>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </>
);
const BAG_ICON = (
  <>
    <path d="M5.5 8h13l-1 12h-11z" />
    <path d="M9 10V7a3 3 0 016 0v3" />
  </>
);

export default function SiteHeader({ user = null, loginHref = "/login" }: { user?: { firstName: string } | null; loginHref?: string }) {
  const [state] = useDemoState();
  const [menuOpen, setMenuOpen] = useState(false);
  const q = useLinkQuery();
  const count = state.cart.reduce((s, l) => s + l.qty, 0);
  // inside the in-app browser view, the menu opens below the browser bar (like a real webview)
  const [chromeH, setChromeH] = useState(0);
  const openMenu = () => {
    setChromeH(document.getElementById("phone-chrome")?.getBoundingClientRect().height ?? 0);
    setMenuOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-1 border-b border-line/70 bg-ivory/90 px-2 py-1.5 backdrop-blur">
        <button onClick={openMenu} aria-label="Open menu" className="grid size-10 place-items-center rounded-full text-ink active:bg-sand">
          <Icon d={MENU_ICON} />
        </button>
        <Link href="/" aria-label="Cosmos home" className="mr-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/cosmos-logo-v4.png" alt="Cosmos" className="h-6 w-auto md:h-[30px]" />
        </Link>
        <Link href={loginHref} aria-label={user ? "Your account" : "Log in"} className="grid size-10 place-items-center rounded-full text-ink active:bg-sand">
          {user ? (
            <span className="ai-badge grid size-7 place-items-center rounded-full text-[13px] font-semibold text-[#3a2a10]">{user.firstName[0]}</span>
          ) : (
            <Icon d={USER_ICON} />
          )}
        </Link>
        <Link href={`/cart${q}`} aria-label={`Bag, ${count} item${count === 1 ? "" : "s"}`} className="relative grid size-10 place-items-center rounded-full text-ink active:bg-sand">
          <Icon d={BAG_ICON} />
          {count > 0 && (
            <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold-deep px-1 text-[10.5px] font-semibold text-white tabular-nums">
              {count}
            </span>
          )}
        </Link>
      </header>

      {/* slide-in menu (display only for now) */}
      <div className={`fixed inset-x-0 bottom-0 z-50 ${menuOpen ? "" : "pointer-events-none"}`} style={{ top: chromeH }} aria-hidden={!menuOpen}>
        <div onClick={() => setMenuOpen(false)} className={`absolute inset-0 bg-ink/30 transition-opacity duration-300 ${menuOpen ? "opacity-100" : "opacity-0"}`} />
        <nav
          aria-label="Shop categories"
          className={`absolute inset-y-0 left-0 flex w-[78%] max-w-[320px] flex-col bg-ivory shadow-[10px_0_40px_-10px_rgba(31,26,23,0.35)] transition-transform duration-300 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/cosmos-logo-v4.png" alt="Cosmos" className="h-6 w-auto" />
            <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid size-9 place-items-center rounded-full bg-sand text-[14px]">
              ✕
            </button>
          </div>
          <ul className="flex-1 px-2 py-2">
            {MENU.map((m, i) => (
              <li key={m} className={`flex items-center justify-between px-3 py-4 font-display text-[19px] ${i === MENU.length - 1 ? "mt-2 border-t border-line pt-5 font-sans text-[15px] text-muted" : "border-b border-line/60"}`}>
                {m}
                <Icon d={<path d="M9 6l6 6-6 6" />} className="size-4 text-muted" />
              </li>
            ))}
          </ul>
          <p className="px-5 pb-6 text-[11px] text-muted">Anti-tarnish demi-fine jewellery · Free shipping over ₹1,499</p>
        </nav>
      </div>
    </>
  );
}
