"use client";
/**
 * Checkout (Option B): four simulated Magic Checkout-style steps (contact, address, offers, payment method), then
 * the real Razorpay Standard Checkout in Test Mode for the payment. Every amount comes from the server
 * (/api/checkout/quote, priced from the bag cookie); the browser only sends choices. COD skips Razorpay. Mock mode
 * (no keys, or Checkout.js blocked) uses a clearly labelled simulated payment.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { readState, writeState } from "@/lib/state";
import { saveOrder, type ConfirmedOrder } from "@/lib/orders";

type Quote = {
  lines: { sku: string; title: string; qty: number; unit_inr: number; line_inr: number }[];
  count: number;
  pincode: string;
  city: string | null;
  arrives_label: string | null;
  subtotal_inr: number;
  applied: { id: string; label: string; amount_inr: number }[];
  discount_inr: number;
  cap: { max_pct: number; max_flat_inr: number };
  coupon: { code: string; valid: boolean; message: string } | null;
  bank_offer: { available: boolean; on: boolean; label: string };
  wallet: { available: boolean; balance_inr: number; usable_inr: number; on: boolean };
  shipping_inr: number;
  cod_fee_inr: number;
  gift_wrap_inr: number;
  payable_inr: number;
  online_payable_inr: number;
  cod_payable_inr: number;
  saved_inr: number;
  cod: { eligible: boolean; fee_inr: number; note: string };
  prepaid_nudge: { text: string } | null;
  emi_available: boolean;
  payments_mode: "test" | "mock";
  key_id: string | null;
};
type Prefill = { name: string; email_masked: string; phone_masked: string; address: { label: string; line1: string; city: string; pincode: string }; wallet_inr: number };
type Method = "upi" | "card" | "netbanking" | "wallet" | "emi" | "cod";
type Step = 0 | 1 | 2 | 3;

const STEPS = ["Contact", "Address", "Offers", "Payment"];
const METHODS: { id: Method; label: string; sub?: string }[] = [
  { id: "upi", label: "UPI", sub: "Any UPI app" },
  { id: "card", label: "Debit or credit card" },
  { id: "netbanking", label: "Netbanking" },
  { id: "wallet", label: "Wallets" },
  { id: "emi", label: "EMI / Pay Later", sub: "On bags over ₹3,000" },
  { id: "cod", label: "Cash on delivery" },
];
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: unknown) => void) => void };
  }
}

/** Loads Checkout.js once; resolves false if it's blocked or fails (then the flow falls back to mock). */
function loadCheckoutJs(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    const t = setTimeout(() => resolve(!!window.Razorpay), 8000);
    s.onload = () => { clearTimeout(t); resolve(!!window.Razorpay); };
    s.onerror = () => { clearTimeout(t); resolve(false); };
    document.body.appendChild(s);
  });
}

export default function CheckoutFlow(p: {
  loggedIn: { phone: string; prefill: Prefill } | null;
  adGroupId: string | null;
  arm: string;
  giftWrap: boolean;
  backHref: string;
  badges: { buyer: string; trusted: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  // contact
  const [phone, setPhone] = useState(p.loggedIn?.phone ?? "");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [contactNote, setContactNote] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(p.loggedIn?.prefill ?? null);
  const [email, setEmail] = useState("");
  // address
  const [useSaved, setUseSaved] = useState(!!p.loggedIn);
  const [addr, setAddr] = useState({ name: "", pincode: "", city: "", line1: "" });
  const [addrNote, setAddrNote] = useState<string | null>(null);
  // offers + payment
  const [walletOn, setWalletOn] = useState(true);
  const [bankCard, setBankCard] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("upi");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payNote, setPayNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mockPay, setMockPay] = useState<{ token: string; amount: number; reason: string } | null>(null);
  const reqId = useRef(0);

  const pincode = useSaved && prefill ? prefill.address.pincode : /^\d{6}$/.test(addr.pincode) ? addr.pincode : null;
  const isCod = method === "cod";

  // the bag cookie mirrors the browser's bag (older sessions may not have it yet)
  useEffect(() => {
    writeState({ cart: readState().cart });
  }, []);

  const refresh = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const r = await fetch("/api/checkout/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pincode, method: isCod ? "cod" : "online", walletOn, bankCard: bankCard && !isCod, coupon, adGroupId: p.adGroupId, giftWrap: p.giftWrap }) });
      const q = (await r.json()) as Quote;
      if (id === reqId.current) setQuote(q);
    } catch {}
  }, [pincode, isCod, walletOn, bankCard, coupon, p.adGroupId, p.giftWrap]);
  useEffect(() => {
    // re-price on the server whenever a choice changes (setQuote runs after the fetch, not synchronously)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  /* ── step 1: contact ── */
  const digits = phone.replace(/\D/g, "").slice(-10);
  const submitPhone = async () => {
    setContactNote(null);
    if (p.loggedIn) return setStep(1);
    const r = await (await fetch("/api/checkout/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: digits }) })).json();
    if (!r.ok) return setContactNote(r.error);
    if (r.recognised) setOtpSent(true);
    else {
      setPrefill(null);
      setUseSaved(false);
      setStep(1); // guest checkout: no OTP
    }
  };
  const submitOtp = async () => {
    setContactNote(null);
    const r = await (await fetch("/api/checkout/otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: digits, otp }) })).json();
    if (!r.ok) return setContactNote(r.error ?? "That code isn't right. Try again.");
    setPrefill(r.prefill);
    setUseSaved(true);
    writeState({ loggedIn: true });
    setContactNote("Saved details found (simulated)");
    void refresh();
    setTimeout(() => setStep(1), 700);
  };

  /* ── step 2: address ── */
  const submitAddress = () => {
    setAddrNote(null);
    if (!useSaved || !prefill) {
      if (!addr.name.trim() || !addr.line1.trim() || !addr.city.trim()) return setAddrNote("Please fill in your name, address and city.");
      if (!/^\d{6}$/.test(addr.pincode)) return setAddrNote("Enter a 6-digit pincode.");
    }
    setStep(2);
  };

  /* ── pay ── */
  const finish = (order: ConfirmedOrder) => {
    saveOrder(order);
    writeState({ cart: [] }); // clear the bag after success
    router.push(`/order/${encodeURIComponent(order.id)}`);
  };
  const verify = async (payload: Record<string, unknown>) => {
    const r = await (await fetch("/api/checkout/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })).json().catch(() => ({ ok: false }));
    if (!r.ok) {
      setBusy(false);
      setPayNote("We couldn't confirm the payment. Your bag is safe; please try again.");
      return;
    }
    finish(r.order as ConfirmedOrder);
  };
  const createOrder = async (forceMock = false) => {
    const contact = { name: prefill?.name ?? addr.name, phone: digits, email };
    const address = useSaved && prefill ? { ...prefill.address, name: prefill.name } : addr;
    const r = await fetch("/api/checkout/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pincode, method: isCod ? "cod" : "online", walletOn, bankCard: bankCard && !isCod, coupon, adGroupId: p.adGroupId, giftWrap: p.giftWrap, arm: p.arm, contact, address, forceMock }) });
    return r.json();
  };
  const pay = async () => {
    if (!quote || busy) return;
    setBusy(true);
    setPayNote(null);
    // online in test mode: Checkout.js must load first, else this payment is simulated (mock) with a note
    const jsOk = !isCod && quote.payments_mode === "test" ? await loadCheckoutJs() : true;
    const o = await createOrder(!isCod && quote.payments_mode === "test" && !jsOk).catch(() => ({ ok: false }));
    if (!o.ok) {
      setBusy(false);
      return setPayNote(o.error ?? "We couldn't start the payment. Please try again.");
    }
    if (o.kind === "cod") return verify({ token: o.token });
    if (o.kind === "mock") {
      setBusy(false);
      return setMockPay({ token: o.token, amount: o.amount / 100, reason: o.fallback === "checkout_js_unavailable" ? "Razorpay couldn't load here, so this payment is simulated." : "Payments are in mock mode (no test keys), so this payment is simulated." });
    }
    const rzp = new window.Razorpay!({
      key: o.key_id,
      order_id: o.order_id,
      amount: o.amount,
      currency: o.currency,
      name: "Cosmos",
      description: "Cosmos order (Test Mode)",
      prefill: { ...o.prefill, method: method === "emi" ? "emi" : method === "card" ? "card" : method === "netbanking" ? "netbanking" : method === "wallet" ? "wallet" : "upi" },
      theme: { color: "#8c6524" },
      // UPI first
      config: { display: { blocks: { upi: { name: "Pay with UPI", instruments: [{ method: "upi" }] } }, sequence: ["block.upi"], preferences: { show_default_blocks: true } } },
      modal: {
        ondismiss: () => {
          setBusy(false);
          setPayNote("Payment didn't go through. Try UPI?");
          setMethod("upi");
        },
      },
      handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void verify({ token: o.token, ...resp }),
    });
    rzp.on("payment.failed", () => {
      setPayNote("Payment didn't go through. Try UPI?");
      setMethod("upi");
    });
    rzp.open();
  };

  const progress = (
    <ol className="flex items-center gap-1.5 px-4 pt-3" aria-label="Checkout steps">
      {STEPS.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 flex-col gap-1" aria-current={i === step ? "step" : undefined}>
          <span className={`h-1 rounded-full ${i <= step ? "bg-ink" : "bg-line"}`} />
          <span className={`truncate text-[11px] ${i === step ? "font-medium text-ink" : "text-muted"}`}>{s}</span>
        </li>
      ))}
    </ol>
  );

  const total = quote ? (isCod ? quote.cod_payable_inr : quote.online_payable_inr) : null;

  return (
    <div className="min-h-full bg-ivory pb-40">
      <header className="flex items-center justify-between px-4 pt-4">
        <Link href={p.backHref} className="text-[13px] text-muted underline underline-offset-2">
          ← Bag
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/cosmos-logo-v4.png" alt="Cosmos" className="h-5 w-auto" />
        <span className="w-10" />
      </header>
      <h1 className="px-4 pt-3 font-display text-[24px]">Checkout</h1>
      <p className="mx-4 mt-2 rounded-lg bg-sand/70 px-3 py-2 text-[11px] leading-snug text-muted" data-simulated-note>
        Checkout steps simulated to show Magic Checkout features · payment uses Razorpay Test Mode
      </p>
      {progress}

      {/* order summary strip */}
      {quote && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px]">
          <span>
            {quote.count} {quote.count === 1 ? "item" : "items"}
            {quote.arrives_label ? <span className="text-success"> · Arrives by {quote.arrives_label}</span> : null}
          </span>
          <span className="font-medium">{total !== null ? inr(total) : ""}</span>
        </div>
      )}
      {quote && quote.count === 0 && (
        <p className="mx-4 mt-4 text-[13.5px]">
          Your bag is empty. <Link href={p.backHref} className="underline">Back to the bag</Link>
        </p>
      )}

      <section className="mx-4 mt-4 rounded-2xl border border-line bg-white p-4">
        {/* ── step 1 ── */}
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="font-display text-[19px]">Your phone number</h2>
            <p className="text-[12.5px] text-muted">For delivery updates by SMS. No account needed.</p>
            {!otpSent ? (
              <>
                <label className="block text-[12px] text-muted" htmlFor="co-phone">Mobile number</label>
                <div className="flex h-12 items-center rounded-xl border border-line bg-white px-3 focus-within:border-gold">
                  <span className="pr-2 text-[14px] text-muted">+91</span>
                  <input id="co-phone" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} disabled={!!p.loggedIn} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" placeholder="10-digit number" />
                </div>
                <label className="block text-[12px] text-muted" htmlFor="co-email">Email (optional, for the receipt)</label>
                <input id="co-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-xl border border-line px-3 text-[16px] outline-none focus:border-gold" />
                {p.loggedIn && <p className="text-[12px] text-success">Logged in · saved details ready (simulated)</p>}
                <button onClick={submitPhone} disabled={!p.loggedIn && digits.length !== 10} className="h-12 w-full rounded-full bg-ink text-[14px] font-medium text-ivory disabled:opacity-40">
                  Continue
                </button>
                <p className="text-[11px] text-muted">Demo: 99999 99999 is a recognised number (OTP 123456). Any other number checks out as a guest.</p>
              </>
            ) : (
              <>
                <label className="block text-[12px] text-muted" htmlFor="co-otp">Enter the 6-digit code sent to +91 {digits.slice(0, 5)} {digits.slice(5)}</label>
                <input id="co-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} className="h-12 w-full rounded-xl border border-line px-3 text-[18px] tracking-[0.3em] outline-none focus:border-gold" />
                <div className="flex gap-2">
                  <button onClick={submitOtp} disabled={otp.length !== 6} className="h-12 flex-1 rounded-full bg-ink text-[14px] font-medium text-ivory disabled:opacity-40">
                    Verify
                  </button>
                  <button onClick={() => { setOtp(""); setContactNote("Code sent again (simulated)."); }} className="h-12 rounded-full border border-line px-4 text-[13px]">
                    Resend
                  </button>
                </div>
              </>
            )}
            {contactNote && <p className={`text-[12.5px] ${/found|sent again/.test(contactNote) ? "text-success" : "text-ink"}`} role="status">{contactNote}</p>}
          </div>
        )}

        {/* ── step 2 ── */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="font-display text-[19px]">Delivery address</h2>
            {prefill && (
              <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${useSaved ? "border-ink" : "border-line"}`}>
                <input type="radio" name="addr" checked={useSaved} onChange={() => setUseSaved(true)} className="mt-1" />
                <span className="text-[13px] leading-snug">
                  <b>{prefill.address.label}</b> · {prefill.name}
                  <br />
                  {prefill.address.line1}, {prefill.address.city} {prefill.address.pincode}
                  <br />
                  <span className="text-[11px] text-muted">Saved address (simulated)</span>
                </span>
              </label>
            )}
            {prefill && (
              <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${!useSaved ? "border-ink" : "border-line"}`}>
                <input type="radio" name="addr" checked={!useSaved} onChange={() => setUseSaved(false)} className="mt-1" />
                <span className="text-[13px]">Add a new address</span>
              </label>
            )}
            {(!prefill || !useSaved) && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: "name", label: "Full name", span: 2, ac: "name" },
                  { k: "pincode", label: "Pincode", span: 1, ac: "postal-code" },
                  { k: "city", label: "City", span: 1, ac: "address-level2" },
                  { k: "line1", label: "House, street, area", span: 2, ac: "street-address" },
                ].map((f) => (
                  <label key={f.k} className={`text-[12px] text-muted ${f.span === 2 ? "col-span-2" : ""}`}>
                    {f.label}
                    <input
                      value={addr[f.k as keyof typeof addr]}
                      inputMode={f.k === "pincode" ? "numeric" : "text"}
                      maxLength={f.k === "pincode" ? 6 : 120}
                      autoComplete={f.ac}
                      onChange={(e) => setAddr((a) => ({ ...a, [f.k]: f.k === "pincode" ? e.target.value.replace(/\D/g, "") : e.target.value }))}
                      className="mt-1 h-12 w-full rounded-xl border border-line px-3 text-[16px] text-ink outline-none focus:border-gold"
                    />
                  </label>
                ))}
              </div>
            )}
            {quote?.arrives_label && pincode && (
              <p className="text-[13px] text-success">
                Arrives by <b>{quote.arrives_label}</b> {quote.city ? `in ${quote.city}` : ""} · {quote.cod.eligible ? "Cash on delivery available" : "Prepaid only for this bag"}
              </p>
            )}
            {addrNote && <p className="text-[12.5px]" role="status">{addrNote}</p>}
            <button onClick={submitAddress} className="h-12 w-full rounded-full bg-ink text-[14px] font-medium text-ivory">
              Continue
            </button>
          </div>
        )}

        {/* ── step 3 ── */}
        {step === 2 && quote && (
          <div className="space-y-3">
            <h2 className="font-display text-[19px]">Offers</h2>
            {quote.applied.length ? (
              <ul className="space-y-1.5 text-[13px]">
                {quote.applied.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>✦ {a.label}</span>
                    <span className="shrink-0 text-success">−{inr(a.amount_inr)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">No offers apply to this bag right now.</p>
            )}
            <p className="text-[11px] text-muted">Best offers applied automatically · capped at {quote.cap.max_pct}% or {inr(quote.cap.max_flat_inr)} by the store</p>
            {quote.bank_offer.available && (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-[13px]">
                <span>{quote.bank_offer.label} <span className="text-[11px] text-muted">(simulated issuer)</span></span>
                <input type="checkbox" checked={bankCard} onChange={(e) => setBankCard(e.target.checked)} className="size-5" />
              </label>
            )}
            {quote.wallet.available && (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-[13px]">
                <span>
                  Use Cosmos wallet ({inr(quote.wallet.balance_inr)})
                  <span className="block text-[11px] text-muted">Up to 20% of the bag · {inr(quote.wallet.usable_inr)} usable</span>
                </span>
                <input type="checkbox" checked={walletOn} onChange={(e) => setWalletOn(e.target.checked)} className="size-5" />
              </label>
            )}
            <form onSubmit={(e) => { e.preventDefault(); setCoupon(couponInput.trim() || null); }} className="flex gap-2">
              <label htmlFor="co-coupon" className="sr-only">Coupon code</label>
              <input id="co-coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Coupon code" className="h-12 min-w-0 flex-1 rounded-xl border border-line px-3 text-[16px] uppercase outline-none focus:border-gold" />
              <button className="h-12 rounded-full border border-ink px-4 text-[13px]">Apply</button>
            </form>
            {quote.coupon && <p className={`text-[12.5px] ${quote.coupon.valid ? "text-success" : "text-muted"}`} role="status">{quote.coupon.message}</p>}
            {quote.saved_inr > 0 && <p className="rounded-lg bg-success/5 px-3 py-2 text-[13.5px] font-medium text-success">You save {inr(quote.saved_inr)}</p>}
            <button onClick={() => setStep(3)} className="h-12 w-full rounded-full bg-ink text-[14px] font-medium text-ivory">
              Continue to payment
            </button>
          </div>
        )}

        {/* ── step 4 ── */}
        {step === 3 && quote && (
          <div className="space-y-3">
            <h2 className="font-display text-[19px]">Payment method</h2>
            {quote.prepaid_nudge && (
              <p className="rounded-xl border border-gold/50 bg-gold/10 px-3 py-2.5 text-[13px] font-medium text-gold-deep" data-prepaid-nudge>
                ✦ {quote.prepaid_nudge.text}
              </p>
            )}
            <div role="radiogroup" aria-label="Payment method" className="space-y-2">
              {METHODS.filter((m) => (m.id !== "emi" || quote.emi_available) && (m.id !== "cod" || quote.cod.eligible)).map((m) => (
                <label key={m.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[13.5px] ${method === m.id ? "border-ink bg-sand/40" : "border-line"} ${m.id === "upi" && quote.prepaid_nudge ? "ring-1 ring-gold/50" : ""}`}>
                  <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} />
                  <span className="flex-1">
                    {m.label}
                    {m.sub && <span className="block text-[11px] text-muted">{m.sub}</span>}
                    {m.id === "cod" && <span className="block text-[11px] text-muted">+{inr(quote.cod.fee_inr)} fee · {quote.cod.note}</span>}
                  </span>
                  {m.id === "cod" && <span className="text-[12.5px] text-muted">{inr(quote.cod_payable_inr)}</span>}
                </label>
              ))}
            </div>
            <dl className="space-y-1 border-t border-line pt-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{inr(quote.subtotal_inr)}</dd></div>
              {quote.discount_inr > 0 && <div className="flex justify-between"><dt className="text-muted">Offers</dt><dd className="text-success">−{inr(quote.discount_inr)}</dd></div>}
              {quote.wallet.on && quote.wallet.usable_inr > 0 && <div className="flex justify-between"><dt className="text-muted">Cosmos wallet</dt><dd className="text-success">−{inr(quote.wallet.usable_inr)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">Shipping</dt><dd>{quote.shipping_inr ? inr(quote.shipping_inr) : "Free"}</dd></div>
              {quote.gift_wrap_inr > 0 && <div className="flex justify-between"><dt className="text-muted">Gift wrap</dt><dd>{inr(quote.gift_wrap_inr)}</dd></div>}
              {isCod && <div className="flex justify-between"><dt className="text-muted">Cash on delivery fee</dt><dd>{inr(quote.cod_fee_inr)}</dd></div>}
              <div className="flex justify-between pt-1 text-[15px] font-semibold"><dt>Total</dt><dd>{inr(quote.payable_inr)}</dd></div>
            </dl>
            {payNote && <p className="rounded-lg bg-sand px-3 py-2 text-[13px]" role="status">{payNote}</p>}
          </div>
        )}
      </section>

      {/* trust badges (simulated) */}
      <ul className="mx-4 mt-4 flex flex-wrap gap-2 text-[11px] text-muted" aria-label="Trust">
        <li className="rounded-full border border-line bg-white px-2.5 py-1">🛡 {p.badges.buyer}</li>
        <li className="rounded-full border border-line bg-white px-2.5 py-1">✓ {p.badges.trusted}</li>
        {quote?.emi_available && <li className="rounded-full border border-line bg-white px-2.5 py-1">EMI available (simulated)</li>}
      </ul>

      {step > 0 && step < 3 && (
        <button onClick={() => setStep((s) => (s - 1) as Step)} className="mx-4 mt-3 h-11 text-[13px] text-muted underline underline-offset-2">
          Back
        </button>
      )}
      {step === 3 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
          <button onClick={pay} disabled={busy || !quote || quote.count === 0} className="h-12 w-full rounded-full bg-ink text-[14px] font-medium text-ivory disabled:opacity-50">
            {busy ? "Opening payment…" : isCod ? `Place order · ${inr(quote?.cod_payable_inr ?? 0)} on delivery` : `Pay ${inr(quote?.online_payable_inr ?? 0)}`}
          </button>
          <button onClick={() => setStep(2)} className="mt-1 h-9 w-full text-[12px] text-muted underline underline-offset-2">Back to offers</button>
        </div>
      )}

      {/* mock mode: a clearly labelled simulated payment instead of the Razorpay modal */}
      {mockPay && (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/30" role="dialog" aria-modal="true" aria-label="Simulated payment">
          <div className="w-full rounded-t-[22px] bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Simulated payment</p>
            <p className="mt-1 font-display text-[22px]">Pay {inr(mockPay.amount)}</p>
            <p className="mt-1 text-[12.5px] text-muted">{mockPay.reason}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => { const t = mockPay.token; setMockPay(null); setBusy(true); void verify({ token: t }); }} className="h-12 flex-1 rounded-full bg-ink text-[14px] font-medium text-ivory">
                Complete simulated payment
              </button>
              <button onClick={() => { setMockPay(null); setPayNote("Payment didn't go through. Try UPI?"); setMethod("upi"); }} className="h-12 rounded-full border border-line px-4 text-[13px]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
