import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Diet",
  description: "Scan your food. Track your calories. Hit your goals.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
