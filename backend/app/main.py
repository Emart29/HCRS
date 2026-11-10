"""CareRoute API."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import demo
from .agent.orchestrator import TriageAgent, TriageBlocked
from .config import ROOT_DIR, Settings, get_settings
from .knowledge import load_guidelines, load_providers
from .payments.paypal import MockPayPal, PaymentGateway, PayPalClient
from .service import PLATFORM_FEE_RATE, CareService, WorkflowError
from .store import Store

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


class TriageRequest(BaseModel):
    symptoms: str = Field(..., max_length=4000)
    age: int | None = None
    sex: str | None = None
    duration: str | None = None
    patient_name: str | None = None
    location: str | None = None


class CheckoutRequest(BaseModel):
    provider_id: str


class AuthorizeRequest(BaseModel):
    order_id: str


class ConfirmRequest(BaseModel):
    note: str | None = None


class CancelRequest(BaseModel):
    reason: str = "Visit did not take place"


class ReviewRequest(BaseModel):
    action: Literal["confirm", "retriage"]
    new_level: Literal["emergency", "urgent", "routine", "self_care"] | None = None
    note: str | None = None
    clinician: str = "Dr. On-call"


def build_gateway(settings: Settings) -> PaymentGateway:
    if settings.paypal_enabled:
        return PayPalClient(settings.paypal_client_id, settings.paypal_client_secret, settings.paypal_base_url)
    return MockPayPal()


def create_app(settings: Settings | None = None, store: Store | None = None,
               gateway: PaymentGateway | None = None) -> FastAPI:
    settings = settings or get_settings()
    store = store or Store(settings.database_path)
    gateway = gateway or build_gateway(settings)
    agent = TriageAgent(settings)
    service = CareService(settings, store, gateway, agent)

    app = FastAPI(title="CareRoute API", version="1.0.0",
                  description="AI triage that routes patients to the right care and pays for it safely with PayPal.")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.state.service = service

    if os.getenv("AUTO_SEED", "").lower() in {"1", "true", "yes"} and not store.list_cases(1):
        demo.seed(service)  # hosted demo: judges land on a dashboard that already tells the story

    @app.exception_handler(WorkflowError)
    async def _workflow_error(_: Request, exc: WorkflowError):
        return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/config")
    def config():
        return {
            "engine": "gemini" if agent.llm else "rules",
            "model": settings.gemini_model if agent.llm else None,
            "paypal_mode": gateway.mode,
            "paypal_client_id": settings.paypal_client_id if settings.paypal_enabled else None,
            "currency": settings.currency,
            "confidence_threshold": settings.confidence_threshold,
            "platform_fee_rate": PLATFORM_FEE_RATE,
        }

    @app.post("/api/triage")
    def triage(req: TriageRequest):
        try:
            return service.triage(req.symptoms, req.age, req.sex, req.duration, req.patient_name, req.location)
        except TriageBlocked as exc:
            raise HTTPException(status_code=422, detail={"message": exc.reason, "checks": exc.checks}) from exc

    @app.get("/api/cases")
    def list_cases():
        return store.list_cases()

    @app.get("/api/cases/{case_id}")
    def get_case(case_id: str):
        case = store.get_case(case_id)
        if not case:
            raise HTTPException(404, "Case not found")
        case["events"] = store.events(case_id)
        return case

    @app.post("/api/cases/{case_id}/checkout")
    def checkout(case_id: str, req: CheckoutRequest):
        return service.checkout(case_id, req.provider_id)

    @app.post("/api/cases/{case_id}/authorize")
    def authorize(case_id: str, req: AuthorizeRequest):
        return service.authorize(case_id, req.order_id)

    @app.post("/api/cases/{case_id}/confirm")
    def confirm(case_id: str, req: ConfirmRequest):
        return service.confirm_consult(case_id, req.note)

    @app.post("/api/cases/{case_id}/cancel")
    def cancel(case_id: str, req: CancelRequest):
        return service.cancel(case_id, req.reason)

    @app.post("/api/cases/{case_id}/review")
    def review(case_id: str, req: ReviewRequest):
        return service.review(case_id, req.action, req.new_level, req.note, req.clinician)

    @app.get("/api/providers")
    def providers():
        return list(load_providers())

    @app.get("/api/guidelines")
    def guidelines():
        return [g.__dict__ | {"keywords": list(g.keywords)} for g in load_guidelines()]

    @app.get("/api/events")
    def events(limit: int = 100):
        return store.events(None, limit)

    @app.get("/api/stats")
    def stats():
        return service.stats()

    @app.get("/api/eval")
    def eval_report():
        path = ROOT_DIR / "eval" / "results" / "latest.json"
        if not path.exists():
            raise HTTPException(404, "No evaluation report yet. Run: python eval/run_eval.py")
        return json.loads(path.read_text())

    @app.post("/api/demo/seed")
    def seed():
        return {"created": demo.seed(service)}

    @app.post("/api/demo/reset")
    def reset():
        store.clear()
        return {"ok": True}

    @app.post("/api/paypal/webhook")
    async def webhook(request: Request):
        event = await request.json()
        if isinstance(gateway, PayPalClient) and settings.paypal_webhook_id:
            if not gateway.verify_webhook(dict(request.headers), event, settings.paypal_webhook_id):
                raise HTTPException(400, "Invalid webhook signature")
        return service.handle_webhook(event)

    dist = Path(settings.frontend_dist)
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            candidate = dist / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
