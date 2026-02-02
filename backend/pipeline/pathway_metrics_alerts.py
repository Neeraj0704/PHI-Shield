"""
Pathway pipeline: consume redacted_logs.jsonl in streaming mode;
on each new log, recompute metrics and alerts and write metrics.json and alerts.json.
Run from backend/: python -m pipeline.pathway_metrics_alerts
"""
from pathlib import Path

import pathway as pw

# This file is backend/pipeline/pathway_metrics_alerts.py
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = _BACKEND_ROOT / "data"
REDACTED_LOGS_PATH = DATA_DIR / "redacted_logs.jsonl"


class LogSchema(pw.Schema):
    id: str
    timestamp: str
    user_id: str
    patient_id: str
    query: str
    llm_response: str
    risk_severity: str
    phi_classifications: str  # JSON string; Pathway may need string for complex types


def on_log_change(key, row, time, is_addition):
    if not is_addition:
        return
    try:
        from app.metrics_alerts import main as run_metrics_alerts
        run_metrics_alerts()
    except Exception as e:
        print(f"[Pathway] metrics_alerts error: {e}", flush=True)


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not REDACTED_LOGS_PATH.exists():
        REDACTED_LOGS_PATH.touch()
    logs = pw.io.jsonlines.read(
        str(REDACTED_LOGS_PATH),
        schema=LogSchema,
        mode="streaming",
    )
    pw.io.subscribe(logs, on_change=on_log_change)
    pw.run()


if __name__ == "__main__":
    main()
