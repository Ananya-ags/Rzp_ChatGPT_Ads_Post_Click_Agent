import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:3600';
const OUT = process.argv[3] || '.cache/chat-browser';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
    const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }), headless: true });
    const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
    const p = await ctx.newPage();
    let errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/net::ERR_ABORTED/.test(m.text()))
        errors.push(m.text()); });
    const requests = [];
    p.on('request', req => { if (req.url().endsWith('/api/chat'))
        requests.push(req.postDataJSON()?.context); });
    const results = [];
    const check = async (name, fn) => { try {
        await fn();
        results.push({ name, pass: true });
        console.log('PASS', name);
    }
    catch (e) {
        results.push({ name, pass: false, error: e.message });
        console.log('FAIL', name, (e.stack || e.message).slice(0, 900));
        await p.screenshot({ path: `${OUT}/failure-${results.length}.png` });
    } };
    const sheet = () => p.locator('[data-cosmos-sheet]');
    const open = async () => { await p.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).click(); await sheet().waitFor(); await p.waitForTimeout(600); };
    const waitAnswer = async (n) => { await p.waitForFunction(n => document.querySelectorAll('[data-role="ai"]').length > n && !document.querySelector('[data-role="typing"]'), n, { timeout: 35000 }); await p.waitForTimeout(200); };
    const chip = async (t) => { const n = await p.locator('[data-role="ai"]').count(); await sheet().getByRole('button', { name: t, exact: true }).click(); await waitAnswer(n); };
    const send = async (t) => { const n = await p.locator('[data-role="ai"]').count(); await sheet().getByRole('textbox').fill(t); await sheet().getByRole('button', { name: 'Send', exact: true }).click(); await waitAnswer(n); };
    const close = async () => { await p.getByRole('button', { name: 'Close chat' }).click(); await sheet().waitFor({ state: 'hidden' }); };
    const fits = async () => { await p.waitForTimeout(650); const g = await p.evaluate(() => { const f = document.querySelector('[data-phone-overlays]'), s = document.querySelector('[data-cosmos-sheet]'), o = document.querySelector('[data-vaul-overlay]'); const within = e => { if (!e)
        return false; const a = e.getBoundingClientRect(), z = f.getBoundingClientRect(); return a.left >= z.left - 1 && a.right <= z.right + 1 && a.top >= z.top - 1 && a.bottom <= z.bottom + 1; }; return { sheet: within(s), overlay: within(o), width: document.documentElement.scrollWidth, viewport: innerWidth, inside: f.contains(s), input: within(s.querySelector('input')), dialog: within(document.querySelector('[data-vaul-drawer]')) }; }); assert(g.sheet && g.overlay && g.inside && g.input && g.dialog && g.width <= g.viewport, JSON.stringify(g)); };
    try {
        await check('desktop launcher home containment', async () => { await p.goto(BASE); await p.getByRole('link', { name: /Store home/ }).click(); await open(); await fits(); await p.screenshot({ path: OUT + '/desktop-containment.png' }); await close(); });
        await check('desktop expand/focus and resize mobile→desktop', async () => { await open(); await sheet().getByRole('textbox').focus(); await fits(); await p.setViewportSize({ width: 390, height: 844 }); await fits(); await p.setViewportSize({ width: 1280, height: 1000 }); await fits(); await close(); });
        await p.setViewportSize({ width: 390, height: 844 });
        await check('home gift → product history divider → delivery → bag persistence', async () => { await p.goto(BASE + '/shop'); await open(); await fits(); await p.screenshot({ path: OUT + '/home-opener.png' }); await chip('Gift under ₹2,000'); assert(await sheet().getByRole('link', { name: /^View / }).count() > 0); await sheet().getByRole('link', { name: /^View / }).first().click(); await p.waitForURL('**/p/**'); await open(); assert(await sheet().getByText(/Now viewing:/).count() > 0); assert(await sheet().getByText('Gift under ₹2,000', { exact: true }).count() > 0); await chip('When will it arrive?'); await fits(); await close(); await p.getByRole('link', { name: /^Bag/ }).click(); await p.waitForURL(/\/cart(?:\?|$)/); await p.getByRole('heading', { name: /^Your bag/ }).waitFor(); await open(); assert((await sheet().innerText()).includes('Gift under ₹2,000')); await p.screenshot({ path: OUT + '/bag-chat.png' }); await close(); await p.reload(); await open(); assert((await sheet().innerText()).includes('Gift under ₹2,000')); await sheet().getByRole('button', { name: 'New chat' }).click(); assert.equal(await sheet().locator('[data-role="user"]').count(), 0); await close(); });
        await check('guided waterproof sponsored route', async () => { await p.goto(BASE + '/chatgpt'); await p.locator('a[href^="/p/"]').click(); await open(); assert((await sheet().innerText()).includes('Can I shower in these?')); await chip('Can I shower in these?'); await fits(); await close(); });
        await check('guided wedding sponsored route and no water chips', async () => { await p.goto(BASE + '/chatgpt?c=conv-wedding'); await p.locator('a[href^="/p/"]').click(); await open(); const t = await sheet().locator('[aria-label="Suggested questions"]').innerText(); assert(!/shower|gym|water/i.test(t), t); assert(t.includes('Show matching pieces')); await p.screenshot({ path: OUT + '/wedding-chips.png' }); await chip('Can you gift wrap it?'); await close(); });
        await check('steel nickel care card', async () => { await p.goto(BASE + '/p/kira-mini-huggies?ad_group=stainless-steel-earrings'); await open(); await chip('Is it nickel-free?'); assert((await sheet().innerText()).includes('No.')); assert(await sheet().locator('a[href="mailto:care@cosmosjewels.example"]').count() > 0); await fits(); await close(); });
        await check('30mm rescue → Aria16Oct → Add updates bag', async () => { await p.goto(BASE + '/p/ciel-hoops-30mm?ad_group=office-minimal'); await open(); await send('need it in Pune by 18 Oct'); let t = await sheet().innerText(); assert(t.includes('21 Oct') && t.includes('16 Oct'), t); const aria = sheet().getByRole('link', { name: 'View Everyday Tube Hoop Earrings', exact: true }).last().locator('..'); assert(await aria.count() > 0); await aria.getByRole('button', { name: 'Add', exact: true }).click(); assert((await p.locator('a[aria-label^="Bag"]').getAttribute('aria-label')).match(/[1-9]/)); await fits(); await aria.scrollIntoViewIfNeeded(); await p.screenshot({ path: OUT + '/30mm-rescue.png' }); await close(); });
        await check('office honest fit alternative', async () => { await p.goto(BASE + '/p/ciel-hoops-40mm?ad_group=office-minimal'); await open(); await send('will these work for office?'); let t = await sheet().innerText(); assert(t.includes('9 of 9') && t.includes('64%'), t); assert(await sheet().locator('a[href*="ciel-hoops-30mm"]').count() > 0); await close(); });
        await check('armA then direct home remains enabled; paused suppresses', async () => { await p.goto(BASE + '/p/ciel-hoops-40mm?ad_group=office-minimal&arm=A'); assert.equal(await p.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).count(), 0); await p.getByRole('link', { name: 'Cosmos home' }).click(); assert.equal(await p.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).count(), 0); await p.goto(BASE + '/shop'); await open(); assert((await sheet().locator('[aria-label="Suggested questions"]').innerText()).includes('Waterproof everyday pieces')); await close(); await p.evaluate(() => { let s = JSON.parse(localStorage.getItem('cosmos-demo-state-v1')); localStorage.setItem('cosmos-demo-state-v1', JSON.stringify({ ...s, agentPaused: true })); dispatchEvent(new Event('storage')); }); assert.equal(await p.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).count(), 0); await p.evaluate(() => { let s = JSON.parse(localStorage.getItem('cosmos-demo-state-v1')); localStorage.setItem('cosmos-demo-state-v1', JSON.stringify({ ...s, agentPaused: false })); dispatchEvent(new Event('storage')); }); });
        await check('category navigation, direct refresh, back/forward and current context', async () => {
            await p.goto(BASE + '/shop');
            await p.getByRole('button', { name: 'Open menu' }).click();
            await p.getByRole('navigation', { name: 'Shop categories' }).getByRole('link', { name: /Earrings/ }).click();
            await p.waitForURL(/\/c\/earrings(?:\?|$)/);
            await p.getByRole('heading', { name: 'Earrings', exact: true, level: 1 }).waitFor();
            await open();
            assert((await sheet().innerText()).includes('Browsing earrings'));
            await fits();
            await close();
            await p.locator('a[href^="/p/"]').first().click();
            await p.waitForURL('**/p/**');
            const url = p.url();
            await open();
            await chip('How big is it?');
            assert.equal(requests.at(-1).sku, new URL(url).pathname.split('/').at(-1));
            await close();
            await p.goBack();
            await open();
            assert((await sheet().innerText()).includes('Browsing earrings'));
            await close();
            await p.goForward();
            await open();
            await fits();
            await close();
            await p.reload();
            await open();
            assert(await sheet().locator('[data-role="user"]').count() > 0);
            await close();
        });
        await check('ad session across home/category/grid; direct URL clears ad', async () => {
            await p.goto(BASE + '/p/ciel-hoops-40mm?ad_group=wedding-guest-gift');
            await p.getByRole('link', { name: 'Cosmos home' }).click();
            await p.waitForURL('**/shop?**');
            assert(p.url().includes('ad_group=wedding-guest-gift'));
            await open();
            assert(!/shower|water/i.test(await sheet().locator('[aria-label="Suggested questions"]').innerText()));
            await close();
            await p.getByRole('link', { name: 'Earrings', exact: true }).click();
            await p.locator('a[href^="/p/"]').first().click();
            await p.waitForURL('**/p/**');
            assert(p.url().includes('ad_group=wedding-guest-gift'));
            await p.goto(BASE + '/shop');
            await open();
            assert((await sheet().locator('[aria-label="Suggested questions"]').innerText()).includes('Waterproof everyday pieces'));
            await close();
        });
        await check('500-character limit, horizontal cards, keyboard Escape and focus return', async () => {
            await p.goto(BASE + '/shop');
            await open();
            await sheet().getByRole('button', { name: 'New chat' }).click();
            await chip('Gift under ₹2,000');
            const rows = sheet().locator('div.overflow-x-auto');
            assert(await rows.count() > 0);
            await sheet().getByRole('textbox').fill('a'.repeat(550));
            assert.equal((await sheet().getByRole('textbox').inputValue()).length, 500);
            assert((await sheet().innerText()).includes('500/500'));
            await fits();
            await p.keyboard.press('Escape');
            await sheet().waitFor({ state: 'hidden' });
            assert.equal(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Ask Cosmos AI');
        });
        await check('drawer handle drag snaps down and up', async () => {
            await open();
            await sheet().getByRole('textbox').focus();
            await p.waitForTimeout(600);
            const h = await p.locator('[data-vaul-handle]').boundingBox();
            await p.mouse.move(h.x + h.width / 2, h.y + 20);
            await p.mouse.down();
            await p.mouse.move(h.x + h.width / 2, h.y + 240, { steps: 30 });
            await p.mouse.up();
            await p.waitForTimeout(600);
            assert(await sheet().getByRole('button', { name: 'Expand chat' }).count() > 0);
            await fits();
            const h2 = await p.locator('[data-vaul-handle]').boundingBox();
            await p.mouse.move(h2.x + h2.width / 2, h2.y + 20);
            await p.mouse.down();
            await p.mouse.move(h2.x + h2.width / 2, h2.y - 240, { steps: 30 });
            await p.mouse.up();
            await p.waitForTimeout(600);
            assert(await sheet().getByRole('button', { name: 'Collapse chat' }).count() > 0);
            await fits();
            await close();
        });
        await check('reset and navigation cancel a delayed reply without stale bag actions', async () => {
            const payload = 'data: ' + JSON.stringify({ type: 'start', messageId: 'delayed' }) + '\n\ndata: ' + JSON.stringify({ type: 'data-cart', data: { cart: [{ sku: 'ciel-hoops-40mm', qty: 15 }], added: { title: 'Delayed test action', qty: 15 } } }) + '\n\ndata: ' + JSON.stringify({ type: 'finish' }) + '\n\ndata: [DONE]\n\n';
            await p.route('**/api/chat', async (route) => { await new Promise(r => setTimeout(r, 1600)); await route.fulfill({ contentType: 'text/event-stream', headers: { 'x-vercel-ai-ui-message-stream': 'v1' }, body: payload }).catch(() => { }); });
            await p.goto(BASE + '/shop');
            await open();
            await sheet().getByRole('button', { name: 'New chat' }).click();
            const before = await p.evaluate(() => localStorage.getItem('cosmos-demo-state-v1'));
            await sheet().getByRole('textbox').fill('Delayed test');
            await sheet().getByRole('button', { name: 'Send', exact: true }).click();
            await sheet().locator('[data-role="typing"]').waitFor();
            await sheet().getByRole('button', { name: 'New chat' }).click();
            await p.waitForTimeout(1800);
            assert.equal(await sheet().locator('[data-role="user"]').count(), 0);
            assert.equal(await p.evaluate(() => localStorage.getItem('cosmos-demo-state-v1')), before);
            await sheet().getByRole('textbox').fill('Delayed navigation');
            await sheet().getByRole('button', { name: 'Send', exact: true }).click();
            await close();
            await p.getByRole('link', { name: 'Earrings', exact: true }).click();
            await p.waitForTimeout(1800);
            await open();
            assert.equal(await sheet().locator('[data-role="typing"]').count(), 0);
            assert.equal(await p.evaluate(() => localStorage.getItem('cosmos-demo-state-v1')), before);
            await close();
            await p.unroute('**/api/chat');
        });
        await check('same-origin iframe with storage denied still navigates and keeps history', async () => {
            const c = await b.newContext({ viewport: { width: 1280, height: 1000 } });
            await c.addInitScript(() => { for (const method of ['getItem', 'setItem', 'removeItem'])
                Storage.prototype[method] = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
            const t = await c.newPage();
            await t.route('**/iframe-harness', route => route.fulfill({ contentType: 'text/html', body: '<iframe title="Shop prototype" src="/shop" style="width:390px;height:844px;border:0"></iframe>' }));
            await t.goto(BASE + '/iframe-harness');
            const f = t.frameLocator('iframe');
            await f.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).click();
            await f.getByRole('button', { name: 'Gift under ₹2,000', exact: true }).click();
            await f.locator('[data-cosmos-sheet] a[aria-label^="View "]').first().waitFor();
            await f.locator('[data-cosmos-sheet] a[aria-label^="View "]').first().click();
            await f.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).click();
            assert(await f.getByText(/Now viewing:/).count() > 0);
            const bounds = await f.locator('[data-cosmos-sheet]').boundingBox();
            assert(bounds.width <= 390);
            await c.close();
        });
        await check('corrupt saved session cannot break the shop', async () => {
            const c = await b.newContext({ viewport: { width: 390, height: 844 } });
            await c.addInitScript(() => sessionStorage.setItem('cosmos-chat-v1', JSON.stringify({ messages: [{ id: 'broken', role: 'user', parts: null }], dividers: [] })));
            const t = await c.newPage();
            const e = [];
            t.on('pageerror', x => e.push(x.message));
            await t.goto(BASE + '/shop');
            await t.getByRole('button', { name: 'Ask Cosmos AI', exact: true }).click();
            await t.locator('[data-cosmos-sheet]').waitFor();
            assert.equal(await t.locator('[data-role="user"]').count(), 0);
            assert.deepEqual(e, []);
            await c.close();
        });
        await check('guided approval unlocks steel ad', async () => {
            await p.goto(BASE + '/chatgpt?c=conv-sensitive');
            assert.equal(await p.locator('a[href^="/p/"]').count(), 0);
            await p.evaluate(() => { const key = 'cosmos-demo-state-v1', s = JSON.parse(localStorage.getItem(key) || '{}'); localStorage.setItem(key, JSON.stringify({ ...s, approvedProposals: ['prop-new-ad-group-steel-earrings'] })); dispatchEvent(new Event('storage')); });
            await p.locator('a[href^="/p/"]').click();
            await open();
            await chip('What metal is this?');
            assert((await sheet().innerText()).includes('stainless steel'));
            await fits();
            await close();
        });
        await check('no browser errors', () => assert.deepEqual(errors, []));
    }
    finally {
        fs.writeFileSync(OUT + '/results.json', JSON.stringify(results, null, 2));
        await b.close();
        if (results.some(x => !x.pass))
            process.exitCode = 1;
    }
})();
