"""
Legacy Pathway pipeline: reads queries from data/queries.jsonl, calls Gemini,
writes answers to data/answers.jsonl. Optional; the FastAPI app (app.server) handles /ask directly.
Run from backend/: PYTHONPATH=. python -m pipeline.main
"""
import os
import re
import json
from pathlib import Path
from typing import Dict, Any, Optional

import pathway as pw
import google.generativeai as genai
import requests
from dotenv import load_dotenv

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = _BACKEND_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

_load_env = _BACKEND_ROOT.parent / ".env"
if _load_env.exists():
    load_dotenv(_load_env)
else:
    load_dotenv()

PATIENTS_PATH = DATA_DIR / "patients_100.json"
with open(PATIENTS_PATH, "r") as f:
    patients_list = json.load(f)

PATIENT_INDEX: Dict[str, Dict[str, Any]] = {
    p["patient_id"]: p for p in patients_list
}

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set")

genai.configure(api_key=API_KEY)
MODEL_NAME = "models/gemini-2.5-flash"
model = genai.GenerativeModel(MODEL_NAME)


class QuerySchema(pw.Schema):
    user_id: str
    patient_id: str
    question: str


QUERIES_PATH = str(DATA_DIR / "queries.jsonl")
ANSWERS_PATH = str(DATA_DIR / "answers.jsonl")
UPDATES_PATH = str(DATA_DIR / "patient_updates.jsonl")

queries = pw.io.jsonlines.read(
    QUERIES_PATH,
    schema=QuerySchema,
    mode="streaming",
)


def answer_patient_query(user_id: str, patient_id: str, question: str) -> str:
    patient = PATIENT_INDEX.get(patient_id)
    if patient is None:
        return f"No patient found for patient_id={patient_id}"
    patient_json = json.dumps(patient, separators=(",", ":"))
    prompt = f"""
You are a clinical assistant. You will be given structured patient data in JSON
and a clinician's question. Use ONLY the provided data. If something is not in
the data, say you don't know.

PATIENT_DATA (JSON):
{patient_json}

QUESTION:
{question}

Respond in 3-5 sentences, clear and concise, using clinical but simple language.
"""
    try:
        resp = model.generate_content(prompt)
        text = getattr(resp, "text", None)
        if not text:
            return "LLM returned an empty response."
        return text.strip()
    except Exception as e:
        return f"Error calling LLM: {e}"


UPDATE_KEYWORDS = ("update", "change", "set")


def detect_age_update(question: str) -> Optional[int]:
    q_lower = question.lower()
    if "age" not in q_lower:
        return None
    if not any(kw in q_lower for kw in UPDATE_KEYWORDS):
        return None
    match = re.search(r"\b(\d{1,3})\b", q_lower)
    if not match:
        return None
    try:
        age_val = int(match.group(1))
    except ValueError:
        return None
    if age_val <= 0 or age_val > 120:
        return None
    return age_val


answers = queries.select(
    user_id=pw.this.user_id,
    patient_id=pw.this.patient_id,
    question=pw.this.question,
    answer=pw.apply(
        answer_patient_query,
        pw.this.user_id,
        pw.this.patient_id,
        pw.this.question,
    ),
)

updates_raw = queries.select(
    user_id=pw.this.user_id,
    patient_id=pw.this.patient_id,
    question=pw.this.question,
    new_age=pw.apply(detect_age_update, pw.this.question),
)
updates = updates_raw.filter(pw.this.new_age.is_not_none())

pw.io.jsonlines.write(updates, UPDATES_PATH)
pw.io.jsonlines.write(answers, ANSWERS_PATH)

WEBHOOK_URL = "https://www.dtc-aparavi.com/webhook"


def send_answer_to_webhook(key, row, time, is_addition):
    if not is_addition:
        return
    payload = {
        "user_id": row.get("user_id"),
        "patient_id": row.get("patient_id"),
        "question": row.get("question"),
        "answer": row.get("answer"),
    }
    try:
        resp = requests.post(WEBHOOK_URL, json=payload, timeout=5)
        print(f"[WEBHOOK] Sent to {WEBHOOK_URL} status={resp.status_code}", flush=True)
    except Exception as e:
        print(f"[WEBHOOK ERROR] {e}", flush=True)


pw.io.subscribe(answers, on_change=send_answer_to_webhook)
pw.run()
