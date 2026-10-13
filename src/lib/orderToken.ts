/**
 * A signed, stateless order record: the order route signs what the server computed, the verify route checks the
 * signature before trusting it. Works across serverless instances (no server memory). Signed with HMAC-SHA256
 * using the Razorpay key secret (or ORDER_TOKEN_SECRET); in mock mode without either, a per-process random key.
 */
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const fallback = randomBytes(32).toString("hex");
const key = () => process.env.ORDER_TOKEN_SECRET || process.env.RAZORPAY_KEY_SECRET || fallback;

export function signRecord(record: unknown): string {
  const body = Buffer.from(JSON.stringify(record)).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

export function readRecord<T>(token: string): T | null {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
