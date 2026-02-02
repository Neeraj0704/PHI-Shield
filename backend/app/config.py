"""Shared paths: data dir is backend/data/."""
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = _BACKEND_ROOT / "data"

PATIENTS_PATH = DATA_DIR / "patients_100.json"
REDACTED_LOGS_PATH = DATA_DIR / "redacted_logs.jsonl"
# Request stream: API writes (user_id, patient_id, question); Pathway reads, calls Gemini, redacts, writes response
REQUEST_EVENTS_PATH = DATA_DIR / "request_events.jsonl"
RESPONSE_STORE_DIR = DATA_DIR / "response_store"  # Pathway writes {event_id}.json with answer; API reads
METRICS_PATH = DATA_DIR / "metrics.json"
ALERTS_PATH = DATA_DIR / "alerts.json"
POLICIES_PATH = DATA_DIR / "access_policies.json"
