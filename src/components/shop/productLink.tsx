"use client";
import { createContext, useContext } from "react";

/** Query string carried to every product / bag link so the ad context (and arm, in-app view) follows the shopper. */
const LinkQuery = createContext("");
export const ProductLinkProvider = LinkQuery.Provider;
export function useLinkQuery() {
  return useContext(LinkQuery);
}
export function useProductHref() {
  const q = useContext(LinkQuery);
  return (handle: string) => `/p/${handle}${q}`;
}
