"use client";
/** Phone + OTP login (simulated). Only the demo account exists; on success a cookie personalises every page. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { writeState } from "@/lib/state";

const COOKIE = "cosmos_user";

export default function LoginForm({ next, loggedInAs, demo }: { next: string; loggedInAs: string | null; demo: { phone: string; otp: string; firstName: string } }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp" | "done">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, "");

  const sendOtp = () => {
    if (digits.length !== 10) return setError("Enter a 10-digit mobile number.");
    if (digits !== demo.phone) return setError("No account found for this number. Use the demo number below.");
    setError(null);
    setStep("otp");
  };
  const verify = () => {
    if (otp !== demo.otp) return setError("That code isn't right. Try again.");
    try {
      document.cookie = `${COOKIE}=ananya; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
    } catch {}
    writeState({ agentPaused: false, loggedIn: true }); // a fresh session always has Cosmos AI on
    setStep("done");
    setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 900);
  };
  const logout = () => {
    try {
      document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
    } catch {}
    writeState({ agentPaused: false, loggedIn: false });
    router.refresh();
  };

  return (
    <div className="min-h-full bg-ivory px-5 pb-10 pt-6">
      <div className="flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/cosmos-logo-v4.png" alt="Cosmos" className="h-6 w-auto md:h-[30px]" />
        <Link href={next} className="text-[13px] text-muted underline underline-offset-2">
          Back to shopping
        </Link>
      </div>

      {loggedInAs && step !== "done" ? (
        <div className="mt-10 rounded-2xl border border-line bg-white p-5 text-center">
          <span className="ai-badge mx-auto grid size-12 place-items-center rounded-full text-[20px] font-semibold text-[#3a2a10]">{loggedInAs[0]}</span>
          <p className="mt-3 font-display text-[20px]">You&apos;re logged in</p>
          <p className="mt-1 text-[13px] text-muted">Pages are personalised for you.</p>
          <div className="mt-5 flex gap-2">
            <Link href={next} className="h-11 flex-1 content-center rounded-full bg-ink text-[14px] font-medium text-ivory">
              Continue shopping
            </Link>
            <button onClick={logout} className="h-11 flex-1 rounded-full border border-ink/70 text-[14px] font-medium">
              Log out
            </button>
          </div>
        </div>
      ) : step === "done" ? (
        <div className="mt-16 text-center">
          <span className="ai-badge mx-auto grid size-14 place-items-center rounded-full text-[24px] text-[#3a2a10]">✓</span>
          <p className="mt-4 font-display text-[24px]">Welcome back</p>
          <p className="mt-1 text-[13px] text-muted">Taking you back…</p>
        </div>
      ) : (
        <>
          <h1 className="mt-8 font-display text-[28px] leading-tight">Log in</h1>
          <p className="mt-1 text-[14px] text-muted">Faster checkout, your saved address and offers picked for you.</p>

          {step === "phone" ? (
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                sendOtp();
              }}
            >
              <label className="text-[12px] text-muted" htmlFor="login-phone">
                Mobile number
              </label>
              <div className="mt-1 flex h-12 items-center rounded-xl border border-line bg-white px-3 focus-within:border-gold">
                <span className="pr-2 text-[15px] text-muted">+91</span>
                <input id="login-phone" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" className="h-full flex-1 bg-transparent text-[15px] outline-none" />
              </div>
              {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
              <button className="mt-4 h-12 w-full rounded-full bg-ink text-[15px] font-medium text-ivory">Send OTP</button>
            </form>
          ) : (
            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                verify();
              }}
            >
              <p className="text-[13px]">
                Enter the 6-digit code sent to <b>+91 {digits.slice(0, 5)} {digits.slice(5)}</b>{" "}
                <button type="button" onClick={() => setStep("phone")} className="text-gold-deep underline underline-offset-2">
                  Change
                </button>
              </p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                className="mt-3 h-12 w-full rounded-xl border border-line bg-white text-center text-[20px] tracking-[0.5em] outline-none focus:border-gold"
              />
              {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
              <button className="mt-4 h-12 w-full rounded-full bg-ink text-[15px] font-medium text-ivory">Verify &amp; log in</button>
            </form>
          )}

          <div className="mt-8 rounded-xl border border-dashed border-gold/50 bg-white/70 p-3.5 text-[12.5px]">
            <p className="font-medium text-gold-deep">Demo account (simulated)</p>
            <p className="mt-1">
              Mobile <b>{demo.phone.slice(0, 5)} {demo.phone.slice(5)}</b> · OTP <b>{demo.otp}</b>
            </p>
            <p className="mt-1 text-[11.5px] text-muted">A fictional shopper with past orders, a saved address in Pune and a ₹300 wallet.</p>
          </div>
        </>
      )}
    </div>
  );
}
