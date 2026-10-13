import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { catalogDesignIndex, searchCatalog } from "../../src/lib/tools/core";
import { loadDb } from "../../src/lib/data/disk";
import { followUpChips, type ChipContext } from "../../src/lib/agent/chips";
import { forcedTool } from "../../src/lib/agent/intents";

const live = process.argv.includes("--live");
if (live) {
  loadEnvConfig(process.cwd());
} else {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
}

const db = loadDb();
const home: ChipContext = { kind: "home", product: null, adGroupId: null, loggedIn: false };
const skus = (r: ReturnType<typeof searchCatalog>) => r.results.map((p) => p.sku);
let passed = 0;
function check(name: string, test: () => void) {
  test();
  passed++;
  console.log(`PASS ${name}`);
}

check("semantic selection keeps all matching designs across pages", () => {
  const ranked = ["noor-mini-jhumkas", "noor-kundan-jhumkas", "noor-pearl-jhumkas", "noor-temple-jhumkas"];
  const first = searchCatalog(db, "Indian earrings", { category: "earrings", ranked_skus: ranked, limit: 3 });
  assert.deepEqual(skus(first), ranked.slice(0, 3));
  assert.equal(first.total_matches, 4);
  assert.equal(first.has_more, true);
  const next = searchCatalog(db, first.query, { ...first.filters, exclude: skus(first) });
  assert.deepEqual(skus(next), ranked.slice(3));
  assert.equal(next.has_more, false);
});

check("discovery routing preserves safety and preference capture", () => {
  assert.equal(forcedTool("Show unusual earrings", false), "search_catalog");
  assert.equal(forcedTool("Suggest earrings for my nickel allergy", false), "handoff");
  assert.equal(forcedTool("I'm looking for something under 2000 for office", true), "search_catalog");
});

check("pendant requests exclude plain chains and merchant-excluded pendants", () => {
  const result = searchCatalog(db, "Show necklaces with pendants");
  assert.deepEqual(new Set(skus(result)), new Set(["luna-coin-pendant", "luna-evil-eye-pendant"]));
  assert.ok(result.results.every((p) => p.category === "necklace" && p.subtype === "pendant"));
});

check("gift browsing matches the catalogue's gifting occasion", () => {
  for (const query of ["gift", "gifts", "gifting"]) {
    const result = searchCatalog(db, query, { occasion: "gifting", max_price_inr: 2000, limit: 3 });
    assert.equal(result.count, 3);
    assert.ok(result.results.every((p) => p.occasions.includes("gifting") && p.price_inr <= 2000));
  }
});

check("unknown designs do not return generic high-rated earrings", () => {
  assert.equal(searchCatalog(db, "square earrings").count, 0);
  assert.equal(searchCatalog(db, "spiral earrings").count, 0);
  assert.equal(searchCatalog(db, "earrings", { ranked_skus: [] }).count, 0);
});

check("photo-derived designs work without shape keywords in the title", () => {
  const copy = structuredClone(db);
  const product = copy.products.find((p) => p.handle === "lia-flower-studs")!;
  product.title = "Lia Studs";
  product.tags = ["earrings"];
  product.metafields.jewellery.collection = "Studio";
  product.metafields.jewellery.shape = null;
  assert.ok(skus(searchCatalog(copy, "floral earrings")).includes(product.handle));
});

check("explicit photo matches fill omissions in the model's candidate list", () => {
  const result = searchCatalog(db, "Show floral earrings", {
    ranked_skus: ["lia-flower-studs"], design_terms: ["flower"], category: "earrings",
  });
  assert.deepEqual(new Set(skus(result)), new Set(["lia-flower-studs", "noor-kundan-jhumkas"]));
});

check("alternative design requests match either motif, not both at once", () => {
  const result = searchCatalog(db, "heart or flower earrings", {
    ranked_skus: ["tara-heart-studs", "lia-flower-studs"],
    design_terms: ["heart", "flower"], design_match: "any", limit: 35,
  });
  assert.deepEqual(new Set(skus(result)), new Set(["tara-heart-studs", "lia-flower-studs", "noor-kundan-jhumkas"]));
});

check("the design index contains appearance evidence, not extracted benefits", () => {
  const index = catalogDesignIndex(db);
  assert.ok(index.find((p) => p.sku === "kira-twist-huggies")?.photo_design_tags.includes("twisted rope"));
  assert.ok(!index.some((p) => p.sku === "luna-heart-pendant"));
  assert.ok(!JSON.stringify(index).includes("unverified"));
  assert.ok(!JSON.stringify(index).includes("water_resistant"));
});

check("semantic ranking cannot override price, category, or verification", () => {
  const ranked = db.products.map((p) => p.handle);
  const result = searchCatalog(db, "pieces for water", {
    ranked_skus: ranked, category: "earrings", water_resistant: true, max_price_inr: 2500, limit: 35,
  });
  assert.ok(result.count > 0);
  assert.ok(result.results.every((p) => p.category === "earrings" && p.water_resistant === true && p.price_inr <= 2500));
  assert.equal(searchCatalog(db, "", { ranked_skus: ["invented", "luna-heart-pendant"] }).count, 0);
});

check("specific appearance constraints reject loosely related semantic candidates", () => {
  const result = searchCatalog(db, "earrings with twisted rope texture", {
    ranked_skus: ["noor-mini-jhumkas", "kira-twist-huggies", "veda-twist-ring"],
    design_terms: ["twisted rope"],
  });
  assert.deepEqual(skus(result), ["kira-twist-huggies"]);
});

check("an explicit category excludes wrong-category semantic selections", () => {
  assert.deepEqual(skus(searchCatalog(db, "distinctive earrings", {
    ranked_skus: ["luna-evil-eye-pendant", "lia-flower-studs", "tara-heart-studs"],
  })), ["lia-flower-studs", "tara-heart-studs"]);
});

check("subjective requests are not narrowed to an unrequested hard style", () => {
  const result = searchCatalog(db, "playful earrings with unusual shapes", {
    ranked_skus: ["tara-heart-studs", "lia-flower-studs", "sana-chain-threaders"],
    design_terms: ["statement"],
  });
  assert.equal(result.count, 3);
  assert.deepEqual(result.filters.design_terms, []);
  assert.deepEqual(result.ignored_design_terms, ["statement"]);
});

check("Show more remains repeatable until the result set is exhausted", () => {
  const used = new Set(["show more"]);
  assert.ok(followUpChips([{ tool: "search_catalog", output: { count: 3, has_more: true } }], home, used).includes("Show more"));
  assert.ok(!followUpChips([{ tool: "search_catalog", output: { count: 1, has_more: false } }], home, used).includes("Show more"));
  assert.ok(!followUpChips([{ tool: "search_catalog", output: { count: 0, has_more: false } }], home, used).includes("Show more"));
});

type Part = Record<string, unknown>;
type Message = { id: string; role: "user" | "assistant"; parts: Part[] };

async function pagination() {
  const { POST } = await import("../../src/app/api/chat/route");
  const ranked = db.products.filter((p) => p.metafields.jewellery.category === "earrings").map((p) => p.handle);
  // The effective price filter came from session preferences, not the model's original tool input.
  const input = { query: "earrings", ranked_skus: ranked, limit: 3 };
  const first = searchCatalog(db, input.query, { ...input, max_price_inr: 2000 });
  const expected = searchCatalog(db, input.query, { ...first.filters, limit: 35 });
  assert.ok(expected.count > 6, "exercise more than one Show more click");
  const seen = new Set(skus(first));
  const history: Message[] = [
    { id: "u0", role: "user", parts: [{ type: "text", text: "Find earrings for me" }] },
    { id: "a0", role: "assistant", parts: [{ type: "tool-search_catalog", toolCallId: "s0", state: "output-available", input, output: first }] },
  ];
  let hasMore = first.has_more;
  let page = 0;
  while (hasMore) {
    assert.ok(page++ < 12, "pagination must terminate");
    history.push({ id: `u${page}`, role: "user", parts: [{ type: "text", text: "Show more" }] });
    const request = new Request("http://test.local/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history, context: { sku: null, adGroupId: null, pincode: null, tier: 1, path: "/shop", cart: [] } }),
    });
    const events = (await (await POST(request)).text()).split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)) as Part);
    const usage = events.find((e) => e.type === "data-usage")?.data as { mode: string };
    assert.equal(usage.mode, "fast_path");
    const call = events.find((e) => e.type === "tool-input-available" && e.toolName === "search_catalog");
    assert.ok(call);
    const output = events.find((e) => e.type === "tool-output-available" && e.toolCallId === call.toolCallId)?.output as ReturnType<typeof searchCatalog>;
    assert.ok(output);
    assert.ok(output.count <= 3);
    assert.equal(output.filters.max_price_inr, 2000);
    for (const product of output.results) {
      assert.ok(!seen.has(product.sku), `duplicate ${product.sku}`);
      assert.ok(product.price_inr <= 2000);
      seen.add(product.sku);
    }
    hasMore = output.has_more;
    assert.equal(followUpChips([{ tool: "search_catalog", output }], home, new Set(["show more"])).includes("Show more"), hasMore);
    history.push({ id: `a${page}`, role: "assistant", parts: [{ type: "tool-search_catalog", toolCallId: call.toolCallId, state: "output-available", input: call.input, output }] });
  }
  assert.deepEqual(seen, new Set(skus(expected)));
  passed++;
  console.log("PASS real-route pagination preserves filters, avoids repeats, and reaches every match");
  if (live) {
    const cases = [
      { query: "Show Indian earrings", category: "earrings", expected: ["noor-kundan-jhumkas", "noor-pearl-jhumkas", "noor-mini-jhumkas", "noor-temple-jhumkas"] },
      { query: "Show quirky design earrings", category: "earrings", minimum: 3 },
      { query: "Suggest playful earrings with unusual shapes", category: "earrings", minimum: 3 },
      { query: "Show necklaces with pendants", category: "necklace", expected: ["luna-coin-pendant", "luna-evil-eye-pendant"], exact: true },
      { query: "Show floral earrings", category: "earrings", expected: ["lia-flower-studs", "noor-kundan-jhumkas"] },
      { query: "Show heart or flower earrings", category: "earrings", expected: ["tara-heart-studs", "lia-flower-studs", "noor-kundan-jhumkas"], exact: true },
      { query: "Show necklaces without pendants", category: "necklace", expected: ["sol-paperclip-chain", "sol-snake-chain", "sol-rope-chain", "sol-layered-chain-set"] },
      { query: "Find earrings with a twisted rope texture", category: "earrings", expected: ["kira-twist-huggies"], exact: true },
      { query: "Show square earrings", category: "earrings", expected: [], exact: true },
      { query: "Recommend bold statement rings", category: "ring", expected: ["veda-dome-ring", "veda-signet-ring"] },
    ];
    const failures: string[] = [];
    for (const c of cases) {
      try {
        const req = new Request("http://test.local/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: `cosmos_vid=discovery-${Date.now()}` },
          body: JSON.stringify({ messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: c.query }] }], context: { sku: null, adGroupId: null, pincode: null, tier: 1, path: "/shop", cart: [] } }),
        });
        const events = (await (await POST(req)).text()).split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)) as Part);
        const usage = events.findLast((e) => e.type === "data-usage")?.data as { mode: string };
        assert.ok(["llm", "llm_fallback"].includes(usage?.mode), "must use the live model");
        const call = events.findLast((e) => e.type === "tool-input-available" && e.toolName === "search_catalog");
        assert.ok(call, "must search the catalogue");
        const output = events.find((e) => e.type === "tool-output-available" && e.toolCallId === call.toolCallId)?.output as ReturnType<typeof searchCatalog>;
        assert.ok(output);
        assert.ok(output.count <= 3);
        assert.ok(output.results.every((p) => p.category === c.category));
        // Check the whole eligible candidate set, not just the first three rendered cards.
        const matches = skus(searchCatalog(db, output.query, { ...output.filters, limit: db.products.length }));
        if (c.expected) for (const sku of c.expected) assert.ok(matches.includes(sku), `missed ${sku}`);
        if (c.exact) assert.deepEqual(new Set(matches), new Set(c.expected));
        if (c.minimum) assert.ok(matches.length >= c.minimum, "too few relevant candidates");
        assert.equal(events.filter((e) => e.type === "data-guard" && (e.data as { pass: boolean }).pass === false).length, 0, "guardrail failed");
        passed++;
        console.log(`PASS live "${c.query}": ${matches.length} candidates, ${output.count} shown`);
      } catch (error) {
        failures.push(`${c.query}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    assert.deepEqual(failures, [], failures.join("\n"));
  }
  console.log(`${passed} discovery checks passed`);
}

void pagination().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
