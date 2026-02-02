"""
PHI Shield Backend — FastAPI server.
/ask: write request to stream; Pathway calls Gemini, redacts, writes response; API returns answer.
No redaction or LLM in API — only Pathway does Gemini + redaction.
"""
import json
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import (
    REDACTED_LOGS_PATH,
    REQUEST_EVENTS_PATH,
    RESPONSE_STORE_DIR,
    METRICS_PATH,
    ALERTS_PATH,
    POLICIES_PATH,
)
from app.llm import PATIENT_INDEX
from app.metrics_alerts import compute_metrics, compute_alerts, _load_logs

app = FastAPI(title="PHI Shield - Backend")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:3000", "http://127.0.0.1:8080", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/Response models ---

class QueryRequest(BaseModel):
    user_id: str
    patient_id: str
    question: str


class LogEntry(BaseModel):
    id: str
    timestamp: str
    user_id: str
    patient_id: str
    query: str  # redacted
    llm_response: str  # redacted
    risk_severity: str
    phi_classifications: List[Dict[str, Any]]


class QueryResponse(BaseModel):
    user_id: str
    patient_id: str
    question: str
    answer: str  # raw answer for display
    logEntry: LogEntry


# --- Helpers ---

def _ensure_logs_file() -> None:
    if not REDACTED_LOGS_PATH.exists():
        REDACTED_LOGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        REDACTED_LOGS_PATH.touch()


def _ensure_request_events_file() -> None:
    REQUEST_EVENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not REQUEST_EVENTS_PATH.exists():
        REQUEST_EVENTS_PATH.touch()


def _append_request_event(entry: Dict[str, Any]) -> None:
    """Append request (question only) for Pathway to consume; Pathway calls Gemini and redacts."""
    _ensure_request_events_file()
    with REQUEST_EVENTS_PATH.open("a") as f:
        f.write(json.dumps(entry) + "\n")


def _wait_for_response(event_id: str, timeout_seconds: float = 60.0) -> Optional[str]:
    """Poll response_store for {event_id}.json until done or timeout. Returns answer or None."""
    RESPONSE_STORE_DIR.mkdir(parents=True, exist_ok=True)
    response_file = RESPONSE_STORE_DIR / f"{event_id}.json"
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if response_file.exists():
            try:
                with response_file.open("r") as f:
                    data = json.load(f)
                if data.get("done"):
                    answer = data.get("answer", "")
                    try:
                        response_file.unlink()
                    except OSError:
                        pass
                    return answer
            except (json.JSONDecodeError, OSError):
                pass
        time.sleep(0.2)
    return None


def _read_logs(limit: Optional[int] = None, offset: int = 0) -> List[Dict[str, Any]]:
    if not REDACTED_LOGS_PATH.exists():
        return []
    lines = []
    with REDACTED_LOGS_PATH.open("r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                lines.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    lines.reverse()  # newest first
    if offset:
        lines = lines[offset:]
    if limit is not None:
        lines = lines[:limit]
    return lines


def _find_log_by_id(log_id: str) -> Optional[Dict[str, Any]]:
    if not REDACTED_LOGS_PATH.exists():
        return None
    with REDACTED_LOGS_PATH.open("r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if obj.get("id") == log_id:
                    return obj
            except json.JSONDecodeError:
                continue
    return None


# --- Endpoints ---

@app.post("/ask", response_model=QueryResponse)
def ask(request: QueryRequest) -> QueryResponse:
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question cannot be empty")

    log_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    # 1) Emit request only (no Gemini, no redaction in API); Pathway will call Gemini and redact
    request_event = {
        "event_id": log_id,
        "user_id": request.user_id,
        "patient_id": request.patient_id,
        "timestamp": timestamp,
        "prompt_text": request.question,
    }
    _append_request_event(request_event)

    # 2) Wait for Pathway to process: call Gemini, redact, write response to response_store
    answer = _wait_for_response(log_id, timeout_seconds=60.0)
    if answer is None:
        raise HTTPException(
            status_code=504,
            detail="Pathway pipeline did not respond in time. Is the pipeline running?",
        )

    # 3) Return answer; redacted log lives in redacted_logs.jsonl (written by Pathway)
    return QueryResponse(
        user_id=request.user_id,
        patient_id=request.patient_id,
        question=request.question,
        answer=answer,
        logEntry=LogEntry(
            id=log_id,
            timestamp=timestamp,
            user_id=request.user_id,
            patient_id=request.patient_id,
            query=request.question,
            llm_response=answer,
            risk_severity="PENDING",
            phi_classifications=[],
        ),
    )


@app.get("/patients")
def get_patients() -> List[Dict[str, Any]]:
    out = []
    for pid, p in PATIENT_INDEX.items():
        demo = p.get("demographics") or {}
        name = demo.get("name") or pid
        age = demo.get("age")
        out.append({
            "patient_id": pid,
            "display_name": name,
            "age": age,
            "mrn": pid,
        })
    return out


@app.get("/patients/{patient_id}")
def get_patient(patient_id: str) -> Dict[str, Any]:
    p = PATIENT_INDEX.get(patient_id)
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    return p


@app.get("/logs")
def get_logs(limit: Optional[int] = 200, offset: int = 0) -> List[Dict[str, Any]]:
    logs = _read_logs(limit=limit, offset=offset)
    return [
        {
            "id": L.get("id"),
            "timestamp": L.get("timestamp"),
            "user_id": L.get("user_id"),
            "patient_id": L.get("patient_id"),
            "query": (L.get("query") or "")[:80] + ("..." if len(L.get("query") or "") > 80 else ""),
            "risk_severity": L.get("risk_severity", "LOW"),
            "phi_classifications": L.get("phi_classifications", []),
        }
        for L in logs
    ]


@app.get("/logs/{log_id}")
def get_log_by_id(log_id: str) -> Dict[str, Any]:
    log = _find_log_by_id(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return log


@app.delete("/logs")
def clear_logs() -> Dict[str, Any]:
    """Clear all redacted logs and reset metrics/alerts to empty state."""
    empty_metrics = {
        "total_today": 0,
        "total_24h": 0,
        "active_investigations": 0,
        "phi_views_24h": 0,
        "by_day": [],
        "by_user": [],
        "risk_distribution": {},
    }
    REDACTED_LOGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    REDACTED_LOGS_PATH.open("w").close()  # truncate
    with METRICS_PATH.open("w") as f:
        json.dump(empty_metrics, f, indent=2)
    with ALERTS_PATH.open("w") as f:
        json.dump([], f)
    return {"ok": True, "message": "All logs cleared."}


@app.get("/metrics")
def get_metrics() -> Dict[str, Any]:
    if not METRICS_PATH.exists():
        return {
            "total_today": 0,
            "total_24h": 0,
            "active_investigations": 0,
            "phi_views_24h": 0,
            "by_day": [],
            "by_user": [],
            "risk_distribution": {},
        }
    try:
        with METRICS_PATH.open("r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {
            "total_today": 0,
            "total_24h": 0,
            "active_investigations": 0,
            "phi_views_24h": 0,
            "by_day": [],
            "by_user": [],
            "risk_distribution": {},
        }


@app.get("/alerts")
def get_alerts() -> List[Dict[str, Any]]:
    if not ALERTS_PATH.exists():
        return []
    try:
        with ALERTS_PATH.open("r") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


# --- Access policies (CRUD) ---

def _read_policies() -> List[Dict[str, Any]]:
    if not POLICIES_PATH.exists():
        return []
    try:
        with POLICIES_PATH.open("r") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _write_policies(policies: List[Dict[str, Any]]) -> None:
    POLICIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with POLICIES_PATH.open("w") as f:
        json.dump(policies, f, indent=2)


class PolicyCreate(BaseModel):
    role: str
    permissions: List[str] = []


class PolicyUpdate(BaseModel):
    permissions: Optional[List[str]] = None
    last_updated: Optional[str] = None


@app.get("/policies")
def get_policies() -> List[Dict[str, Any]]:
    return _read_policies()


@app.get("/policies/{role}")
def get_policy(role: str) -> Dict[str, Any]:
    policies = _read_policies()
    for p in policies:
        if (p.get("role") or "").strip().lower() == role.strip().lower():
            return p
    raise HTTPException(status_code=404, detail="Policy not found")


@app.post("/policies")
def create_policy(body: PolicyCreate) -> Dict[str, Any]:
    policies = _read_policies()
    role_clean = (body.role or "").strip()
    if not role_clean:
        raise HTTPException(status_code=400, detail="role is required")
    for p in policies:
        if (p.get("role") or "").strip().lower() == role_clean.lower():
            raise HTTPException(status_code=409, detail="Policy for this role already exists")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    new_policy = {
        "role": role_clean,
        "permissions": list(body.permissions or []),
        "last_updated": now,
    }
    policies.append(new_policy)
    _write_policies(policies)
    return new_policy


@app.put("/policies/{role}")
def update_policy(role: str, body: PolicyUpdate) -> Dict[str, Any]:
    policies = _read_policies()
    role_clean = role.strip()
    for i, p in enumerate(policies):
        if (p.get("role") or "").strip().lower() == role_clean.lower():
            if body.permissions is not None:
                policies[i]["permissions"] = list(body.permissions)
            if body.last_updated is not None:
                policies[i]["last_updated"] = body.last_updated
            else:
                policies[i]["last_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            _write_policies(policies)
            return policies[i]
    raise HTTPException(status_code=404, detail="Policy not found")


@app.delete("/policies/{role}")
def delete_policy(role: str) -> Dict[str, Any]:
    policies = _read_policies()
    role_clean = role.strip()
    for i, p in enumerate(policies):
        if (p.get("role") or "").strip().lower() == role_clean.lower():
            removed = policies.pop(i)
            _write_policies(policies)
            return removed
    raise HTTPException(status_code=404, detail="Policy not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
