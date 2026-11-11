import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { actorMeta, clock } from "../lib/meta";
import type { AuditEvent } from "../lib/types";

/** Light timeline used inside the clinic case panel. */
export function EventTimeline({ events }: { events: AuditEvent[] }) {
  const sorted = [...events].sort((a, b) => a.id - b.id);
  return (
    <ol className="relative space-y-3">
      {sorted.map((e, i) => {
        const m = actorMeta(e.actor);
        return (
          <li key={e.id} className="relative flex gap-3">
            {i < sorted.length - 1 && <span className="absolute left-[5px] top-4 h-[calc(100%+4px)] w-px bg-ink/10" aria-hidden />}
            <span className={clsx("relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-white", m.dot)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx("chip px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", m.lightChip)}>{m.label}</span>
                <span className="font-mono text-[11px] text-ink-3">{e.type}</span>
                <span className="ml-auto font-mono text-[11px] text-ink-4">{clock(e.ts)}</span>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-ink-2">{e.message}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Dark, terminal-style live audit stream used on the dashboard. */
export function AuditStream({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="space-y-1 font-mono text-[12px]">
      <AnimatePresence initial={false}>
        {events.map((e) => {
          const m = actorMeta(e.actor);
          const isPP = e.actor === "paypal";
          return (
            <motion.li
              key={e.id}
              layout
              initial={{ opacity: 0, backgroundColor: "rgba(56,189,248,0.18)" }}
              animate={{ opacity: 1, backgroundColor: "rgba(56,189,248,0)" }}
              transition={{ duration: 1.2 }}
              className={clsx("rounded-md border-l-2 px-3 py-2", isPP ? "border-sky-400/80 bg-sky-400/[0.04]" : "border-transparent")}
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
                <span className="text-white/35">{clock(e.ts)}</span>
                <span className={clsx("font-semibold tracking-wide", m.text)}>{m.label.toUpperCase()}</span>
                <span className="text-white/45">{e.type}</span>
                <span className="ml-auto text-white/30">{e.case_id ?? "system"}</span>
              </div>
              <p className="mt-0.5 font-sans text-[13px] leading-snug text-white/85">{e.message}</p>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
