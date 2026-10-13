"use client";
/**
 * Site-wide emitter for the AI console (/demo). Renders nothing. It logs nothing on the start page, the mock
 * ChatGPT screen or /demo itself; from the first Cosmos page it logs the arrival (ad or direct), the session
 * (personalisation tier, approximate city, device), every page view, and bag and login changes.
 * Every emit is a no-op unless the console is listening (src/lib/console/emit.ts).
 */
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { emit, lastChatBagAt, setConsolePage } from "@/lib/console/emit";
import { useDemoState } from "@/lib/state";

export type BridgeAdGroup = { id: string; name: string; campaign_id: string; ad_group_id: string; ad_id: string; context_hints: string[] };
type Props = { adGroups: BridgeAdGroup[]; titles: Record<string, string>; categories: Record<string, string> };

const SILENT = (path: string) => path === "/" || path.startsWith("/demo") || path.startsWith("/merchant") || path.startsWith("/chatgpt") || path.startsWith("/api");

let arrived = false; // once per session (a "Restart session" reloads the frame, which resets it)

function pageLabel(path: string, p: Props) {
  if (path === "/shop") return "Home";
  if (path.startsWith("/c/")) return `Category: ${p.categories[path.slice(3)] ?? path.slice(3)}`;
  if (path.startsWith("/p/")) return `Product: ${p.titles[decodeURIComponent(path.slice(3))] ?? path.slice(3)}`;
  if (path === "/cart") return "Bag";
  if (path === "/checkout") return "Checkout";
  if (path.startsWith("/order/")) return "Order confirmation";
  if (path === "/login") return "Login";
  return path;
}

export default function ConsoleBridge(p: Props) {
  const pathname = usePathname();
  const [state, , ready] = useDemoState();
  const prevCart = useRef<Record<string, number> | null>(null);
  const prevLogin = useRef<boolean | null>(null);

  useEffect(() => {
    if (SILENT(pathname)) return;
    const q = new URLSearchParams(window.location.search);
    const label = pageLabel(pathname, p);
    if (!arrived) {
      arrived = true;
      // the ChatGPT card carries the Engage id (ad_group_id=adg_…); shop links carry the slug (ad_group=…)
      const group = p.adGroups.find((g) => g.id === q.get("ad_group") || g.ad_group_id === q.get("ad_group_id"));
      const fromAd = !!group && (q.get("via") === "chatgpt" || q.get("utm_source") === "chatgpt" || !!q.get("oppref"));
      setConsolePage(label);
      if (group)
        emit({
          journey_step: "arrival",
          kind: "arrival",
          title: fromAd ? "Arrived from ChatGPT ad" : `Arrived with ad context: ${group.name}`,
          detail: `${group.name} · ${group.context_hints.join(" · ")}`,
          source: "session",
          status: "info",
          data: { campaign_id: group.campaign_id, ad_group_id: group.ad_group_id, ad_id: group.ad_id, oppref: q.get("oppref") ?? "(none in URL)", ad_group: group.id, context_hints: group.context_hints },
        });
      else emit({ journey_step: "arrival", kind: "arrival", title: "Direct visit (no ad context)", source: "session", status: "info" });
      const loggedIn = /(?:^|;\s*)cosmos_user=ananya/.test(document.cookie) || state.loggedIn;
      const tier = loggedIn ? 3 : state.returningVisitor ? 2 : 0;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      emit({
        journey_step: "session",
        kind: "session",
        title: `Agent on · tier ${tier} (${["anonymous", "session", "brand cookie", "logged in"][tier]})`,
        detail: `${loggedIn ? "Saved address city" : "Pune (approx., from IP)"} · ${coarse ? "mobile device" : "desktop (phone-frame preview)"}`,
        source: loggedIn ? "login" : "session",
        status: "info",
        data: { tier, city: loggedIn ? "Pune (saved address)" : "Pune (approx.)", device: coarse ? "mobile" : "desktop preview", ad_group: group?.id ?? null, oppref: q.get("oppref") },
      });
    }
    setConsolePage(label);
    emit({ journey_step: "page", kind: "page_view", title: `Viewing ${label}`, source: "session", status: "info", page: label, data: { path: pathname + window.location.search } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // bag and login changes (from the page or the chat)
  useEffect(() => {
    if (!ready) return;
    const now = Object.fromEntries(state.cart.map((l) => [l.sku, l.qty]));
    if (prevCart.current && !SILENT(pathname))
      for (const [sku, qty] of Object.entries(now)) {
        const before = prevCart.current[sku] ?? 0;
        if (qty > before && Date.now() - lastChatBagAt() > 3000) emit({ journey_step: "action", kind: "bag", title: `Added to bag: ${p.titles[sku] ?? sku}${qty - before > 1 ? ` ×${qty - before}` : ""}`, source: "session", status: "ok", data: { sku, qty } });
      }
    prevCart.current = now;
    if (prevLogin.current === false && state.loggedIn && !SILENT(pathname)) emit({ journey_step: "action", kind: "login", title: "Logged in as the demo shopper → tier 3", detail: "Saved address, wallet and order history now personalise pages (simulated)", source: "login", status: "ok" });
    prevLogin.current = state.loggedIn;
  }, [ready, state.cart, state.loggedIn, pathname, p.titles]);

  return null;
}
