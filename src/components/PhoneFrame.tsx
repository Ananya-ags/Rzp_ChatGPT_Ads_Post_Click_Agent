/**
 * Mobile-first shell. On phones the site is full-screen; on desktop it sits in a 470px-wide phone frame.
 * The frame gets a transform so `fixed` children (sticky bar, bottom sheet) stay inside it.
 */
export default function PhoneFrame({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="min-h-dvh md:flex md:flex-col md:items-center md:justify-center md:gap-3 md:bg-[#e7e1d8] md:py-6">
      {label && <p className="hidden text-xs tracking-wide text-muted md:block">{label}</p>}
      <div
        id="phone"
        className="relative w-full bg-ivory md:h-[min(932px,calc(100dvh-64px))] md:w-[470px] md:overflow-hidden md:rounded-[46px] md:border-[10px] md:border-ink md:shadow-[0_30px_80px_-20px_rgba(31,26,23,0.45)] md:[transform:translateZ(0)]"
      >
        <div id="phone-scroll" className="min-h-dvh md:h-full md:min-h-0 md:overflow-y-auto no-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
