/**
 * Demo bypass (for recording the video only): opening any page with ?demo=<DEMO_BYPASS_TOKEN> sets a session cookie
 * that skips the chat rate limit. The cookie holds a hash of the token, never the token, and the parameter is always
 * removed from the address bar (redirect) so it can't end up in a shared link. Runs only when ?demo is present.
 */
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, sha256Hex } from "@/lib/agent/rateLimit";

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const given = url.searchParams.get("demo");
  url.searchParams.delete("demo");
  const res = NextResponse.redirect(url);
  const token = process.env.DEMO_BYPASS_TOKEN;
  if (token && given === token) res.cookies.set(DEMO_COOKIE, await sha256Hex(token), { httpOnly: true, sameSite: "lax", path: "/" }); // session cookie
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/|api/|favicon).*)", has: [{ type: "query", key: "demo" }] }],
};
