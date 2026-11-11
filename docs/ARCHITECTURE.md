# Architecture

```
                 ┌──────────────────────── React + Tailwind dashboard ────────────────────────┐
                 │  Get care (patient)     Clinic console (provider/clinician)     Dashboard   │
                 └───────────────┬──────────────────────────┬──────────────────────────────────┘
                                 │ /api                     │ PayPal JS SDK (approve popup)
┌────────────────────────────────▼──────────────────────────▼──────────────────────────────────┐
│ FastAPI (backend/app/main.py)                                                                │
│                                                                                              │
│  TriageAgent (agent/orchestrator.py)                CareService (service.py) state machine   │
│   1 input_guard  ─ scope / injection / PII           triaged ─checkout─► awaiting_payment    │
│   2 red_flags    ─ 14 deterministic rules              ─authorize─► funds_held               │
│   3 retrieve     ─ BM25 over guidelines.json           ─confirm─► capture ─► payout          │
│   4 engine       ─ Gemini (structured) | rules         ─cancel─► void                        │
│   5 output_guard ─ floor, grounding, confidence        review: down ─► partial capture/refund│
│   6 route        ─ providers for level                 review: emergency ─► void/refund      │
│                                                       emergency_routed: no payment, ever     │
│                                                                                              │
│  Store (SQLite): cases + append-only audit events     PaymentGateway: PayPalClient | Mock    │
└──────────────────────────────────────────────────────────────────┬───────────────────────────┘
                                                                   │ OAuth2, Orders v2, Payments v2,
                                                                   │ Payouts v1, Webhook verify
                                                                   ▼
                                                            PayPal REST API
```

## Design principles
1. **Guardrails are code, not prompts.** Every rule is a Python function with unit tests. The LLM is one stage among six, not the whole system.
2. **The LLM can make a case more urgent, never less urgent than a red flag.** The red-flag floor is applied after the model.
3. **No grounding, no decision.** Citations must reference guidelines that were actually retrieved. If there are none, the case is escalated.
4. **Uncertainty goes to a human.** Below the confidence threshold, the level is raised one step and the case is held for clinician review. Payment cannot be captured until a clinician reviews it.
5. **Money follows the clinical decision.** Authorize up front, capture on confirmed care, and adjust automatically when a clinician changes the triage level.
6. **Emergencies never pay first.** Enforced in three places: the agent (`payment_required=false`), the service (checkout returns 409), and the UI (no payment step).
7. **Always works.** The mock PayPal gateway and the rules engine share the same interfaces as the real ones, so the demo, tests and CI run without secrets.

## How this maps to the team's design doc

Shado's design doc, *Designing the healthcare triage system (multi-agent system)*, set out the layers below. This table shows what the hackathon build implements and what is planned.

| Design layer | Implemented in CareRoute | Planned |
|---|---|---|
| **A. Ingestion & security**: PHI/PII scrubbing | `guardrails/input_guard.py` redacts emails and phone numbers before any AI call; input length and age checks; prompt-injection detection | API gateway (Kong/Envoy), OAuth, encryption at rest |
| **B. Guardrail layer**: pre-LLM deterministic red-flag filter | `guardrails/red_flags.py`: 14 rules (chest pain, breathing, stroke, bleeding, suicidal ideation, infant fever, pregnancy...) run **before** the LLM | NeMo Guardrails / Llama Guard as an extra classifier |
| **B. Instant override protocol** | Red flag means emergency takeover UI, no payment, `emergency_bypass` event in the audit log. The LLM can never downgrade it (red-flag floor re-applied after the model). | Push alert to an emergency queue |
| **C. Orchestration**: symptom intake agent | Structured intake (symptoms, age, sex, duration) in the patient UI | Multi-turn OPQRST conversation |
| **C. Medical history RAG agent** | RAG over **clinical guidelines** (NHS/NICE/WHO) with mandatory citations | Patient EHR via FHIR/HL7 |
| **C. Clinical urgency scoring agent** | Gemini structured decision (4 levels) verified by `guardrails/output_guard.py` | ESI / Manchester Triage System mapping |
| **D. Human-in-the-loop queue** | Low-confidence or ungrounded cases are escalated to the Clinic console; **payment cannot be captured until a clinician signs off** | Nurse paging / SLAs |
| **D. FHIR interoperability bus** | SBAR handoff note generated for every case | Write-back to Epic/Cerner |
| **E. Action dispatcher** | Emergency: ER plus call buttons. Urgent/routine: same-day clinic or telehealth booking paid via **PayPal authorize, then capture**. Self-care: pharmacist plus safety-net advice. | Real scheduling integration |
| **3. Audit store** | Append-only `events` table: every agent decision, guardrail result and PayPal call, shown live on the dashboard | Hash-chained, immutable ledger |
| **4. Observability** | Per-case pipeline trace with timings and confidence; published eval report | OpenTelemetry / Arize Phoenix |
| **4. Fail-safe mechanism** | If Gemini errors or times out, the deterministic engine takes over (logged as `llm_fallback`). Ambiguous cases are escalated, never guessed. | |

**What the hackathon build adds to the design:** a **PayPal money layer** in which clinical decisions drive payment, and a **published evaluation** with a CI safety gate.
