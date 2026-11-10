"""Input guardrails: run on the raw patient message before any LLM call."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..knowledge import tokenize
from .red_flags import scan

INJECTION_PATTERNS = (
    r"ignore (all |any )?(the )?(previous|prior|above) (instructions|rules)",
    r"disregard (your|the) (rules|instructions|guidelines)",
    r"you are now", r"system prompt", r"jailbreak", r"pretend (you are|to be)",
    r"set (the )?(triage )?level to", r"mark (this|me) as (self[_ ]care|routine)",
)

# Vocabulary that indicates a health complaint. Used to keep the agent in scope.
HEALTH_TERMS = {
    "pain", "ache", "aches", "hurt", "hurts", "sore", "fever", "temperature", "cough", "breathe", "breathing",
    "breath", "vomit", "vomiting", "diarrhoea", "diarrhea", "rash", "bleeding", "blood", "dizzy", "headache",
    "nausea", "swollen", "swelling", "injury", "burn", "cut", "sprain", "itchy", "chest", "stomach", "tummy",
    "throat", "ear", "eye", "pregnant", "baby", "child", "sick", "ill", "unwell", "tired", "weak", "numb",
    "seizure", "fit", "faint", "fainted", "malaria", "anxious", "anxiety", "depressed", "sleep", "urine",
    "pee", "back", "neck", "allergic", "allergy", "infection", "symptom", "symptoms", "fall", "fell",
    "collapsed", "unconscious", "suicide", "harm", "cold", "flu", "migraine", "stroke", "droop", "slurred",
    "chills", "sweating", "shivering", "bite", "wound", "fracture", "broken", "overdose", "temp", "hot",
    "cramps", "constipation", "panic", "stress", "stressed", "mood", "lump", "bruise", "spots", "acne",
    "toothache", "tooth", "knee", "ankle", "wrist", "arm", "leg", "joint", "dehydrated", "thirsty",
    "body", "tingling", "sensation", "pressure", "jaw", "pills", "dizziness", "feels", "wrong", "health",
}
PII_PATTERNS = (
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[email]"),
    (re.compile(r"\+?\d[\d\s-]{8,}\d"), "[phone]"),
)
DIAGNOSIS_REQUEST = re.compile(r"(what (disease|illness|condition) do i have|diagnose me|prescribe|what dose|how many (mg|tablets))")


@dataclass
class InputCheck:
    allowed: bool
    sanitized: str
    checks: list[dict] = field(default_factory=list)
    block_reason: str | None = None
    notes: list[str] = field(default_factory=list)


def check_input(symptoms: str, age: int | None) -> InputCheck:
    checks: list[dict] = []
    text = (symptoms or "").strip()

    ok_len = 8 <= len(text) <= 4000
    checks.append({"name": "length", "passed": ok_len,
                   "detail": "Message length OK" if ok_len else "Describe the symptoms in a little more detail (8-4000 characters)."})
    if not ok_len:
        return InputCheck(False, text, checks, checks[-1]["detail"])

    ok_age = age is None or 0 <= age <= 120
    checks.append({"name": "age", "passed": ok_age, "detail": "Age valid" if ok_age else "Age must be between 0 and 120."})
    if not ok_age:
        return InputCheck(False, text, checks, checks[-1]["detail"])

    lowered = text.lower()
    injection = any(re.search(p, lowered) for p in INJECTION_PATTERNS)
    checks.append({"name": "prompt_injection", "passed": not injection,
                   "detail": "No instruction-override attempt" if not injection
                   else "Instruction-override attempt detected and neutralised; triage is decided by guardrails, not by the message."})

    tokens = set(tokenize(lowered))
    # Safety first: anything that trips a red-flag rule is ALWAYS in scope, never blocked.
    has_red_flag = bool(scan(lowered))
    in_scope = has_red_flag or bool(tokens & HEALTH_TERMS)
    checks.append({"name": "clinical_scope", "passed": in_scope,
                   "detail": ("Red-flag language detected; always handled" if has_red_flag else
                              "Message describes a health complaint") if in_scope
                   else "This assistant only handles symptom triage. Please describe the symptoms."})
    if not in_scope:
        return InputCheck(False, text, checks, checks[-1]["detail"])

    sanitized = text
    redacted = False
    for pattern, repl in PII_PATTERNS:
        sanitized, n = pattern.subn(repl, sanitized)
        redacted = redacted or n > 0
    checks.append({"name": "pii_redaction", "passed": True,
                   "detail": "Personal contact details redacted before AI processing" if redacted else "No contact details found"})

    notes: list[str] = []
    if DIAGNOSIS_REQUEST.search(lowered):
        notes.append("CareRoute does not diagnose or prescribe; it routes you to the right level of care.")
    if injection:
        sanitized = re.sub("|".join(INJECTION_PATTERNS), "[removed]", sanitized, flags=re.IGNORECASE)
    return InputCheck(True, sanitized, checks, None, notes)
