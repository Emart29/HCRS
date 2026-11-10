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
