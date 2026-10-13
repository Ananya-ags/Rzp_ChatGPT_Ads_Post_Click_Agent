import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const data = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../data/${path}`, import.meta.url)), "utf8"));
const products = data("catalogue/products.json").products;
const office = data("ad_groups.json").ad_groups.find((g) => g.id === "office-minimal");
const target = `${BASE}/p/ciel-hoops-40mm?ad_group=office-minimal`;
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.BROWSER_CHANNEL || "chrome" }),
  headless: true,
});
const errors = [];
const query = "I'm looking for earrings under 2000 for the office";
const sheetOf = (page) => page.locator("[data-cosmos-sheet]");
const railOf = (page) => page.locator('section[aria-label="Product recommendations"]');
const handles = async (page) => [...new Set(await railOf(page).locator('a[href^="/p/"]').evaluateAll((links) =>
  links.map((link) => new URL(link.href).pathname.split("/").at(-1))))];

async function send(page, networkPage, text) {
  const sheet = sheetOf(page);
  if (!await sheet.isVisible()) await page.getByRole("button", { name: "Ask Cosmos AI", exact: true }).click();
  await sheet.getByRole("textbox").fill(text);
  const response = networkPage.waitForResponse((r) => r.url().endsWith("/api/chat"));
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  const result = await response;
  assert.equal(result.status(), 200);
  const events = (await result.text()).split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
  assert.ok(events.some((e) => e.type === "data-preferences"), "chat must save preferences");
  await railOf(page).locator("h2").filter({ hasText: "Updated from your chat" }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-role="typing"]'));
  assert.ok(await sheet.isVisible(), "refresh must not close chat");
  assert.ok((await sheet.innerText()).includes(text), "refresh must preserve the conversation");
}

async function assertOfficeRail(page) {
  const rows = await handles(page);
  assert.ok(rows.length > 0);
  for (const sku of rows) {
    const p = products.find((item) => item.handle === sku);
    assert.ok(office.candidate_skus.includes(sku), `out-of-pool recommendation ${sku}`);
    assert.ok(Number(p.variants[0].price) <= 2000, `over-budget recommendation ${sku}`);
    assert.ok(p.metafields.jewellery.occasions.includes("office"));
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(target, { waitUntil: "networkidle" });
  const original = await handles(page);
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  const bag = await page.locator('a[aria-label^="Bag"]').getAttribute("aria-label");
  await send(page, page, query);
  assert.equal(await page.locator('a[aria-label^="Bag"]').getAttribute("aria-label"), bag);
  await assertOfficeRail(page);
  assert.notDeepEqual(await handles(page), original);
  await sheetOf(page).getByRole("button", { name: "Close chat" }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Updated from your chat" }).waitFor();
  await assertOfficeRail(page);
  console.log("PASS mobile: live chat updates the rail, preserves chat/bag, and survives reload");

  await send(page, page, "I'm looking for earrings under 100 for the office");
  await railOf(page).locator('[role="status"]').waitFor();
  assert.equal((await handles(page)).length, 0);
  assert.match(await railOf(page).innerText(), /No pieces in this ad's selection/);
  console.log("PASS empty results: explicit no-match message, no unrelated fallback");

  // a legacy variant param is ignored: the agent experience (and the chat-updated rail) always applies
  await page.goto(`${target}&arm=A`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("heading", { name: "Updated from your chat" }).count(), 1);
  console.log("PASS legacy URL param ignored: chat preferences still apply");

  await context.addCookies([{ name: "cosmos_prefs", value: encodeURIComponent(JSON.stringify({ category: "necklace", budget_max_inr: 3000 })), url: BASE }]);
  await page.goto(`${BASE}/p/ciel-hoops-40mm`, { waitUntil: "networkidle" });
  const direct = await handles(page);
  assert.ok(direct.length > 0);
  assert.ok(direct.every((sku) => products.find((p) => p.handle === sku).metafields.jewellery.category === "necklace"));
  console.log("PASS direct visit: explicit category preferences can select another category");

  await context.request.post(`${BASE}/api/demo/reset`);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByRole("heading", { name: "Updated from your chat" }).count(), 0);
  console.log("PASS demo reset: preference-based rail is cleared");

  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const demo = await desktop.newPage();
  demo.on("pageerror", (error) => errors.push(error.message));
  await demo.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  const frame = await (await demo.waitForSelector('iframe[title^="Cosmos shop"]')).contentFrame();
  await frame.goto(target, { waitUntil: "networkidle" });
  await send(frame, demo, query);
  await assertOfficeRail(frame);
  await demo.getByText("Recommendations updated from chat", { exact: true }).waitFor();
  console.log("PASS desktop demo: iframe recommendations and console update live");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
