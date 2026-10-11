/**
 * `npm run seed`: writes every Part B file into /data (and evals/). Deterministic: same input, same bytes.
 * Demo-script cached responses are filled afterwards by `npm run demo-cache` (they run the real tools).
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildProducts, PLANTED } from "./catalogue";
import { brand, adGroups, mockChatgpt, brandRules, offers, logistics, shoppers, razorpay, merchant } from "./static";
import { buildReturns } from "./returns";
import { buildOrdersSessions, CELL_TARGETS } from "./orders";
import { buildEvals, DEMO_STEPS, TRY_IT_CHIPS } from "./evals";

const ROOT = join(__dirname, "..", "..");
const write = (rel: string, data: unknown) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
  console.log("wrote", rel);
};

const products = buildProducts();
const { file: returns, labels } = buildReturns(products);
const { ordersSessions, chatLogs, chatThemes } = buildOrdersSessions(products, returns.skus);

write("data/brand.json", brand);
write("data/catalogue/products.json", { products });
write("data/ad_groups.json", adGroups);
write("data/mock_chatgpt.json", mockChatgpt);
write("data/brand_rules.json", brandRules);
write("data/offers.json", offers);
write("data/logistics.json", logistics);
write("data/returns.json", returns);
write("data/shoppers.json", shoppers);
write("data/razorpay.json", razorpay);
write("data/orders_sessions.json", ordersSessions);
write("data/chat_logs_seed.json", chatLogs);
write("data/merchant.json", merchant);
write("evals/cases.json", buildEvals());

// keep previously built cached responses if the demo cache has run
const demoPath = join(ROOT, "data/demo_script.json");
const prev = existsSync(demoPath) ? JSON.parse(readFileSync(demoPath, "utf8")) : null;
write("data/demo_script.json", {
  steps: DEMO_STEPS.map((s) => ({ ...s, cached_response: prev?.steps?.find((p: { id: string }) => p.id === s.id)?.cached_response ?? null })),
  try_it_chips: TRY_IT_CHIPS,
});

// image manifest: two photos per SKU (product, then on model) from the supplied Cosmos catalogue images
const SUPPLIED = "Cosmos catalogue images (AI-generated prototype photography, supplied by the user; see BUILD_LOG)";
const photo = (file: string) => ({ file, kind: "photo", query: null, source: { provider: "cosmos-catalogue", page_url: null, photographer: null, license: SUPPLIED } });
write("data/images/manifest.json", {
  style_note: "Two images per SKU: product shot first, then on model. Installed from ~/Desktop/Cosmos-Full-Catalogue-Images (sha256-verified against its image-manifest.json), resized to 800px JPEG for mobile. Model proportions are approximate; size answers come from verified mm data.",
  products: Object.fromEntries(products.map((p) => [p.handle, { front: photo(`/images/products/${p.handle}/front.jpg`), on_model: photo(`/images/products/${p.handle}/on_model.jpg`) }])),
  lifestyle: {
    office: { file: "/images/lifestyle/office.jpg", kind: "placeholder", query: "woman office gold earrings", source: null },
    wedding: { file: "/images/lifestyle/wedding.jpg", kind: "placeholder", query: "indian wedding guest jewellery", source: null },
  },
});

write("evals/planted_facts.json", {
  note: "Answer key for validate-data and pipeline scoring. Offline pipelines and the agent must never read this file.",
  ...PLANTED,
  hero: "ciel-hoops-40mm",
  keeper: "ciel-hoops-30mm",
  rescue: "aria-hoops-28mm",
  layered_set: "sol-layered-chain-set",
  delivery_pune: [
    { sku: "ciel-hoops-40mm", ships: "2026-10-13", arrives: "2026-10-16" },
    { sku: "ciel-hoops-30mm", ships: "2026-10-18", arrives: "2026-10-21" },
    { sku: "aria-hoops-28mm", ships: "2026-10-13", arrives: "2026-10-16" },
  ],
  chat_themes: chatThemes,
  return_reason_labels: labels,
  metric_targets: {
    kept_per_click_C: 61, kept_per_click_A: 44, kept_per_click_wedding: 31,
    return_rto_C: 0.09, return_rto_A: 0.14, chat_open_C_min: 0.15, chat_open_C_max: 0.25,
    ...Object.fromEntries(Object.entries(CELL_TARGETS).flatMap(([arm, m]) => Object.entries(m).map(([ag, v]) => [`cell_${arm}_${ag}`, v]))),
  },
});
