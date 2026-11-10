import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Ban, Hospital, MapPin, Phone, Siren } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Case } from "../lib/types";

export default function EmergencyTakeover({ c, onClose }: { c: Case; onClose: () => void }) {
  const t = c.triage;
  const ers = t.providers.filter((p) => p.type === "emergency" || p.levels.includes("emergency"));
  const callRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    callRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="er-title"
      aria-describedby="er-desc"
      className="fixed inset-0 z-50 overflow-y-auto bg-er-600 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* radiating rings */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full bg-er-500/60 blur-3xl" />
        <div className="absolute -bottom-52 -left-40 h-[520px] w-[520px] rounded-full bg-er-900/50 blur-3xl" />
        <div className="absolute right-[12%] top-[18%] hidden lg:block">
          {[0, 0.6, 1.2].map((d) => (
            <span
              key={d}
              className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 animate-pulsering rounded-full border-2 border-white/40"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
        </div>
      </div>

      <div className="relative mx-auto flex min-h-full max-w-6xl flex-col px-5 py-6 sm:px-8 sm:py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/80">
            <Siren className="h-4 w-4" aria-hidden /> CareRoute safety override · {c.id}
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white/80 ring-1 ring-white/30 hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back
          </button>
        </div>

        <div className="mt-10 grid flex-1 gap-10 lg:mt-14 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
          <div>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.1 }}
              className="relative mb-8 inline-grid h-20 w-20 place-items-center rounded-3xl bg-white text-er-600 shadow-2xl"
            >
              <span className="absolute inset-0 animate-pulsering rounded-3xl bg-white/60" aria-hidden />
              <Siren className="relative h-10 w-10" aria-hidden />
            </motion.div>
            <motion.h1
              id="er-title"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
              className="font-display text-[52px] leading-[0.95] tracking-tight sm:text-7xl lg:text-[88px]"
            >
              Go to the emergency department <em className="underline decoration-white/40 decoration-4 underline-offset-8">now.</em>
            </motion.h1>
            <motion.p
              id="er-desc"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="mt-6 max-w-xl text-lg leading-relaxed text-white/90"
            >
              Your symptoms match warning signs that need emergency care. Call your local emergency number or go to the nearest emergency
              department. Do not drive yourself, and do not wait to see if it settles.
            </motion.p>

            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <a
                ref={callRef}
                href="tel:112"
                className="inline-flex h-16 items-center justify-center gap-3 rounded-2xl bg-white px-8 text-xl font-bold text-er-700 shadow-2xl transition hover:scale-[1.02] focus-visible:outline-white"
              >
                <Phone className="h-6 w-6" aria-hidden /> Call 112
              </a>
              <a
                href="tel:767"
                className="inline-flex h-16 items-center justify-center gap-3 rounded-2xl bg-er-700/60 px-6 text-base font-semibold text-white ring-1 ring-white/40 transition hover:bg-er-700 focus-visible:outline-white"
              >
                <Phone className="h-5 w-5" aria-hidden /> Lagos emergency 767
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-er-900/40 px-5 py-4 ring-1 ring-white/25"
            >
              <Ban className="h-7 w-7 shrink-0" aria-hidden />
              <div>
                <div className="text-lg font-bold">No payment required.</div>
                <div className="text-sm text-white/80">CareRoute never asks for payment before emergency care. The payment step was skipped entirely.</div>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="space-y-5"
          >
            {t.red_flags.length > 0 && (
              <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">Red flags detected</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.red_flags.map((f) => (
                    <span key={f} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-er-700">
                      {f}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-white/70">
                  Detected by deterministic safety rules. An AI model can never downgrade these.
                </p>
              </div>
            )}

            <div className="rounded-3xl bg-white p-5 text-ink shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="eyebrow text-er-700">Nearest emergency departments</div>
                <span className="text-[11px] font-semibold text-sc-700">Open 24/7</span>
              </div>
              <ul className="mt-3 divide-y divide-paper-line">
                {(ers.length ? ers : t.providers).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-er-50 text-er-600">
                      <Hospital className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <div className="text-xs text-ink-3">
                        {p.city} · {p.service}
                      </div>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + " " + p.city)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-paper hover:bg-ink-2"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden /> Directions
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {t.citations.length > 0 && (
              <div className="rounded-3xl bg-er-900/30 p-5 ring-1 ring-white/15">
                <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">Why · grounded guidance</div>
                <ul className="mt-2 space-y-1.5">
                  {t.citations.map((ci) => (
                    <li key={ci.guideline_id}>
                      <a href={ci.url} target="_blank" rel="noreferrer" className="group flex items-start gap-2 text-sm text-white">
                        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>
                          <span className="font-medium group-hover:underline">{ci.title}</span>
                          <span className="block text-xs text-white/65">{ci.source}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </div>

        <p className="mt-10 text-center text-xs text-white/70">
          Decision support for routing only. Not a diagnosis. If you are unsure, always choose emergency care.
        </p>
      </div>
    </motion.div>
  );
}
