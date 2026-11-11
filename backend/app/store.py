"""SQLite persistence: cases (JSON documents) and an append-only audit log."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: Path | str):
        self.path = str(path)
        self._lock = threading.Lock()
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._conn:
            self._conn.execute("CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, created_at TEXT, data TEXT)")
            self._conn.execute("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, "
                               "ts TEXT, type TEXT, actor TEXT, message TEXT, data TEXT)")
            self._conn.execute("CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id)")

    @staticmethod
    def new_case_id() -> str:
        return "CR-" + uuid.uuid4().hex[:8].upper()

    def save_case(self, case: dict) -> dict:
        with self._lock, self._conn:
            self._conn.execute("INSERT OR REPLACE INTO cases (id, created_at, data) VALUES (?, ?, ?)",
                               (case["id"], case["created_at"], json.dumps(case)))
        return case

    def get_case(self, case_id: str) -> dict | None:
        row = self._conn.execute("SELECT data FROM cases WHERE id = ?", (case_id,)).fetchone()
        return json.loads(row["data"]) if row else None

    def list_cases(self, limit: int = 200) -> list[dict]:
        rows = self._conn.execute("SELECT data FROM cases ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [json.loads(r["data"]) for r in rows]

    def find_by_payment(self, key: str, value: str) -> dict | None:
        for case in self.list_cases(1000):
            if case.get("payment", {}).get(key) == value:
                return case
        return None

    def log(self, case_id: str | None, type_: str, actor: str, message: str, data: dict | None = None) -> dict:
        event = {"case_id": case_id, "ts": now_iso(), "type": type_, "actor": actor, "message": message, "data": data or {}}
        with self._lock, self._conn:
            self._conn.execute("INSERT INTO events (case_id, ts, type, actor, message, data) VALUES (?, ?, ?, ?, ?, ?)",
                               (case_id, event["ts"], type_, actor, message, json.dumps(data or {})))
        return event

    def events(self, case_id: str | None = None, limit: int = 200) -> list[dict]:
        if case_id:
            rows = self._conn.execute("SELECT * FROM events WHERE case_id = ? ORDER BY id ASC", (case_id,)).fetchall()
        else:
            rows = self._conn.execute("SELECT * FROM events ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [{"id": r["id"], "case_id": r["case_id"], "ts": r["ts"], "type": r["type"], "actor": r["actor"],
                 "message": r["message"], "data": json.loads(r["data"] or "{}")} for r in rows]

    def clear(self) -> None:
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM cases")
            self._conn.execute("DELETE FROM events")
