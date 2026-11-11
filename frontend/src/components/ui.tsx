import clsx from "clsx";
import { motion } from "framer-motion";
import { AlertTriangle, BookOpen, Check, ExternalLink, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";
import { levelMeta, statusMeta, titleCase } from "../lib/meta";
import type { Check as CheckT, Citation } from "../lib/types";

export function LevelBadge({ level, size = "md" }: { level: string; size?: "sm" | "md" | "lg" }) {
  const m = levelMeta(level);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset",
        m.soft,
        m.text,
        m.ring,
        size === "sm" && "px-2 py-0.5 text-[11px]",
        size === "md" && "px-2.5 py-1 text-xs",
        size === "lg" && "px-3.5 py-1.5 text-sm",
      )}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: m.hex }} aria-hidden />
      {m.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return <span className={clsx("chip", m.cls)}>{m.label}</span>;
}

export function ConfidenceMeter({ value, threshold = 0.6, color }: { value: number; threshold?: number; color: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-ink-2">Agent confidence</span>
        <span className="font-mono text-sm font-medium text-ink">{Math.round(v * 100)}%</span>
      </div>
      <div
        className="relative h-2.5 rounded-full bg-ink/[0.07]"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        aria-label="Agent confidence"
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${v * 100}%` }}
          transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
        />
        <div
          className="absolute -top-1 h-[18px] w-px bg-ink/50"
          style={{ left: `${threshold * 100}%` }}
          title={`Clinician review below ${Math.round(threshold * 100)}%`}
        />
      </div>
      <div className="mt-1 text-[11px] text-ink-3">
        Below {Math.round(threshold * 100)}% a human clinician reviews before any money moves.
      </div>
    </div>
  );
}

export function CheckChip({ check, dark = false }: { check: CheckT; dark?: boolean }) {
  return (
    <span
      title={check.detail}
      className={clsx(
        "chip",
        check.passed
          ? dark
            ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/25"
            : "bg-sc-50 text-sc-700 ring-sc-500/20"
          : dark
            ? "bg-rose-500/15 text-rose-200 ring-rose-400/30"
            : "bg-er-50 text-er-700 ring-er-500/25",
      )}
    >
      {check.passed ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
      <span className="sr-only">{check.passed ? "passed" : "failed"}:</span>
      {titleCase(check.name)}
    </span>
  );
}

export function GuardrailChecks({ checks }: { checks: CheckT[] }) {
  const passed = checks.filter((c) => c.passed).length;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink-2">Guardrail checks</span>
        <span className="font-mono text-[11px] text-ink-3">
          {passed}/{checks.length} passed
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {checks.map((c) => (
          <CheckChip key={c.name} check={c} />
        ))}
      </div>
    </div>
  );
}

export function Citations({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <ul className="space-y-2">
      {citations.map((c) => (
        <li key={c.guideline_id}>
          <a
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-3 rounded-xl bg-paper p-3 ring-1 ring-ink/[0.06] transition hover:bg-white hover:ring-ink/15"
          >
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{c.title}</span>
              <span className="mt-0.5 block text-xs text-ink-3">
                {c.source} · <span className="font-mono">{c.guideline_id}</span>
              </span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-4 group-hover:text-ink-2" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function RedFlags({ flags }: { flags: string[] }) {
  if (!flags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <span key={f} className="chip bg-er-50 text-er-700 ring-er-500/25">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {f}
        </span>
      ))}
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin", className)} aria-hidden />;
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-paper-2 text-ink-3">{icon}</div>
      <div className="font-semibold text-ink">{title}</div>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-er-50 px-3.5 py-3 text-sm text-er-700 ring-1 ring-er-500/20">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
