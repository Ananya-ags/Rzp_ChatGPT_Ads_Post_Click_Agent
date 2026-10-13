/**
 * AI console "Restart session": clears this browser's session cookies, including the httpOnly ones the page can't
 * touch (ad oppref, visitor id). Only ever affects the caller's own browser.
 */
const COOKIES = ["cosmos_oppref", "cosmos_vid", "cosmos_user", "cosmos_bag", "cosmos_prefs", "cosmos_orders", "cosmos_approved"];

export async function POST() {
  const headers = new Headers({ "content-type": "application/json" });
  for (const c of COOKIES) headers.append("set-cookie", `${c}=; Path=/; Max-Age=0; SameSite=Lax`);
  return new Response(JSON.stringify({ ok: true, cleared: COOKIES }), { headers });
}
