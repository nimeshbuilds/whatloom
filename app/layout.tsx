import type { Metadata } from "next";
import { assetPath } from "@/lib/hosting";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whatloom — Your startup thinking partner.",
  description: "Find a worthwhile idea, research the market, shape the product and brand, and hand an approved brief to your AI builder.",
  applicationName: "Whatloom",
  manifest: assetPath("/manifest.webmanifest"),
  icons: {
    icon: assetPath("/favicon.svg"),
    shortcut: assetPath("/favicon.svg"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
