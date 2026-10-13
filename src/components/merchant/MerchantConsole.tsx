"use client";
/**
 * Merchant console for Cosmos (desktop-first, readable on a phone). Numbers arrive computed on the server; the
 * merchant's decisions (approve, dismiss, pause) go to the shared demo state, which product pages, the chat route
 * (via a cookie) and the mock ChatGPT already read. No model call happens here.
 */
import { useEffect, useState } from "react";
import { useDemoState } from "@/lib/state";
import { readOrders, type ConfirmedOrder } from "@/lib/orders";

export type MerchantProps = {
  period: { from: string; to: string };
  funnel: { label: string; n: number }[];
  conversion: number;
  kept: { paid: number; kept: number; lost: number; predictedShare: number };
  proposals: { id: string; title: string; summary: string; confidence: number; evidence: { label: string; value: string }[]; examples: string[]; result: string }[];
  producer: string;
  clusters: { id: string; label: string; count: number; examples: string[] }[];
  adGroupNames: Record<string, string>;
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const day = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function Simulated() {
  return <span className="rounded-full bg-sand px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wider text-muted">Simulated</span>;
}

function Panel({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-5 md:p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[20px] leading-tight">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function MerchantConsole(p: MerchantProps) {
  const [state, write, ready] = useDemoState();
  const [orders, setOrders] = useState<ConfirmedOrder[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    // orders placed in this browser session live in sessionStorage (client only)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrders(readOrders());
  }, []);

  const approved = ready ? state.approvedProposals : [];
  const dismissed = ready ? state.dismissedProposals : [];
  const pending = p.proposals.filter((x) => !approved.includes(x.id) && !dismissed.includes(x.id));
  const done = p.proposals.filter((x) => approved.includes(x.id) || dismissed.includes(x.id));
  const paused = ready && state.agentPaused;

  const approve = (id: string) => write((s) => ({ approvedProposals: [...new Set([...s.approvedProposals, id])], dismissedProposals: s.dismissedProposals.filter((x) => x !== id) }));
  const dismiss = (id: string) => write((s) => ({ dismissedProposals: [...new Set([...s.dismissedProposals, id])], approvedProposals: s.approvedProposals.filter((x) => x !== id) }));
  const undo = (id: string) => write((s) => ({ approvedProposals: s.approvedProposals.filter((x) => x !== id), dismissedProposals: s.dismissedProposals.filter((x) => x !== id) }));

  const reset = async () => {
    setResetting(true);
    setResetError(null);
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error("Demo reset request failed");
      write({ cart: [], approvedProposals: [], dismissedProposals: [], loggedIn: false, loginOffered: false, loginDismissed: false, agentPaused: false, returningVisitor: false });
      try {
        for (const key of ["cosmos-chat-v1", "cosmos-orders-v1", "cosmos-console-events"]) sessionStorage.removeItem(key);
      } catch {
        console.warn("Session storage unavailable while resetting the demo.");
      }
      window.location.reload();
    } catch (error) {
      console.error("Could not reset the demo:", error);
      setResetError("Couldn't reset the demo. Please try again.");
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 md:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/cosmos-logo-v4.png" alt="Cosmos" className="h-7 w-auto" />
          <span className="h-5 w-px bg-line" aria-hidden />
          <h1 className="text-[15px] font-medium">Merchant console</h1>
          <span className="text-[13px] text-muted">ChatGPT ads · {day(p.period.from)} – {day(p.period.to)} 2026</span>
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium ${paused ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}
            aria-live="polite"
          >
            <span aria-hidden className={`size-1.5 rounded-full ${paused ? "bg-danger" : "bg-success"}`} />
            Cosmos AI {paused ? "Paused" : "On"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        {/* summary strip */}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr_0.8fr]" data-testid="summary">
          <section className="rounded-2xl border border-line bg-white p-5 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-muted">Ad-click-to-order conversion · ChatGPT ads</p>
              <Simulated />
            </div>
            <p className="mt-1 font-display text-[44px] leading-none md:text-[52px]">{pct(p.conversion)}</p>
            <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {p.funnel.map((f, i) => (
                <li key={f.label} className="rounded-xl bg-ivory px-3 py-2.5">
                  <p className="text-[12px] text-muted">{f.label}</p>
                  <p className="text-[18px] font-semibold tabular-nums">{f.n.toLocaleString("en-IN")}</p>
                  <p className="text-[11.5px] text-gold-deep">{i === 0 ? "100%" : `${pct(f.n / p.funnel[0].n)} of clicks`}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium text-muted">Kept revenue · ChatGPT ads</p>
              <Simulated />
            </div>
            <p className="mt-1 font-display text-[34px] leading-none">{inr(p.kept.kept)}</p>
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Paid {inr(p.kept.paid)} − refunds and RTO {inr(p.kept.lost)}
            </p>
            <p className="mt-1 text-[12px] text-muted">Using predicted returns for recent orders ({pct(p.kept.predictedShare, 0)} still in the return window).</p>
          </section>
          <section className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-white p-5 md:p-6 lg:grid-cols-1">
            <div>
              <p className="text-[13px] font-medium text-muted">Proposals waiting</p>
              <p className="mt-1 font-display text-[34px] leading-none">{ready ? pending.length : "–"}</p>
            </div>
            <div>
              <p className="text-[13px] font-medium text-muted">Agent status</p>
              <p className={`mt-1 text-[20px] font-semibold ${paused ? "text-danger" : "text-success"}`}>{paused ? "Paused" : "On"}</p>
            </div>
          </section>
        </div>

        {/* proposals inbox */}
        <Panel title="Proposals inbox" aside={<p className="text-[12.5px] text-muted">From what shoppers asked Cosmos AI, returns and ad results. Nothing changes until you approve.</p>}>
          {ready && pending.length === 0 && <p className="text-[14px] text-muted">Inbox clear. Approved and dismissed proposals are under Done.</p>}
          <ul className="space-y-4">
            {(ready ? pending : p.proposals).map((x) => (
              <li key={x.id} className="rounded-xl border border-line p-4 md:p-5" data-testid="proposal">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="max-w-3xl text-[16.5px] font-semibold leading-snug">{x.title}</h3>
                  <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[12px] font-medium text-gold-deep">Confidence {Math.round(x.confidence * 100)}%</span>
                </div>
                <p className="mt-2 max-w-4xl text-[14px] leading-relaxed text-ink/85">{x.summary}</p>
                <details className="group mt-3">
                  <summary className="cursor-pointer list-none text-[13px] font-medium text-gold-deep marker:hidden">
                    <span className="group-open:hidden">Show evidence ▾</span>
                    <span className="hidden group-open:inline">Hide evidence ▴</span>
                  </summary>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <dl className="space-y-1.5 text-[13px]">
                      {x.evidence.map((e) => (
                        <div key={e.label} className="flex gap-2">
                          <dt className="w-44 shrink-0 text-muted">{e.label}</dt>
                          <dd>{e.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {x.examples.length > 0 && (
                      <div>
                        <p className="text-[12px] font-medium uppercase tracking-wider text-muted">What shoppers said</p>
                        <ul className="mt-1.5 space-y-1.5">
                          {x.examples.map((m) => (
                            <li key={m} className="rounded-lg bg-ivory px-3 py-1.5 text-[13px] italic">&ldquo;{m}&rdquo;</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button onClick={() => approve(x.id)} disabled={!ready} className="rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-ivory hover:bg-ink/90 disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => dismiss(x.id)} disabled={!ready} className="rounded-full border border-line px-4 py-2 text-[13.5px] font-medium hover:border-ink/40 disabled:opacity-50">
                    Dismiss
                  </button>
                  <p className="ml-auto text-[11.5px] text-muted">AI-generated · {p.producer}</p>
                </div>
              </li>
            ))}
          </ul>
          {ready && done.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[12px] font-medium uppercase tracking-wider text-muted">Done</h3>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line" data-testid="done">
                {done.map((x) => {
                  const ok = approved.includes(x.id);
                  return (
                    <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${ok ? "bg-success/10 text-success" : "bg-sand text-muted"}`}>{ok ? "Approved" : "Dismissed"}</span>
                      <span className="text-[14px] font-medium">{x.title}</span>
                      {ok && <span className="w-full text-[13px] text-muted sm:w-auto">→ {x.result}</span>}
                      <button onClick={() => undo(x.id)} className="ml-auto text-[13px] font-medium text-gold-deep underline underline-offset-2">
                        Undo
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="What shoppers asked" aside={<Simulated />}>
            <ul className="space-y-3">
              {p.clusters.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <span className="w-10 shrink-0 text-right text-[15px] font-semibold tabular-nums">{c.count}</span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">{c.label}</p>
                    <p className="text-[13px] text-muted">{c.examples.map((e) => `“${e}”`).join(" · ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="space-y-6">
            <Panel title="Orders from this session" aside={<span className="text-[12px] text-muted">Razorpay Test Mode</span>}>
              {orders.length === 0 ? (
                <p className="text-[14px] text-muted">Place a test order in the shop to see it here.</p>
              ) : (
                <ul className="divide-y divide-line" data-testid="session-orders">
                  {[...orders].reverse().map((o) => (
                    <li key={o.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-[13.5px]">
                      <span className="font-semibold tabular-nums">{inr(o.payable_inr)}</span>
                      <span>{o.attribution.ad_group === "direct" ? "Direct visit" : p.adGroupNames[o.attribution.ad_group] ?? o.attribution.ad_group}</span>
                      <span className="text-muted">{o.payment_method}</span>
                      <span className="ml-auto font-mono text-[12px] text-muted">{o.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Controls">
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-[14px] font-medium">Pause Cosmos AI</span>
                  <span className="block text-[12.5px] text-muted">Site-wide: shoppers see the curated pages without the chat.</span>
                </span>
                <button
                  role="switch"
                  aria-checked={paused}
                  aria-label="Pause Cosmos AI"
                  disabled={!ready}
                  onClick={() => write({ agentPaused: !state.agentPaused })}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${paused ? "bg-danger" : "bg-line"}`}
                >
                  <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${paused ? "left-6" : "left-1"}`} />
                </button>
              </label>
              <div className="mt-5 border-t border-line pt-4">
                {!confirmReset ? (
                  <button onClick={() => setConfirmReset(true)} className="text-[13.5px] font-medium text-muted underline underline-offset-2 hover:text-ink">
                    Reset demo
                  </button>
                ) : (
                  <div role="group" aria-label="Confirm reset" className="rounded-xl bg-ivory p-3">
                    <p className="text-[13.5px]">Reset the demo? This clears approvals, the bag, the chat, test orders and login.</p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => void reset()} disabled={resetting} className="rounded-full bg-ink px-4 py-1.5 text-[13px] font-medium text-ivory disabled:opacity-50">
                        {resetting ? "Resetting…" : "Reset everything"}
                      </button>
                      <button onClick={() => setConfirmReset(false)} disabled={resetting} className="rounded-full border border-line px-4 py-1.5 text-[13px] font-medium">
                        Cancel
                      </button>
                    </div>
                    {resetError && <p role="alert" className="mt-2 text-[13px] text-danger">{resetError}</p>}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 md:px-8">
        <p className="text-[12px] text-muted">Powered by Razorpay Engage · Cosmos is a fictional brand; all shopper, order and ad data is simulated.</p>
      </footer>
    </div>
  );
}
