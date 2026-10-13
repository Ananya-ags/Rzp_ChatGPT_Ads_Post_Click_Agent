// Checkout flows at 390px with Playwright: real Razorpay Test Mode (test bank page) and mock mode.
//   node scripts/tests/checkout-browser.mjs <test-mode base> <mock-mode base> <out dir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const MOCK = process.argv[3] || 'http://localhost:3600';
const OUT = process.argv[4] || '.cache/checkout-browser';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

const b = await chromium.launch({ channel: 'chrome', headless: true });
const fresh = async () => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  return { ctx, p: await ctx.newPage() };
};
const setBag = async (p, base, cart) => {
  await p.goto(`${base}/shop`);
  await p.evaluate((c) => localStorage.setItem('cosmos-demo-state-v1', JSON.stringify({ cart: c })), cart);
};
const bag = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('cosmos-demo-state-v1') || '{}').cart ?? []);
const guestToPayment = async (p, pin = '400050', city = 'Mumbai') => {
  await p.fill('#co-phone', '9123456780');
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.fill('input[autocomplete=name]', 'Test Shopper');
  await p.fill('input[autocomplete=postal-code]', pin);
  await p.fill('input[autocomplete=address-level2]', city);
  await p.fill('input[autocomplete=street-address]', '12 Test Road');
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByRole('button', { name: 'Continue to payment' }).click();
  await p.waitForTimeout(500);
};
/** In the real Razorpay Test Mode modal: contact (if asked) → Netbanking → test bank → Success. */
const payInModal = async (ctx, frameHost) => {
  const rf = await (async () => { for (let i = 0; i < 40; i++) { const f = frameHost.frames().find((x) => /api\.razorpay\.com/.test(x.url())); if (f) return f; await new Promise((r) => setTimeout(r, 300)); } return null; })();
  if (!rf) return false;
  await rf.waitForLoadState().catch(() => {});
  await frameHost.waitForTimeout(2500);
  const contact = rf.locator('input[name=contact]');
  if (await contact.isVisible({ timeout: 8000 }).catch(() => false)) {
    await contact.click();
    await contact.press('Control+a').catch(() => {});
    await contact.press('Backspace').catch(() => {});
    await contact.pressSequentially('9123456780', { delay: 50 });
    await frameHost.waitForTimeout(1200);
    // Razorpay may move on by itself after 10 digits; otherwise press Continue
    if (await contact.isVisible().catch(() => false)) await rf.locator('button:visible', { hasText: /^Continue$/ }).last().click().catch(() => {});
  }
  await frameHost.waitForTimeout(1500);
  await rf.getByText(/^Netbanking$/).first().click({ timeout: 15000 });
  const popupP = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
  await rf.getByText(/^BOB$/).first().click();
  const pop = await popupP;
  if (pop) await pop.getByRole('button', { name: /success/i }).first().click({ timeout: 8000 }).catch(() => {}); // test bank: auto or "Success"
  return true;
};

try {
  // (a) guest + online (Razorpay Test Mode) → signature verified → confirmation
  {
    const { ctx, p } = await fresh();
    await setBag(p, BASE, [{ sku: 'ciel-hoops-30mm', qty: 1 }]);
    await p.goto(`${BASE}/cart?ad_group=waterproof-everyday-under-5k`);
    await p.getByRole('link', { name: /Proceed to pay/ }).click();
    await p.waitForURL(/\/checkout/);
    check('(a) bag → Proceed to pay → checkout', true);
    check('(a) simulated-steps note visible', await p.locator('[data-simulated-note]').isVisible());
    check('(a) no Cosmos AI in checkout', (await p.getByRole('button', { name: 'Ask Cosmos AI' }).count()) === 0);
    await p.screenshot({ path: `${OUT}/a1-contact.png` });
    await guestToPayment(p);
    await p.screenshot({ path: `${OUT}/a2-payment.png` });
    const order = p.waitForResponse((r) => r.url().endsWith('/api/checkout/order'));
    const verify = p.waitForResponse((r) => r.url().endsWith('/api/checkout/verify'), { timeout: 90000 });
    await p.getByRole('button', { name: /^Pay ₹/ }).click();
    const o = await (await order).json();
    check('(a) server created a Razorpay order (amount from the server)', o.kind === 'razorpay' && o.amount === o.quote.online_payable_inr * 100, `${o.order_id} · ${o.amount} paise`);
    check('(a) order notes carry ad_group_id and oppref', !!o.notes?.ad_group_id && 'oppref' in o.notes, JSON.stringify({ ad_group_id: o.notes?.ad_group_id, ad_group: o.notes?.ad_group, oppref: o.notes?.oppref }));
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}/a3-razorpay-modal.png` });
    await payInModal(ctx, p);
    const v = await verify;
    check('(a) signature verified by the server', v.status() === 200);
    await p.waitForURL(/\/order\//, { timeout: 30000 });
    await p.waitForTimeout(800);
    const txt = await p.locator('body').innerText();
    check('(a) confirmation: payment ID, arrival, care tip, care line, SMS', /Order ID pay_/.test(txt) && /Arrives by/.test(txt) && /Care tips/.test(txt) && txt.includes('care@cosmosjewels.example') && /SMS/.test(txt) && !/whatsapp/i.test(txt));
    check('(a) bag cleared after success', (await bag(p)).length === 0);
    const ev = await p.evaluate(() => JSON.parse(sessionStorage.getItem('cosmos-console-events') || '[]').at(-1));
    check('(a) order event for the AI console (attribution, predicted kept revenue)', ev?.type === 'order' && ev.attribution?.ad_group === 'waterproof-everyday-under-5k' && typeof ev.prediction?.predicted_kept_revenue_inr === 'number', JSON.stringify({ attribution: ev?.attribution?.ad_group_id, kept: ev?.prediction?.predicted_kept_revenue_inr, return_p: ev?.prediction?.items?.[0]?.return_probability }));
    check('(a) no Cosmos AI on the confirmation', (await p.getByRole('button', { name: 'Ask Cosmos AI' }).count()) === 0);
    await p.screenshot({ path: `${OUT}/a4-confirmation.png` });
    await ctx.close();
  }

  // (b) demo number → OTP (wrong, then right) → saved address → wallet → (d) prepaid nudge, COD still offered → pay
  {
    const { ctx, p } = await fresh();
    await setBag(p, BASE, [{ sku: 'ciel-hoops-40mm', qty: 1 }]);
    await p.goto(`${BASE}/checkout`);
    await p.fill('#co-phone', '9999999999');
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.fill('#co-otp', '111111');
    await p.getByRole('button', { name: 'Verify' }).click();
    await p.waitForTimeout(500);
    check('(b) wrong OTP → calm inline message', (await p.getByRole('status').innerText()).includes("isn't right"));
    await p.getByRole('button', { name: 'Resend' }).click();
    await p.fill('#co-otp', '123456');
    await p.getByRole('button', { name: 'Verify' }).click();
    await p.waitForTimeout(300);
    check('(b) "Saved details found (simulated)"', (await p.locator('body').innerText()).includes('Saved details found (simulated)'));
    await p.waitForTimeout(900);
    const t2 = await p.locator('body').innerText();
    check('(b) saved Pune address 411038 prefilled', /Pune 411038/.test(t2) && /Saved address \(simulated\)/.test(t2));
    await p.screenshot({ path: `${OUT}/b1-address.png` });
    await p.getByRole('button', { name: 'Continue' }).click();
    const t3 = await p.locator('body').innerText();
    check('(b) wallet toggle (₹300) + "You save"', /Use Cosmos wallet \(₹300\)/.test(t3) && /You save ₹/.test(t3));
    await p.screenshot({ path: `${OUT}/b2-offers.png` });
    await p.fill('#co-coupon', 'FAKE50');
    await p.getByRole('button', { name: 'Apply' }).click();
    await p.waitForTimeout(700);
    check('(b) invalid coupon → "That code isn\'t valid", no error box', (await p.locator('body').innerText()).includes("That code isn't valid"));
    await p.getByRole('button', { name: 'Continue to payment' }).click();
    await p.waitForTimeout(500);
    const nudge = await p.locator('[data-prepaid-nudge]').innerText().catch(() => '');
    check('(d) high-RTO shopper sees "Pay online, extra 5% off"', /Pay online, extra 5% off/.test(nudge), nudge);
    const t4 = await p.locator('body').innerText();
    check('(d) COD still available, and the reason is never shown', /Cash on delivery/.test(t4) && !/risk|RTO|refused|returned before/i.test(t4));
    check('(b) EMI shown on a bag over ₹3,000', /EMI \/ Pay Later/.test(t4));
    await p.screenshot({ path: `${OUT}/d-nudge.png` });
    const verify = p.waitForResponse((r) => r.url().endsWith('/api/checkout/verify'), { timeout: 90000 });
    await p.getByRole('button', { name: /^Pay ₹/ }).click();
    await p.waitForTimeout(2500);
    await payInModal(ctx, p);
    check('(b) paid and verified', (await verify).status() === 200);
    await p.waitForURL(/\/order\//, { timeout: 30000 });
    check('(b) confirmation shows wallet savings', /You saved/.test(await p.locator('body').innerText()));
    await ctx.close();
  }

  // (c) COD → confirmation with the ₹49 fee and no online offers
  {
    const { ctx, p } = await fresh();
    await setBag(p, BASE, [{ sku: 'ciel-hoops-30mm', qty: 1 }]);
    await p.goto(`${BASE}/checkout`);
    await guestToPayment(p, '411038', 'Pune');
    check('(c) EMI hidden on a bag under ₹3,000', !/EMI \/ Pay Later/.test(await p.locator('body').innerText()));
    await p.getByLabel(/Cash on delivery/).check();
    await p.waitForTimeout(900);
    const t = await p.locator('body').innerText();
    check('(c) COD: ₹49 fee in the total, online offers removed', /Cash on delivery fee\s*₹49/.test(t) && !/\nOffers\s*−/.test(t) && /Total\s*₹3,048/.test(t), (t.match(/Total\s*₹[\d,]+/) ?? [''])[0]);
    await p.screenshot({ path: `${OUT}/c1-cod.png` });
    await p.getByRole('button', { name: /Place order/ }).click();
    await p.waitForURL(/\/order\/COD-/, { timeout: 20000 });
    await p.waitForTimeout(600);
    const c = await p.locator('body').innerText();
    check('(c) confirmation marked "Cash on delivery" with the fee', /Order placed/.test(c) && /Cash on delivery/.test(c) && /₹49/.test(c));
    await p.screenshot({ path: `${OUT}/c2-cod-confirmation.png` });
    await ctx.close();
  }

  // (e) cancelled payment → back to the payment step, bag intact
  {
    const { ctx, p } = await fresh();
    await setBag(p, BASE, [{ sku: 'ciel-hoops-30mm', qty: 1 }]);
    await p.goto(`${BASE}/checkout`);
    await guestToPayment(p);
    await p.getByRole('button', { name: /^Pay ₹/ }).click();
    const rf = await (async () => { for (let i = 0; i < 40; i++) { const f = p.frames().find((x) => /api\.razorpay\.com/.test(x.url())); if (f) return f; await p.waitForTimeout(300); } return null; })();
    await rf.waitForLoadState().catch(() => {});
    await p.waitForTimeout(2500);
    await rf.locator('[aria-label*="lose" i], [aria-label*="back" i], button:visible').first().click().catch(() => {});
    await p.waitForTimeout(800);
    // Razorpay asks "Are you sure you want to exit?" → "Yes, exit" (the modal's ondismiss fires)
    await p.waitForTimeout(1200);
    // a DOM click: Razorpay ignores the emulated touch-pointer click here
    await rf.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Yes, exit/.test(b.textContent || ''))?.click());
    await p.waitForTimeout(1500);
    await p.getByText("Payment didn't go through. Try UPI?").waitFor({ timeout: 15000 }).catch(() => {});
    const t = await p.locator('body').innerText();
    check('(e) cancelled → "Payment didn\'t go through. Try UPI?" on the payment step', t.includes("Payment didn't go through. Try UPI?") && /Payment method/.test(t));
    check('(e) bag intact', (await bag(p)).length === 1);
    await p.screenshot({ path: `${OUT}/e-cancelled.png` });
    await ctx.close();
  }

  // (f) mock mode (no keys) end to end
  {
    const { ctx, p } = await fresh();
    await setBag(p, MOCK, [{ sku: 'ciel-hoops-30mm', qty: 1 }]);
    await p.goto(`${MOCK}/checkout`);
    await guestToPayment(p);
    await p.getByRole('button', { name: /^Pay ₹/ }).click();
    await p.getByRole('dialog', { name: 'Simulated payment' }).waitFor({ timeout: 10000 });
    check('(f) mock: labelled "Simulated payment", no Razorpay call', !p.frames().some((f) => /razorpay/.test(f.url())));
    await p.screenshot({ path: `${OUT}/f-mock.png` });
    await p.getByRole('button', { name: 'Complete simulated payment' }).click();
    await p.waitForURL(/\/order\/pay_mock_/, { timeout: 20000 });
    check('(f) mock confirmation', /Simulated payment/.test(await p.locator('body').innerText()));
    await ctx.close();
  }

  // iframe: does the Razorpay modal open when the shop is embedded (the /demo page)?
  {
    const { ctx, p } = await fresh();
    await setBag(p, BASE, [{ sku: 'ciel-hoops-30mm', qty: 1 }]);
    // a same-origin host page with the shop in an iframe (how /demo will embed it)
    await p.goto(`${BASE}/shop`);
    await p.evaluate((src) => { document.body.innerHTML = `<iframe id="shop" src="${src}" style="position:fixed;inset:0;width:390px;height:844px;border:0;z-index:99999"></iframe>`; }, `${BASE}/checkout`);
    const f = await (await p.waitForSelector('#shop')).contentFrame();
    await f.waitForSelector('#co-phone');
    await f.fill('#co-phone', '9123456780');
    await f.getByRole('button', { name: 'Continue' }).click();
    await f.fill('input[autocomplete=name]', 'Iframe Shopper');
    await f.fill('input[autocomplete=postal-code]', '400050');
    await f.fill('input[autocomplete=address-level2]', 'Mumbai');
    await f.fill('input[autocomplete=street-address]', '1 Frame Street');
    await f.waitForTimeout(600);
    await f.getByRole('button', { name: 'Continue' }).click();
    await f.getByRole('button', { name: 'Continue to payment' }).click();
    const verify = p.waitForResponse((r) => r.url().endsWith('/api/checkout/verify'), { timeout: 90000 }).catch(() => null);
    await f.getByRole('button', { name: /^Pay ₹/ }).click();
    await p.waitForTimeout(4000);
    const opened = p.frames().some((x) => /api\.razorpay\.com/.test(x.url()));
    await p.screenshot({ path: `${OUT}/iframe-modal.png` });
    check('(iframe) Razorpay modal opens inside the iframe', opened);
    if (opened) {
      await payInModal(ctx, p);
      const v = await verify;
      check('(iframe) payment verified inside the iframe', v?.status() === 200);
    }
    await ctx.close();
  }
} catch (e) {
  check('no unexpected error', false, e.message.split('\n')[0]);
}
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
