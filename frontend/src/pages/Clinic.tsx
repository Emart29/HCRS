import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Search,
  Siren,
  Stethoscope,
  UserRoundCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AgentPipeline from "../components/AgentPipeline";
import DemoControls from "../components/DemoControls";
import { EventTimeline } from "../components/EventList";
import MoneyTimeline from "../components/MoneyTimeline";
import { Citations, EmptyState, ErrorNote, GuardrailChecks, LevelBadge, RedFlags, SectionTitle, Spinner, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { usePoll } from "../lib/hooks";
import { LEVEL_META, LEVELS, levelMeta, money, parseSbar, timeAgo } from "../lib/meta";
import type { Case, Level } from "../lib/types";

type Filter = "all" | "review" | "held" | "completed" | "emergency";

const FILTERS: { key: Filter; label: string; test: (c: Case) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "review", label: "Needs review", test: (c) => c.review.status === "pending" },
  { key: "held", label: "Funds held", test: (c) => c.status === "funds_held" },
  { key: "completed", label: "Completed", test: (c) => c.status === "completed" },
  { key: "emergency", label: "Emergency", test: (c) => c.status === "emergency_routed" },
];

interface Outcome {
  tone: "money" | "safe" | "info";
  title: string;
  lines: string[];
}

function describeOutcome(before: Case, after: Case): Outcome {
  const b = before.payment;
  const a = after.payment;
  const cur = a.currency;
  const lines: string[] = [];
  let tone: Outcome["tone"] = "info";
  let title = "Case updated";

  if (a.captured > b.captured) {
    tone = "money";
    title = "Consult confirmed · payment captured";
    lines.push(`Captured ${money(a.captured, cur)} from the PayPal hold`);
    if (a.captured < a.amount) lines.push(`Released the remaining ${money(a.amount - a.captured, cur)} of the ${money(a.amount, cur)} hold`);
  }
  if (a.payout_amount > b.payout_amount) lines.push(`Paid ${after.provider?.name ?? "provider"} ${money(a.payout_amount, cur)} via PayPal Payouts (platform fee ${money(a.platform_fee, cur)})`);
  if (a.status === "voided" && b.status !== "voided") {
    tone = "safe";
    title = "Hold voided";
    lines.push(`Authorization of ${money(a.amount, cur)} voided, patient charged ${money(0, cur)}`);
  }
  if (a.refunded > b.refunded) {
    tone = "safe";
    title = "Refund issued";
    lines.push(`Refunded ${money(a.refunded - b.refunded, cur)} to the patient`);
  }
  if (a.adjusted_amount != null && a.adjusted_amount !== b.adjusted_amount) {
    tone = "money";
    title = "Down-triaged · charge reduced";
    lines.push(`Will capture only ${money(a.adjusted_amount, cur)} of the ${money(a.amount, cur)} held (saves the patient ${money(a.amount - a.adjusted_amount, cur)})`);
  }
  if (after.status === "emergency_routed" && before.status !== "emergency_routed") {
    tone = "safe";
    title = "Escalated to emergency";
    lines.push("Patient redirected to the emergency department; no payment will ever be requested");
  }
  if (after.status === "rebook_required" && before.status !== "rebook_required") {
    title = "Up-triaged · rebook required";
    lines.push(`Hold released so the patient can book ${levelMeta(after.triage.level).label.toLowerCase()} care`);
  }
  if (after.status === "cancelled" && before.status !== "cancelled" && !lines.length) {
    title = "Cancelled";
    lines.push("Case cancelled before any payment was taken");
  }
  if (after.review.status === "confirmed" && before.review.status !== "confirmed") {
    title = lines.length ? title : "Triage confirmed by clinician";
    lines.push(after.status === "funds_held" ? "Review complete: capture is now unlocked for the provider" : "Review complete");
  }
  if (after.review.status === "retriaged" && before.triage.level !== after.triage.level) {
    lines.unshift(`Re-triaged ${levelMeta(before.triage.level).label} → ${levelMeta(after.triage.level).label}`);
  }
  if (!lines.length) lines.push("No money moved.");
  return { tone, title, lines };
}

/* ------------------------------------------------------------------ */

function QueueItem({ c, active, onClick }: { c: Case; active: boolean; onClick: () => void }) {
  const m = levelMeta(c.triage.level);
  return (
    <button
      onClick={onClick}
      aria-current={active}
      className={clsx(
        "relative w-full overflow-hidden rounded-xl py-3 pl-4 pr-3 text-left transition",
        active ? "bg-white shadow-card ring-1 ring-ink/15" : "hover:bg-white/70",
      )}
    >
      <span className="absolute inset-y-2 left-0 w-1 rounded-r-full" style={{ background: m.hex }} aria-hidden />
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold text-ink">{c.patient.name}</span>
        <span className="text-xs text-ink-3">
          {c.patient.age ?? "?"}
          {c.patient.sex ? c.patient.sex[0].toUpperCase() : ""}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-4">{timeAgo(c.created_at)}</span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-xs text-ink-3">{c.patient.symptoms}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <LevelBadge level={c.triage.level} size="sm" />
        <StatusBadge status={c.status} />
        {c.review.status === "pending" && (
          <span className="chip bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700 ring-violet-300/50">
            <UserRoundCheck className="h-3 w-3" aria-hidden /> Review
          </span>
        )}
        {c.payment.amount > 0 && <span className="ml-auto font-mono text-[11px] text-ink-2">{money(c.payment.amount, c.payment.currency)}</span>}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */

function ActionPanel({ c, onUpdated }: { c: Case; onUpdated: (before: Case, after: Case) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [cNote, setCNote] = useState("");
  const [newLevel, setNewLevel] = useState<Level | null>(null);
  const [clinician, setClinician] = useState("Dr. Bello");

  useEffect(() => {
    setError(null);
    setNote("");
    setCNote("");
    setNewLevel(null);
  }, [c.id]);

  const act = async (key: string, fn: () => Promise<Case>) => {
    setBusy(key);
    setError(null);
    try {
      const after = await fn();
      onUpdated(c, after);
      setNote("");
      setCNote("");
      setNewLevel(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reviewPending = c.review.status === "pending";
  const canConfirm = c.status === "funds_held";
  const canCancel = ["funds_held", "triaged", "awaiting_payment"].includes(c.status);
  const canReview = !["cancelled"].includes(c.status);
  const cur = c.payment.currency;
  const captureAmount = c.payment.adjusted_amount ?? c.payment.amount;

  return (
    <div className="space-y-4">
      {/* Provider actions */}
      <div className="rounded-2xl bg-white p-4 ring-1 ring-ink/[0.07]">
        <div className="mb-3 flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-ink-2" aria-hidden />
          <span className="text-sm font-semibold text-ink">Provider</span>
          <span className="text-xs text-ink-3">{c.provider?.name ?? "not booked yet"}</span>
        </div>
        {canConfirm || canCancel ? (
          <>
            <label htmlFor="note" className="sr-only">
              Note
            </label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="field mb-3" />
            <div className="flex flex-wrap gap-2">
              {canConfirm && (
                <button
                  disabled={!!busy || reviewPending}
                  onClick={() => act("confirm", () => api.confirm(c.id, note || "Consultation completed"))}
                  className="btn flex-1 bg-pp text-white hover:bg-[#00256b]"
                  title={reviewPending ? "A clinician must review this case first" : undefined}
                >
                  {busy === "confirm" ? <Spinner /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                  Confirm consult · capture {money(captureAmount, cur)}
                </button>
              )}
              {canCancel && (
                <button
                  disabled={!!busy}
                  onClick={() => act("cancel", () => api.cancel(c.id, note || "Patient did not attend (no-show)"))}
                  className="btn-ghost"
                >
                  {busy === "cancel" ? <Spinner /> : <XCircle className="h-4 w-4" aria-hidden />}
                  {c.status === "funds_held" ? "No-show · void hold" : "Cancel"}
                </button>
              )}
            </div>
            {canConfirm && reviewPending && (
              <p className="mt-2 text-xs text-violet-700">Capture is locked until a clinician reviews this escalated case.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-3">
            {c.status === "emergency_routed"
              ? "Emergency case: routed to the ER, no payment is ever requested."
              : c.status === "completed"
                ? "Consult confirmed and provider paid."
                : c.status === "cancelled"
                  ? "Case closed."
                  : "Waiting for the patient."}
          </p>
        )}
      </div>

      {/* Clinician review */}
      {canReview && (
        <div className={clsx("rounded-2xl p-4 ring-1", reviewPending ? "bg-violet-50/70 ring-violet-300/60" : "bg-white ring-ink/[0.07]")}>
          <div className="mb-3 flex items-center gap-2">
            <UserRoundCheck className="h-4 w-4 text-violet-700" aria-hidden />
            <span className="text-sm font-semibold text-ink">Clinician review</span>
            {reviewPending ? (
              <span className="chip bg-violet-600 px-2 py-0.5 text-[11px] text-white ring-violet-600">Required</span>
            ) : (
              <span className="text-xs text-ink-3">{c.review.status === "none" ? "optional" : c.review.status}</span>
            )}
          </div>
          {reviewPending && c.review.reasons.length > 0 && (
            <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-violet-900/80">
              {c.review.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <div className="mb-2 text-[11px] font-medium text-ink-3">Re-triage to</div>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="New triage level">
            {LEVELS.map((l) => {
              const m = LEVEL_META[l];
              const current = l === c.triage.level;
              const sel = newLevel === l;
              return (
                <button
                  key={l}
                  role="radio"
                  aria-checked={sel}
                  disabled={current || !!busy}
                  onClick={() => setNewLevel(sel ? null : l)}
                  className={clsx(
                    "rounded-xl px-1 py-2 text-[11px] font-semibold ring-1 transition disabled:cursor-not-allowed",
                    sel ? "text-white ring-transparent" : current ? "bg-paper text-ink-4 ring-ink/5" : "bg-white text-ink-2 ring-ink/10 hover:ring-ink/30",
                  )}
                  style={sel ? { background: m.hex } : undefined}
                >
                  <span className="mx-auto mb-1 block h-2 w-2 rounded-full" style={{ background: m.hex }} aria-hidden />
                  {m.label}
                  {current && <span className="block text-[9px] font-normal">current</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px]">
            <label htmlFor="cnote" className="sr-only">
              Clinician note
            </label>
            <input id="cnote" value={cNote} onChange={(e) => setCNote(e.target.value)} placeholder="Clinical note" className="field" />
            <label htmlFor="clin" className="sr-only">
              Clinician name
            </label>
            <input id="clin" value={clinician} onChange={(e) => setClinician(e.target.value)} className="field" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={!!busy || !newLevel}
              onClick={() => newLevel && act("retriage", () => api.review(c.id, { action: "retriage", new_level: newLevel, note: cNote || undefined, clinician }))}
              className="btn-ink flex-1"
            >
              {busy === "retriage" ? <Spinner /> : null}
              {newLevel ? `Re-triage to ${LEVEL_META[newLevel].label}` : "Pick a level"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => act("review", () => api.review(c.id, { action: "confirm", note: cNote || "Agree with triage.", clinician }))}
              className="btn-ghost"
            >
              {busy === "review" ? <Spinner /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              Confirm triage
            </button>
          </div>
        </div>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CaseDetail({ c, outcome, onUpdated, onBack }: { c: Case; outcome: Outcome | null; onUpdated: (b: Case, a: Case) => void; onBack: () => void }) {
  const t = c.triage;
  const m = levelMeta(t.level);
  const p = c.payment;
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="btn-ghost h-9 px-3 text-xs lg:hidden">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Queue
      </button>

      <div className="card overflow-hidden">
        <div className="h-1.5" style={{ background: m.hex }} aria-hidden />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow">
                {c.id} · {timeAgo(c.created_at)}
              </div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
                {c.patient.name}{" "}
                <span className="text-base font-normal text-ink-3">
                  {[c.patient.age != null ? `${c.patient.age}y` : null, c.patient.sex, c.patient.location].filter(Boolean).join(" · ")}
                </span>
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <LevelBadge level={t.level} size="lg" />
              <StatusBadge status={c.status} />
            </div>
          </div>
          <blockquote className="mt-4 rounded-xl bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink ring-1 ring-ink/5">
            &ldquo;{c.patient.symptoms}&rdquo;
            {c.patient.duration && <span className="ml-1 text-sm text-ink-3">· {c.patient.duration}</span>}
          </blockquote>
          {c.review.status === "retriaged" && (
            <p className="mt-3 text-xs text-ink-3">
              Originally triaged <strong>{levelMeta(c.review.original_level).label}</strong> by the agent; changed by {c.review.reviewed_by}.
              {c.review.clinician_note && <> &ldquo;{c.review.clinician_note}&rdquo;</>}
            </p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {outcome && (
          <motion.div
            key={outcome.title + outcome.lines.join()}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            className={clsx(
              "rounded-2xl p-4 ring-1",
              outcome.tone === "money" && "bg-pp text-white ring-pp",
              outcome.tone === "safe" && "bg-sc-50 text-sc-700 ring-sc-500/30",
              outcome.tone === "info" && "bg-white text-ink ring-ink/10",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="h-4 w-4" aria-hidden /> {outcome.title}
            </div>
            <ul className="mt-1.5 space-y-0.5 text-sm opacity-90">
              {outcome.lines.map((l) => (
                <li key={l}>→ {l}</li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {/* money */}
          <div className="card p-5">
            <SectionTitle
              eyebrow="PayPal"
              title="Money flow"
              right={
                p.required ? (
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold text-ink">{money(p.amount, p.currency)}</div>
                    <div className="text-[11px] text-ink-3">{p.status.replace(/_/g, " ")}</div>
                  </div>
                ) : (
                  <span className="chip bg-er-50 text-er-700 ring-er-500/25">
                    <Siren className="h-3 w-3" aria-hidden /> No payment required
                  </span>
                )
              }
            />
            {p.required && p.status !== "not_started" ? (
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[440px]">
                  <MoneyTimeline c={c} layout="horizontal" />
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-3">
                {p.required
                  ? "Patient hasn't chosen a provider yet."
                  : "Emergency bypass: the agent skipped checkout entirely and sent the patient to the ER."}
              </p>
            )}
            {(p.captured > 0 || p.refunded > 0) && (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-paper-line pt-4 text-sm sm:grid-cols-4">
                {[
                  ["Captured", p.captured],
                  ["Refunded", p.refunded],
                  ["Platform fee", p.platform_fee],
                  ["Provider payout", p.payout_amount],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-[11px] text-ink-3">{k}</dt>
                    <dd className="font-mono font-medium text-ink">{money(v as number, p.currency)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {/* SBAR */}
          <div className="card p-5">
            <SectionTitle eyebrow="Handoff" title="SBAR summary" right={<ClipboardList className="h-4 w-4 text-ink-3" aria-hidden />} />
            <dl className="space-y-2.5">
              {parseSbar(t.handoff_summary).map((s) => (
                <div key={s.key + s.text} className="flex gap-3">
                  <dt className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink font-mono text-xs font-semibold text-paper" title={s.label}>
                    {s.key}
                  </dt>
                  <dd className="pt-1 text-sm text-ink-2">
                    <span className="sr-only">{s.label}: </span>
                    {s.text}
                  </dd>
                </div>
              ))}
            </dl>
            {t.red_flags.length > 0 && (
              <div className="mt-4">
                <RedFlags flags={t.red_flags} />
              </div>
            )}
          </div>

          <AgentPipeline trace={t.trace} title={`Agent trace · ${t.engine}`} />

          <div className="card space-y-5 p-5">
            <GuardrailChecks checks={t.guardrail_checks} />
            <div>
              <div className="mb-2 text-xs font-semibold text-ink-2">Citations</div>
              <Citations citations={t.citations} />
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-5 order-first xl:order-last">
          <ActionPanel c={c} onUpdated={onUpdated} />
          <div className="card p-5">
            <SectionTitle eyebrow="Audit" title="Event timeline" />
            {c.events?.length ? <EventTimeline events={c.events} /> : <Spinner />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Clinic() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("case");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Case | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const cases = usePoll(api.cases, 4000);

  const list = cases.data ?? [];
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, list.filter(f.test).length])), [list]);
  const shown = list
    .filter(FILTERS.find((f) => f.key === filter)!.test)
    .filter((c) => !q || `${c.patient.name} ${c.id} ${c.patient.symptoms}`.toLowerCase().includes(q.toLowerCase()));

  // auto-select the first case on desktop
  useEffect(() => {
    if (!selectedId && list.length && window.innerWidth >= 1024) {
      setParams({ case: (list.find((c) => c.review.status === "pending") ?? list[0]).id }, { replace: true });
    }
  }, [selectedId, list, setParams]);

  // load + poll detail
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let alive = true;
    const load = () =>
      api
        .getCase(selectedId)
        .then((c) => alive && setDetail(c))
        .catch(() => alive && setDetail(null));
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [selectedId]);

  useEffect(() => setOutcome(null), [selectedId]);

  const select = (id: string) => setParams({ case: id });

  const onUpdated = (before: Case, after: Case) => {
    setDetail(after);
    setOutcome(describeOutcome(before, after));
    cases.refresh();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Provider &amp; clinician console</div>
          <h1 className="mt-1 font-display text-5xl tracking-tight text-ink">Clinic</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sc-500" aria-hidden /> Live · refreshes every 4s
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Queue */}
        <aside className={clsx("min-w-0 lg:block", selectedId ? "hidden" : "block")} aria-label="Case queue">
          <div className="rounded-2xl bg-paper-2/70 p-2 ring-1 ring-ink/[0.05] lg:sticky lg:top-20">
            <div className="relative p-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" aria-hidden />
              <label htmlFor="q" className="sr-only">
                Search cases
              </label>
              <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient, ID, symptom" className="field bg-white pl-9" />
            </div>
            <div className="flex flex-wrap gap-1 p-1" role="tablist" aria-label="Filter cases">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={clsx(
                    "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                    filter === f.key ? "bg-ink text-paper" : "text-ink-2 hover:bg-white",
                  )}
                >
                  {f.label}
                  <span className={clsx("ml-1.5 font-mono text-[10px]", filter === f.key ? "text-paper/60" : "text-ink-4")}>{counts[f.key] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="scroll-thin max-h-[calc(100vh-240px)] space-y-1 overflow-y-auto p-1">
              {cases.loading && !cases.data ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : shown.length ? (
                shown.map((c) => <QueueItem key={c.id} c={c} active={c.id === selectedId} onClick={() => select(c.id)} />)
              ) : (
                <EmptyState
                  icon={<Inbox className="h-5 w-5" />}
                  title={list.length ? "Nothing here" : "No cases yet"}
                  body={list.length ? "No cases match this filter." : "Triage a patient on the Get care page, or load the Lagos demo data."}
                  action={!list.length ? <DemoControls compact onChange={cases.refresh} /> : undefined}
                />
              )}
            </div>
          </div>
        </aside>

        {/* Detail */}
        <section className={clsx("min-w-0", !selectedId && "hidden lg:block")} aria-label="Case detail">
          {detail ? (
            <CaseDetail c={detail} outcome={outcome} onUpdated={onUpdated} onBack={() => setParams({})} />
          ) : selectedId ? (
            <div className="card flex justify-center py-20">
              <Spinner className="h-6 w-6" />
            </div>
          ) : (
            <div className="card">
              <EmptyState icon={<Stethoscope className="h-5 w-5" />} title="Select a case" body="Pick a patient from the queue to review triage, confirm the consult and move money." />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
