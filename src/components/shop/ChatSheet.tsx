"use client";
/**
 * The Cosmos AI sheet (vaul): half (58%) → full (94%); full when the input is focused. Inside the desktop phone
 * frame it portals into the frame, so it never overflows it. The conversation comes from ChatProvider (one per
 * session); this component only renders it for the current page.
 *
 * - Header: star + "Cosmos AI", what the shopper is looking at, "New chat", close.
 * - Full height pins a slim strip: the product (thumbnail, name, price, Add) or the bag (count, total).
 * - Shopper messages are right-aligned bubbles; Cosmos AI is left-aligned with a star avatar and no bubble.
 *   While waiting: three dots and a pulsing star; text streams, then the tool cards appear under it.
 * - Chips: starters from chips.ts for this page, then 2–3 follow-ups chosen in code from the last tool.
 * - Text input only (no attachments), 500 characters, with a counter near the limit; disclosure always visible.
 */
import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { UIMessage } from "ai";
import { ToolCard } from "./ToolCards";
import ProductImage from "./ProductImage";
import CartButton from "./CartButton";
import { ProductLinkProvider } from "./productLink";
import { useCosmosChat } from "./chat/ChatProvider";
import { inr } from "@/lib/view";
import { useDemoState } from "@/lib/state";
import { browseOpener, followUpChips, starterChips, type ChipContext, type LastTool } from "@/lib/agent/chips";
import { norm } from "@/lib/agent/intents";
import CosmosStar from "../brand/CosmosStar";

const MAX_CHARS = 500;
const COUNTER_FROM = 420;
/** Friendly status while a tool runs (never the tool's name). */
const TOOL_STATUS: Record<string, string> = {
  check_delivery: "Checking delivery dates",
  search_catalog: "Finding pieces",
  get_offer: "Checking offers",
  get_return_insight: "Checking what other buyers found",
  lookup_policy: "Checking store policy",
  get_product_facts: "Checking product details",
  add_to_bag: "Adding to your bag",
};
/** Notes the server adds in quick-answer mode: shown as a calm inline note, never as an error. */
const NOTE = /^(Limited mode:|Lots of questions!)/;

type ToolPart = { type: string; state?: string; output?: unknown; toolName?: string };
const toolName = (p: ToolPart) => (p.type === "dynamic-tool" ? p.toolName ?? "" : p.type.startsWith("tool-") ? p.type.slice(5) : "");
const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();

export default function ChatSheet() {
  const chat = useCosmosChat();
  const { page, open, setOpen, messages, status, send, newChat, dividers, pageStart, cards, adGroupId, toast } = chat;
  const [state] = useDemoState();
  const [full, setFull] = useState(false);
  const [input, setInput] = useState("");
  const [kb, setKb] = useState(0); // on-screen keyboard height (iOS), so the input stays above it
  // inside the desktop phone frame, portal the sheet into the frame; on phones, into <body>
  const [container] = useState<HTMLElement | null>(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches ? document.getElementById("phone") : null,
  );
  const listRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";
  const last = messages.at(-1);
  const replying = last?.role === "assistant" && last.parts.some((x) => x.type === "text" && x.text.trim());
  const running = last?.role === "assistant" ? (last.parts as ToolPart[]).filter((p) => toolName(p) && p.state !== "output-available").map(toolName).at(-1) : undefined;

  const hero = page?.kind === "product" && page.sku ? cards[page.sku] ?? null : null;
  const subtitle = !page ? "" : hero ? `You're viewing: ${hero.title}` : page.kind === "bag" ? "Your bag" : page.kind === "category" ? `Browsing ${page.title?.toLowerCase() ?? "the store"}` : "Browsing the store";

  // chips: rules in code (chips.ts), never the model
  const chipCtx: ChipContext = { kind: page?.kind ?? "home", adGroupId, loggedIn: state.loggedIn || !!page?.loggedIn, product: hero ? { handle: hero.handle, title: hero.title, waterResistant: hero.waterResistant } : null };
  const used = new Set(messages.filter((m) => m.role === "user").map((m) => norm(textOf(m))));
  const answeredHere = messages.length - 1 >= pageStart; // the last answer came on this page
  const lastTools: LastTool[] = last?.role === "assistant" && answeredHere ? (last.parts as ToolPart[]).filter((p) => toolName(p) && p.state === "output-available").map((p) => ({ tool: toolName(p), output: (p.output ?? null) as Record<string, unknown> | null })) : [];
  const followUps = !busy && lastTools.length ? followUpChips(lastTools, chipCtx, used) : [];
  const starters = starterChips(chipCtx).map((c) => c.text).filter((t) => !used.has(norm(t)));
  // follow-ups first; fewer than 3 → topped up with this page's unused starters (still rules, never the model)
  const chips = followUps.length ? [...followUps, ...starters.filter((t) => !followUps.includes(t))].slice(0, 3) : starters;

  const cartCount = state.cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = state.cart.reduce((s, l) => s + (cards[l.sku]?.price ?? 0) * l.qty, 0);
  const linkQuery = page?.linkQuery || (adGroupId ? `?ad_group=${adGroupId}` : "");

  // keep the latest question + its answer in view (the answer sits above its cards)
  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;
  useEffect(() => {
    if (!open) return;
    // scroll only the message list (scrollIntoView would also scroll the sheet and push the header out of view)
    const t = setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const el = lastUserId ? document.getElementById(`msg-${lastUserId}`) : null;
      const top = el ? el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 8 : list.scrollHeight;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      list.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    }, 60);
    return () => clearTimeout(t);
  }, [lastUserId, status, open]);

  // iOS: keep the input above the on-screen keyboard
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv || container) return; // the desktop frame has no keyboard
    const onResize = () => {
      const h = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      setKb(h > 120 ? h : 0); // only a real on-screen keyboard, not browser chrome resizing
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [container]);

  const submit = (text: string) => {
    if (!text.trim() || busy) return;
    send(text.slice(0, MAX_CHARS));
    setInput("");
  };
  // product pages bring their own opener (the ad's line on the hero); elsewhere it echoes the session's ad
  const opener = !page ? null : page.kind === "product" ? page.opener : browseOpener(page.kind, adGroupId);

  return (
    <ProductLinkProvider value={linkQuery}>
      {toast && (
        <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-[70] mx-auto flex max-w-[358px] items-center justify-between gap-3 rounded-full bg-ink px-4 py-2.5 text-[12.5px] text-ivory shadow-lg">
          <span className="truncate">✓ {toast}</span>
          <Link href={`/cart${linkQuery}`} className="shrink-0 font-medium text-[#e8c983] underline underline-offset-2">
            View bag
          </Link>
        </div>
      )}
      <Drawer.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFull(false); }} container={container} repositionInputs={false}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/25" />
          <Drawer.Content
            aria-describedby={undefined}
            style={kb ? { paddingBottom: kb } : undefined}
            className={`fixed inset-x-0 bottom-0 z-50 flex max-w-full flex-col overflow-hidden rounded-t-[22px] bg-ivory shadow-[0_-10px_40px_-10px_rgba(31,26,23,0.35)] outline-none transition-[height] duration-300 motion-reduce:transition-none ${full ? "h-[94%]" : "h-[58%]"}`}
          >
            <button onClick={() => setFull((f) => !f)} className="mx-auto flex h-5 w-16 shrink-0 items-center justify-center" aria-label={full ? "Collapse chat" : "Expand chat"}>
              <span className="h-1.5 w-10 rounded-full bg-line" />
            </button>

            {/* header */}
            <div className="flex items-center gap-2 px-4 pb-2">
              <div className="min-w-0 flex-1">
                <Drawer.Title className="flex items-center gap-1.5 font-display text-[17px] leading-tight">
                  <CosmosStar className="size-[18px]" /> Cosmos AI
                </Drawer.Title>
                <p className="truncate text-[11.5px] text-muted">{subtitle}</p>
              </div>
              {messages.length > 0 && (
                <button onClick={newChat} className="h-11 shrink-0 rounded-full px-3 text-[12.5px] text-ink underline decoration-line underline-offset-2 focus-visible:outline-2 focus-visible:outline-gold">
                  New chat
                </button>
              )}
              <Drawer.Close className="grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-gold" aria-label="Close chat">
                <span className="grid size-8 place-items-center rounded-full bg-sand text-[13px]">✕</span>
              </Drawer.Close>
            </div>

            {/* full height: pinned product or bag strip */}
            {full && hero && (
              <div className="mx-4 mb-2 flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-white p-1.5 pr-2">
                <div className="size-10 shrink-0 overflow-hidden rounded-lg">
                  <ProductImage card={hero} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px]">{hero.title}</p>
                  <p className="text-[12.5px] font-medium">{inr(hero.price)}</p>
                </div>
                <CartButton sku={hero.handle} max={hero.maxQty} limitReason={hero.limitReason} size="md" />
              </div>
            )}
            {full && page?.kind === "bag" && (
              <div className="mx-4 mb-2 flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-[12.5px]">
                <span>
                  Bag · {cartCount} {cartCount === 1 ? "item" : "items"}
                </span>
                <span className="font-medium">{inr(cartTotal)}</span>
              </div>
            )}

            {/* conversation */}
            <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 pb-3 pt-1 no-scrollbar" data-vaul-no-drag aria-live="polite">
              {opener && messages.length === 0 && (
                <AiRow role="opener">
                  <p className="text-[14.5px] leading-relaxed">{opener}</p>
                </AiRow>
              )}
              {messages.map((m, mi) => {
                const isLast = mi === messages.length - 1;
                const divider = dividers.find((d) => d.afterId === m.id);
                const body =
                  m.role === "user" ? (
                    <div id={`msg-${m.id}`} data-role="user" className="ml-auto w-fit max-w-[82%] scroll-mt-2 break-words rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[14px] text-ivory">
                      {textOf(m)}
                    </div>
                  ) : (
                    <AssistantMessage message={m} showCards={!(isLast && busy)} />
                  );
                return (
                  <div key={m.id} className="space-y-4">
                    {body}
                    {divider && <DividerRow label={divider.label} />}
                  </div>
                );
              })}
              {busy && !replying && (
                <AiRow waiting>
                  <div className="flex items-center gap-2 py-1.5 text-muted" aria-label="Cosmos AI is typing">
                    <span className="flex items-center gap-1 text-ink">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </span>
                    {running && TOOL_STATUS[running] && <span className="text-[12px]">{TOOL_STATUS[running]}…</span>}
                  </div>
                </AiRow>
              )}
              {status === "error" && (
                <p className="rounded-xl bg-sand/70 px-3 py-2 text-[12.5px] text-muted">I couldn&apos;t finish that one. Try again, or pick a suggestion below.</p>
              )}
            </div>

            {/* chips + input + disclosure */}
            <div className="border-t border-line bg-ivory px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2">
              {chips.length > 0 && !busy && (
                <div className="mb-2 flex min-w-0 gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Suggested questions">
                  {chips.map((c) => (
                    <button key={c} onClick={() => submit(c)} className="h-10 shrink-0 rounded-full border border-line bg-white px-3.5 text-[12.5px] active:bg-sand focus-visible:outline-2 focus-visible:outline-gold">
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(input);
                }}
                className="flex items-center gap-2"
              >
                <label htmlFor="cosmos-chat-input" className="sr-only">
                  Message Cosmos AI
                </label>
                <input
                  id="cosmos-chat-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
                  onFocus={() => setFull(true)}
                  // text only: no attachments; pasting or dropping a file or image does nothing
                  onPaste={(e) => {
                    if (e.clipboardData.files.length) e.preventDefault();
                  }}
                  onDrop={(e) => e.preventDefault()}
                  maxLength={MAX_CHARS}
                  type="text"
                  inputMode="text"
                  enterKeyHint="send"
                  autoComplete="off"
                  placeholder="Ask about size, delivery, gifting…"
                  className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-[16px] outline-none placeholder:text-[14px] focus:border-gold md:text-[14px]"
                />
                <button disabled={busy || !input.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-ivory disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-gold" aria-label="Send">
                  ↑
                </button>
              </form>
              <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[10.5px] text-muted">
                <p>AI assistant · answers from Cosmos product info · can make mistakes</p>
                {input.length >= COUNTER_FROM && (
                  <p className={`shrink-0 tabular-nums ${input.length >= MAX_CHARS ? "text-ink" : ""}`} aria-live="polite">
                    {input.length}/{MAX_CHARS}
                  </p>
                )}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </ProductLinkProvider>
  );
}

/** Cosmos AI's side: a small star avatar, no bubble. */
function AiRow({ children, waiting = false, role = "ai" }: { children: React.ReactNode; waiting?: boolean; role?: "ai" | "opener" }) {
  return (
    <div className="flex min-w-0 gap-2.5" data-role={waiting ? "typing" : role}>
      <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[#fdf6e7] ring-1 ring-gold/30">
        <span className={waiting ? "star-pulse inline-grid" : "inline-grid"}>
          <CosmosStar className="size-4" shimmer={false} />
        </span>
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">{children}</div>
    </div>
  );
}

function AssistantMessage({ message, showCards }: { message: UIMessage; showCards: boolean }) {
  const { cards } = useCosmosChat();
  const parts = message.parts as (ToolPart & { text?: string })[];
  const texts = parts.filter((p) => p.type === "text" && p.text?.trim());
  const tools = parts.filter((p) => toolName(p) && p.state === "output-available");
  const answer = texts.filter((p) => !NOTE.test(p.text!.trim()));
  const notes = texts.filter((p) => NOTE.test(p.text!.trim()));
  if (!answer.length && !tools.length && !notes.length) return null;
  return (
    <AiRow>
      {answer.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">
          {p.text!.trim()}
        </p>
      ))}
      {/* the answer first; its cards once the text has finished streaming */}
      {showCards && tools.map((p, i) => <ToolCard key={i} name={toolName(p)} output={p.output} cards={cards} />)}
      {notes.map((p, i) => (
        <p key={`n${i}`} className="flex items-center gap-1.5 text-[11.5px] text-muted">
          <span aria-hidden>ⓘ</span> {p.text!.trim()}
        </p>
      ))}
    </AiRow>
  );
}

function DividerRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted" role="separator" data-role="divider">
      <span className="h-px flex-1 bg-line" />
      <span className="max-w-[75%] truncate">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

