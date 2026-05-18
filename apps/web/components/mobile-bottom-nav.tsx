"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Camera, Compass, History, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Today", icon: BarChart3 },
  { href: "/history", label: "History", icon: History },
  { href: "/scan", label: "Scan", icon: Camera },
  { href: "/insights", label: "Coach", icon: Compass },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-emerald-100/80 bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <ul className="grid grid-cols-5 gap-1">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium transition",
                  active
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "text-muted-foreground hover:bg-muted"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

