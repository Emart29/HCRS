import type { Actor, CaseStatus, Level } from "./types";

export interface LevelMeta {
  label: string;
  short: string;
  tagline: string;
  hex: string;
  text: string;
  bg: string;
  soft: string;
  ring: string;
  border: string;
}

export const LEVELS: Level[] = ["emergency", "urgent", "routine", "self_care"];

export const LEVEL_META: Record<Level, LevelMeta> = {
  emergency: {
    label: "Emergency",
    short: "ER now",
    tagline: "Go to the emergency department now",
    hex: "#E5252A",
    text: "text-er-700",
    bg: "bg-er-600",
    soft: "bg-er-50",
    ring: "ring-er-500/30",
    border: "border-er-500",
  },
  urgent: {
    label: "Urgent",
    short: "Same day",
    tagline: "Be seen today",
    hex: "#E89A0C",
    text: "text-ur-700",
    bg: "bg-ur-500",
    soft: "bg-ur-50",
    ring: "ring-ur-500/30",
    border: "border-ur-500",
  },
  routine: {
    label: "Routine",
    short: "GP visit",
    tagline: "Book a GP consultation",
    hex: "#2F6FEB",
    text: "text-rt-700",
    bg: "bg-rt-500",
    soft: "bg-rt-50",
    ring: "ring-rt-500/30",
    border: "border-rt-500",
  },
  self_care: {
    label: "Self-care",
    short: "Pharmacy",
    tagline: "A pharmacist can help",
    hex: "#1E9E5A",
    text: "text-sc-700",
    bg: "bg-sc-500",
    soft: "bg-sc-50",
    ring: "ring-sc-500/30",
    border: "border-sc-500",
  },
};

export const levelMeta = (l: string): LevelMeta => LEVEL_META[l as Level] ?? LEVEL_META.routine;

export const STATUS_META: Record<CaseStatus, { label: string; cls: string }> = {
  emergency_routed: { label: "Sent to ER", cls: "bg-er-50 text-er-700 ring-er-500/25" },
  triaged: { label: "Choosing care", cls: "bg-paper-2 text-ink-2 ring-ink/10" },
  awaiting_payment: { label: "Awaiting PayPal", cls: "bg-[#E8F3FB] text-pp ring-pp-light/30" },
  funds_held: { label: "Funds held", cls: "bg-[#E8F3FB] text-pp ring-pp-light/40" },
  completed: { label: "Completed", cls: "bg-sc-50 text-sc-700 ring-sc-500/25" },
  cancelled: { label: "Cancelled", cls: "bg-paper-2 text-ink-3 ring-ink/10" },
  rebook_required: { label: "Rebook needed", cls: "bg-ur-50 text-ur-700 ring-ur-500/25" },
};

export const statusMeta = (s: string) => STATUS_META[s as CaseStatus] ?? { label: s, cls: "bg-paper-2 text-ink-2 ring-ink/10" };

export const ACTOR_META: Record<Actor, { label: string; dot: string; text: string; chip: string; lightChip: string }> = {
  agent: {
    label: "Agent",
    dot: "bg-violet-400",
    text: "text-violet-300",
    chip: "bg-violet-500/15 text-violet-200 ring-violet-400/30",
    lightChip: "bg-violet-50 text-violet-700 ring-violet-300/50",
  },
  guardrail: {
    label: "Guardrail",
    dot: "bg-rose-400",
    text: "text-rose-300",
    chip: "bg-rose-500/15 text-rose-200 ring-rose-400/30",
    lightChip: "bg-rose-50 text-rose-700 ring-rose-300/50",
  },
  paypal: {
    label: "PayPal",
    dot: "bg-sky-400",
    text: "text-sky-300",
    chip: "bg-sky-500/15 text-sky-200 ring-sky-400/30",
    lightChip: "bg-[#E8F3FB] text-pp ring-pp-light/40",
  },
  clinician: {
    label: "Clinician",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
    chip: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
    lightChip: "bg-emerald-50 text-emerald-700 ring-emerald-300/50",
  },
  provider: {
    label: "Provider",
    dot: "bg-amber-400",
    text: "text-amber-300",
    chip: "bg-amber-500/15 text-amber-200 ring-amber-400/30",
    lightChip: "bg-amber-50 text-amber-800 ring-amber-300/50",
  },
};

export const actorMeta = (a: string) => ACTOR_META[a as Actor] ?? ACTOR_META.agent;

export const STEP_META: Record<string, { title: string; blurb: string }> = {
  input_guardrails: { title: "Input guard", blurb: "Scope, prompt-injection, PII and sanity checks" },
  red_flag_rules: { title: "Red-flag rules", blurb: "Deterministic emergency patterns, no AI involved" },
  retrieval: { title: "Guideline retrieval", blurb: "Searches the NHS / WHO / NICE knowledge base" },
  llm_fallback: { title: "Model fallback", blurb: "Model unavailable, deterministic engine took over" },
  reasoning: { title: "Clinical reasoning", blurb: "Proposes a care level, advice and SBAR handoff" },
  output_guardrails: { title: "Output verification", blurb: "Grounding, red-flag floor, confidence, safe language" },
  routing: { title: "Care routing", blurb: "Matches the level to real services and prices" },
};

export const PROVIDER_TYPE: Record<string, string> = {
  pharmacy: "Pharmacy",
  telehealth: "Telehealth",
  clinic: "Clinic",
  emergency: "Emergency dept.",
};

export function money(n: number | undefined | null, currency = "USD") {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

export function pct(n: number | undefined | null, digits = 0) {
  return `${(Number(n ?? 0) * 100).toFixed(digits)}%`;
}

export function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function clock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const titleCase = (s: string) =>
  s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bPii\b/g, "PII");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Split "S: ... | B: ... | A: ... | R: ..." into labelled parts. */
export function parseSbar(s: string): { key: string; label: string; text: string }[] {
  const labels: Record<string, string> = { S: "Situation", B: "Background", A: "Assessment", R: "Recommendation" };
  const parts = (s || "").split(/\s*\|\s*/).filter(Boolean);
  const out = parts.map((p) => {
    const m = p.match(/^([SBAR]):\s*(.*)$/s);
    return m ? { key: m[1], label: labels[m[1]], text: m[2] } : { key: "•", label: "Note", text: p };
  });
  return out.length ? out : [{ key: "•", label: "Summary", text: s }];
}
