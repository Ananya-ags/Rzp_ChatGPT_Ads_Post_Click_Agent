"use client";
/** Emits a page's server-computed decisions to the AI console on mount. Renders nothing; a no-op without the console. */
import { useEffect } from "react";
import { emit, setConsolePage, type ConsoleEvent } from "@/lib/console/emit";
import { readState } from "@/lib/state";
import { pausedAdGroups } from "@/lib/overrides";

export type PageEvent = Omit<ConsoleEvent, "ts" | "page">;

export default function ConsoleEmit({ id, page, events, agentPausable = false, adGroupId = null }: { id: string; page: string; events: PageEvent[]; agentPausable?: boolean; adGroupId?: string | null }) {
  useEffect(() => {
    // this page's label, set here too: page effects run before the bridge's on a client-side navigation
    setConsolePage(page);
    // the store's pause switch lives in the browser, so that decision is made here
    const st = readState();
    const groupPaused = !!adGroupId && pausedAdGroups(st.approvedProposals).includes(adGroupId);
    if (agentPausable && (st.agentPaused || groupPaused)) {
      emit({ journey_step: "page", kind: "agent_off", title: st.agentPaused ? "Agent paused by the store (merchant console)" : "Agent paused for this ad group (merchant approved)", detail: "Page shows the curated rail without Cosmos AI", source: "rule", status: "info" });
      for (const e of events.filter((x) => x.kind !== "opener")) emit(e);
      return;
    }
    for (const e of events) emit(e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return null;
}
