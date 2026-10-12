"use client";
/**
 * Agent chat in a vaul bottom sheet: pill (closed) → half → full. Full when the keyboard opens; in full,
 * a slim product strip and the cart count stay pinned. Heights are driven by our own state rather than vaul
 * snapPoints so the sheet behaves the same inside the desktop phone frame.
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Drawer } from "vaul";
import { useEffect, useRef, useState } from "react";
import { ToolCard } from "./ToolCards";
import ProductImage from "./ProductImage";
import { inr, type CardVM } from "@/lib/view";
import { useDemoState } from "@/lib/state";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: string | null; // chip text to send when opened
  clearPending: () => void;
  context: { sku: string; adGroupId: string | null; pincode: string | null; tier: number };
  hero: CardVM;
  cards: Record<string, CardVM>;
  chips: string[];
  opener: string | null;
};

export default function ChatSheet({ open, onOpenChange, pending, clearPending, context, hero, cards, chips, opener }: Props) {
  const [full, setFull] = useState(false);
  const [input, setInput] = useState("");
  const [state] = useDemoState();
  // inside the desktop phone frame, portal the sheet into the frame; on phones, into <body>
  const [container] = useState<HTMLElement | null>(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches ? document.getElementById("phone") : null,
  );
  const endRef = useRef<HTMLDivElement>(null);
  const [transport] = useState(() => new DefaultChatTransport({ api: "/api/chat" }));
  const { messages, sendMessage, status } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";
  const chatContext = { ...context, tier: state.loggedIn ? 3 : context.tier };
  const ask = (text: string) => sendMessage({ text }, { body: { context: chatContext } });

  useEffect(() => {
    if (open && pending) {
      sendMessage({ text: pending }, { body: { context: { ...context, tier: context.tier } } });
      clearPending();
    }
  }, [open, pending, sendMessage, clearPending, context]);

  // keep the latest question + its answer in view (the answer sits above its cards)
  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;
  useEffect(() => {
    if (lastUserId) document.getElementById(`msg-${lastUserId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else endRef.current?.scrollIntoView({ block: "end" });
  }, [lastUserId, status]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    ask(text);
    setInput("");
  };
  const cartCount = state.cart.reduce((s, l) => s + l.qty, 0);

  return (
    <Drawer.Root open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setFull(false); }} container={container} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/25" />
        <Drawer.Content
          aria-describedby={undefined}
          className={`fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[22px] bg-ivory shadow-[0_-10px_40px_-10px_rgba(31,26,23,0.35)] outline-none transition-[height] duration-300 ${full ? "h-[94%]" : "h-[58%]"}`}
        >
          <button onClick={() => setFull((f) => !f)} className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-label={full ? "Collapse" : "Expand"} />
          <div className="flex items-center justify-between px-4 pb-2 pt-2">
            <div>
              <Drawer.Title className="font-display text-[17px]">Ask Cosmos AI</Drawer.Title>
              <p className="text-[11px] text-muted">AI assistant · answers from verified product facts</p>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="whitespace-nowrap rounded-full bg-sand px-2.5 py-1">Bag {cartCount}</span>
              <Drawer.Close className="grid size-7 place-items-center rounded-full bg-sand text-[13px]" aria-label="Close">✕</Drawer.Close>
            </div>
          </div>
          {full && (
            <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl border border-line bg-white p-1.5 pr-3">
              <div className="size-9 overflow-hidden rounded-lg">
                <ProductImage card={hero} />
              </div>
              <p className="flex-1 truncate text-[12.5px]">{hero.title}</p>
              <p className="text-[12.5px] font-medium">{inr(hero.price)}</p>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3 no-scrollbar" data-vaul-no-drag>
            {opener && messages.length === 0 && <Bubble role="assistant">{opener}</Bubble>}
            {messages.map((m) => (
              <div key={m.id} id={`msg-${m.id}`} className="scroll-mt-2 space-y-2">
                {/* answer first, then the cards its tools produced */}
                {[...m.parts.filter((x) => x.type === "text"), ...m.parts.filter((x) => x.type !== "text")].map((part, i) => {
                  if (part.type === "text") return part.text.trim() ? <Bubble key={i} role={m.role}>{part.text}</Bubble> : null;
                  if (part.type.startsWith("tool-")) {
                    const p = part as unknown as { state: string; output?: unknown; toolCallId: string };
                    if (p.state !== "output-available") return <p key={i} className="text-[11px] text-muted">Checking…</p>;
                    return <ToolCard key={i} name={part.type.slice(5)} output={p.output} cards={cards} />;
                  }
                  return null;
                })}
              </div>
            ))}
            {status === "submitted" && <p className="text-[12px] text-muted">Thinking…</p>}
            {status === "error" && <p className="text-[12px] text-danger">Something went wrong. Try a suggested question.</p>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-line bg-ivory px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
            {chips.length > 0 && (
              <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 no-scrollbar">
                {chips.filter((c) => !messages.some((m) => m.role === "user" && m.parts.some((x) => x.type === "text" && x.text === c))).map((c) => (
                  <button key={c} onClick={() => send(c)} className="shrink-0 rounded-full border border-line bg-white px-3 py-1.5 text-[12px]">
                    {c}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setFull(true)}
                placeholder="Ask about size, delivery, care…"
                className="h-11 flex-1 rounded-full border border-line bg-white px-4 text-[14px] outline-none focus:border-gold"
              />
              <button disabled={busy || !input.trim()} className="grid size-11 place-items-center rounded-full bg-ink text-ivory disabled:opacity-40" aria-label="Send">
                ↑
              </button>
            </form>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function Bubble({ role, children }: { role: string; children: React.ReactNode }) {
  return role === "user" ? (
    <div className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[14px] text-ivory">{children}</div>
  ) : (
    <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[14px] leading-relaxed shadow-[0_1px_0_rgba(0,0,0,0.04)]">{children}</div>
  );
}
