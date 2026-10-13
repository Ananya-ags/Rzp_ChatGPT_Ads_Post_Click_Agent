"use client";
import { useDemoState } from "@/lib/state";
import { PROPOSAL } from "@/lib/overrides";

/** Start page stand-in for the merchant's Approve: the same demo-state approval the merchant console writes. */
export default function ApproveSteelAd() {
  const [s, write, ready] = useDemoState();
  const on = ready && s.approvedProposals.includes(PROPOSAL.steelAd);
  return (
    <label className="flex h-full cursor-pointer flex-col rounded-2xl border border-[#DCE3EE] bg-white p-5 transition hover:border-[#3395FF] hover:shadow-[0_6px_24px_rgba(7,38,84,0.08)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#3395FF]">
      <span className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={on}
          disabled={!ready}
          onChange={(e) =>
            write((cur) => ({ approvedProposals: e.target.checked ? [...new Set([...cur.approvedProposals, PROPOSAL.steelAd])] : cur.approvedProposals.filter((x) => x !== PROPOSAL.steelAd) }))
          }
          className="mt-0.5 size-5 shrink-0 accent-[#3395FF]"
        />
        <span className="text-[16px] font-semibold leading-snug text-[#072654]">Merchant approves a new ad for sensitive ears</span>
      </span>
      <span className="mt-2 text-[14px] leading-relaxed text-[#4A5A72]">
        Once the merchant approves a new ad based on the agent&apos;s suggestion, it appears in ChatGPT under the third conversation, &lsquo;Earrings for sensitive ears&rsquo;.
      </span>
      <span className={`mt-auto pt-3 text-[12.5px] font-medium ${on ? "text-[#1A7F4E]" : "text-[#4A5A72]"}`} aria-live="polite">
        {on ? "✓ Approved · ad live in ChatGPT" : "Not approved yet"}
      </span>
    </label>
  );
}
