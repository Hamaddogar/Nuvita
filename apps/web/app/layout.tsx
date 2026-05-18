import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Nuvita",
    template: "%s | Nuvita",
  },
  description: "Premium AI nutrition coaching and meal tracking for modern wellness goals.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-[#F6FFFC] via-[#F8FBFA] to-white text-foreground antialiased dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
        {children}
      </body>
    </html>
  );
}
