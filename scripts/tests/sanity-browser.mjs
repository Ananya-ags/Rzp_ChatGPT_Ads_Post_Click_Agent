import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.argv[2] || "http://127.0.0.1:3000";
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.BROWSER_CHANNEL || "chrome" }),
  headless: true,
});
const errors = [];
const quoteResponse = (page, match) => page.waitForResponse((r) => r.url().endsWith("/api/checkout/quote") && match(r.request().postDataJSON()));

try {
  const corrupt = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await corrupt.addInitScript(() => localStorage.setItem("cosmos-demo-state-v1", JSON.stringify({ cart: null, approvedProposals: null, loggedIn: "false" })));
  const broken = await corrupt.newPage();
  broken.on("pageerror", (e) => errors.push(e.message));
  await broken.goto(`${BASE}/shop`);
  await broken.getByRole("link", { name: "Bag, 0 items" }).waitFor();
  await broken.getByRole("button", { name: "Ask Cosmos AI", exact: true }).click();
  await broken.locator("[data-cosmos-sheet]").waitFor();
  assert.deepEqual(errors, []);
  await corrupt.close();
  console.log("PASS malformed saved demo data does not crash the shop");

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "cosmos_user", value: "ananya", url: BASE }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  // Only the provider selection is simulated. Amounts and signed order verification still use the real local routes.
  await page.route("**/api/checkout/quote", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), payments_mode: "mock", key_id: null } });
  });
  await page.route("**/api/checkout/order", async (route) => {
    const body = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...body, forceMock: true }) });
  });
  await page.goto(`${BASE}/shop`);
  await page.evaluate(() => localStorage.setItem("cosmos-demo-state-v1", JSON.stringify({ cart: [{ sku: "sol-paperclip-chain", qty: 1 }], loggedIn: true })));
  await page.goto(`${BASE}/checkout`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  let response = quoteResponse(page, (q) => q.bankCard === true);
  await page.getByLabel(/select bank cards/).check();
  let q = await (await response).json();
  assert.ok(q.applied.some((a) => a.id === "bank_offer"));
  await page.getByRole("button", { name: "Continue to payment" }).click();
  assert.equal(await page.locator('input[name="method"]:checked').inputValue(), "card");
  response = quoteResponse(page, (q) => q.method === "online" && q.bankCard === false);
  await page.getByLabel("UPI", { exact: false }).check();
  q = await (await response).json();
  assert.ok(!q.applied.some((a) => a.id === "bank_offer"));
  console.log("PASS switching from eligible card to UPI removes the bank discount");

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const slowQuote = async (route) => { await gate; await route.fallback(); };
  await page.route("**/api/checkout/quote", slowQuote);
  const pending = page.waitForRequest((r) => r.url().endsWith("/api/checkout/quote") && r.postDataJSON().method === "cod");
  response = quoteResponse(page, (q) => q.method === "cod");
  await page.getByLabel(/Cash on delivery/).check();
  await pending;
  assert.ok(await page.getByRole("button", { name: "Updating total..." }).isDisabled());
  assert.equal(await page.locator("dl").count(), 0, "do not show the old price breakdown");
  release();
  await response;
  await page.unroute("**/api/checkout/quote", slowQuote);
  await page.getByRole("button", { name: /Place order/ }).waitFor();
  console.log("PASS payment is blocked while a changed quote is pending");

  const failedQuote = (route) => route.fulfill({ status: 503, json: { error: "Simulated quote failure" } });
  await page.route("**/api/checkout/quote", failedQuote);
  await page.getByLabel("UPI", { exact: false }).check();
  await page.getByRole("alert").filter({ hasText: "Couldn't update your total" }).waitFor();
  assert.ok(await page.getByRole("button", { name: "Total unavailable" }).isDisabled());
  await page.unroute("**/api/checkout/quote", failedQuote);
  response = quoteResponse(page, (q) => q.method === "online");
  await page.getByRole("button", { name: "Retry total" }).click();
  q = await (await response).json();
  await page.getByRole("button", { name: /^Pay ₹/ }).waitFor();
  console.log("PASS quote failures show an error and retry restores the correct total");

  const orderResponse = page.waitForResponse((r) => r.url().endsWith("/api/checkout/order"));
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
  const order = await (await orderResponse).json();
  assert.equal(order.kind, "mock");
  assert.equal(order.amount, q.payable_inr * 100);
  await page.getByRole("button", { name: "Complete simulated payment" }).click();
  await page.waitForURL(/\/order\//);
  await page.getByRole("heading", { name: "Payment received" }).waitFor();
  assert.match(await page.getByRole("heading", { name: "Care tips" }).locator("..").innerText(), /Keep dry/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("cosmos-demo-state-v1")).cart), []);
  console.log("PASS simulated checkout verifies, confirms the order, and clears the bag");

  await page.goto(BASE);
  await page.evaluate(() => {
    document.cookie = `cosmos_prefs=${encodeURIComponent(JSON.stringify({ budget_max_inr: 100 }))}; path=/`;
    sessionStorage.setItem("cosmos-chat-v1", JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Old chat" }] }], dividers: [] }));
  });
  const reload = page.waitForEvent("load");
  await page.getByRole("button", { name: "Reset demo state (also logs out)" }).click();
  await reload;
  const reset = await page.evaluate(() => ({
    prefs: document.cookie.includes("cosmos_prefs="),
    user: document.cookie.includes("cosmos_user="),
    orders: sessionStorage.getItem("cosmos-orders-v1"),
    chat: JSON.parse(sessionStorage.getItem("cosmos-chat-v1") || '{"messages":[]}').messages,
  }));
  assert.deepEqual(reset, { prefs: false, user: false, orders: null, chat: [] });
  console.log("PASS start-page reset clears login, preferences, chat and simulated orders");

  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/shop", "/c/earrings", "/c/necklaces", "/p/ciel-hoops-40mm", "/p/noor-kundan-jhumkas", "/cart", "/login", "/chatgpt", "/demo"]) {
      const r = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      assert.equal(r.status(), 200, path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow: ${path} at ${width}px`);
      const brokenImages = await page.locator("img").evaluateAll((images) => images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute("src")));
      assert.deepEqual(brokenImages, [], `broken images: ${path}`);
    }
  }
  assert.deepEqual(errors, []);
  console.log("PASS main pages: no runtime errors, broken images or horizontal overflow at 360/390/1440px");
} finally {
  await browser.close();
}
