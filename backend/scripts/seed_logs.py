"""
Seed redacted_logs.jsonl with sample entries so compliance dashboard and charts
have data to display. Run from repo root: python -m backend.scripts.seed_logs
Or from backend/: python -m scripts.seed_logs
"""
import json
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Resolve backend root: this file is backend/scripts/seed_logs.py
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = _BACKEND_ROOT / "data"
REDACTED_LOGS_PATH = DATA_DIR / "redacted_logs.jsonl"

SAMPLE_ENTRIES = [
    {"user_id": "doctorJane@doctor.com", "patient_id": "P001", "query": "What are the current medications?", "llm_response": "Patient is on # and #.", "risk_severity": "LOW"},
    {"user_id": "doctorJane@doctor.com", "patient_id": "P002", "query": "Summarize recent notes.", "llm_response": "Recent notes indicate #.", "risk_severity": "MEDIUM"},
    {"user_id": "complianceDave@compliance.com", "patient_id": "P003", "query": "List active medications.", "llm_response": "Active medications include #.", "risk_severity": "LOW"},
    {"user_id": "doctorJane@doctor.com", "patient_id": "P001", "query": "What is the blood pressure?", "llm_response": "BP is #/# mmHg.", "risk_severity": "LOW"},
    {"user_id": "nurse@hospital.com", "patient_id": "P005", "query": "Any allergies?", "llm_response": "No known drug allergies.", "risk_severity": "LOW"},
    {"user_id": "doctorJane@doctor.com", "patient_id": "P010", "query": "Lab results?", "llm_response": "Labs show #.", "risk_severity": "MEDIUM"},
    {"user_id": "admin@hospital.com", "patient_id": "P007", "query": "Patient demographics.", "llm_response": "Demographics: #.", "risk_severity": "HIGH"},
]


def main():
    now = datetime.now(timezone.utc)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    existing = 0
    if REDACTED_LOGS_PATH.exists():
        with REDACTED_LOGS_PATH.open("r") as f:
            existing = sum(1 for line in f if line.strip())

    if existing >= 7:
        print(f"Already {existing} log entries; skipping seed.")
        return

    with REDACTED_LOGS_PATH.open("a") as f:
        for i, sample in enumerate(SAMPLE_ENTRIES):
            ts = (now - timedelta(days=6 - i, hours=i)).isoformat()
            entry = {
                "id": str(uuid.uuid4()),
                "timestamp": ts,
                "user_id": sample["user_id"],
                "patient_id": sample["patient_id"],
                "query": sample["query"],
                "llm_response": sample["llm_response"],
                "risk_severity": sample["risk_severity"],
                "phi_classifications": [{"type": "GENERIC", "count": 1, "confidence": 0.9, "redaction_status": "redacted"}],
            }
            f.write(json.dumps(entry) + "\n")
    print(f"Seeded {len(SAMPLE_ENTRIES)} log entries to {REDACTED_LOGS_PATH}")


if __name__ == "__main__":
    main()
