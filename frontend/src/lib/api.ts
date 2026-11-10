import type { AppConfig, AuditEvent, Case, Check, EvalReport, Stats, TriageInput, Level } from "./types";

export class ApiError extends Error {
  status: number;
  checks?: Check[];
  constructor(message: string, status: number, checks?: Check[]) {
    super(message);
    this.status = status;
    this.checks = checks;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Can't reach the CareRoute server. Is the backend running?", 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail) && "message" in detail) {
      const d = detail as { message: string; checks?: Check[] };
      throw new ApiError(d.message, res.status, d.checks);
    }
    if (Array.isArray(detail)) {
      // FastAPI validation errors
      const msg = detail.map((d: { msg?: string; loc?: unknown[] }) => `${(d.loc ?? []).slice(-1)[0] ?? "field"}: ${d.msg}`).join("; ");
      throw new ApiError(msg || "Invalid request", res.status);
    }
    throw new ApiError(typeof detail === "string" ? detail : `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) });

export const api = {
  config: () => request<AppConfig>("/api/config"),
  triage: (input: TriageInput) => post<Case>("/api/triage", input),
  cases: () => request<Case[]>("/api/cases"),
  getCase: (id: string) => request<Case>(`/api/cases/${encodeURIComponent(id)}`),
  checkout: (id: string, provider_id: string) => post<Case>(`/api/cases/${id}/checkout`, { provider_id }),
  authorize: (id: string, order_id: string) => post<Case>(`/api/cases/${id}/authorize`, { order_id }),
  confirm: (id: string, note?: string) => post<Case>(`/api/cases/${id}/confirm`, { note }),
  cancel: (id: string, reason: string) => post<Case>(`/api/cases/${id}/cancel`, { reason }),
  review: (id: string, body: { action: "confirm" | "retriage"; new_level?: Level; note?: string; clinician?: string }) =>
    post<Case>(`/api/cases/${id}/review`, body),
  stats: () => request<Stats>("/api/stats"),
  events: (limit = 100) => request<AuditEvent[]>(`/api/events?limit=${limit}`),
  evalReport: () => request<EvalReport>("/api/eval"),
  seed: () => post<{ created: number }>("/api/demo/seed"),
  reset: () => post<{ ok: boolean }>("/api/demo/reset"),
};
