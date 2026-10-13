/**
 * Checkout step 1 (simulated "phone recognised by the network"): the demo number asks for an OTP; the right OTP
 * logs the shopper in (the same cookie as /login) and returns her saved details. Any other valid number is a guest.
 */
import { getDb } from "@/lib/data";
import { USER_COOKIE, personaFromDb } from "@/lib/user";

export async function POST(req: Request) {
  const { phone = "", otp }: { phone?: string; otp?: string } = await req.json().catch(() => ({}));
  const digits = String(phone).replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) return Response.json({ ok: false, error: "Enter a valid 10-digit mobile number." });
  const demo = getDb().shoppers.tier3_demo;
  if (digits !== demo.demo_login_phone) return Response.json({ ok: true, recognised: false });
  if (!otp) return Response.json({ ok: true, recognised: true, otp_sent: true });
  if (String(otp).trim() !== demo.otp_for_demo) return Response.json({ ok: false, recognised: true, error: "That code isn't right. Try again." });
  const p = personaFromDb();
  const body = { ok: true, recognised: true, verified: true, prefill: { name: p.firstName, email_masked: p.emailMasked, phone_masked: p.phoneMasked, address: p.address, wallet_inr: p.walletInr, payment_methods: p.paymentMethods } };
  return Response.json(body, { headers: { "set-cookie": `${USER_COOKIE}=ananya; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax` } });
}
