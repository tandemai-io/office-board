import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tandem Office Board",
  description: "Messages, moments, and a little celebration. The shared control panel for Tandem’s Vestaboard.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/brand/tandem-symbol-black.png",
    shortcut: "/brand/tandem-symbol-black.png",
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
