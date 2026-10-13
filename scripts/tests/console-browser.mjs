// AI console (/demo) journeys at 1440px with Playwright, against a test-mode server with the model on.
//   node scripts/tests/console-browser.mjs <base> <out dir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = process.argv[3] || '.cache/console-browser';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ''}`); };

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

const consoleText = () => p.locator('section[aria-label="Under the hood"]').innerText();
const waitConsole = async (re, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (re.test(await consoleText())) return true; await p.waitForTimeout(300); } return false; };
const frame = async () => (await p.waitForSelector('iframe[title^="Cosmos shop"]')).contentFrame();
const restart = async () => { await p.getByRole('button', { name: 'Restart session' }).click(); await p.waitForTimeout(1500); return frame(); };
const sheet = (f) => f.locator('[data-vaul-drawer]');
const openChat = async (f) => { await f.getByRole('button', { name: 'Ask Cosmos AI' }).last().click(); await sheet(f).locator('#cosmos-chat-input').waitFor(); await f.waitForTimeout(500); };
const answered = async (f, before, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { const n = await sheet(f).locator('[data-role=ai]').count(); const typing = await sheet(f).locator('[data-role=typing]').count(); if (n > before && !typing) return true; await f.waitForTimeout(300); } return false; };
const chip = async (f, text) => { const before = await sheet(f).locator('[data-role=ai]').count(); await sheet(f).getByRole('group', { name: 'Suggested questions' }).getByRole('button', { name: text, exact: true }).click(); return answered(f, before); };
const type = async (f, text) => { const before = await sheet(f).locator('[data-role=ai]').count(); await sheet(f).locator('#cosmos-chat-input').fill(text); await sheet(f).getByRole('button', { name: 'Send' }).click(); return answered(f, before); };
const closeChat = async (f) => { await sheet(f).getByRole('button', { name: 'Close chat' }).click().catch(() => {}); await f.waitForTimeout(500); };
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });

try {
  // desktop-only gate
  {
    const small = await b.newPage({ viewport: { width: 900, height: 800 } });
    await small.goto(`${BASE}/demo`);
    await small.waitForTimeout(800);
    const t = await small.locator('body').innerText();
    check('/demo below 1024px shows the desktop-only message', /designed for desktop/.test(t) && /Open the shop instead/.test(t) && !(await small.locator('iframe').count()));
    await small.screenshot({ path: `${OUT}/0-mobile-gate.png` });
    await small.close();
  }

  await p.goto(`${BASE}/demo`);
  let f = await restart(); // a clean session

  // nothing logs before the iframe reaches a Cosmos page
  await f.waitForSelector('text=Waterproof office earrings');
  await p.waitForTimeout(2500);
  const pre = await consoleText();
  check('nothing logged on the mock ChatGPT screen', /Waiting for the shopper to reach the Cosmos site/.test(pre) && /\b0 events\b/.test(pre));

  // (1) ChatGPT ad → 40mm → office question → return insight + alternative → add 3cm → checkout → pay → outcome
  {
    await f.locator('a[href*="/p/ciel-hoops-40mm"]').first().click();
    await f.waitForURL(/\/p\/ciel-hoops-40mm/);
    check('(1) arrival from the ChatGPT ad (session card: source, ad group, oppref)', await waitConsole(/Arrived from ChatGPT ad/) && /SOURCE\s*ChatGPT ad/i.test(await consoleText()) && /waterproof-everyday-under-5k/.test(await consoleText()));
    check('(1) rail decisions with AI and rule badges + opener source', await waitConsole(/Rail 1:/) && /Opener:/.test(await consoleText()));
    await openChat(f);
    check('(1) office question answered', await chip(f, 'Will these work for office?'));
    check('(1) forced tool + return insight with the alternative + guardrails + LLM usage', await waitConsole(/get_return_insight\(/) && /Forced tool: get_return_insight/.test(await consoleText()) && /verified claims only: passed|claim check/i.test(await consoleText()) && /LLM answer/.test(await consoleText()));
    const add = sheet(f).getByRole('group', { name: 'Suggested questions' }).getByRole('button', { name: /^Add the .* to bag$/ });
    if (await add.count()) { const before = await sheet(f).locator('[data-role=ai]').count(); await add.first().click(); await answered(f, before); }
    check('(1) add the 3cm to the bag (logged)', await waitConsole(/Added to bag: Medium Classic Hoop|Chat added 1 × Medium Classic Hoop/));
    await shot('1a-office-chat');
    await closeChat(f);
    await f.getByRole('link', { name: /^Bag/ }).click();
    await f.waitForURL(/\/cart/);
    await f.getByRole('link', { name: /Proceed to pay/ }).click();
    await f.waitForURL(/\/checkout/);
    await f.fill('#co-phone', '9123456780');
    await f.getByRole('button', { name: 'Continue' }).click();
    await f.fill('input[autocomplete=name]', 'Demo Guest');
    await f.fill('input[autocomplete=postal-code]', '400050');
    await f.fill('input[autocomplete=address-level2]', 'Mumbai');
    await f.fill('input[autocomplete=street-address]', '12 Test Road');
    await f.waitForTimeout(700);
    await f.getByRole('button', { name: 'Continue' }).click();
    await f.getByRole('button', { name: 'Continue to payment' }).click();
    await f.getByRole('button', { name: /^Pay ₹/ }).click();
    // the real Razorpay Test Mode modal opens inside the /demo iframe
    let rf = null;
    for (let i = 0; i < 40 && !rf; i++) { rf = p.frames().find((x) => /api\.razorpay\.com/.test(x.url())) ?? null; await p.waitForTimeout(300); }
    check('(1) Razorpay modal opens inside the /demo iframe', !!rf);
    if (rf) {
      await p.waitForTimeout(2500);
      const contact = rf.locator('input[name=contact]');
      if (await contact.isVisible().catch(() => false)) { await contact.click(); await contact.pressSequentially('9123456780', { delay: 50 }); await p.waitForTimeout(1200); if (await contact.isVisible().catch(() => false)) await rf.locator('button:visible', { hasText: /^Continue$/ }).last().click().catch(() => {}); }
      await rf.getByText(/^Netbanking$/).first().click({ timeout: 15000 });
      const pop = ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null);
      await rf.getByText(/^BOB$/).first().click();
      const w = await pop;
      if (w) await w.getByRole('button', { name: /success/i }).first().click({ timeout: 8000 }).catch(() => {});
    }
    check('(1) checkout steps, Razorpay order with notes, signature verified', await waitConsole(/Payment signature verified/, 60000) && /Razorpay order created: order_/.test(await consoleText()) && /Offers:/.test(await consoleText()));
    check('(1) order outcome: attribution via oppref, return probability, kept revenue', await waitConsole(/Predicted kept revenue/) && /Order attributed to waterproof-everyday-under-5k via oppref/.test(await consoleText()) && /Predicted return probability/.test(await consoleText()));
    await shot('1b-checkout-outcome');
  }

  // (2) 30mm → "need it in Pune by 18 Oct" → delivery rescue
  {
    f = await restart();
    await f.goto(`${BASE}/p/ciel-hoops-30mm`);
    await waitConsole(/Direct visit/);
    await openChat(f);
    await type(f, 'need it in Pune by 18 Oct');
    check('(2) delivery rescue logged (check_delivery → in-time alternatives)', await waitConsole(/check_delivery\(/) && /alternative|misses|in time|2\.8cm|Everyday Tube/i.test(await consoleText()));
    await shot('2-delivery-rescue');
  }

  // (3) direct visit → home → category → product → chat chip on the fast path
  {
    f = await restart();
    await f.goto(`${BASE}/shop`);
    check('(3) direct visit logged', await waitConsole(/Direct visit \(no ad context\)/));
    await f.getByRole('link', { name: 'Earrings', exact: true }).first().click();
    await f.waitForURL(/\/c\//);
    await f.locator('a[href^="/p/"]').first().click();
    await f.waitForURL(/\/p\//);
    await f.waitForTimeout(800);
    await openChat(f);
    await chip(f, 'How big is it?');
    check('(3) home → category → product page views + fast path (no AI)', await waitConsole(/Fast path · answered by code/) && /Viewing Home/.test(await consoleText()) && /Viewing Category/.test(await consoleText()) && /Viewing Product/.test(await consoleText()));
    await shot('3-direct-fast-path');
  }

  // (4) "is it hypoallergenic?" → claim-safe answer; then a simulated slip shows the caught state
  {
    f = await restart();
    await f.goto(`${BASE}/p/tara-solitaire-studs?ad_group=office-minimal`);
    await waitConsole(/Viewing Product/);
    await openChat(f);
    await type(f, 'is it hypoallergenic?');
    check('(4) claim-safe answer: guardrails logged, no claim made', await waitConsole(/verified claims only: passed|Safety handoff|handoff\(/) && !/Claim check caught/.test(await consoleText()));
    await p.getByRole('button', { name: 'Simulate a slip' }).click();
    check('(4) simulated slip → "Claim check caught … → safe reply sent"', await waitConsole(/Claim check caught "hypoallergenic" → safe reply sent/));
    await p.getByRole('tab', { name: 'Guardrails' }).click();
    await p.waitForTimeout(400);
    await shot('4-claim-caught');
    await p.getByRole('tab', { name: 'All' }).click();
  }

  // (5) a legacy variant param in the URL is ignored: every visitor gets the agent
  {
    f = await restart();
    await f.goto(`${BASE}/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k&arm=A`);
    check('(5) legacy URL param ignored: session shows "Agent on"', await waitConsole(/Agent on · tier/));
    check('(5) no "agent off" event', !/Agent off/.test(await p.locator('body').innerText()));
  }

  // (6) logged-in demo shopper → personalised rail → wallet at checkout
  {
    f = await restart();
    await f.goto(`${BASE}/login?next=${encodeURIComponent('/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k')}`);
    await f.fill('input[inputmode=numeric], input[type=tel]', '9999999999').catch(() => {});
    await f.getByRole('button', { name: /OTP|Continue|Send/i }).first().click();
    await f.waitForTimeout(500);
    await f.locator('input').last().fill('123456');
    await f.getByRole('button', { name: /Verify|Log in|Continue/i }).first().click();
    await f.waitForURL(/\/p\/ciel-hoops-40mm/, { timeout: 15000 });
    check('(6) personalised rail reasons with Login badges', await waitConsole(/Removed .*Login|Added: goes with the pendant|Login: she already owns/) || /Login/.test(await consoleText()));
    await f.getByRole('button', { name: /^Add · ₹/ }).first().click();
    await f.waitForTimeout(500);
    await f.goto(`${BASE}/checkout?ad_group=waterproof-everyday-under-5k`);
    await f.getByRole('button', { name: 'Continue' }).click();
    await f.waitForTimeout(800);
    await f.getByRole('button', { name: 'Continue' }).click();
    await f.getByRole('button', { name: 'Continue to payment' }).click();
    check('(6) wallet and RTO nudge at checkout (internal reason)', await waitConsole(/wallet −₹300/) && /RTO risk high/.test(await consoleText()) && /RTO nudge shown/.test(await consoleText()));
    await shot('6-logged-in-wallet');
  }

  // (7) stand-in approve → steel ad appears in mock ChatGPT → its page
  {
    f = await restart();
    await p.getByRole('button', { name: /Merchant: approve/ }).first().click();
    check('(7) merchant events: approved → ad group live → rail built → ad appears', await waitConsole(/New ad appears in mock ChatGPT/) && /Ad group live/.test(await consoleText()) && /Rail built/.test(await consoleText()));
    await f.getByRole('button', { name: 'Earrings for sensitive ears' }).click();
    await f.locator('a[href^="/p/"]').first().click({ timeout: 10000 });
    await f.waitForURL(/kira-mini-huggies|stainless-steel-earrings/);
    check('(7) steel ad page logged with its rail', await waitConsole(/Arrived from ChatGPT ad/) && /Stainless steel earrings/.test(await consoleText()));
    await shot('7-merchant-steel');
  }
} catch (e) {
  check('no unexpected error', false, e.message.split('\n')[0]);
  await shot('error');
}
check('no page errors in /demo', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
