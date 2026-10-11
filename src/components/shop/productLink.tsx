"use client";
import { createContext, useContext } from "react";

/** Query string carried to every product link so the ad context (and arm) follows the shopper. */
const LinkQuery = createContext("");
export const ProductLinkProvider = LinkQuery.Provider;
export function useProductHref() {
  const q = useContext(LinkQuery);
  return (handle: string) => `/p/${handle}${q}`;
}
