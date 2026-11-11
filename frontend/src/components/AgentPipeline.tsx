import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookMarked,
  BrainCircuit,
  Check,
  ChevronDown,
  Navigation,
  ShieldCheck,
  Siren,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { STEP_META } from "../lib/meta";
import type { TraceStep } from "../lib/types";
import { CheckChip } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  input_guardrails: ShieldCheck,
  red_flag_rules: Siren,
  retrieval: BookMarked,
  llm_fallback: TriangleAlert,
  reasoning: BrainCircuit,
  output_guardrails: ShieldCheck,
  routing: Navigation,
};

const CANONICAL = ["input_guardrails", "red_flag_rules", "retrieval", "reasoning", "output_guardrails", "routing"];

function StepDetails({ step }: { step: TraceStep }) {
  return (
    <div className="space-y-2 pt-2">
      {step.checks && step.checks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {step.checks.map((c) => (
            <CheckChip key={c.name} check={c} dark />
          ))}
        </div>
      )}
      {step.flags && step.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {step.flags.map((f) => (
            <span key={f.rule_id} className="chip bg-rose-500/20 text-rose-100 ring-rose-400/40">
              <Siren className="h-3 w-3" aria-hidden /> {f.label}
              <span className="font-mono text-[10px] text-rose-300/80">{f.rule_id}</span>
            </span>
          ))}
        </div>
      )}
      {step.hits && step.hits.length > 0 && (
        <ul className="space-y-1">
          {(() => {
            const max = Math.max(...step.hits.map((h) => h.score), 1);
            return step.hits.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 truncate font-mono text-[11px] text-white/50">{h.id}</span>
                <span className="min-w-0 flex-1 truncate text-white/80">{h.title}</span>
                <span className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-white/10 sm:block">
                  <span className="block h-full rounded-full bg-sky-400" style={{ width: `${(h.score / max) * 100}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right font-mono text-[11px] text-white/50">{h.score.toFixed(1)}</span>
              </li>
            ));
          })()}
        </ul>
      )}
      {step.engine && (
        <div className="font-mono text-[11px] text-white/50">
          engine = <span className="text-violet-300">{String(step.engine)}</span>
        </div>
      )}
      {typeof step.provider_count === "number" && (
        <div className="font-mono text-[11px] text-white/50">
          providers matched = <span className="text-sky-300">{step.provider_count}</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  trace: TraceStep[] | null;
  animate?: boolean;
  onDone?: () => void;
  title?: string;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * The agent's reasoning pipeline. With `animate`, steps light up one at a time
 * (while waiting for the API, the first pending step shimmers).
 */
export default function AgentPipeline({ trace, animate = false, onDone, title = "Agent trace", defaultExpanded = false, className }: Props) {
  const steps = trace ?? CANONICAL.map((s) => ({ step: s, detail: "", ms: 0 }) as TraceStep);
  const [revealed, setRevealed] = useState(animate ? 0 : steps.length);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!animate) {
      setRevealed(steps.length);
      return;
    }
    if (!trace) return;
    if (revealed >= steps.length) {
      if (!doneRef.current) {
        const t = window.setTimeout(() => {
          doneRef.current = true;
          onDoneRef.current?.();
        }, 650);
        return () => window.clearTimeout(t);
      }
      return;
    }
    const t = window.setTimeout(() => setRevealed((r) => r + 1), revealed === 0 ? 250 : 480);
    return () => window.clearTimeout(t);
  }, [animate, trace, revealed, steps.length]);

  const total = trace?.length ? trace[trace.length - 1].ms : 0;

  return (
    <div className={clsx("relative overflow-hidden rounded-2xl bg-ink text-white shadow-lift", className)}>
      <div className="dark-grid absolute inset-0 opacity-60" aria-hidden />
      <div className="relative flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {animate && revealed < steps.length && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
            )}
            <span className={clsx("relative inline-flex h-2.5 w-2.5 rounded-full", revealed < steps.length ? "bg-sky-400" : "bg-emerald-400")} />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/70">{title}</span>
        </div>
        <span className="font-mono text-[11px] text-white/45">
          {trace ? `${revealed}/${steps.length} steps · ${total.toFixed(1)} ms` : "running…"}
        </span>
      </div>
      <ol className="relative px-3 py-3 sm:px-4" aria-live={animate ? "polite" : undefined}>
        {steps.map((s, i) => {
          const meta = STEP_META[s.step] ?? { title: s.step, blurb: "" };
          const Icon = ICONS[s.step] ?? Check;
          const isDone = i < revealed;
          const isActive = i === revealed && animate;
          const failed = s.checks?.some((c) => !c.passed) || (s.flags?.length ?? 0) > 0 || s.step === "llm_fallback";
          const escalated = s.step === "output_guardrails" && /escalat/i.test(s.detail);
          const hasDetails = !!(s.checks?.length || s.flags?.length || s.hits?.length || s.engine || typeof s.provider_count === "number");
          const isOpen = open[s.step] ?? defaultExpanded;
          const tone = !isDone
            ? "text-white/30"
            : s.flags?.length
              ? "text-rose-300"
              : escalated || s.step === "llm_fallback"
                ? "text-amber-300"
                : "text-emerald-300";
          return (
            <li key={s.step + i} className="relative pl-11">
              {i < steps.length - 1 && (
                <span
                  className={clsx("absolute left-[19px] top-10 h-[calc(100%-28px)] w-px transition-colors duration-500", isDone ? "bg-white/25" : "bg-white/10")}
                  aria-hidden
                />
              )}
              <span
                className={clsx(
                  "absolute left-1.5 top-2 grid h-7 w-7 place-items-center rounded-lg ring-1 transition-all duration-500",
                  isDone ? "bg-white/10 ring-white/20" : isActive ? "bg-sky-400/15 ring-sky-400/50" : "bg-white/[0.03] ring-white/10",
                )}
              >
                <Icon className={clsx("h-3.5 w-3.5", isActive ? "text-sky-300" : tone)} aria-hidden />
              </span>
              <div className={clsx("rounded-xl px-2 py-2 transition", hasDetails && isDone && "hover:bg-white/[0.04]")}>
                <button
                  type="button"
                  disabled={!hasDetails || !isDone}
                  onClick={() => setOpen((o) => ({ ...o, [s.step]: !isOpen }))}
                  className="flex w-full items-start gap-3 text-left disabled:cursor-default"
                  aria-expanded={hasDetails && isDone ? isOpen : undefined}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={clsx("text-sm font-semibold transition-colors", isDone || isActive ? "text-white" : "text-white/40")}>
                        {meta.title}
                      </span>
                      <span className="text-xs text-white/40">{meta.blurb}</span>
                    </span>
                    <span className="mt-0.5 block min-h-[18px] text-[13px]">
                      {isDone ? (
                        <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={clsx("font-mono text-[12px]", tone)}>
                          {failed && s.flags?.length ? "⚑ " : "✓ "}
                          {s.detail}
                        </motion.span>
                      ) : isActive ? (
                        <span className="inline-block h-3 w-40 animate-shimmer rounded bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(125,211,252,0.35),rgba(255,255,255,0.06))] bg-[length:200%_100%]" />
                      ) : null}
                    </span>
                  </span>
                  {isDone && (
                    <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
                      <span className="font-mono text-[10px] text-white/35">{s.ms.toFixed(1)}ms</span>
                      {hasDetails && (
                        <ChevronDown className={clsx("h-3.5 w-3.5 text-white/40 transition", isOpen && "rotate-180")} aria-hidden />
                      )}
                    </span>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {isDone && hasDetails && isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <StepDetails step={s} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
