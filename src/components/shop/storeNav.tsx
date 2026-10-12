"use client";
import { createContext, useContext } from "react";
import type { NavCategory } from "@/lib/catalog";

/** Catalogue categories for the header menu, provided once by the root layout. */
const StoreNav = createContext<NavCategory[]>([]);

export function StoreNavProvider({ categories, children }: { categories: NavCategory[]; children: React.ReactNode }) {
  return <StoreNav.Provider value={categories}>{children}</StoreNav.Provider>;
}
export function useStoreNav() {
  return useContext(StoreNav);
}
