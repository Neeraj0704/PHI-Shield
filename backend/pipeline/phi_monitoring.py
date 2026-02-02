"""
Pathway real-time PHI monitoring pipeline.

Flow:
  1. Ingest request events from request_events.jsonl (user_id, patient_id, question only).
  2. Call Gemini (LLM) for each request to get the answer.
  3. Run PHI detection + redaction + risk scoring (app.redaction).
  4. Write redacted log entries to redacted_logs.jsonl.
  5. Write raw answer to response_store/{event_id}.json so the API can return it.
  6. Update metrics.json and alerts.json for dashboards.

Run from backend/: PYTHONPATH=. python -m pipeline.phi_monitoring

Requires: pathway>=0.10.0
"""
import json
import sys
from pathlib import Path

# Ensure app is importable
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIR = _BACKEND_ROOT / "data"
sys.path.insert(0, str(_BACKEND_ROOT))

from app.config import REQUEST_EVENTS_PATH, REDACTED_LOGS_PATH, RESPONSE_STORE_DIR, METRICS_PATH, ALERTS_PATH

import pathway as pw

from app.llm import answer_patient_query
from app.redaction import redact_query_and_answer


class RequestEventSchema(pw.Schema):
    """Request event: API writes (question only); Pathway calls Gemini and redacts."""
    event_id: str
    user_id: str
    patient_id: str
    timestamp: str
    prompt_text: str


def call_llm_and_redact(user_id: str, patient_id: str, prompt_text: str) -> str:
    """
    Call Gemini for the answer, then redact prompt + answer.
    Returns JSON string with query_redacted, response_redacted, risk_severity, phi_classifications, raw_answer.
    """
    prompt_text = prompt_text or ""
    try:
        answer = answer_patient_query(user_id, patient_id, prompt_text)
    except Exception as e:
        answer = f"[Error calling LLM: {e!s}]"
    q_red, a_red, phi_list, risk = redact_query_and_answer(prompt_text, answer)
    return json.dumps({
        "query_redacted": q_red,
        "response_redacted": a_red,
        "risk_severity": risk,
        "phi_classifications": phi_list,
        "raw_answer": answer,
    })


def on_redacted_log(key, row, time, is_addition):
    """For each result: write redacted log, write response for API, refresh metrics/alerts."""
    if not is_addition:
        return
    try:
        event_id = row.get("event_id")
        user_id = row.get("user_id")
        patient_id = row.get("patient_id")
        timestamp = row.get("timestamp")
        result_json = row.get("redacted_result")
        if not result_json:
            return
        data = json.loads(result_json)
        raw_answer = data.get("raw_answer", "")

        # Write redacted log (no raw answer)
        log_entry = {
            "id": event_id,
            "timestamp": timestamp,
            "user_id": user_id,
            "patient_id": patient_id,
            "query": data.get("query_redacted", ""),
            "llm_response": data.get("response_redacted", ""),
            "risk_severity": data.get("risk_severity", "LOW"),
            "phi_classifications": data.get("phi_classifications", []),
        }
        REDACTED_LOGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with REDACTED_LOGS_PATH.open("a") as f:
            f.write(json.dumps(log_entry) + "\n")

        # Write response so API can return answer to the user
        RESPONSE_STORE_DIR.mkdir(parents=True, exist_ok=True)
        response_file = RESPONSE_STORE_DIR / f"{event_id}.json"
        with response_file.open("w") as f:
            json.dump({"answer": raw_answer, "done": True}, f)

        # Refresh dashboard metrics and alerts
        from app.metrics_alerts import compute_metrics, compute_alerts, _load_logs
        logs = _load_logs()
        metrics = compute_metrics(logs)
        alerts = compute_alerts(logs)
        with METRICS_PATH.open("w") as f:
            json.dump(metrics, f, indent=2)
        with ALERTS_PATH.open("w") as f:
            json.dump(alerts, f, indent=2)
        print(f"[Pathway] {event_id[:8]}... → Gemini + redact → redacted_logs + response_store", flush=True)
    except Exception as e:
        print(f"[Pathway] on_redacted_log error: {e}", flush=True)


def main():
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not REQUEST_EVENTS_PATH.exists():
        REQUEST_EVENTS_PATH.touch()

    events = pw.io.jsonlines.read(
        str(REQUEST_EVENTS_PATH),
        schema=RequestEventSchema,
        mode="streaming",
    )

    # For each request: call Gemini, then redact (Pathway does LLM + redaction)
    redacted_table = events.select(
        event_id=pw.this.event_id,
        user_id=pw.this.user_id,
        patient_id=pw.this.patient_id,
        timestamp=pw.this.timestamp,
        redacted_result=pw.apply(
            call_llm_and_redact,
            pw.this.user_id,
            pw.this.patient_id,
            pw.this.prompt_text,
        ),
    )

    pw.io.subscribe(redacted_table, on_change=on_redacted_log)
    print("[Pathway] PHI pipeline: request_events → Gemini → redact → redacted_logs + response_store + metrics", flush=True)
    pw.run()


if __name__ == "__main__":
    main()
