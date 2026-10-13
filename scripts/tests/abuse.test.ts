/**
 * `npm run test:abuse`: the G2 word list. Hits in English and transliterated Hindi (incl. disguised spellings),
 * no hits on mild intensifiers or ordinary shopping questions, and no false positive on any eval message or chip.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abuseCheck, chatEnded, strikesSoFar, ABUSE_LINE, END_LINE } from "../../src/lib/agent/abuse";
import { allChipTexts } from "../../src/lib/agent/chips";

let passed = 0;
const t = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

const HITS = [
  "you are so stupid",
  "shut up and give me a discount",
  "f*ck this website",
  "this is sh1t",
  "stupid bot",
  "tu pagal hai kya",
  "chutiya bot hai ye",
  "bhenchod kab aayega",
  "you're a useless idiot",
  "go to hell",
];
const FINE = [
  "this is damn pretty",
  "bloody gorgeous hoops",
  "hell yes, add them to my bag",
  "can you tell me a joke",
  "bc it's too big for office",
  "Is it nickel-free?",
  "aap ka product thoda bekaar laga",
  "these look laudable",
  "Will these work for office?",
  "Ye office mein pehen sakte hain?",
  "Need it in Pune by 18 Oct",
  "I'm looking for something under ₹2,000 for the office",
];

console.log("hits");
for (const x of HITS) t(`"${x.replace(/[a-z]/gi, (c, i) => (i % 3 ? "·" : c))}" is caught`, () => assert.equal(abuseCheck(x).hit, true, x));
console.log("not abuse");
for (const x of FINE) t(`"${x}" passes`, () => assert.equal(abuseCheck(x).hit, false, x));

console.log("no false positives on eval messages (outside the abuse category) or chips");
const cases = JSON.parse(readFileSync("evals/cases.json", "utf8")).cases as { id: string; category: string; messages: { content: string }[] }[];
const evalHits = cases.filter((c) => c.category !== "abuse").flatMap((c) => c.messages.filter((m) => abuseCheck(m.content).hit).map(() => c.id));
t(`${cases.filter((c) => c.category !== "abuse").length} eval cases clean`, () => assert.deepEqual(evalHits, []));
const chipHits = [...new Set(allChipTexts([]).map((r) => r.text))].filter((x) => abuseCheck(x).hit);
t("all chip texts clean", () => assert.deepEqual(chipHits, []));

console.log("strikes from the conversation");
const a = (text: string) => ({ role: "assistant", parts: [{ type: "text", text }] });
const u = (text: string) => ({ role: "user", parts: [{ type: "text", text }] });
t("two declines = 2 strikes, not ended", () => {
  const m = [u("x"), a(ABUSE_LINE), u("y"), a("Here are some hoops."), u("z"), a(ABUSE_LINE)];
  assert.equal(strikesSoFar(m), 2);
  assert.equal(chatEnded(m), false);
});
t("end line = ended", () => assert.equal(chatEnded([a(END_LINE)]), true));
t("empty (New chat) = 0 strikes", () => assert.equal(strikesSoFar([]), 0));

console.log(`\n${passed} passed`);
