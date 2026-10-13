"use client";

import { createContext, useContext, useState } from "react";

type Surface = { portal: HTMLDivElement | null; scroller: HTMLDivElement | null };
const PhoneSurface = createContext<Surface | null>(null);

/** Each frame supplies its own live DOM refs. No document-wide lookup or mount-time timing assumption. */
export function usePhoneSurface() {
  const surface = useContext(PhoneSurface);
  if (!surface) throw new Error("Shop overlays must be inside PhoneFrame");
  return surface;
}

export default function PhoneSurfaceProvider({ children, chrome }: { children: React.ReactNode; chrome?: React.ReactNode }) {
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  return (
    <PhoneSurface.Provider value={{ portal, scroller }}>
      {chrome}
      <div ref={setScroller} id="phone-scroll" className={chrome ? "min-h-0 flex-1 overflow-y-auto no-scrollbar" : "min-h-dvh md:h-full md:min-h-0 md:overflow-y-auto no-scrollbar"}>
        {children}
      </div>
      <div ref={setPortal} data-phone-overlays className="pointer-events-none fixed inset-0 z-40 overflow-hidden md:absolute" />
    </PhoneSurface.Provider>
  );
}
