# Demo video script (under 3 minutes)

**Rules from the hackathon:** under 3:00, uploaded publicly to YouTube, shows the app actually working, and contains no copyrighted music.
**Setup before recording:** real PayPal **sandbox** keys and a Gemini key set (the header badges should read *PayPal: Sandbox* and *AI: Gemini*). Click **Reset**, then **Load demo data** on the dashboard. Keep three tabs open: Get care, Clinic, Dashboard. Use 1080p and zoom the browser to 110%.

| Time | Screen | Say (voice-over) |
|---|---|---|
| 0:00-0:20 | Title card, then Get care page | "In Nigeria, and much of the world, people pay for healthcare out of pocket, up front. So they often pay for the wrong care, and in emergencies, 'pay first' can cost lives. CareRoute is an AI agent that gets you to the right level of care and pays for it safely with PayPal." |
| 0:20-0:55 | Click the **sore throat** or **UTI** example, then submit. Let the pipeline animate. | "I describe my symptoms. Watch the agent think: input guardrails, red-flag rules, retrieval of NHS and WHO guidelines, Gemini reasoning, then output guardrails that check every claim is grounded in a cited guideline. It says routine care, cites its sources, and writes a handoff note for the clinician." |
| 0:55-1:25 | Pick a provider, then **PayPal button**, sandbox login, approve. The "Funds held" receipt appears. | "I pick a telehealth GP and pay with PayPal. Notice: the money is only *authorized*, held, not taken. CareRoute only captures it once the doctor confirms the consultation happened." |
| 1:25-1:50 | **Clinic** tab: find the case, open it, **Confirm consult**. Show captured, payout and fee. | "On the clinic side, the doctor confirms. The agent captures the payment and pays the provider instantly through PayPal Payouts, minus our 5% fee. Every step is in the audit log." |
| 1:50-2:15 | **Get care**: click the **chest pain to arm** example. Red takeover. | "Now the most important part. Crushing chest pain spreading to the arm. A deterministic red-flag rule fires, and the AI cannot override it. Emergency: go now. No payment screen, ever. Our API won't even create an order for an emergency." |
| 2:15-2:35 | Clinic: an escalated case, **Re-triage** down to self-care. Show the reduced capture or partial refund. | "When the agent isn't sure, it doesn't guess. It escalates to a human clinician. If the clinician decides a pharmacist is enough, CareRoute automatically captures less, or refunds the difference through PayPal." |
| 2:35-2:55 | **Dashboard**: money flow, then the **Reliability panel**. | "And we publish our numbers: across 61 labelled scenarios, 100% emergency recall and zero under-triage, enforced on every commit by CI. CareRoute: the right care, paid for safely. Built with PayPal and Gemini." |

**Tips**
- Record each segment separately and cut them together. Don't try to do it in one take.
- If the Gemini free tier rate-limits during recording, the badge in the trace will show "rules fallback". That's fine, and arguably a feature, but re-record for a clean take.
- Don't show `.env` or any keys on screen.
