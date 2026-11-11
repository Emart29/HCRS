"""Output guardrails: verify the agent's decision before it is shown or acted on.

Rules (each is independently unit tested):
1. Level must be one of the four known levels.
2. Red-flag floor: if a deterministic red flag fired, the level is forced to emergency.
3. Grounding: every citation must point to a guideline that was actually retrieved;
   at least one valid citation is required, otherwise the case is escalated.
4. Confidence: below threshold -> escalate to a clinician and bump one level up.
5. Content: strip diagnosis-style certainty and medication dosing from patient text.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..knowledge import LEVEL_RANK, LEVELS

DOSAGE = re.compile(r"\b\d+(\.\d+)?\s?(mg|mcg|ml|milligrams?|tablets?|pills?)\b", re.IGNORECASE)
DIAGNOSIS = re.compile(r"\byou (definitely |certainly )?(have|are suffering from|are diagnosed with)\b", re.IGNORECASE)


@dataclass
class Decision:
    level: str
    confidence: float
    reasoning: str
    advice: str
    handoff_summary: str
    citations: list[str]
    red_flags: list[str] = field(default_factory=list)


@dataclass
class OutputCheck:
    decision: Decision
    escalated: bool
    escalation_reasons: list[str]
    checks: list[dict]


def bump(level: str) -> str:
    return LEVELS[min(LEVEL_RANK[level] + 1, len(LEVELS) - 1)]


def _clean(text: str) -> tuple[str, bool]:
    changed = False
    if DOSAGE.search(text):
        text = DOSAGE.sub("[dose removed - ask a pharmacist]", text)
        changed = True
    if DIAGNOSIS.search(text):
        text = DIAGNOSIS.sub("your symptoms may be consistent with", text)
        changed = True
    return text, changed


def check_output(decision: Decision, retrieved_ids: list[str], red_flag_ids: list[str],
                 confidence_threshold: float) -> OutputCheck:
    checks: list[dict] = []
    reasons: list[str] = []
    escalated = False

    if decision.level not in LEVEL_RANK:
        checks.append({"name": "valid_level", "passed": False, "detail": f"Unknown level '{decision.level}', defaulted to urgent"})
        decision.level = "urgent"
        escalated = True
        reasons.append("Model returned an invalid triage level")
    else:
        checks.append({"name": "valid_level", "passed": True, "detail": f"Level '{decision.level}' is valid"})

    if red_flag_ids and decision.level != "emergency":
        checks.append({"name": "red_flag_floor", "passed": False,
                       "detail": f"Red flags {red_flag_ids} fired; level raised from {decision.level} to emergency"})
        decision.level = "emergency"
    else:
        checks.append({"name": "red_flag_floor", "passed": True,
                       "detail": "Level consistent with red-flag rules" if red_flag_ids else "No red flags fired"})

    valid = [c for c in decision.citations if c in retrieved_ids]
    invalid = [c for c in decision.citations if c not in retrieved_ids]
    decision.citations = valid
    if not valid:
        checks.append({"name": "grounding", "passed": False,
                       "detail": "No recommendation could be traced to a retrieved guideline"})
        escalated = True
        reasons.append("Decision not grounded in a retrieved guideline")
    else:
        detail = f"Grounded in {', '.join(valid)}"
        if invalid:
            detail += f"; removed unsupported citations {invalid}"
        checks.append({"name": "grounding", "passed": True, "detail": detail})

    decision.confidence = max(0.0, min(1.0, float(decision.confidence)))
    if decision.confidence < confidence_threshold and decision.level != "emergency":
        checks.append({"name": "confidence", "passed": False,
                       "detail": f"Confidence {decision.confidence:.2f} below {confidence_threshold:.2f}; "
                                 f"level raised {decision.level} -> {bump(decision.level)} and sent for clinician review"})
        decision.level = bump(decision.level)
        escalated = True
        reasons.append(f"Low confidence ({decision.confidence:.2f})")
    else:
        checks.append({"name": "confidence", "passed": True, "detail": f"Confidence {decision.confidence:.2f}"})

    changed = False
    for attr in ("advice", "reasoning"):
        cleaned, c = _clean(getattr(decision, attr))
        setattr(decision, attr, cleaned)
        changed = changed or c
    checks.append({"name": "safe_language", "passed": not changed,
                   "detail": "Removed dosing or diagnostic certainty from response" if changed else "No dosing or diagnostic claims"})

    return OutputCheck(decision, escalated, reasons, checks)
