// Start page + merchant console flows (a–f) with Playwright.
//   node scripts/tests/merchant-browser.mjs <base> <out dir>
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3100';
const OUT = process.argv[3] || '.cache/merchant-browser';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${String(detail).slice(0, 240)}` : ''}`); };
const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, e.message); } };

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('cosmos-demo-state-v1') || '{}'));
const body = () => p.locator('body').innerText();
const askButtons = () => p.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).count();
const STEEL = 'prop-new-ad-group-steel-earrings';
const waterFact = async () => (await p.getByRole('region', { name: 'Product promises' }).innerText()).includes('Water-resistant'); // the badge row, not rail cards

// (a) start page: every card and link, and the approve checkbox on and off
await step('(a) start page', async () => {
  await p.goto(`${BASE}/`);
  const t = await body();
  check('(a) hero and footer', /ChatGPT Ads Post.Click Agent/.test(t) && /Turns ChatGPT ad clicks into orders, inside Razorpay Engage/.test(t) && /Cosmos is a fictional brand/.test(t));
  check('(a) no arm, control or Cosmos heading', !/\barm\b|control page|holdout/i.test(t) && (await p.getByRole('heading', { name: 'Cosmos', exact: true }).count()) === 0);
  const hrefs = await p.locator('main a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check('(a) 7 links (4 cards, 2 ad pages, login)', hrefs.length === 7, hrefs.join(' '));
  for (const h of hrefs) {
    const r = await p.request.get(`${BASE}${h}`);
    check(`(a) ${h} → ${r.status()}`, r.ok() && !/[?&]arm=/.test(h));
  }
  await p.screenshot({ path: `${OUT}/start-1280.png`, fullPage: true });
  const box = p.getByRole('checkbox', { name: /sensitive ears/ });
  await box.check();
  check('(a) checkbox on → approved', (await state()).approvedProposals?.includes(STEEL));
  await p.goto(`${BASE}/chatgpt?c=conv-sensitive`);
  check('(a) ad shows in ChatGPT conversation 3', /Sponsored/.test(await body()));
  await p.goto(`${BASE}/`);
  await box.uncheck();
  check('(a) checkbox off → not approved', !(await state()).approvedProposals?.includes(STEEL));
  await p.goto(`${BASE}/chatgpt?c=conv-sensitive`);
  check('(a) ad gone from ChatGPT', !/Sponsored ·/.test(await body()));
});

// (b) approve sensitive ears in /merchant → ad in mock ChatGPT → steel rail → honest nickel answer
await step('(b) sensitive ears', async () => {
  await p.goto(`${BASE}/merchant`);
  await p.screenshot({ path: `${OUT}/merchant-summary-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 360 } });
  const card = p.getByTestId('proposal').filter({ hasText: 'sensitive ears' });
  await card.getByText('Show evidence').click();
  await p.waitForTimeout(300);
  await card.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${OUT}/merchant-inbox-expanded-1280.png`, fullPage: true });
  const ev = await card.innerText();
  check('(b) evidence: shopper messages, AI-generated line', /what shoppers said/i.test(ev) && /AI-generated · .+ · proposals-v1/.test(ev));
  await card.getByRole('button', { name: 'Approve' }).click();
  const done = p.getByTestId('done');
  check('(b) moved to Done with result', /Ad live in ChatGPT · rail of 5 steel earrings/.test(await done.innerText()));
  await p.goto(`${BASE}/chatgpt?c=conv-sensitive`);
  check('(b) ad live in conversation 3', /Sponsored/.test(await body()));
  await p.getByRole('link', { name: /Sponsored/ }).first().click();
  await p.waitForURL(/\/p\//);
  const t = await body();
  check('(b) steel rail on the landing page', /Stainless steel earrings/.test(t));
  await p.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).first().click().catch(() => {});
  const sheet = p.locator('[data-cosmos-sheet]');
  await sheet.waitFor();
  const n = await p.locator('[data-role="ai"]').count();
  await sheet.getByRole('textbox').fill('Is it nickel-free?');
  await sheet.getByRole('button', { name: 'Send', exact: true }).click();
  await p.waitForFunction((n) => document.querySelectorAll('[data-role="ai"]').length > n && !document.querySelector('[data-role="typing"]'), n, { timeout: 40000 });
  await p.waitForTimeout(500);
  const a = await p.locator('[data-role="ai"]').last().innerText();
  const claims = /\b(?:is|are|it's|they're)\s+nickel[- ]free\b/i.test(a) && !/\bnot\b|n't|no\b/i.test(a);
  check('(b) honest no + care line', !claims && /nickel/i.test(a) && /care@cosmosjewels\.example/.test(a), a.replace(/\s+/g, ' '));
  await p.screenshot({ path: `${OUT}/steel-nickel.png` });
});

// (c) approve waterproof → Kira huggies show the badge
await step('(c) waterproof', async () => {
  await p.goto(`${BASE}/p/kira-mini-huggies`);
  const before = await waterFact();
  await p.goto(`${BASE}/merchant`);
  await p.getByTestId('proposal').filter({ hasText: 'waterproof' }).getByRole('button', { name: 'Approve' }).click();
  check('(c) Done line', /Water-resistant badge on 18 products/.test(await p.getByTestId('done').innerText()));
  await p.goto(`${BASE}/p/kira-mini-huggies`);
  check('(c) Kira huggies show the water-resistant fact', !before && (await waterFact()));
  await p.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).first().click();
  const sheet = p.locator('[data-cosmos-sheet]');
  await sheet.waitFor();
  const n = await p.locator('[data-role="ai"]').count();
  await sheet.getByRole('textbox').fill('Can I shower with these?');
  await sheet.getByRole('button', { name: 'Send', exact: true }).click();
  await p.waitForFunction((n) => document.querySelectorAll('[data-role="ai"]').length > n && !document.querySelector('[data-role="typing"]'), n, { timeout: 40000 });
  await p.waitForTimeout(500);
  const a = await p.locator('[data-role="ai"]').last().innerText();
  check('(c) agent may now state it', /water-resistant/i.test(a) && !/hasn't confirmed|keep (it|them) dry/i.test(a), a.replace(/\s+/g, ' '));
  await p.getByRole('button', { name: /close/i }).first().click().catch(() => {});
});

// (d) pause → no chat anywhere → unpause
await step('(d) pause', async () => {
  await p.goto(`${BASE}/merchant`);
  await p.getByRole('switch', { name: 'Pause Cosmos AI' }).click();
  check('(d) status Paused', /Cosmos AI Paused/.test(await body()));
  for (const path of ['/shop', '/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k', '/p/kira-mini-huggies', '/c/earrings']) {
    await p.goto(`${BASE}${path}`);
    await p.waitForTimeout(400);
    check(`(d) no chat on ${path}`, (await askButtons()) === 0);
  }
  await p.goto(`${BASE}/merchant`);
  await p.getByRole('switch', { name: 'Pause Cosmos AI' }).click();
  await p.goto(`${BASE}/shop`);
  await p.waitForTimeout(400);
  check('(d) unpaused → chat back', (await askButtons()) > 0);
});

// wedding pause (ad-group level): no chat on that ad group's pages, others unaffected
await step('wedding pause', async () => {
  await p.goto(`${BASE}/merchant`);
  await p.getByTestId('proposal').filter({ hasText: 'Wedding' }).getByRole('button', { name: 'Approve' }).click();
  await p.goto(`${BASE}/p/ciel-hoops-40mm?ad_group=wedding-guest-gift`);
  await p.waitForTimeout(400);
  check('wedding ad page: no chat', (await askButtons()) === 0 && /paused by the store/.test(await body()));
  await p.goto(`${BASE}/p/ciel-hoops-40mm?ad_group=waterproof-everyday-under-5k`);
  await p.waitForTimeout(400);
  check('waterproof ad page: chat still on', (await askButtons()) > 0);
});

// (e) a test order (COD, no payment step) appears under "Orders from this session"
await step('(e) order', async () => {
  await p.goto(`${BASE}/shop`);
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('cosmos-demo-state-v1') || '{}'); localStorage.setItem('cosmos-demo-state-v1', JSON.stringify({ ...s, cart: [{ sku: 'ciel-hoops-30mm', qty: 1 }] })); });
  await p.goto(`${BASE}/cart?ad_group=office-minimal`);
  await p.waitForTimeout(300);
  await p.goto(`${BASE}/checkout?ad_group=office-minimal`);
  await p.fill('#co-phone', '9123456780');
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.fill('input[autocomplete=name]', 'Test Shopper');
  await p.fill('input[autocomplete=postal-code]', '411038');
  await p.fill('input[autocomplete=address-level2]', 'Pune');
  await p.fill('input[autocomplete=street-address]', '12 Test Road');
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Continue' }).click();
  await p.getByRole('button', { name: 'Continue to payment' }).click();
  await p.waitForTimeout(500);
  await p.getByLabel(/Cash on delivery/).check();
  await p.waitForTimeout(800);
  await p.getByRole('button', { name: /Place order/ }).click();
  await p.waitForURL(/\/order\/COD-/, { timeout: 20000 });
  const id = p.url().match(/COD-[A-F0-9]+/)?.[0];
  await p.goto(`${BASE}/merchant`);
  const t = await p.getByTestId('session-orders').innerText();
  check('(e) order listed with ad group, method and amount', t.includes(id) && /Office minimal/i.test(t) && /₹3,048/.test(t) && /cash|cod/i.test(t), t.replace(/\s+/g, ' '));
});

// (f) reset restores everything
await step('(f) reset', async () => {
  await p.goto(`${BASE}/merchant`);
  await p.getByRole('button', { name: 'Reset demo' }).click();
  await p.getByRole('button', { name: 'Reset everything' }).click();
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(800);
  const s = await state();
  const t = await body();
  check('(f) state cleared', (s.approvedProposals ?? []).length === 0 && (s.dismissedProposals ?? []).length === 0 && !s.agentPaused && (s.cart ?? []).length === 0);
  check('(f) inbox full, no orders', (await p.getByTestId('proposal').count()) === 4 && /Place a test order in the shop to see it here/.test(t));
  await p.goto(`${BASE}/chatgpt?c=conv-sensitive`);
  check('(f) steel ad gone', !/Sponsored ·/.test(await body()));
  await p.goto(`${BASE}/p/kira-mini-huggies`);
  check('(f) waterproof badge gone', !(await waterFact()));
});

// dismiss + undo
await step('dismiss/undo', async () => {
  await p.goto(`${BASE}/merchant`);
  const card = p.getByTestId('proposal').filter({ hasText: 'Layered' });
  await card.getByRole('button', { name: 'Dismiss' }).click();
  check('dismiss → Done (Dismissed)', /Dismissed/.test(await p.getByTestId('done').innerText()) && (await p.getByTestId('proposal').count()) === 3);
  await p.getByTestId('done').getByRole('button', { name: 'Undo' }).click();
  check('undo → back in inbox', (await p.getByTestId('proposal').count()) === 4);
});

check('no page errors', errors.length === 0, errors.join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
