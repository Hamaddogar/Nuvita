"use client";

import { Camera, Search, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";

export type ScanMode = "photo" | "barcode" | "search";

type ScanModeSwitcherProps = {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
  disabled?: boolean;
};

const MODE_OPTIONS: Array<{
  value: ScanMode;
  label: string;
  icon: typeof Camera;
}> = [
  { value: "photo", label: "Photo", icon: Camera },
  { value: "barcode", label: "Barcode", icon: ScanLine },
  { value: "search", label: "Search", icon: Search },
];

export function ScanModeSwitcher({ mode, onChange, disabled = false }: ScanModeSwitcherProps) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border bg-card p-1">
      {MODE_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              disabled ? "cursor-not-allowed opacity-60" : ""
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
