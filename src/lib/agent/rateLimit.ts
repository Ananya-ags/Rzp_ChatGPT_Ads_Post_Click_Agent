/**
 * In-memory rate limit for /api/chat (guardrail G4): 40 messages per 10 minutes per visitor, keyed on the visitor
 * cookie; the IP is used only when there's no cookie yet (judges may share an office network). Over the limit, the
 * chat switches to quick answers rather than refusing.
 * Limitation: memory is per server instance, so on Vercel each instance counts separately and resets on a cold start.
 */
export const VISITOR_COOKIE = "cosmos_vid";
export const DEMO_COOKIE = "cosmos_demo";
const LIMIT = Number(process.env.RATE_LIMIT_PER_10_MIN) || 40; // override only for testing
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

const readCookie = (req: Request, name: string) => (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([\\w-]{8,128})`))?.[1] ?? null;

export function visitorKey(req: Request): { key: string; newVisitorId: string | null } {
  const vid = readCookie(req, VISITOR_COOKIE);
  if (vid) return { key: `vid:${vid}`, newVisitorId: null };
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  return { key: `ip:${ip}`, newVisitorId: crypto.randomUUID() };
}

/** Records one message; returns false when the visitor is over the limit. */
export function allowMessage(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k); // prune idle visitors
  return recent.length <= LIMIT; // fast-path chips never reach this (they cost nothing), so only model calls count
}

/** SHA-256 hex, so cookies hold a hash of the demo token, never the token itself. */
export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the request carries the demo-bypass session cookie set by src/proxy.ts (video recording only). */
export async function hasDemoBypass(req: Request) {
  const token = process.env.DEMO_BYPASS_TOKEN;
  const cookie = readCookie(req, DEMO_COOKIE);
  return !!token && !!cookie && cookie === (await sha256Hex(token));
}
