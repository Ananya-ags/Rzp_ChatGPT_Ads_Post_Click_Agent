/**
 * Merchant approvals that change what shoppers see (no database). The browser keeps the approved proposal ids in
 * demo state and mirrors them to a cookie, so server pages and the chat route apply the same overrides.
 */
export const APPROVED_COOKIE = "cosmos_approved";

export const PROPOSAL = {
  steelAd: "prop-new-ad-group-steel-earrings",
  waterproof: "prop-feed-waterproof",
  layeredOffice: "prop-rule-exclude-sol-layered-chain-set-office-minimal",
  pauseWedding: "prop-pause-wedding-guest-gift",
} as const;

/** Ad groups whose agent the merchant paused (approved pause_context proposals). */
export const PAUSED_AD_GROUPS: Record<string, string> = { [PROPOSAL.pauseWedding]: "wedding-guest-gift" };

export function pausedAdGroups(approved: string[]) {
  return approved.map((id) => PAUSED_AD_GROUPS[id]).filter(Boolean);
}

/** Parse the cookie value (comma-separated ids); never throws. */
export function readApprovedCookie(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    return decodeURIComponent(raw).split(",").map((s) => s.trim()).filter((s) => /^prop-[a-z0-9-]+$/.test(s)).slice(0, 20);
  } catch {
    return [];
  }
}

export function approvedFromCookieHeader(header: string | null) {
  return readApprovedCookie(header?.match(new RegExp(`(?:^|;\\s*)${APPROVED_COOKIE}=([^;]+)`))?.[1]);
}
