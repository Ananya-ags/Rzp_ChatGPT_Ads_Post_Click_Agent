"use client";
import { useDemoState } from "@/lib/state";

/**
 * Demo-only switches (stored in localStorage). Until the merchant console exists, "approve" here stands in for its
 * Approve button: approving a new-ad-group proposal unlocks that ad in the mock ChatGPT.
 */
export default function DemoToggles({ proposals = [] }: { proposals?: { id: string; title: string }[] }) {
  const [s, write, ready] = useDemoState();
  if (!ready) return null;
  return (
    <div className="mt-8 rounded-2xl border border-line bg-white px-4 py-2">
      <p className="pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">Demo controls</p>
      <Row label="Store control: pause Cosmos AI on product pages" on={s.agentPaused} set={(v) => write({ agentPaused: v })} />
      {proposals.map((p) => (
        <Row
          key={p.id}
          label={`Merchant (stand-in for the console): approve "${p.title}" → new ad`}
          on={s.approvedProposals.includes(p.id)}
          set={(v) => write((cur) => ({ approvedProposals: v ? [...new Set([...cur.approvedProposals, p.id])] : cur.approvedProposals.filter((x) => x !== p.id) }))}
        />
      ))}
      <button
        onClick={() => {
          write({ cart: [], approvedProposals: [], loggedIn: false, loginOffered: false, loginDismissed: false, agentPaused: false, returningVisitor: false });
          try {
            document.cookie = "cosmos_user=; path=/; max-age=0; samesite=lax";
          } catch {}
        }}
        className="my-2 text-[13px] text-muted underline"
      >
        Reset demo state (also logs out)
      </button>
    </div>
  );
}

function Row({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 text-[14px]">
      {label}
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="size-4 accent-[#1f1a17]" />
    </label>
  );
}
