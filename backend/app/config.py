"""Runtime configuration, read from environment variables (and .env if present)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / "backend" / ".env")


def _flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str | None
    gemini_model: str
    paypal_client_id: str | None
    paypal_client_secret: str | None
    paypal_base_url: str
    paypal_webhook_id: str | None
    currency: str
    database_path: Path
    frontend_dist: Path
    confidence_threshold: float

    @property
    def llm_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def paypal_enabled(self) -> bool:
        return bool(self.paypal_client_id and self.paypal_client_secret)


def get_settings() -> Settings:
    mode = os.getenv("PAYPAL_MODE", "sandbox").lower()
    base = "https://api-m.paypal.com" if mode == "live" else "https://api-m.sandbox.paypal.com"
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY") or None,
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        paypal_client_id=os.getenv("PAYPAL_CLIENT_ID") or None,
        paypal_client_secret=os.getenv("PAYPAL_CLIENT_SECRET") or None,
        paypal_base_url=os.getenv("PAYPAL_BASE_URL", base),
        paypal_webhook_id=os.getenv("PAYPAL_WEBHOOK_ID") or None,
        currency=os.getenv("CURRENCY", "USD"),
        database_path=Path(os.getenv("DATABASE_PATH", str(ROOT_DIR / "careroute.db"))),
        frontend_dist=Path(os.getenv("FRONTEND_DIST", str(ROOT_DIR / "frontend" / "dist"))),
        confidence_threshold=float(os.getenv("CONFIDENCE_THRESHOLD", "0.6")),
    )
