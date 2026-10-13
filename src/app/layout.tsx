import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { StoreNavProvider } from "@/components/shop/storeNav";
import { getDb } from "@/lib/data";
import { categoriesFrom } from "@/lib/catalog";
import ChatProvider from "@/components/shop/chat/ChatProvider";
import { toCard } from "@/lib/view";
import ConsoleBridge from "@/components/console/ConsoleBridge";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Cosmos · demi-fine jewellery",
  description: "Cosmos: modern anti-tarnish demi-fine jewellery (fictional brand, prototype).",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fbf7f2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-full">
        <StoreNavProvider categories={categoriesFrom(getDb().products)}>
          {/* one Cosmos AI conversation per session, shared by every shop page */}
          <ChatProvider cards={Object.fromEntries(getDb().products.map((p) => [p.handle, toCard(p, getDb().manifest)]))}>{children}</ChatProvider>
          {/* AI console events (/demo): a no-op unless the console is listening */}
          <ConsoleBridge
            adGroups={getDb().adGroups.map((g) => ({ id: g.id, name: g.name, campaign_id: g.campaign_id, ad_group_id: g.ad_group_id, ad_id: g.ad_id, context_hints: g.context_hints }))}
            titles={Object.fromEntries(getDb().products.map((p) => [p.handle, p.title]))}
            categories={Object.fromEntries(categoriesFrom(getDb().products).map((c) => [c.slug, c.label]))}
          />
        </StoreNavProvider>
      </body>
    </html>
  );
}
