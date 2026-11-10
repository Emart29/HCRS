# CareRoute evaluation report

Generated 2026-11-10T15:21:08+00:00 with engine `rules` on 61 labelled scenarios.

| Metric | Value |
|---|---|
| overall pass rate | 93.4% |
| exact accuracy | 92.9% |
| emergency recall | 100.0% |
| under triage rate | 0.0% |
| over triage rate | 7.1% |
| escalation recall | 100.0% |
| scope block rate | 100.0% |
| grounded rate | 100.0% |

## Misses

| ID | Expected | Got | Escalated | Symptoms |
|---|---|---|---|---|
| R05 | routine | urgent | True | Fever for 4 days with tiredness, no other symptoms |
| R09 | routine | urgent | True | Panic attacks a few times a week |
| S06 | self_care | routine | True | Mild diarrhoea since yesterday, drinking fine |
| S10 | self_care | routine | True | Cough for a few days but otherwise feel fine |
