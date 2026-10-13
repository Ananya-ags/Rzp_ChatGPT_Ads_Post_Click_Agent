"use client";
/**
 * Cosmos AI entry points. Every shop page renders this once: it registers the page with the session's chat
 * (ChatProvider) and mounts the sheet inside the page's phone frame.
 * - Home, category pages and the bag: a floating gold-star button, bottom-right above the safe area, labelled
 *   "Ask Cosmos AI" on first view and collapsing to the star once the shopper scrolls.
 * - Product page: no floating button; its sticky bar has the "Ask Cosmos AI" pill (it calls openWith()).
 * - Hidden when the store has paused the agent (site-wide or for this ad group). Never rendered in checkout.
 */
import { pausedAdGroups } from "@/lib/overrides";
import { useEffect, useState } from "react";
import { usePhoneSurface } from "../PhoneSurface";
import ChatSheet from "./ChatSheet";
import { useCosmosChat, type ChatPage } from "./chat/ChatProvider";
import { useDemoState } from "@/lib/state";
import { CosmosStarBadge } from "../brand/CosmosStar";

type Props = {
  page: Omit<ChatPage, "arm" | "adGroupId"> & { arm?: ChatPage["arm"]; adGroupId?: string | null };
  fab: boolean;
  lift?: boolean; // the bag's sticky pay bar: sit above it
};

/** The ad in this page's URL (read in the browser, so static pages stay static). */
function fromUrl() {
  try {
    const q = new URLSearchParams(window.location.search);
    // every visitor gets the agent: the URL never selects a holdout variant
    return { adGroupId: q.get("ad_group") || null, arm: null } as const;
  } catch {
    return { adGroupId: null, arm: null } as const;
  }
}

export default function AskCosmos({ page, fab, lift = false }: Props) {
  const { register, setOpen, arm, ready, adGroupId } = useCosmosChat();
  const [state] = useDemoState();
  const { scroller } = usePhoneSurface();
  const [collapsed, setCollapsed] = useState(false);
  const key = JSON.stringify(page);

  useEffect(() => {
    const url = fromUrl();
    const p = JSON.parse(key) as Props["page"];
    register({ ...p, adGroupId: p.adGroupId ?? url.adGroupId, arm: p.arm ?? url.arm });
  }, [key, register]);

  // the label shows on first view and collapses to the star after the shopper scrolls
  useEffect(() => {
    if (!fab) return;
    const onScroll = () => {
      const y = Math.max(window.scrollY, scroller?.scrollTop ?? 0);
      if (y > 120) setCollapsed(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      scroller?.removeEventListener("scroll", onScroll);
    };
  }, [fab, scroller]);

  // paused site-wide, or paused by the merchant for this ad group
  if (!ready || state.agentPaused || (adGroupId && pausedAdGroups(state.approvedProposals).includes(adGroupId)) || arm === "A" || arm === "B") return null;

  return (
    <>
      {fab && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask Cosmos AI"
          className={`ai-cta fixed right-4 z-30 flex h-14 items-center overflow-hidden rounded-full text-[14px] font-semibold text-[#3a2a10] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${collapsed ? "w-14 justify-center" : "gap-2 pl-3.5 pr-4"} ${lift ? "bottom-[calc(max(env(safe-area-inset-bottom),12px)+92px)]" : "bottom-[max(env(safe-area-inset-bottom),16px)]"}`}
        >
          <CosmosStarBadge className="size-8" />
          <span aria-hidden className={`fab-label whitespace-nowrap ${collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100"}`}>
            Ask Cosmos AI
          </span>
        </button>
      )}
      <ChatSheet />
    </>
  );
}
