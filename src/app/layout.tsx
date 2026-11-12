import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter-tight/wght.css";
import "@fontsource-variable/onest/wght.css";
import "./globals.css";
import { getLang } from "@/lib/i18n";
import { siteUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Shaqyru — закрытое комьюнити Алматы", template: "%s · Shaqyru" },
  description: "Закрытое lifestyle-комьюнити Алматы: лучшие места города по совету тех, кому доверяют.",
  openGraph: { images: ["/og.png"], siteName: "Shaqyru" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
