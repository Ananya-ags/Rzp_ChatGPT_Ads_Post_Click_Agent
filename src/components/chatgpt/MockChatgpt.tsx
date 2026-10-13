"use client";
/** Simulated ChatGPT screen with sponsored cards. Conversation 3's card (steel earrings) appears only after the proposal is approved. */
import Link from "next/link";
import { useState } from "react";
import ProductImage from "../shop/ProductImage";
import { useDemoState } from "@/lib/state";
import type { CardVM } from "@/lib/view";

type Conv = {
  id: string;
  title: string;
  requires_approval_of: string | null;
  proposalId: string | null;
  turns: { role: "user" | "assistant"; text: string }[];
  card: { advertiser: string; title: string; body: string; cta: string; click_url: string; hero: CardVM };
};

export default function MockChatgpt({ conversations, initial }: { conversations: Conv[]; initial: string }) {
  const [state, , ready] = useDemoState();
  const [active, setActive] = useState(initial);
  const conv = conversations.find((c) => c.id === active) ?? conversations[0];
  const unlocked = !conv.requires_approval_of || (ready && conv.proposalId && state.approvedProposals.includes(conv.proposalId));

  return (
    <div className="flex min-h-full flex-col bg-white text-[#0d0d0d]">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/95 px-4 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-semibold">ChatGPT</span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-black/50">Simulated</span>
        </div>
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 no-scrollbar">
          {conversations.map((c) => (
            <button key={c.id} onClick={() => setActive(c.id)} className={`shrink-0 rounded-full px-3 py-1 text-[12px] ${c.id === active ? "bg-black text-white" : "bg-black/5 text-black/70"}`}>
              {c.title}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 py-4">
        {conv.turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[80%] rounded-3xl bg-[#f1f1f1] px-4 py-2.5 text-[15px] leading-snug">
              {t.text}
            </div>
          ) : (
            <p key={i} className="text-[15px] leading-relaxed">
              {t.text}
            </p>
          ),
        )}

        {unlocked ? (
          <Link href={conv.card.click_url} className="block overflow-hidden rounded-2xl border border-black/10 active:scale-[0.99]">
            <div className="flex gap-3 p-3">
              <div className="size-[76px] shrink-0 overflow-hidden rounded-xl">
                <ProductImage card={conv.card.hero} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-black/50">
                  Sponsored · {conv.card.advertiser}
                </p>
                <p className="text-[14px] font-semibold leading-snug">{conv.card.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] text-black/70">{conv.card.body}</p>
              </div>
            </div>
            <div className="border-t border-black/5 px-3 py-2 text-[13px] font-medium">{conv.card.cta} →</div>
          </Link>
        ) : (
          <p className="rounded-xl border border-dashed border-black/15 px-3 py-3 text-center text-[12px] text-black/45">
            No sponsored result yet. It appears after the merchant approves the proposal in the merchant console.
          </p>
        )}
      </main>

      <div className="sticky bottom-0 border-t border-black/5 bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
        <div className="rounded-full bg-[#f4f4f4] px-4 py-3 text-[14px] text-black/40">Ask anything</div>
      </div>
    </div>
  );
}
