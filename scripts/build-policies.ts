/**
 * `npm run pipelines` step 0 (no LLM): docs/POLICY_KB_DRAFT.md → data/policies.json, one entry per `### \`id\``
 * section: { id, title, group, text, version, last_updated }. The agent reads these only through lookup_policy.
 * Sections under "##" headings without an id (the per-SKU table, the eval gold answers) aren't policies.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PoliciesFileSchema } from "../src/lib/schemas";

const ROOT = join(__dirname, "..");
const SRC = "docs/POLICY_KB_DRAFT.md";
const md = readFileSync(join(ROOT, SRC), "utf8");

let lastUpdated: string;
try {
  lastUpdated = execSync(`git log -1 --format=%cs -- ${SRC}`, { cwd: ROOT, encoding: "utf8" }).trim() || "";
} catch {
  lastUpdated = "";
}
lastUpdated ||= statSync(join(ROOT, SRC)).mtime.toISOString().slice(0, 10);

const humanize = (id: string) => {
  const t = id.replace(/[._]/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const policies: { id: string; title: string; group: string; text: string; version: string; last_updated: string }[] = [];
let group = "";
let cur: (typeof policies)[number] | null = null;
const flush = () => {
  if (cur) {
    cur.text = cur.text.replace(/\n-{3,}\s*$/, "").trim();
    policies.push(cur);
  }
  cur = null;
};
for (const line of md.split("\n")) {
  const h2 = line.match(/^## (.+)$/);
  const h3 = line.match(/^### `([a-z_.]+)`\s*(?:\((.+)\))?/);
  if (h2) {
    flush();
    group = h2[1].trim();
  } else if (h3) {
    flush();
    cur = { id: h3[1], title: h3[2] ? `${humanize(h3[1])} (${h3[2]})` : humanize(h3[1]), group, text: "", version: "v1", last_updated: lastUpdated };
  } else if (cur) cur.text += line + "\n";
}
flush();

const data = PoliciesFileSchema.parse({ source: SRC, version: "v1", last_updated: lastUpdated, policies });
writeFileSync(join(ROOT, "data/policies.json"), JSON.stringify(data, null, 2) + "\n");
console.log(`policies: ${policies.length} sections from ${SRC} → data/policies.json`);
