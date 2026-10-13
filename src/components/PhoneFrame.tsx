/**
 * Mobile-first shell. On phones the site is full-screen; on desktop it sits in a 470px-wide phone frame.
 * The frame gets a transform so `fixed` children (sticky bar, bottom sheet) stay inside it.
 *
 * `chrome` adds a fixed top area above the scrolling page: "status" = phone status bar (mock ChatGPT app);
 * "webview" = status bar + in-app browser bar, for product pages opened from a sponsored card.
 */
import PhoneSurfaceProvider from "./PhoneSurface";
import { StatusBar, WebviewBar } from "./PhoneChrome";

type Chrome = { kind: "status" } | { kind: "webview"; backHref: string; domain: string };

export default function PhoneFrame({ children, label, chrome }: { children: React.ReactNode; label?: string; chrome?: Chrome }) {
  return (
    <div className="min-h-dvh md:flex md:flex-col md:items-center md:justify-center md:gap-3 md:bg-[#e7e1d8] md:py-6">
      {label && <p className="hidden text-xs tracking-wide text-muted md:block">{label}</p>}
      <div
        id="phone"
        className={`relative w-full bg-ivory md:h-[min(932px,calc(100dvh-64px))] md:w-[470px] md:overflow-hidden md:rounded-[46px] md:border-[10px] md:border-ink md:shadow-[0_30px_80px_-20px_rgba(31,26,23,0.45)] md:[transform:translateZ(0)] ${chrome ? "flex h-dvh flex-col" : ""}`}
      >
        <PhoneSurfaceProvider chrome={chrome ? (
          <div id="phone-chrome" className="shrink-0 bg-white md:pt-1">
            <StatusBar />
            {chrome.kind === "webview" && <WebviewBar backHref={chrome.backHref} domain={chrome.domain} />}
          </div>
        ) : undefined}>
          {children}
        </PhoneSurfaceProvider>
      </div>
    </div>
  );
}
