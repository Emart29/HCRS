export type Level = "emergency" | "urgent" | "routine" | "self_care";
export type CaseStatus =
  | "emergency_routed"
  | "triaged"
  | "awaiting_payment"
  | "funds_held"
  | "completed"
  | "cancelled"
  | "rebook_required";
export type Actor = "agent" | "guardrail" | "paypal" | "clinician" | "provider";

export interface AppConfig {
  engine: string;
  model: string | null;
  paypal_mode: "mock" | "sandbox" | "live" | string;
  paypal_client_id: string | null;
  currency: string;
  confidence_threshold: number;
  platform_fee_rate: number;
}

export interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

export interface Citation {
  guideline_id: string;
  title: string;
  source: string;
  url: string;
}

export interface TraceStep {
  step: string;
  detail: string;
  ms: number;
  checks?: Check[];
  flags?: { rule_id: string; label: string; guideline_id: string }[];
  hits?: { id: string; title: string; score: number }[];
  engine?: string;
  provider_count?: number;
  [k: string]: unknown;
}

export interface Provider {
  id: string;
  name: string;
  type: "pharmacy" | "telehealth" | "clinic" | "emergency" | string;
  service: string;
  levels: Level[];
  price: number;
  city: string;
  eta_minutes: number;
  rating: number;
  paypal_email: string | null;
}

export interface Triage {
  level: Level;
  confidence: number;
  reasoning: string;
  advice: string;
  handoff_summary: string;
  citations: Citation[];
  red_flags: string[];
  escalated: boolean;
  escalation_reasons: string[];
  engine: string;
  notes: string[];
  guardrail_checks: Check[];
  trace: TraceStep[];
  recommended_service: string;
  providers: Provider[];
  payment_required: boolean;
}

export interface Payment {
  required: boolean;
  mode: string;
  currency: string;
  status: string;
  amount: number;
  captured: number;
  refunded: number;
  platform_fee: number;
  payout_amount: number;
  adjusted_amount?: number;
  order_id?: string;
  approve_url?: string | null;
  authorization_id?: string;
  authorization_expires_at?: string | null;
  payer_email?: string | null;
  capture_id?: string;
  payout_batch_id?: string;
  payout_status?: string;
}

export interface Review {
  status: "none" | "pending" | "confirmed" | "retriaged";
  reasons: string[];
  clinician_note: string | null;
  original_level: Level;
  reviewed_by?: string;
  new_level?: Level;
}

export interface AuditEvent {
  id: number;
  case_id: string | null;
  ts: string;
  type: string;
  actor: Actor | string;
  message: string;
  data: Record<string, unknown>;
}

export interface Case {
  id: string;
  created_at: string;
  updated_at: string;
  patient: {
    name: string;
    age: number | null;
    sex: string | null;
    duration: string | null;
    location: string | null;
    symptoms: string;
  };
  triage: Triage;
  status: CaseStatus;
  review: Review;
  provider: Provider | null;
  payment: Payment;
  events?: AuditEvent[];
}

export interface Stats {
  total_cases: number;
  by_level: Record<Level, number>;
  by_status: Record<string, number>;
  escalation_rate: number;
  emergency_bypasses: number;
  reviews_pending: number;
  avg_confidence: number;
  money: { held: number; captured: number; refunded: number; paid_out: number; platform_fees: number; currency: string };
}

export interface EvalRow {
  id: string;
  age?: number;
  symptoms: string;
  expected: string;
  got: string;
  escalated: boolean;
  confidence: number | null;
  correct: boolean;
  citations: string[];
  engine?: string;
  ms?: number;
}

export interface EvalReport {
  summary: {
    engine: string;
    scenarios: number;
    overall_pass_rate: number;
    exact_accuracy: number;
    emergency_recall: number;
    under_triage_rate: number;
    over_triage_rate: number;
    escalation_recall: number;
    scope_block_rate: number;
    grounded_rate: number;
    generated_at: string;
  };
  rows: EvalRow[];
}

export interface TriageInput {
  symptoms: string;
  age?: number;
  sex?: string;
  duration?: string;
  patient_name?: string;
  location?: string;
}
