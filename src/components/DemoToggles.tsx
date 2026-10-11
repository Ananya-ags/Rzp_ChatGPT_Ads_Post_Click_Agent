"use client";
import { useDemoState } from "@/lib/state";

/** Demo-only switches (stored in localStorage). */
export default function DemoToggles() {
  const [s, write, ready] = useDemoState();
  if (!ready) return null;
  return (
    <div className="mt-8 rounded-2xl border border-line bg-white px-4 py-2">
      <p className="pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">Demo controls</p>
      <Row label="Pause agent (hides the chat pill)" on={s.agentPaused} set={(v) => write({ agentPaused: v })} />
      <button onClick={() => write({ cart: [], approvedProposals: [], loggedIn: false, loginOffered: false, agentPaused: false, returningVisitor: false })} className="my-2 text-[13px] text-muted underline">
        Reset demo state
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
