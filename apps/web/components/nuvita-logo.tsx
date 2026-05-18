import { cn } from "@/lib/utils";

type NuvitaLogoProps = {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
};

export function NuvitaLogo({
  className,
  iconClassName,
  wordmarkClassName,
  showWordmark = true,
}: NuvitaLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-emerald-100 bg-white/90 shadow-sm dark:border-emerald-900/60 dark:bg-slate-900/60",
          iconClassName
        )}
        aria-hidden
      >
        <svg viewBox="0 0 64 64" className="h-6 w-6" role="img">
          <defs>
            <linearGradient id="nuvita-logo-gradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0F766E" />
              <stop offset="100%" stopColor="#22C55E" />
            </linearGradient>
          </defs>
          <path
            d="M32 7c-9.3 0-16.8 7.5-16.8 16.8 0 7.8 5.4 14.5 12.7 16.3v10.9c0 2.3 1.9 4.2 4.2 4.2s4.2-1.9 4.2-4.2V40.1c7.3-1.8 12.7-8.5 12.7-16.3C48.8 14.5 41.3 7 32 7Z"
            fill="url(#nuvita-logo-gradient)"
          />
          <path
            d="M22 25.5c4.2 1.2 8.9.2 12.2-2.7 2.4-2.1 5.4-3.3 8.6-3.5-1.7-4.6-6.1-7.9-11.3-7.9-6.7 0-12.1 5.4-12.1 12.1 0 .7.1 1.3.2 2Z"
            fill="#D1FAE5"
            opacity="0.95"
          />
          <circle cx="42.5" cy="36.8" r="3.1" fill="#34D399" />
        </svg>
      </span>
      {showWordmark ? (
        <span
          className={cn(
            "text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100",
            wordmarkClassName
          )}
        >
          Nuvita
        </span>
      ) : null}
    </span>
  );
}

