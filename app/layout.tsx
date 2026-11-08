import type { Metadata } from "next";
import { assetPath } from "@/lib/hosting";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whatloom — Make room for what could be.",
  description: "A private invention studio. Explore possible futures, challenge assumptions, and find your first credible move.",
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
