"use client";
/**
 * The AI console ("under the hood"), desktop only. Left: the real site in a same-origin iframe inside a phone frame,
 * starting at the mock ChatGPT screen. Right: a live, structured decision log from the site's events
 * (BroadcastChannel "cosmos-console"). The console pings every second; the site emits only while it hears pings.
 * It shows structured decisions and why lines only: never model reasoning or the system prompt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConsoleEvent, ConsoleSource, ConsoleStatus } from "@/lib/console/emit";
import { writeState } from "@/lib/state";

type Merchant = {
  id: string;
  title: string;
  evidence: string[];
  group: { id: string; name: string; ad_group_id: string; ad_id: string; campaign_id: string; budget: number } | null;
  rail: { count: number; first: string[]; producer: string } | null;
  conversation: string | null;
};
type Filter = "all" | "ai" | "tools" | "guards" | "checkout";

// Razorpay-inspired palette (navy and blue from Razorpay's public logo; one place to change), plus neutrals
const C = { navy: "#072654", blue: "#3395FF", bg: "#F4F7FB", panel: "#FFFFFF", line: "#DCE3EE", text: "#0B1F3A", muted: "#4A5A72" };
const BADGE: Record<ConsoleSource, { label: string; fg: string; bg: string }> = {
  ai: { label: "AI", fg: "#5B21B6", bg: "#EDE7FE" },
  code: { label: "Code", fg: "#0F766E", bg: "#DDF4F1" },
  rule: { label: "Rule", fg: "#3F4B5C", bg: "#E7EBF1" },
  login: { label: "Login", fg: "#0B5CC2", bg: "#E1EEFF" },
  cookie: { label: "Cookie", fg: "#0B5CC2", bg: "#E1EEFF" },
  session: { label: "Session", fg: "#0B5CC2", bg: "#E1EEFF" },
};
const STATUS: Record<ConsoleStatus, { icon: string; color: string; label: string }> = {
  ok: { icon: "✓", color: "#15803D", label: "ok" },
  caught: { icon: "!", color: "#B45309", label: "caught" },
  fallback: { icon: "↺", color: "#9A3412", label: "fallback" },
  info: { icon: "•", color: "#4A5A72", label: "info" },
};
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ai", label: "AI decisions" },
  { id: "tools", label: "Tools" },
  { id: "guards", label: "Guardrails" },
  { id: "checkout", label: "Checkout" },
];
const keep = (f: Filter, e: ConsoleEvent) =>
  f === "all" || (f === "ai" && e.source === "ai") || (f === "tools" && (e.kind === "tool" || e.kind === "forced")) || (f === "guards" && (e.kind === "guard" || e.kind === "agent_off" || /abuse|blocked/i.test(e.title))) || (f === "checkout" && (e.journey_step === "checkout" || e.journey_step === "order"));

const time = (ts: number) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

export default function DemoConsole({ merchant, evalsUrl }: { merchant: Merchant[]; evalsUrl: string }) {
  const [gate, setGate] = useState<"checking" | "desktop" | "mobile">("checking");
  useEffect(() => {
    const check = () => setGate(window.innerWidth >= 1024 && !window.matchMedia("(pointer: coarse)").matches ? "desktop" : "mobile");
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  if (gate === "checking") return null;
  if (gate === "mobile")
    return (
      <main style={{ background: C.bg, color: C.text }} className="grid min-h-dvh place-items-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-[18px] font-semibold">The under-the-hood view is designed for desktop.</p>
          <a href="/chatgpt" className="mt-4 inline-block text-[16px] font-medium underline" style={{ color: C.blue }}>
            Open the shop instead →
          </a>
        </div>
      </main>
    );
  return <Console merchant={merchant} evalsUrl={evalsUrl} />;
}

function Console({ merchant, evalsUrl }: { merchant: Merchant[]; evalsUrl: string }) {
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [frameKey, setFrameKey] = useState(0);
  const [scale, setScale] = useState(1);
  const [approved, setApproved] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // the handshake: ping every second, answer the site's ping at once, collect events
  useEffect(() => {
    const ch = new BroadcastChannel("cosmos-console");
    const hello = () => ch.postMessage({ type: "console-hello" });
    ch.onmessage = (m) => {
      if (m.data?.type === "site-ping") hello();
      if (m.data?.type === "event") setEvents((list) => [...list, m.data.event as ConsoleEvent].slice(-800));
    };
    hello();
    const t = setInterval(hello, 1000);
    return () => {
      clearInterval(t);
      ch.close();
    };
  }, []);

  // phone fits the window height
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 40) / (844 + 28)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // auto-scroll to the newest event unless the user scrolled up
  useEffect(() => {
    const el = listRef.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [events, filter]);

  const local = useCallback((e: Omit<ConsoleEvent, "ts">) => setEvents((list) => [...list, { ts: Date.now(), ...e }]), []);

  const restart = async () => {
    try {
      await fetch("/api/demo/reset", { method: "POST" });
    } catch {}
    try {
      frameRef.current?.contentWindow?.sessionStorage.clear(); // chat, orders, console queue (same origin)
    } catch {}
    try {
      window.sessionStorage.clear();
    } catch {}
    writeState({ cart: [], approvedProposals: [], loggedIn: false, loginOffered: false, loginDismissed: false, agentPaused: false, returningVisitor: false });
    setApproved([]);
    setEvents([]);
    setOpen({});
    follow.current = true;
    setFrameKey((k) => k + 1); // reloads the iframe at /chatgpt
  };

  const approve = (m: Merchant) => {
    writeState((s) => ({ approvedProposals: [...new Set([...s.approvedProposals, m.id])] }));
    setApproved((a) => [...a, m.id]);
    const page = "Merchant (stand-in approve)";
    local({ journey_step: "merchant", kind: "merchant", page, title: `Proposal approved: "${m.title}"`, detail: m.evidence.join(" · "), source: "session", status: "ok" });
    if (m.group) local({ journey_step: "merchant", kind: "merchant", page, title: `Ad group live: ${m.group.name}`, detail: `campaign ${m.group.campaign_id} · ad group ${m.group.ad_group_id} · ad ${m.group.ad_id} · ₹${m.group.budget.toLocaleString("en-IN")}/day`, source: "rule", status: "ok" });
    if (m.rail) local({ journey_step: "merchant", kind: "merchant", page, title: `Rail built: ${m.rail.count} pieces (AI-curated, ${m.rail.producer})`, detail: m.rail.first.join(" · "), source: "ai", status: "ok" });
    if (m.conversation) local({ journey_step: "merchant", kind: "merchant", page, title: `New ad appears in mock ChatGPT: "${m.conversation}"`, detail: "Open that conversation in the phone to see the sponsored card", source: "rule", status: "info" });
  };

  const simulateSlip = async () => {
    try {
      const r = await (await fetch("/api/demo/claim-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sku: "tara-solitaire-studs" }) })).json();
      local({ journey_step: "chat", kind: "guard", page: "Simulated slip (demo)", title: `Claim check caught "${(r.caught as string[]).join(", ")}" → safe reply sent`, detail: `Simulated draft for ${r.product}: "${r.draft}" → replaced with: "${r.safe_reply}"`, source: "rule", status: "caught", data: { simulated: true } });
    } catch {}
  };

  // session card: from the newest events
  const session = useMemo(() => {
    const arrival = [...events].reverse().find((e) => e.kind === "arrival");
    const sess = [...events].reverse().find((e) => e.kind === "session");
    const loggedIn = events.some((e) => e.kind === "login") || (sess?.data?.tier as number) === 3;
    const page = [...events].reverse().find((e) => e.kind === "page_view")?.page;
    const notes = [...events].reverse().find((e) => e.data?.notes)?.data?.notes as Record<string, string> | undefined;
    return {
      source: arrival ? (arrival.title.startsWith("Arrived from ChatGPT") ? "ChatGPT ad" : arrival.title.startsWith("Direct") ? "Direct visit" : "Ad context link") : "—",
      adGroup: (arrival?.data?.ad_group as string) ?? (arrival ? "none" : "—"),
      oppref: (arrival?.data?.oppref as string) ?? notes?.oppref ?? "—",
      agent: !sess ? "—" : [...events].reverse().some((e) => e.kind === "agent_off" && e.page === page) ? "Paused" : "On",
      tier: loggedIn ? "3 · logged in" : sess ? `${sess.data?.tier} · ${["anonymous", "session", "brand cookie", "logged in"][Number(sess.data?.tier) || 0]}` : "—",
      page: page ?? "—",
    };
  }, [events]);

  const totals = useMemo(() => {
    const usage = events.filter((e) => e.kind === "usage");
    const llm = usage.filter((e) => e.data?.llm);
    const guards = events.filter((e) => e.kind === "guard" && !e.data?.simulated);
    return {
      llm: llm.length,
      fast: usage.length - llm.length,
      tokens: llm.reduce((s, e) => s + (Number(e.data?.tokens) || 0), 0),
      cost: llm.reduce((s, e) => s + (Number(e.data?.cost_usd) || 0), 0),
      p50: median(usage.map((e) => e.latency_ms ?? 0)),
      passed: guards.filter((e) => e.status === "ok").length,
      caught: guards.filter((e) => e.status === "caught").length,
    };
  }, [events]);

  const shown = events.map((e, i) => ({ e, i })).filter(({ e }) => keep(filter, e));
  const groups: { page: string; items: typeof shown }[] = [];
  for (const row of shown) {
    const page = row.e.page || "Session";
    if (groups.at(-1)?.page === page) groups.at(-1)!.items.push(row);
    else groups.push({ page, items: [row] });
  }

  return (
    <main className="flex h-dvh overflow-hidden" style={{ background: C.bg, color: C.text }}>
      {/* LEFT: the real site in a phone frame */}
      <section className="flex shrink-0 items-center justify-center px-6" style={{ width: 390 * scale + 76 }} aria-label="Shopper's phone">
        <div style={{ width: 390 + 28, height: 844 + 28, transform: `scale(${scale})`, transformOrigin: "center" }} className="shrink-0 rounded-[48px] bg-[#111] p-[14px] shadow-2xl">
          <iframe key={frameKey} ref={frameRef} src="/chatgpt" title="Cosmos shop (shopper view)" className="h-[844px] w-[390px] rounded-[36px] bg-white" />
        </div>
      </section>

      {/* RIGHT: the console */}
      <section className="flex min-w-0 flex-1 flex-col border-l" style={{ borderColor: C.line, background: C.panel }} aria-label="Under the hood">
        <header className="flex flex-wrap items-center gap-3 px-5 py-3 text-white" style={{ background: C.navy }}>
          <h1 className="text-[17px] font-semibold tracking-tight">Under the hood · Cosmos AI agent</h1>
          <span className="rounded-full px-2 py-0.5 text-[12px] font-medium" style={{ background: C.blue }}>
            Prototype
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[13px]">
            {merchant
              .filter((m) => m.group)
              .map((m) => (
                <button key={m.id} onClick={() => approve(m)} disabled={approved.includes(m.id)} className="rounded-md border border-white/40 px-2.5 py-1.5 hover:bg-white/10 disabled:opacity-50" title="Stand-in for the merchant console's Approve button">
                  {approved.includes(m.id) ? "Approved ✓" : `Merchant: approve "${m.title}"`}
                </button>
              ))}
            <button onClick={simulateSlip} className="rounded-md border border-white/40 px-2.5 py-1.5 hover:bg-white/10" title="Runs the real claim checker on a canned unsafe draft">
              Simulate a slip
            </button>
            <button onClick={restart} className="rounded-md px-3 py-1.5 font-semibold" style={{ background: C.blue }}>
              Restart session
            </button>
          </div>
        </header>

        {/* 1. session card (sticky) */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 border-b px-5 py-3 text-[13.5px] xl:grid-cols-6" style={{ borderColor: C.line, background: "#F8FAFD" }}>
          {[
            ["Source", session.source],
            ["Ad group", session.adGroup],
            ["oppref", session.oppref],
            ["Agent", session.agent],
            ["Tier", session.tier],
            ["Viewing", session.page],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-wide" style={{ color: C.muted }}>
                {k}
              </p>
              <p className="truncate font-medium" title={v}>
                {v}
              </p>
            </div>
          ))}
        </div>

        {/* filters */}
        <div className="flex items-center gap-2 border-b px-5 py-2" style={{ borderColor: C.line }} role="tablist" aria-label="Filter events">
          {FILTERS.map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)} className="rounded-full px-3 py-1 text-[13.5px] font-medium" style={filter === f.id ? { background: C.navy, color: "#fff" } : { color: C.muted }}>
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-[12.5px]" style={{ color: C.muted }}>
            {events.length} events · click a line for details
          </span>
        </div>

        {/* 2. live timeline */}
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-3"
          aria-live="polite"
        >
          {events.length === 0 && <p className="py-8 text-[14px]" style={{ color: C.muted }}>Waiting for the shopper to reach the Cosmos site…</p>}
          {groups.map((g, gi) => (
            <div key={gi} className="mb-3">
              <p className="sticky top-0 z-10 -mx-5 mb-1 border-b px-5 py-1.5 text-[13px] font-semibold" style={{ background: "#EEF3FA", borderColor: C.line, color: C.navy }}>
                {g.page}
              </p>
              <ul>
                {g.items.map(({ e, i }) => {
                  const b = BADGE[e.source], st = STATUS[e.status], isOpen = !!open[i];
                  const hasMore = !!e.detail || (!!e.data && Object.keys(e.data).length > 0);
                  return (
                    <li key={i} className="border-b" style={{ borderColor: "#EEF1F6" }}>
                      <button onClick={() => hasMore && setOpen((o) => ({ ...o, [i]: !o[i] }))} className="flex w-full items-start gap-2.5 py-1.5 text-left text-[14px]" aria-expanded={hasMore ? isOpen : undefined}>
                        <span className="w-[62px] shrink-0 pt-px font-mono text-[12.5px]" style={{ color: C.muted }}>
                          {time(e.ts)}
                        </span>
                        <span className="w-[62px] shrink-0 rounded px-1.5 py-px text-center text-[12px] font-semibold" style={{ color: b.fg, background: b.bg }}>
                          {b.label}
                        </span>
                        <span className="grid size-[18px] shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: st.color }} aria-label={st.label}>
                          {st.icon}
                        </span>
                        <span className="min-w-0 flex-1 break-words" style={{ color: e.status === "caught" ? "#92400E" : C.text }}>
                          {e.title}
                        </span>
                        {e.latency_ms !== undefined && e.latency_ms > 0 && (
                          <span className="shrink-0 font-mono text-[12.5px]" style={{ color: C.muted }}>
                            {e.latency_ms}ms
                          </span>
                        )}
                        {hasMore && <span style={{ color: C.muted }}>{isOpen ? "▾" : "▸"}</span>}
                      </button>
                      {isOpen && (
                        <div className="mb-2 ml-[150px] rounded-md px-3 py-2 text-[13.5px]" style={{ background: "#F6F8FC", color: C.text }}>
                          {e.detail && <p className="mb-1">{e.detail}</p>}
                          {e.data && (
                            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
                              {Object.entries(e.data)
                                .filter(([, v]) => v !== undefined && v !== null && v !== "")
                                .slice(0, 12)
                                .map(([k, v]) => (
                                  <div key={k} className="contents">
                                    <dt style={{ color: C.muted }}>{k}</dt>
                                    <dd className="min-w-0 break-words font-mono text-[12.5px]">{fmt(v)}</dd>
                                  </div>
                                ))}
                            </dl>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* 3. totals (sticky bottom) */}
        <footer className="border-t px-5 py-2.5" style={{ borderColor: C.line, background: "#F8FAFD" }}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13.5px]">
            <Stat k="LLM calls" v={String(totals.llm)} />
            <Stat k="Fast-path / code answers" v={String(totals.fast)} />
            <Stat k="Tokens" v={totals.tokens.toLocaleString("en-IN")} />
            <Stat k="Cost" v={`$${totals.cost.toFixed(4)}`} />
            <Stat k="p50 latency" v={`${totals.p50}ms`} />
            <Stat k="Guardrails" v={`${totals.passed} passed · ${totals.caught} caught`} />
            <a href={evalsUrl} target="_blank" rel="noreferrer" className="ml-auto font-medium underline" style={{ color: C.blue }}>
              How we test the AI → docs/EVALS.md
            </a>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: C.muted }}>
            Structured decisions only (tool, arguments, why line, result, checks); never model reasoning or prompts. Prototype · simulated brand (Cosmos).
          </p>
        </footer>
      </section>
    </main>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <span>
      <span style={{ color: C.muted }}>{k}</span> <b>{v}</b>
    </span>
  );
}

/** One readable line per value: no walls of JSON. */
function fmt(v: unknown): string {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? Object.values(x as object).slice(0, 3).join(" ") : String(x))).join(" · ").slice(0, 300);
  if (v && typeof v === "object") return Object.entries(v as object).map(([k, x]) => `${k} ${typeof x === "object" ? "…" : x}`).join(" · ").slice(0, 300);
  return "";
}
