export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0E1726" />
      <path
        d="M6.5 22.5 C 11.5 22.5, 11.5 9.5, 16.5 9.5 S 21.5 22.5, 25.5 22.5"
        fill="none"
        stroke="#F6F3EE"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="6.5" cy="22.5" r="2.7" fill="#1E9E5A" />
      <circle cx="16.5" cy="9.5" r="2.7" fill="#E89A0C" />
      <circle cx="25.5" cy="22.5" r="2.7" fill="#E5252A" />
    </svg>
  );
}

export default function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[26px] leading-none tracking-tight text-ink">
        Care<span className="italic">Route</span>
      </span>
    </span>
  );
}
