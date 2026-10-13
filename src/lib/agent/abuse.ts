/**
 * G2: abuse filter with strikes. An input check for profanity and harassment in English and transliterated Hindi
 * (Gemini's safety block in the route counts too). A hit gets a fixed line and no model call; the shopper's words
 * are never repeated or logged. Strikes are counted from the conversation itself (how many times the decline line
 * has been sent), so they are per session and "New chat" resets them. The 3rd strike ends the chat.
 * Client-safe (no server imports): the sheet uses END_LINE to disable the input.
 */

export const ABUSE_LINE = "I'm here to help with Cosmos jewellery and orders, so I can't respond to that. Is there something I can help you find?";
export const END_LINE = "I'll stop here for now. Our care team is at care@cosmosjewels.example if you need help.";
export const MAX_STRIKES = 3;

/** Lowercase, undo common character swaps (f*ck, sh1t, @ss), collapse stretched letters (stuuupid). */
function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[$5]/g, "s")
    .replace(/(\w)[*.\-_]+(?=\w)/g, "$1") // f*ck → fck, s.h.i.t → shit
    .replace(/(\w)\1{2,}/g, "$1$1");
}

// whole-word profanity (English); stems match common endings
const PROFANITY = /\b(f+u*c*k+\w*|fck\w*|fuk\w*|motherf\w*|shit\w*|bullshit|bitch\w*|bastard\w*|asshole\w*|arsehole\w*|dickhead\w*|cunt\w*|slut\w*|whore\w*|retard\w*|wanker\w*|twat\w*)\b/;
// transliterated Hindi abuse
const HINDI = /\b(chutiy\w*|chutia\w*|madarchod\w*|maderchod\w*|behenchod\w*|bhenchod\w*|bhencho\w*|bhosd\w*|bsdk|gaand\w*|gandu\w*|harami\w*|haramzad\w*|randi\w*|lavd[ae]|laud[ae]|lund|kamina\w*|kamine|kutt[aei]y?)\b/;
// harassment aimed at the assistant or a person ("you're useless", "shut up", "tu pagal hai")
const HARASS = [
  /\bshut (up|ur mouth|your mouth)\b/,
  /\b(you|u|ur|you'?re|youre|you are)\b.{0,20}\b(idiot|moron|stupid|dumb|useless|pathetic|trash|garbage|loser|worthless)\b/,
  /\b(idiot|moron|stupid|dumb) (bot|ai|machine|thing)\b/,
  /\b(kill yourself|kys|go to hell|go die|screw you|get lost|piss off)\b/,
  /\b(tu|tum|tume|tumhe|you|u)\b.{0,20}\b(pagal|bewakoof|bevkoof|bewkoof|gadha|gadhe|ullu|nalayak|nikamm[ae])\b/,
];

export type AbuseCheck = { hit: boolean; category: "profanity" | "hindi_abuse" | "harassment" | null };

/** Never returns the matched words: only whether it hit and which list. */
export function abuseCheck(text: string): AbuseCheck {
  const t = normalise(text);
  if (PROFANITY.test(t)) return { hit: true, category: "profanity" };
  if (HINDI.test(t)) return { hit: true, category: "hindi_abuse" };
  if (HARASS.some((re) => re.test(t))) return { hit: true, category: "harassment" };
  return { hit: false, category: null };
}

type Msg = { role: string; parts: { type: string; text?: string }[] };
const textOf = (m: Msg) => m.parts.map((p) => (p.type === "text" ? p.text ?? "" : "")).join(" ");

/** Strikes so far in this conversation (the decline line, from the word list or a safety block). */
export const strikesSoFar = (messages: Msg[]) => messages.filter((m) => m.role === "assistant" && textOf(m).includes(ABUSE_LINE)).length;
/** The chat was ended by the 3rd strike (only "New chat" starts a new one). */
export const chatEnded = (messages: Msg[]) => messages.some((m) => m.role === "assistant" && textOf(m).includes(END_LINE));
