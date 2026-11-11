"""Seed realistic demo cases so the dashboard tells a story on first load."""

from __future__ import annotations

from .service import CareService

SCENARIOS = [
    # (name, age, sex, duration, symptoms, script)
    ("Adaeze O.", 58, "female", "40 minutes",
     "Crushing chest pain spreading to my left arm and jaw, I'm sweating and feel sick", []),
    ("Tunde B.", 34, "male", "2 days",
     "High fever with chills and body aches, I live in Lagos and think it might be malaria", ["pay", "confirm"]),
    ("Chioma E.", 27, "female", "3 days",
     "Sore throat and runny nose, mild cough, otherwise fine", ["pay", "confirm"]),
    ("Kemi A.", 41, "female", "1 week",
     "Burning when I pee and needing to go more often", ["pay", "retriage_down", "confirm"]),
    ("Ibrahim S.", 23, "male", "today",
     "Twisted my ankle playing football, it's swollen but I can walk on it", ["pay"]),
    ("Bisi O.", 52, "female", "a few days",
     "I just feel weird and not myself, something is off and I'm tired", []),
    ("Ngozi U.", 3, "female", "1 day",
     "My daughter has a fever and is pulling at her ear, still drinking", ["pay"]),
    ("Emeka N.", 67, "male", "20 minutes",
     "His face is drooping on one side and his speech is slurred", []),
    ("Funmi K.", 31, "female", "2 weeks",
     "Feeling anxious and can't sleep well, very stressed with work", []),
    ("Yusuf M.", 45, "male", "3 hours",
     "Stomach pain on the lower right side that keeps getting worse, slight fever", ["pay", "cancel"]),
]


def seed(service: CareService) -> int:
    count = 0
    for name, age, sex, duration, symptoms, script in SCENARIOS:
        case = service.triage(symptoms, age, sex, duration, patient_name=name, location="Lagos, NG")
        count += 1
        if not case["payment"]["required"] or not script:
            continue
        provider = case["triage"]["providers"][0]
        case = service.checkout(case["id"], provider["id"])
        case = service.authorize(case["id"], case["payment"]["order_id"])
        for action in script[1:]:
            if case["review"]["status"] == "pending" and action in {"confirm", "retriage_down"}:
                if action == "confirm":
                    service.review(case["id"], "confirm", None, "Reviewed history; agree with triage.", "Dr. Bello")
            if action == "confirm":
                case = service.confirm_consult(case["id"], "Consultation completed")
            elif action == "retriage_down" and case["triage"]["level"] != "self_care":
                case = service.review(case["id"], "retriage", "self_care",
                                      "Uncomplicated symptoms, no fever or back pain: pharmacist can manage.", "Dr. Bello")
            elif action == "cancel":
                case = service.cancel(case["id"], "Patient went to a hospital closer to home")
    return count
