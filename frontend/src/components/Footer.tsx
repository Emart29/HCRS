import { ShieldAlert } from "lucide-react";
import { LogoMark } from "./Logo";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-paper-line bg-paper-2/60">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-er-600" aria-hidden />
          <p className="max-w-2xl text-sm text-ink-2">
            <strong className="font-semibold text-ink">Decision support for routing only. Not a diagnosis.</strong> In an
            emergency call your local emergency number (Nigeria: 112 · UK: 999 · US: 911).
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <LogoMark className="h-5 w-5" />
          <span>CareRoute · PayPal AI Hackathon · guidelines from NHS, WHO &amp; NICE</span>
        </div>
      </div>
    </footer>
  );
}
