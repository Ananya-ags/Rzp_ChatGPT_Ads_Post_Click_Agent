import Link from "next/link";

/** Phone status bar (demo clock 10:00), shown at the top of the mock ChatGPT app and its in-app browser. */
export function StatusBar() {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between bg-white px-6 text-[13px] font-semibold text-black" aria-hidden>
      <span className="tabular-nums">10:00</span>
      <span className="flex items-center gap-1.5">
        {/* cellular signal */}
        <svg viewBox="0 0 18 12" className="h-3 w-[18px]" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="10" y="3" width="3" height="9" rx="0.8" />
          <rect x="15" y="0" width="3" height="12" rx="0.8" />
        </svg>
        {/* wi-fi */}
        <svg viewBox="0 0 16 12" className="h-3 w-4" fill="currentColor">
          <path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3C13.4 1.4 10.8.4 8 .4S2.6 1.4.5 3.4l1.2 1.3C3.4 3.1 5.6 2.2 8 2.2z" />
          <path d="M8 5.6c1.5 0 2.9.6 3.9 1.5l1.2-1.3C11.8 4.6 10 3.8 8 3.8S4.2 4.6 2.9 5.8l1.2 1.3C5.1 6.2 6.5 5.6 8 5.6z" />
          <path d="M8 9.1c.6 0 1.1.2 1.5.6L8 11.5 6.5 9.7c.4-.4.9-.6 1.5-.6z" />
        </svg>
        {/* battery */}
        <span className="flex items-center">
          <span className="relative h-[11px] w-[22px] rounded-[3px] border border-black/40 p-[1.5px]">
            <span className="block h-full w-[80%] rounded-[1.5px] bg-black" />
          </span>
          <span className="ml-[1px] h-[4px] w-[1.5px] rounded-r-sm bg-black/40" />
        </span>
      </span>
    </div>
  );
}

/** In-app browser bar: the page opened from a sponsored card inside the (mock) ChatGPT app. */
export function WebviewBar({ backHref, domain }: { backHref: string; domain: string }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-black/10 bg-white px-3 text-black">
      <Link href={backHref} aria-label="Close and go back to the chat" className="grid size-8 place-items-center rounded-full text-[18px] leading-none text-black/70 active:bg-black/5">
        ✕
      </Link>
      <div className="flex min-w-0 flex-1 flex-col items-center leading-tight">
        <span className="flex items-center gap-1 text-[13px] font-semibold">
          <svg viewBox="0 0 12 14" className="h-3 w-2.5 text-black/50" fill="currentColor" aria-hidden>
            <path d="M3 6V4a3 3 0 016 0v2h.5A1.5 1.5 0 0111 7.5v5A1.5 1.5 0 019.5 14h-7A1.5 1.5 0 011 12.5v-5A1.5 1.5 0 012.5 6H3zm1.5 0h3V4a1.5 1.5 0 00-3 0v2z" />
          </svg>
          {domain}
        </span>
        <span className="text-[10.5px] text-black/45">Sponsored link</span>
      </div>
      <span className="grid size-8 place-items-center text-[18px] leading-none text-black/60" aria-hidden>
        ⋯
      </span>
    </div>
  );
}
