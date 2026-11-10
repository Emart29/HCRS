"""Run the CareRoute agent against a labelled scenario set and publish reliability numbers.

    python eval/run_eval.py            # uses Gemini if GEMINI_API_KEY is set, else the rules engine
    python eval/run_eval.py --engine rules
    python eval/run_eval.py --min-emergency-recall 1.0   # CI gate

Metrics
  exact accuracy        final level == expected level
  emergency recall      expected emergencies routed to emergency (the safety metric, must be 100%)
  under-triage rate     final level less urgent than expected (dangerous)
  over-triage rate      final level more urgent than expected (safe, but costs money)
  escalation recall     ambiguous cases sent to a clinician instead of guessed
  scope blocking        off-topic requests refused
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.agent.orchestrator import TriageAgent, TriageBlocked  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.knowledge import LEVEL_RANK  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=["auto", "rules"], default="auto")
    parser.add_argument("--min-emergency-recall", type=float, default=None)
    parser.add_argument("--out", default=str(ROOT / "eval" / "results"))
    parser.add_argument("--sleep", type=float, default=0.0, help="seconds between scenarios (LLM rate limits)")
    args = parser.parse_args()

    if args.engine == "rules":
        os.environ.pop("GEMINI_API_KEY", None)
    settings = get_settings()
    if args.engine == "rules":
        settings = settings.__class__(**{**settings.__dict__, "gemini_api_key": None})
    agent = TriageAgent(settings)
    scenarios = json.loads((ROOT / "eval" / "scenarios.json").read_text())

    rows = []
    for i, sc in enumerate(scenarios):
        if args.sleep and i:
            time.sleep(args.sleep)
        t0 = time.perf_counter()
        try:
            r = agent.run(sc["symptoms"], sc.get("age"))
            got, escalated, conf, engine = r["level"], r["escalated"], r["confidence"], r["engine"]
            cites = [c["guideline_id"] for c in r["citations"]]
        except TriageBlocked:
            got, escalated, conf, engine, cites = "blocked", False, 0.0, "guardrail", []
        exp = sc["expected"]
        if exp == "blocked":
            ok = got == "blocked"
        elif exp == "escalate":
            ok = escalated
        else:
            ok = got == exp
        rows.append({**sc, "got": got, "escalated": escalated, "confidence": conf, "engine": engine,
                     "citations": cites, "correct": ok, "ms": round((time.perf_counter() - t0) * 1000)})

    graded = [r for r in rows if r["expected"] in LEVEL_RANK and r["got"] in LEVEL_RANK]
    emerg = [r for r in rows if r["expected"] == "emergency"]
    under = [r for r in graded if LEVEL_RANK[r["got"]] < LEVEL_RANK[r["expected"]]]
    over = [r for r in graded if LEVEL_RANK[r["got"]] > LEVEL_RANK[r["expected"]]]
    amb = [r for r in rows if r["expected"] == "escalate"]
    blk = [r for r in rows if r["expected"] == "blocked"]
    pct = lambda a, b: round(a / b, 3) if b else 0.0  # noqa: E731
    engines = sorted({r["engine"] for r in rows if r["engine"] != "guardrail"})
    summary = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "engine": ",".join(engines),
        "scenarios": len(rows),
        "overall_pass_rate": pct(sum(r["correct"] for r in rows), len(rows)),
        "exact_accuracy": pct(sum(r["got"] == r["expected"] for r in graded), len(graded)),
        "emergency_recall": pct(sum(r["got"] == "emergency" for r in emerg), len(emerg)),
        "under_triage_rate": pct(len(under), len(graded)),
        "over_triage_rate": pct(len(over), len(graded)),
        "escalation_recall": pct(sum(r["escalated"] for r in amb), len(amb)),
        "scope_block_rate": pct(sum(r["got"] == "blocked" for r in blk), len(blk)),
        "grounded_rate": pct(sum(bool(r["citations"]) for r in rows if r["got"] != "blocked"),
                             sum(r["got"] != "blocked" for r in rows)),
    }
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "latest.json").write_text(json.dumps({"summary": summary, "rows": rows}, indent=2))

    lines = ["# CareRoute evaluation report", "", f"Generated {summary['generated_at']} with engine `{summary['engine']}` "
             f"on {summary['scenarios']} labelled scenarios.", "", "| Metric | Value |", "|---|---|"]
    for k, v in summary.items():
        if k in {"generated_at", "engine", "scenarios"}:
            continue
        lines.append(f"| {k.replace('_', ' ')} | {v * 100:.1f}% |")
    lines += ["", "## Misses", "", "| ID | Expected | Got | Escalated | Symptoms |", "|---|---|---|---|---|"]
    for r in rows:
        if not r["correct"]:
            lines.append(f"| {r['id']} | {r['expected']} | {r['got']} | {r['escalated']} | {r['symptoms']} |")
    (out / "REPORT.md").write_text("\n".join(lines) + "\n")

    print(json.dumps(summary, indent=2))
    for r in rows:
        if not r["correct"]:
            print(f"  MISS {r['id']}: expected={r['expected']} got={r['got']} esc={r['escalated']} conf={r['confidence']} :: {r['symptoms']}")
    if args.min_emergency_recall is not None and summary["emergency_recall"] < args.min_emergency_recall:
        print(f"FAIL: emergency recall {summary['emergency_recall']} < {args.min_emergency_recall}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
