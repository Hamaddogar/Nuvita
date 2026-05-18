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
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 180 120"
        className={cn("h-10 w-auto shrink-0", iconClassName)}
        role="img"
        aria-label="Nuvita logo mark"
      >
        <defs>
          <linearGradient id="nuvita-mark-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="55%" stopColor="#0EA5A4" />
            <stop offset="100%" stopColor="#0F766E" />
          </linearGradient>
          <linearGradient id="nuvita-leaf-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9AE76A" />
            <stop offset="100%" stopColor="#39C16C" />
          </linearGradient>
        </defs>
        <path
          d="M90 109c-3.6-7.2-17.4-17.7-32.4-32.9C39 58.7 27 45.1 27 29c0-14.2 10.8-24.4 24.2-24.4 9.8 0 18.8 4.9 24.8 12.9L90 34.2l14-16.7c6-8 15-12.9 24.8-12.9C142.2 4.6 153 14.8 153 29c0 16.1-12 29.7-30.6 47.1-15 15.2-28.8 25.7-32.4 32.9Z"
          fill="none"
          stroke="url(#nuvita-mark-gradient)"
          strokeWidth="9.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 71c27 0 49 10.3 63 30.9-20.8 9.4-42.8 7.4-59.6-5.4-8.4-6.5-13.6-15.1-15.8-25.5C6.1 71 10.1 71 14 71Z"
          fill="url(#nuvita-leaf-gradient)"
        />
        <path
          d="M18 79c13.6 6.1 26.2 15.2 37.1 27.4"
          fill="none"
          stroke="#E8FFEE"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M37 45h13l11 11v15M62 58V40M78 52v19M87 45v10l8 8v11"
          fill="none"
          stroke="#0E9F9C"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="37" cy="45" r="4.6" fill="none" stroke="#0E9F9C" strokeWidth="3.6" />
        <circle cx="62" cy="40" r="4.6" fill="none" stroke="#0E9F9C" strokeWidth="3.6" />
        <circle cx="78" cy="52" r="4.6" fill="none" stroke="#0E9F9C" strokeWidth="3.6" />
        <circle cx="87" cy="45" r="4.6" fill="none" stroke="#0E9F9C" strokeWidth="3.6" />
        <path
          d="M112 54v33c0 9-6.4 16.8-15.2 18.6l-2.8.6 5.1-15.3c2.2-.8 3.9-2.9 3.9-5.4V54c0-3 2.4-5.4 5.4-5.4S112 51 112 54Z"
          fill="url(#nuvita-mark-gradient)"
        />
        <path
          d="M97 39v14M104 39v14M111 39v14"
          fill="none"
          stroke="#0E9F9C"
          strokeWidth="4.1"
          strokeLinecap="round"
        />
      </svg>
      {showWordmark ? (
        <span className={cn("relative inline-flex items-end", wordmarkClassName)}>
          <span className="text-[1.65rem] font-semibold leading-none tracking-tight text-[#045f69] dark:text-[#2dd4bf]">
            Nuvita
          </span>
          <svg
            viewBox="0 0 24 24"
            className="absolute -top-2 right-[2.05rem] h-3.5 w-3.5"
            aria-hidden
          >
            <path
              d="M12 21c6-6.2 7.8-11.2 7-18-6.8.7-11.3 4.2-13 10.8 1.8-1 4.1-1.6 6.6-1.6-2.6 1.4-4.4 3.6-5.4 6.6 1.5.8 3.1 1.2 4.8 2.2Z"
              fill="#7ED957"
            />
          </svg>
        </span>
      ) : null}
    </span>
  );
}

