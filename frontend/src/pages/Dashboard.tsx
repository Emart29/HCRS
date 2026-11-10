import clsx from "clsx";
import { Activity, Gauge, ShieldCheck, Siren, Terminal, UserRoundCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DemoControls from "../components/DemoControls";
import { AuditStream } from "../components/EventList";
import MoneyFlow from "../components/MoneyFlow";
import { EmptyState, LevelBadge, SectionTitle, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { usePoll } from "../lib/hooks";
import { ACTOR_META, LEVEL_META, LEVELS, levelMeta, money, pct, statusMeta } from "../lib/meta";
import type { EvalReport, Stats } from "../lib/types";

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: string; sub: string; tone?: "er" | "violet" }) {
  return (
    <div className={clsx("card relative overflow-hidden p-5", tone === "er" && "bg-er-600 text-white ring-er-600")}>
      <div className="flex items-center justify-between">
        <span className={clsx("text-xs font-semibold", tone === "er" ? "text-white/85" : "text-ink-2")}>{label}</span>
        <Icon className={clsx("h-4 w-4", tone === "er" ? "text-white" : tone === "violet" ? "text-violet-600" : "text-ink-3")} aria-hidden />
      </div>
      <div className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className={clsx("mt-1 text-xs", tone === "er" ? "text-white/80" : "text-ink-3")}>{sub}</div>
    </div>
  );
}

function LevelChart({ stats }: { stats: Stats }) {
  const data = LEVELS.map((l) => ({ level: l, name: LEVEL_META[l].label, value: stats.by_level[l] ?? 0, color: LEVEL_META[l].hex }));
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={78} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#3A4556" }} />
          <Tooltip
            cursor={{ fill: "rgba(14,23,38,0.04)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #E4DED4", fontSize: 12, boxShadow: "0 8px 24px -12px rgba(14,23,38,.2)" }}
            formatter={(v: number) => [`${v} case${v === 1 ? "" : "s"}`, "Cases"]}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            label={{ position: "right", fontSize: 12, fill: "#0E1726", fontFamily: "JetBrains Mono" }}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.level} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatusBar({ stats }: { stats: Stats }) {
  const entries = Object.entries(stats.by_status).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const COLORS: Record<string, string> = {
    emergency_routed: "#E5252A",
    triaged: "#A3ABB7",
    awaiting_payment: "#7FC4EA",
    funds_held: "#009CDE",
    completed: "#003087",
    cancelled: "#D5CFC5",
    rebook_required: "#E89A0C",
  };
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Case status breakdown">
        {entries.map(([k, v]) => (
          <div key={k} style={{ width: `${(v / total) * 100}%`, background: COLORS[k] ?? "#A3ABB7" }} title={`${statusMeta(k).label}: ${v}`} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {entries.map(([k, v]) => (
          <li key={k} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[k] ?? "#A3ABB7" }} aria-hidden />
            <span className="text-ink-2">{statusMeta(k).label}</span>
            <span className="ml-auto font-mono text-ink">{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const EVAL_METRICS: { key: keyof EvalReport["summary"]; label: string; goodHigh: boolean; note: string }[] = [
  { key: "emergency_recall", label: "Emergency recall", goodHigh: true, note: "emergencies caught" },
  { key: "under_triage_rate", label: "Under-triage", goodHigh: false, note: "sent to lower care than needed" },
  { key: "escalation_recall", label: "Escalation recall", goodHigh: true, note: "ambiguous cases sent to a human" },
  { key: "scope_block_rate", label: "Scope blocks", goodHigh: true, note: "off-topic / abuse stopped" },
  { key: "grounded_rate", label: "Grounded", goodHigh: true, note: "answers cite a guideline" },
  { key: "exact_accuracy", label: "Exact level", goodHigh: true, note: "matched expected level" },
  { key: "over_triage_rate", label: "Over-triage", goodHigh: false, note: "cautious: sent higher than needed" },
  { key: "overall_pass_rate", label: "Overall pass", goodHigh: true, note: "all scenario checks" },
];

const EXP_ORDER = ["emergency", "urgent", "routine", "self_care", "escalate", "blocked"];
const GOT_ORDER = ["emergency", "urgent", "routine", "self_care", "blocked"];
const short = (s: string) => (s === "self_care" ? "Self-care" : s === "escalate" ? "Escalate" : s.charAt(0).toUpperCase() + s.slice(1));

function Reliability({ report }: { report: EvalReport }) {
  const s = report.summary;
  const [onlyFails, setOnlyFails] = useState(false);
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const r of report.rows) {
      m[r.expected] ??= {};
      m[r.expected][r.got] = (m[r.expected][r.got] ?? 0) + 1;
    }
    return m;
  }, [report]);
  const maxCell = Math.max(1, ...Object.values(matrix).flatMap((r) => Object.values(r)));
  const rows = onlyFails ? report.rows.filter((r) => !r.correct) : report.rows;
  const expRows = EXP_ORDER.filter((e) => matrix[e]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {EVAL_METRICS.map((m) => {
          const v = Number(s[m.key] ?? 0);
          const great = m.goodHigh ? v >= 0.999 : v <= 0.001;
          const hero = m.key === "emergency_recall" || m.key === "under_triage_rate";
          return (
            <div
              key={m.key}
              className={clsx("rounded-2xl p-4 ring-1", hero ? "bg-ink text-white ring-ink" : "bg-paper ring-ink/[0.06]")}
            >
              <div className={clsx("text-xs font-semibold", hero ? "text-white/80" : "text-ink-2")}>{m.label}</div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className={clsx("font-mono text-3xl font-semibold tracking-tight", hero ? "text-white" : "text-ink")}>{pct(v, v % 1 && v * 100 % 1 ? 1 : 0)}</span>
                {great && (
                  <ShieldCheck className={clsx("h-4 w-4", hero ? "text-emerald-300" : "text-sc-600")} aria-label="target met" />
                )}
              </div>
              <div className={clsx("mt-0.5 text-[11px] leading-snug", hero ? "text-white/60" : "text-ink-3")}>{m.note}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-2">Expected vs. agent decision</div>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-[3px] text-center text-xs">
              <thead>
                <tr>
                  <th className="text-left text-[10px] font-medium text-ink-4">exp ↓ / got →</th>
                  {GOT_ORDER.map((g) => (
                    <th key={g} scope="col" className="px-1 pb-1 text-[10px] font-semibold text-ink-3">
                      {short(g)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expRows.map((e) => (
                  <tr key={e}>
                    <th scope="row" className="pr-2 text-left text-[11px] font-semibold text-ink-2">
                      {short(e)}
                    </th>
                    {GOT_ORDER.map((g) => {
                      const v = matrix[e]?.[g] ?? 0;
                      const diag = e === g;
                      const under = ["urgent", "routine", "self_care"].includes(g) && e === "emergency";
                      return (
                        <td
                          key={g}
                          className={clsx("h-9 min-w-[40px] rounded-md font-mono", v ? "font-semibold" : "text-ink-4", under && v && "ring-2 ring-er-500")}
                          style={{
                            background: v ? (diag ? `rgba(30,158,90,${0.15 + 0.6 * (v / maxCell)})` : `rgba(14,23,38,${0.05 + 0.25 * (v / maxCell)})`) : "rgba(14,23,38,0.03)",
                            color: v && diag && v / maxCell > 0.55 ? "white" : undefined,
                          }}
                          title={`expected ${short(e)}, got ${short(g)}: ${v}`}
                        >
                          {v || "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-ink-3">
            Green diagonal = exact match. Off-diagonal cells above the diagonal are cautious over-triage; an emergency below it would be outlined
            in red (there are none).
          </p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-2">
              {report.rows.length} scenarios · engine <span className="font-mono">{s.engine}</span>
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
              <input type="checkbox" checked={onlyFails} onChange={(e) => setOnlyFails(e.target.checked)} className="h-3.5 w-3.5 rounded accent-ink" />
              Only misses
            </label>
          </div>
          <div className="scroll-thin max-h-[340px] overflow-auto rounded-xl ring-1 ring-ink/[0.07]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-paper-2 text-[10px] uppercase tracking-wider text-ink-3">
                <tr>
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">Scenario</th>
                  <th className="px-3 py-2 font-semibold">Expected</th>
                  <th className="px-3 py-2 font-semibold">Got</th>
                  <th className="px-3 py-2 text-right font-semibold">Conf.</th>
                  <th className="px-3 py-2 text-center font-semibold">Pass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-line bg-white">
                {rows.map((r) => (
                  <tr key={r.id} className={clsx(!r.correct && "bg-ur-50/60")}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-ink-3">{r.id}</td>
                    <td className="max-w-[320px] px-3 py-2 text-ink-2">
                      <span className="line-clamp-2">{r.symptoms}</span>
                    </td>
                    <td className="px-3 py-2">{LEVEL_META[r.expected as keyof typeof LEVEL_META] ? <LevelBadge level={r.expected} size="sm" /> : <span className="chip bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700 ring-violet-300/50">{short(r.expected)}</span>}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        {LEVEL_META[r.got as keyof typeof LEVEL_META] ? <LevelBadge level={r.got} size="sm" /> : <span className="chip bg-paper-2 px-2 py-0.5 text-[11px] text-ink-2 ring-ink/10">{short(r.got)}</span>}
                        {r.escalated && <UserRoundCheck className="h-3.5 w-3.5 text-violet-600" aria-label="escalated" />}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-ink-2">{r.confidence != null ? r.confidence.toFixed(2) : "–"}</td>
                    <td className="px-3 py-2 text-center">
                      {r.correct ? <span className="font-semibold text-sc-600">✓</span> : <span className="font-semibold text-ur-700">✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const stats = usePoll(api.stats, 4000);
  const events = usePoll(() => api.events(60), 4000);
  const evalReport = usePoll(api.evalReport, 0);
  const refresh = () => {
    stats.refresh();
    events.refresh();
  };
  const s = stats.data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Operations &amp; trust</div>
          <h1 className="mt-1 font-display text-5xl tracking-tight text-ink">Dashboard</h1>
        </div>
        <DemoControls onChange={refresh} />
      </div>

      {!s ? (
        <div className="flex justify-center py-24">{stats.error ? <p className="text-sm text-er-700">{stats.error.message}</p> : <Spinner className="h-6 w-6" />}</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi icon={Users} label="Cases triaged" value={String(s.total_cases)} sub={`${s.by_level.self_care + s.by_level.routine} kept out of clinics & ERs`} />
            <Kpi icon={Siren} label="Emergency bypasses" value={String(s.emergency_bypasses)} sub="sent to ER · $0 payment asked" tone="er" />
            <Kpi icon={UserRoundCheck} label="Escalation rate" value={pct(s.escalation_rate)} sub={`${s.reviews_pending} awaiting clinician review`} tone="violet" />
            <Kpi icon={Gauge} label="Avg. confidence" value={pct(s.avg_confidence)} sub="low confidence → human review" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="card p-5 sm:p-6">
              <SectionTitle
                eyebrow="PayPal · authorize → capture → payout"
                title="Where every dollar went"
                right={<span className="font-mono text-xs text-ink-3">{s.money.currency}</span>}
              />
              <MoneyFlow money={s.money} />
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-paper-line pt-4 sm:grid-cols-5">
                {[
                  ["Held", s.money.held, "#009CDE"],
                  ["Captured", s.money.captured, "#003087"],
                  ["Paid out", s.money.paid_out, "#0F8A7A"],
                  ["Fees", s.money.platform_fees, "#7C3AED"],
                  ["Refunded", s.money.refunded, "#D97706"],
                ].map(([k, v, c]) => (
                  <div key={k as string}>
                    <dt className="flex items-center gap-1.5 text-[11px] text-ink-3">
                      <span className="h-2 w-2 rounded-sm" style={{ background: c as string }} aria-hidden />
                      {k}
                    </dt>
                    <dd className="font-mono text-sm font-semibold text-ink">{money(v as number, s.money.currency)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card space-y-6 p-5 sm:p-6">
              <div>
                <SectionTitle eyebrow="Routing" title="Triage mix" />
                {s.total_cases ? <LevelChart stats={s} /> : <p className="text-sm text-ink-3">No cases yet.</p>}
              </div>
              <div>
                <SectionTitle eyebrow="Workflow" title="Case status" />
                {s.total_cases ? <StatusBar stats={s} /> : <p className="text-sm text-ink-3">No cases yet.</p>}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="relative overflow-hidden rounded-2xl bg-ink text-white shadow-lift">
              <div className="dark-grid absolute inset-0 opacity-50" aria-hidden />
              <div className="relative flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-white/60" aria-hidden />
                  <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/70">Live audit log</span>
                </div>
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-white/45">
                  <Activity className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> streaming
                </span>
              </div>
              <div className="relative flex flex-wrap gap-1.5 border-b border-white/10 px-5 py-2.5">
                {Object.entries(ACTOR_META).map(([k, m]) => (
                  <span key={k} className={clsx("chip px-2 py-0.5 text-[10px]", m.chip)}>
                    <span className={clsx("h-1.5 w-1.5 rounded-full", m.dot)} aria-hidden />
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="scroll-dark relative max-h-[560px] overflow-y-auto px-3 py-3" aria-live="polite">
                {events.data?.length ? (
                  <AuditStream events={events.data} />
                ) : (
                  <p className="px-2 py-8 text-center font-mono text-xs text-white/40">No events yet. Load demo data or triage a patient.</p>
                )}
              </div>
            </div>
            <div className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {LEVELS.map((l) => {
                const m = levelMeta(l);
                const n = s.by_level[l] ?? 0;
                return (
                  <div key={l} className="flex items-center gap-3 rounded-2xl bg-white/60 p-4 ring-1 ring-ink/[0.05]">
                    <span className="h-10 w-1.5 rounded-full" style={{ background: m.hex }} aria-hidden />
                    <div>
                      <div className="text-sm font-semibold text-ink">{m.label}</div>
                      <div className="text-xs text-ink-3">{m.tagline}</div>
                    </div>
                    <div className="ml-auto font-mono text-lg font-semibold text-ink">{pct(s.total_cases ? n / s.total_cases : 0)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5 sm:p-6">
              <SectionTitle
                eyebrow="Offline evaluation · eval/run_eval.py"
                title="Reliability"
                right={
                  evalReport.data ? (
                    <span className="font-mono text-[11px] text-ink-3">{new Date(evalReport.data.summary.generated_at).toLocaleString()}</span>
                  ) : null
                }
              />
              {evalReport.data ? (
                <Reliability report={evalReport.data} />
              ) : evalReport.loading ? (
                <Spinner />
              ) : (
                <EmptyState
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="No evaluation report yet"
                  body="Run the safety benchmark to populate this panel:"
                  action={<code className="rounded-lg bg-ink px-3 py-2 font-mono text-xs text-paper">python eval/run_eval.py --engine rules</code>}
                />
              )}
            </div>

        </div>
      )}
    </div>
  );
}
