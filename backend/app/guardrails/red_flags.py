"""Deterministic red-flag rules.

These run BEFORE and AFTER the LLM. If any rule fires, the case is floored at
`emergency`, no matter what the model says. Over-triage is acceptable;
under-triage of an emergency is not.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RedFlagRule:
    id: str
    label: str
    guideline_id: str
    all_of: tuple[str, ...] = ()
    any_of: tuple[str, ...] = ()

    def matches(self, text: str) -> bool:
        if self.all_of and not all(re.search(p, text) for p in self.all_of):
            return False
        if self.any_of and not any(re.search(p, text) for p in self.any_of):
            return False
        return bool(self.all_of or self.any_of)


CHEST = r"chest (pain|tight|pressure|hurt)|(pain|pressure|tightness|heaviness) in (my|his|her|the) chest|crushing"
RULES: tuple[RedFlagRule, ...] = (
    RedFlagRule("RF-CARDIAC", "Possible heart attack", "G-CHEST-01",
                all_of=(CHEST,),
                any_of=(r"\barm\b", r"\bjaw\b", r"sweat", r"radiat", r"spread", r"short(ness)? of breath",
                        r"breathless", r"nause", r"crushing", r"dizz", r"faint")),
    RedFlagRule("RF-BREATH", "Severe breathing difficulty", "G-BREATH-01",
                any_of=(r"can'?t breathe", r"cannot breathe", r"struggling to breathe", r"gasping",
                        r"blue lips", r"lips (are|turning) blue", r"choking", r"can'?t catch (my|his|her) breath",
                        r"unable to (speak|talk).{0,20}breath")),
    RedFlagRule("RF-STROKE", "Stroke warning signs", "G-STROKE-01",
                any_of=(r"face (is )?droop", r"droop", r"slurred speech", r"slurring", r"one side of (my|his|her) (body|face)",
                        r"weak(ness)? (in|on) one (arm|side)", r"sudden(ly)? (numb|weak)", r"\bstroke\b")),
    RedFlagRule("RF-THUNDERCLAP", "Sudden severe headache", "G-HEAD-01",
                any_of=(r"worst headache", r"thunderclap", r"sudden (severe|very bad|terrible) headache")),
    RedFlagRule("RF-MENINGITIS", "Fever with stiff neck or non-blanching rash", "G-HEAD-01",
                any_of=(r"stiff neck.*(fever|temperature)|(fever|temperature).*stiff neck",
                        r"rash.*(doesn'?t|does not|won'?t) fade", r"glass test")),
    RedFlagRule("RF-UNCONSCIOUS", "Unresponsive, collapse or seizure", "G-SEIZ-01",
                any_of=(r"unconscious", r"not responding", r"unresponsive", r"passed out", r"collapsed",
                        r"seizure", r"\bfits?\b(?! of)", r"convuls", r"won'?t wake", r"hard to wake")),
    RedFlagRule("RF-BLEED", "Uncontrolled bleeding or major injury", "G-INJ-01",
                any_of=(r"(won'?t|will not|doesn'?t|does not|can'?t) stop bleeding", r"bleeding (heavily|a lot|badly)",
                        r"bone (is )?(sticking|poking) out", r"vomiting blood", r"coughing (up )?blood",
                        r"head injury.*(vomit|confus|drows)|(vomit|confus|drows).*head injury", r"car (accident|crash)")),
    RedFlagRule("RF-ANAPHYLAXIS", "Possible anaphylaxis", "G-ALLERGY-01",
                any_of=(r"(throat|tongue|lips?) (is |are )?(swell|swollen|closing)",
                        r"swollen (throat|tongue)", r"anaphyla", r"epi-?pen")),
    RedFlagRule("RF-SELFHARM", "Risk of self-harm", "G-MH-01",
                any_of=(r"suicid", r"kill (my|him|her)self", r"end (my|his|her) life", r"self[- ]harm", r"want to die", r"pills ready",
                        r"hurt (my|him|her)self", r"overdose", r"(don'?t|do not) want to (live|be alive)")),
    RedFlagRule("RF-INFANT-FEVER", "Fever in a baby under 3 months", "G-FEVER-CHILD-01",
                all_of=(r"fever|temperature|hot|38|39|40",),
                any_of=(r"\b([0-9]|1[0-2]) ?(weeks?|wks?)[- ]old", r"\b[0-2] ?(months?|mo)[- ]old", r"newborn")),
    RedFlagRule("RF-CHILD-DANGER", "Child with danger signs", "G-FEVER-CHILD-01",
                all_of=(r"baby|child|toddler|infant|son|daughter|kid",),
                any_of=(r"floppy", r"limp", r"not feeding", r"not drinking anything", r"rash.*fade", r"breathing (very )?fast")),
    RedFlagRule("RF-PREGNANCY", "Pregnancy danger sign", "G-PREG-01",
                all_of=(r"pregnan|weeks pregnant|expecting",),
                any_of=(r"bleed", r"baby (is )?(not|isn'?t) moving", r"moving less", r"blurred vision", r"severe (headache|pain)",
                        r"waters? (broke|broken)", r"fit|seizure")),
    RedFlagRule("RF-ABDO", "Severe abdominal emergency", "G-ABDO-01",
                any_of=(r"black (stool|poo)", r"blood in (my )?(stool|poo)", r"(stomach|abdomen|tummy) (is )?(rigid|hard and swollen)",
                        r"severe (stomach|abdominal|tummy) pain.*(vomit|collapse|can'?t stand)")),
    RedFlagRule("RF-MALARIA-SEVERE", "Severe malaria danger signs", "G-MALARIA-01",
                all_of=(r"fever|malaria|temperature",),
                any_of=(r"confus", r"yellow eyes", r"dark (urine|pee)", r"can'?t (keep|hold) (anything|fluids) down")),
)


@dataclass(frozen=True)
class RedFlagHit:
    rule_id: str
    label: str
    guideline_id: str


def scan(text: str) -> list[RedFlagHit]:
    t = text.lower()
    return [RedFlagHit(r.id, r.label, r.guideline_id) for r in RULES if r.matches(t)]
