"""The CareRoute agent: guard -> red flags -> retrieve -> reason -> verify -> route.

Each stage is recorded as a trace step so the dashboard (and judges) can see
exactly why the agent made a decision and when money is allowed to move.
"""

from __future__ import annotations

import logging
import time

from ..config import Settings
from ..guardrails import input_guard, output_guard, red_flags
from ..knowledge import Hit, guideline_by_id, load_providers, retrieve
from .engines import GeminiEngine, RulesEngine

log = logging.getLogger(__name__)

SERVICE_FOR_LEVEL = {
    "emergency": "Emergency department - go now, payment is never required first",
    "urgent": "Same-day clinic or urgent video consultation",
    "routine": "GP telehealth consultation",
    "self_care": "Pharmacist advice",
}


class TriageBlocked(Exception):
    def __init__(self, reason: str, checks: list[dict]):
        super().__init__(reason)
        self.reason = reason
        self.checks = checks


class TriageAgent:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.rules = RulesEngine()
        self.llm = None
        if settings.llm_enabled:
            try:
                self.llm = GeminiEngine(settings.gemini_api_key, settings.gemini_model)
            except Exception:  # pragma: no cover - depends on environment
                log.exception("Gemini unavailable, using rules engine")

    def providers_for(self, level: str) -> list[dict]:
        return sorted((p for p in load_providers() if level in p["levels"]), key=lambda p: (p["price"], p["eta_minutes"]))

    def run(self, symptoms: str, age: int | None = None, sex: str | None = None, duration: str | None = None) -> dict:
        trace: list[dict] = []
        t0 = time.perf_counter()

        def step(name: str, detail: str, **data):
            trace.append({"step": name, "detail": detail, "ms": round((time.perf_counter() - t0) * 1000, 1), **data})

        guard = input_guard.check_input(symptoms, age)
        step("input_guardrails", "Passed" if guard.allowed else f"Blocked: {guard.block_reason}", checks=guard.checks)
        if not guard.allowed:
            raise TriageBlocked(guard.block_reason or "Blocked", guard.checks)

        context = " ".join(filter(None, [guard.sanitized, f"age {age}" if age is not None else None]))
        flags = red_flags.scan(context)
        step("red_flag_rules", f"{len(flags)} red flag(s) fired" if flags else "No red flags",
             flags=[f.__dict__ for f in flags])

        query = guard.sanitized + " " + " ".join(f.label for f in flags)
        hits = retrieve(query, k=5)
        for f in flags:  # always include the guideline behind each red flag
            if all(h.guideline.id != f.guideline_id for h in hits):
                g = guideline_by_id(f.guideline_id)
                if g:
                    hits.insert(0, Hit(g, 99.0))
        step("retrieval", f"Retrieved {len(hits)} guideline(s)",
             hits=[{"id": h.guideline.id, "title": h.guideline.title, "score": h.score} for h in hits])

        engine_name = self.rules.name
        decision = None
        if self.llm is not None:
            try:
                decision = self.llm.decide(guard.sanitized, age, sex, duration, hits, [f.label for f in flags])
                engine_name = self.llm.name
            except Exception as exc:
                log.warning("LLM call failed (%s); falling back to rules engine", exc)
                step("llm_fallback", f"Gemini call failed ({type(exc).__name__}); used deterministic engine")
        if decision is None:
            decision = self.rules.decide(guard.sanitized, age, sex, duration, hits, [f.label for f in flags])
        step("reasoning", f"{engine_name} proposed '{decision.level}' at confidence {decision.confidence:.2f}",
             engine=engine_name)

        out = output_guard.check_output(decision, [h.guideline.id for h in hits], [f.rule_id for f in flags],
                                        self.settings.confidence_threshold)
        d = out.decision
        step("output_guardrails", "Escalated to clinician" if out.escalated else "Verified", checks=out.checks)

        if flags and d.level == "emergency":
            d.advice = ("This could be an emergency. Call your local emergency number or go to the nearest "
                        "emergency department now. Do not wait and do not pay anything first. ") + d.advice
        providers = self.providers_for(d.level)
        step("routing", SERVICE_FOR_LEVEL[d.level], provider_count=len(providers))

        citations = [g.citation() for g in (guideline_by_id(c) for c in d.citations) if g]
        return {
            "level": d.level,
            "confidence": round(d.confidence, 2),
            "reasoning": d.reasoning,
            "advice": d.advice,
            "handoff_summary": d.handoff_summary,
            "citations": citations,
            "red_flags": [f.label for f in flags],
            "escalated": out.escalated,
            "escalation_reasons": out.escalation_reasons,
            "engine": engine_name,
            "notes": guard.notes,
            "guardrail_checks": guard.checks + out.checks,
            "trace": trace,
            "recommended_service": SERVICE_FOR_LEVEL[d.level],
            "providers": providers,
            "payment_required": d.level != "emergency",
        }
