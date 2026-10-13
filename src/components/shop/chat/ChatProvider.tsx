"use client";
/**
 * One Cosmos AI conversation per browser session, shared by every shop page.
 *
 * - Lives in the root layout, so a single useChat instance (stable id) survives client-side navigation.
 * - Messages, "Now viewing" dividers and the session's ad context are saved to sessionStorage after each finished
 *   reply and read back when the provider first renders in the browser, so a refresh keeps the chat (the sheet is
 *   closed on load, so the server's empty render and the browser's restored state show the same markup). Every storage call is in try/catch with an
 *   in-memory fallback, because storage can be blocked (private windows, the /demo page's iframe). Nothing here
 *   reads window.top or the parent frame.
 * - Each page registers itself (product, home, category, bag). The next message carries that page's context;
 *   moving to another product adds a "Now viewing: …" divider under the conversation so far.
 * - The sheet itself renders inside each page's phone frame (AskCosmos → ChatSheet); only the state lives here.
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { readState, writeState, type CartLine } from "@/lib/state";
import type { CardVM } from "@/lib/view";
import type { PageKind } from "@/lib/agent/chips";

export type ChatPage = {
  kind: PageKind;
  sku: string | null;
  title: string | null; // product title, or the category label
  adGroupId: string | null; // from this page's URL (product links carry it); falls back to the session's
  arm: "A" | "B" | "C" | null;
  pincode: string | null; // the logged-in shopper's saved pincode (server decides; never trusted for identity)
  loggedIn: boolean;
  opener: string; // first assistant line when the conversation is empty
  linkQuery: string; // carried on product links from the chat
};
export type Divider = { afterId: string; label: string };
type Saved = { messages: UIMessage[]; dividers: Divider[]; lastSku: string | null; adGroupId: string | null; arm: ChatPage["arm"] };

const KEY = "cosmos-chat-v1";
const MAX_SAVED = 40; // messages kept across refreshes (the server only reads the last 10)
let memory: Saved | null = null; // fallback when sessionStorage is unavailable (blocked iframe, private mode)

function load(): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {}
  return memory;
}
function save(s: Saved) {
  memory = s;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {} // quota or blocked: the in-memory copy keeps the chat for this tab
}
function clear() {
  memory = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {}
}

type Ctx = {
  messages: UIMessage[];
  status: ReturnType<typeof useChat>["status"];
  send: (text: string) => void;
  newChat: () => void;
  page: ChatPage | null;
  register: (p: ChatPage) => void;
  dividers: Divider[];
  pageStart: number; // index of the first message on the current page (follow-up chips only for answers here)
  adGroupId: string | null; // effective ad context: this page's, else the session's
  arm: ChatPage["arm"];
  cards: Record<string, CardVM>;
  open: boolean;
  setOpen: (o: boolean) => void;
  openWith: (text?: string) => void;
  toast: string | null;
  };
const ChatCtx = createContext<Ctx | null>(null);

export function useCosmosChat() {
  const c = useContext(ChatCtx);
  if (!c) throw new Error("useCosmosChat outside ChatProvider");
  return c;
}

export default function ChatProvider({ cards, children }: { cards: Record<string, CardVM>; children: React.ReactNode }) {
  const [initial] = useState<Saved | null>(() => (typeof window === "undefined" ? null : load()));
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/chat" }));
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { messages, sendMessage, status, setMessages, stop } = useChat({
    id: "cosmos-session",
    transport,
    messages: initial?.messages ?? [],
    // data parts from the agent: a new bag (header count updates at once, plus a toast) and saved preferences
    onData: (part) => {
      if (part.type === "data-cart") {
        const d = part.data as { cart: CartLine[]; added: { title: string; qty: number } };
        writeState({ cart: d.cart });
        setToast(`Added ${d.added.qty} × ${d.added.title} to your bag`);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2600);
      }
      if (part.type === "data-preferences") {
        try {
          document.cookie = `cosmos_prefs=${encodeURIComponent(JSON.stringify((part.data as { preferences: unknown }).preferences))}; path=/; samesite=lax`; // session cookie
        } catch {}
      }
    },
  });

  const [page, setPage] = useState<ChatPage | null>(null);
  const [dividers, setDividers] = useState<Divider[]>(initial?.dividers ?? []);
  const [session, setSession] = useState<{ lastSku: string | null; adGroupId: string | null; arm: ChatPage["arm"] }>({ lastSku: initial?.lastSku ?? null, adGroupId: initial?.adGroupId ?? null, arm: initial?.arm ?? null });
  const [open, setOpen] = useState(false);
  const [pageStart, setPageStart] = useState(initial?.messages?.length ?? 0);
  const pageKeyRef = useRef<string | null>(null);
  const sessionRef = useRef(session);
  const messagesRef = useRef(messages);
  useEffect(() => {
    sessionRef.current = session;
    messagesRef.current = messages;
  }, [session, messages]);

  // save after each finished reply (not on every streamed token)
  useEffect(() => {
    if (status === "streaming" || status === "submitted") return;
    save({ messages: messages.slice(-MAX_SAVED), dividers, ...session });
  }, [status, messages, dividers, session]);

  /** A page announces itself. A different product than last time → divider (if there is a conversation). */
  const register = useCallback((p: ChatPage) => {
    setPage(p);
    setOpen(false);
    const key = `${p.kind}|${p.sku ?? ""}`;
    if (key !== pageKeyRef.current) {
      pageKeyRef.current = key;
      setPageStart(messagesRef.current.length); // a new page: its starter chips, not the last page's follow-ups
    } // a new page starts with the sheet closed; the conversation is kept
    const s = sessionRef.current;
    const next = { ...s, adGroupId: p.adGroupId ?? s.adGroupId, arm: p.arm ?? s.arm };
    if (p.kind === "product" && p.sku && p.sku !== s.lastSku) {
      const last = messagesRef.current.at(-1);
      if (last) setDividers((d) => (d.some((x) => x.afterId === last.id) ? d : [...d, { afterId: last.id, label: `Now viewing: ${p.title}` }]));
      next.lastSku = p.sku;
    }
    sessionRef.current = next;
    setSession(next);
  }, []);

  // a product page follows its own URL (ad or direct visit), so the sheet matches the page; home, category and the
  // bag follow the session's ad
  const adGroupId = page?.kind === "product" ? page.adGroupId : page?.adGroupId ?? session.adGroupId;
  const arm = page?.arm ?? session.arm;

  // read at send time so the bag and login flag are current (they live in the browser)
  const send = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const st = readState();
      const context = {
        sku: page?.kind === "product" ? page.sku : null,
        adGroupId,
        pincode: page?.pincode ?? null,
        tier: st.loggedIn || page?.loggedIn ? 3 : 1,
        cart: st.cart,
        loginOffered: st.loginOffered,
        path: `${location.pathname}${location.search}`,
      };
      sendMessage({ text: text.trim() }, { body: { context } });
    },
    [page, adGroupId, sendMessage],
  );

  const openWith = useCallback(
    (text?: string) => {
      setOpen(true);
      if (text) send(text);
    },
    [send],
  );

  const newChat = useCallback(() => {
    stop();
    setMessages([]);
    setDividers([]);
    setPageStart(0);
    setSession((s) => ({ ...s, lastSku: page?.kind === "product" ? page.sku : null }));
    clear();
  }, [stop, setMessages, page]);

  const value = useMemo<Ctx>(
    () => ({ messages, status, send, newChat, page, register, dividers, pageStart, adGroupId, arm, cards, open, setOpen, openWith, toast }),
    [messages, status, send, newChat, page, register, dividers, pageStart, adGroupId, arm, cards, open, openWith, toast],
  );
  return <ChatCtx.Provider value={value}>{children}</ChatCtx.Provider>;
}
