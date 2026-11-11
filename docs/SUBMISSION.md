# Devpost submission text (copy-paste)

## Project name
CareRoute: AI triage that pays for the right care

## Tagline (short)
An AI agent that gets patients to the right level of care, and pays for it safely with PayPal. Emergencies never see a payment screen.

## Inspiration
We're a team in Nigeria, where most healthcare is paid out of pocket and up front. We've watched people spend money they don't have on the wrong level of care, and we've heard stories of emergencies delayed at a payment desk. Symptom checkers exist, but they stop at advice: none of them close the loop to *paying for the right care*, and almost none publish how often they're wrong.

## What it does
1. **Triage**: the patient describes symptoms, and an AI agent classifies the case as emergency, urgent, routine or self-care. Every decision cites public NHS, NICE and WHO guidelines.
2. **Route**: it recommends the right service (pharmacist, telehealth GP, same-day clinic) with prices.
3. **Pay safely with PayPal**: the payment is **authorized, not captured**, and is captured only when the provider confirms the consult. The provider is paid via **PayPal Payouts**. If a clinician down-triages, the agent captures less or partially refunds. If they escalate to emergency, the hold is voided.
4. **Emergencies bypass payment entirely**: deterministic red-flag rules send the patient straight to the ER, and the API refuses to create an order.
5. **Clinic console and trust dashboard**: escalated cases go to a human clinician. The dashboard shows every agent decision, guardrail check, PayPal event, money flow, and our published reliability numbers.

## How we built it
- **It's a 6-stage pipeline (guardrails -> red-flag rules -> BM25 retrieval over NHS/NICE/WHO -> Gemini -> output verification -> routing). No tool-calling loop and no vector store.**
- **AI:** Google Gemini (`gemini-2.5-flash`) with structured JSON output, grounded by BM25 retrieval over a curated guideline knowledge base. A deterministic rules engine is the fallback.
- **Guardrails as code, not prompts:** an input guard (scope, prompt injection, personal-data redaction), 14 red-flag rules that set a floor the LLM can never go below, and an output guard (grounding, confidence-based escalation to a human, removal of dosing and diagnosis language).
- **PayPal:** Orders v2 (intent AUTHORIZE), JS SDK buttons, authorize, partial and full capture, void, refund, Payouts v1, and webhooks with signature verification, all with idempotency keys.
- **Stack:** Python and FastAPI, SQLite, React, TypeScript and Tailwind, Docker, Render, and GitHub Actions CI.
- **Evaluation:** 61 labelled scenarios. CI fails the build if emergency recall drops below 100%.

## Challenges
- Making PayPal's *authorize → capture* model match clinical reality: who confirms care happened, and what happens to the held money when a clinician changes the triage level.
- Our own eval set caught a serious bug: "I want to kill myself" was being blocked as off-topic by the scope filter. Red-flag language now always wins, and a regression test guards it.

## Accomplishments
-Results: **100% emergency recall, 0% under-triage** on our labelled set, enforced in CI.
- A full money lifecycle (authorize, capture or partial capture, refund, void, payout) driven by the triage decision.
- Every decision is explainable: an agent trace, guardrail results and cited sources for each case.

## What we learned
In health, trust comes from showing reliability numbers, not from adding features. And PayPal's authorization model is ideal for "pay only for the care you actually received."

## What's next
Pilot with a Lagos telehealth provider; expand the guideline base with clinicians; add Yoruba, Igbo, Hausa and Pidgin intake; and use PayPal Vault so returning patients pay in one tap.

## Built with
python, fastapi, google-gemini, paypal-orders-api, paypal-payouts, paypal-js-sdk, paypal-webhooks, react, typescript, tailwindcss, sqlite, docker, render, github-actions

## Tools (AI) used and how
- **Google Gemini**: the triage reasoning engine (structured output, grounded only in retrieved guidelines, writes the patient advice and the clinician SBAR handoff).
- **Claude Code**: the AI coding assistant used to build the project.

## Links
- Code: https://github.com/Emart29/HCRS
- Live demo: <add Render URL>
- Video: <add YouTube URL>
