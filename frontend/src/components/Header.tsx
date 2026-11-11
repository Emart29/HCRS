import { NavLink, Link } from "react-router-dom";
import { useState } from "react";
import clsx from "clsx";
import { Menu, X, Cpu, Wallet } from "lucide-react";
import Logo from "./Logo";
import { useConfig } from "../lib/config";

const NAV = [
  { to: "/", label: "Get care", end: true },
  { to: "/clinic", label: "Clinic" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/how-it-works", label: "How it works" },
];

export function ModeBadges({ compact = false }: { compact?: boolean }) {
  const { config, online } = useConfig();
  const mode = config.paypal_mode;
  const modeLabel = mode === "mock" ? "Mock" : mode === "live" ? "Live" : "Sandbox";
  const engineLabel = config.engine === "gemini" ? config.model ?? "gemini" : "rules engine";
  return (
    <div className={clsx("flex items-center gap-1.5", compact && "flex-wrap")}>
      <span
        className="chip bg-white text-ink-2 ring-ink/10"
        title={config.engine === "gemini" ? `AI engine: ${config.model}` : "AI engine: deterministic rules (no API key)"}
      >
        <Cpu className="h-3.5 w-3.5 text-violet-600" aria-hidden />
        <span className="text-ink-3">AI</span>
        <span className="font-mono text-[11px]">{engineLabel}</span>
      </span>
      <span className="chip bg-[#E8F3FB] text-pp ring-pp-light/30" title={`PayPal mode: ${mode}`}>
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        <span className="font-semibold">PayPal</span>
        <span className="font-mono text-[11px]">{modeLabel}</span>
      </span>
      <span
        className={clsx("h-2 w-2 rounded-full", online ? "bg-sc-500" : "bg-er-500")}
        title={online ? "API online" : "API offline"}
        aria-label={online ? "API online" : "API offline"}
        role="img"
      />
    </div>
  );
}

export default function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-paper-line/80 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="CareRoute home" className="shrink-0 rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  isActive ? "bg-ink text-paper" : "text-ink-2 hover:bg-ink/[0.05] hover:text-ink",
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto hidden lg:block">
          <ModeBadges />
        </div>
        <button
          className="ml-auto rounded-lg p-2 text-ink md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-paper-line bg-paper px-4 pb-4 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col py-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  clsx("rounded-lg px-3 py-2.5 text-sm font-medium", isActive ? "bg-ink text-paper" : "text-ink-2")
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <ModeBadges compact />
        </div>
      )}
    </header>
  );
}
