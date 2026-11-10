import clsx from "clsx";
import {
  ArrowRight,
  BookMarked,
  BrainCircuit,
  CircleDollarSign,
  FileSearch,
  HandCoins,
  Lock,
  Navigation,
  ScrollText,
  ShieldCheck,
  Siren,
  Stethoscope,
  Unlock,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useConfig } from "../lib/config";
import { LEVEL_META, LEVELS } from "../lib/meta";

interface Stage {
  icon: LucideIcon;
  title: string;
  body: string;
  kind: "guard" | "ai" | "data" | "pay";
}

const PIPELINE: Stage[] = [
  { icon: ShieldCheck, title: "Input guard", body: "Length, age, prompt-injection, clinical scope, PII redaction before any model sees text.", kind: "guard" },
  { icon: Siren, title: "Red-flag rules", body: "Deterministic patterns (chest pain, stroke, sepsis…) set a floor an AI can't lower.", kind: "guard" },
  { icon: BookMarked, title: "Retrieval", body: "BM25-style search over curated NHS, WHO and NICE guidance.", kind: "data" },
  { icon: BrainCircuit, title: "Gemini reasoning", body: "Proposes level, advice, SBAR handoff; falls back to a rules engine if unavailable.", kind: "ai" },
  { icon: FileSearch, title: "Output guard", body: "Valid level, red-flag floor, citations grounded, safe language, confidence threshold.", kind: "guard" },
  { icon: Navigation, title: "Routing", body: "Maps the level to real services, prices and ETAs. Emergencies skip payment.", kind: "data" },
];

const MONEY: Stage[] = [
  { icon: Lock, title: "Authorize", body: "PayPal order with intent AUTHORIZE. Funds held, not taken.", kind: "pay" },
  { icon: Stethoscope, title: "Consult confirmed", body: "Provider confirms the visit happened (and any clinician review is done).", kind: "pay" },
  { icon: CircleDollarSign, title: "Capture", body: "Capture the hold, or less if a clinician down-triaged the case.", kind: "pay" },
  { icon: HandCoins, title: "Payout", body: "PayPal Payouts sends the provider their share minus a 5% platform fee.", kind: "pay" },
];

const KIND: Record<Stage["kind"], { chip: string; label: string; icon: string }> = {
  guard: { chip: "bg-rose-50 text-rose-700 ring-rose-300/50", label: "Guardrail", icon: "bg-rose-100 text-rose-700" },
  ai: { chip: "bg-violet-50 text-violet-700 ring-violet-300/50", label: "LLM", icon: "bg-violet-100 text-violet-700" },
  data: { chip: "bg-paper-2 text-ink-2 ring-ink/10", label: "Deterministic", icon: "bg-paper-2 text-ink-2" },
  pay: { chip: "bg-[#E8F3FB] text-pp ring-pp-light/40", label: "PayPal", icon: "bg-[#E8F3FB] text-pp" },
};

function Flow({ stages }: { stages: Stage[] }) {
  return (
    <ol className={clsx("grid gap-3", stages.length === 6 ? "md:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-2 lg:grid-cols-4")}>
      {stages.map((s, i) => (
        <li key={s.title} className="relative">
          <div className="card h-full p-4">
            <div className="flex items-center justify-between">
              <span className={clsx("grid h-9 w-9 place-items-center rounded-xl", KIND[s.kind].icon)}>
                <s.icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="font-mono text-[11px] text-ink-4">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <div className="mt-3 text-sm font-semibold text-ink">{s.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">{s.body}</p>
            <span className={clsx("chip mt-3 px-2 py-0.5 text-[10px]", KIND[s.kind].chip)}>{KIND[s.kind].label}</span>
          </div>
          {i < stages.length - 1 && (
            <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-paper text-ink-3 xl:block" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  );
}

const PRINCIPLES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Siren, title: "Emergencies never see a checkout", body: "If any red flag fires or the level is emergency, the payment step is removed entirely: the backend refuses checkout with HTTP 409." },
  { icon: ShieldCheck, title: "Rules set the floor, AI can only go up", body: "The LLM can never return a lower level than a deterministic red-flag rule. Output verification enforces it." },
  { icon: ScrollText, title: "Grounded or it doesn't ship", body: "Every decision must cite a retrieved guideline. Ungrounded output is flagged and escalated to a clinician." },
  { icon: UserRoundCheck, title: "Humans in the loop when unsure", body: "Low confidence or conflicting signals send the case to a clinician. Capture is locked until they review." },
  { icon: Lock, title: "Money follows care, not the other way round", body: "Authorize first, capture only after the consult. Down-triage captures less; up-triage voids or refunds." },
  { icon: FileSearch, title: "Everything is auditable", body: "Each agent step, guardrail decision and PayPal call is written to an append-only event log." },
];

export default function HowItWorks() {
  const { config } = useConfig();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="max-w-3xl">
        <div className="eyebrow">How it works</div>
        <h1 className="mt-2 font-display text-5xl leading-[1.02] tracking-tight text-ink sm:text-6xl">
          An agent that knows when <em className="text-ink-2">not</em> to take your money.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-2">
          In Lagos, as in much of the world, people pay out of pocket and often end up at the wrong door: an expensive hospital for a sore throat,
          or a pharmacy counter for a heart attack. CareRoute fixes the routing and makes paying for care safe for both sides.
        </p>
      </div>

      <section className="mt-12" aria-labelledby="triage-h">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 id="triage-h" className="text-2xl font-semibold tracking-tight text-ink">
            1 · The triage pipeline
          </h2>
          <span className="font-mono text-xs text-ink-3">
            running now: {config.engine === "gemini" ? config.model : "rules engine"} · threshold {config.confidence_threshold}
          </span>
        </div>
        <Flow stages={PIPELINE} />
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {LEVELS.map((l) => (
            <div key={l} className="flex items-center gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-ink/[0.05]">
              <span className="h-8 w-1.5 rounded-full" style={{ background: LEVEL_META[l].hex }} aria-hidden />
              <div>
                <div className="text-sm font-semibold text-ink">{LEVEL_META[l].label}</div>
                <div className="text-xs text-ink-3">{LEVEL_META[l].tagline}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="money-h">
        <h2 id="money-h" className="mb-4 text-2xl font-semibold tracking-tight text-ink">
          2 · The money flow on PayPal
        </h2>
        <Flow stages={MONEY} />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { icon: Unlock, t: "No-show or cancel", d: "Authorization voided. Patient charged nothing.", c: "text-sc-700" },
            { icon: CircleDollarSign, t: "Clinician down-triages", d: "Capture only the cheaper level's price; the rest of the hold is released.", c: "text-rt-700" },
            { icon: Siren, t: "Clinician up-triages to emergency", d: "Hold voided, or a full refund if already captured. Patient sent to ER.", c: "text-er-700" },
          ].map(({ icon: Icon, t, d, c }) => (
            <div key={t} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink/[0.05]">
              <div className={clsx("flex items-center gap-2 text-sm font-semibold", c)}>
                <Icon className="h-4 w-4" aria-hidden /> {t}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="safety-h">
        <h2 id="safety-h" className="mb-4 text-2xl font-semibold tracking-tight text-ink">
          3 · Safety principles
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-5">
              <Icon className="h-5 w-5 text-ink" aria-hidden />
              <div className="mt-3 font-semibold text-ink">{title}</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-3">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 overflow-hidden rounded-3xl bg-ink p-8 text-white sm:p-10">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-4xl leading-tight">See it end to end in two minutes.</h2>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              Triage a patient, hold funds with PayPal, then open the clinic console in another tab and confirm the consult. Watch the dashboard
              update live.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/" className="btn bg-white text-ink hover:bg-paper">
              Get care <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/dashboard" className="btn text-white ring-1 ring-white/30 hover:bg-white/10">
              Dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
