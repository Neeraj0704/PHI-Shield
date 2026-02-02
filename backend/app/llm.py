"""
LLM module: load patient data and call Ollama for clinical answers.
Used by Pathway pipeline (and optionally FastAPI). No Gemini; runs locally via Ollama.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict

from app.config import PATIENTS_PATH

if not PATIENTS_PATH.exists():
    raise FileNotFoundError(f"Patients file not found: {PATIENTS_PATH}")

with open(PATIENTS_PATH, "r") as f:
    _patients_list = json.load(f)

PATIENT_INDEX: Dict[str, Dict[str, Any]] = {
    p["patient_id"]: p for p in _patients_list
}

# Ollama: default local server; set OLLAMA_HOST / OLLAMA_MODEL in env if needed
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


def _call_ollama(prompt: str) -> str:
    """Call Ollama /api/generate with the given prompt. Returns generated text or error message."""
    url = f"{OLLAMA_HOST}/api/generate"
    body = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        return (data.get("response") or "").strip()
    except urllib.error.URLError as e:
        return f"Ollama unavailable: {e}. Is Ollama running? Try: ollama serve && ollama pull {OLLAMA_MODEL}"
    except json.JSONDecodeError as e:
        return f"Invalid response from Ollama: {e}"
    except Exception as e:
        return f"Error calling Ollama: {e}"


# Keywords that suggest the user is asking about the patient (use patient data).
_PATIENT_QUERY_KEYWORDS = (
    "vital", "medication", "diagnosis", "diagnoses", "condition",
    "summary", "summarize", "patient", "his ", "her ", "their ", "labs", "lab ",
    "blood pressure", "heart rate", "allergy", "allergies", "note", "notes",
    "history", "test result", "treatment", "current", "status", "health",
    "problem", "issue", "symptom", "prescription", "drug", "dose", "doses",
)

# Greeting/small-talk patterns: respond like a normal bot, no patient data.
_GREETING_PATTERNS = (
    "hi", "hello", "hey", "thanks", "thank you", "good morning", "good afternoon",
    "good evening", "how are you", "what's up", "sup", "goodbye", "bye", "ok", "okay",
)


def _is_patient_specific_query(question: str) -> bool:
    """True if the user is explicitly asking about the patient; False for greetings/small talk."""
    q = question.strip().lower()
    if not q or len(q) > 500:
        return False
    # Short message that looks like greeting/small talk → no patient data
    if len(q) <= 25 and any(g in q for g in _GREETING_PATTERNS):
        return False
    # Very short and no patient-related keyword → treat as chat
    if len(q) <= 15 and not any(k in q for k in _PATIENT_QUERY_KEYWORDS):
        return False
    # Contains patient-related keyword or longer question → use patient data
    return any(k in q for k in _PATIENT_QUERY_KEYWORDS) or len(q) > 30


def _generic_reply(question: str) -> str:
    """Friendly reply without patient data (for greetings and general chat)."""
    prompt = f"""You are a friendly clinical assistant in a healthcare app. The user said: "{question}"

Reply briefly and naturally in 1-3 sentences. Be helpful and conversational. Do not mention or infer any specific patient information. If they seem to be greeting you, greet them back and say you can help with questions about the patient when they're ready."""
    out = _call_ollama(prompt)
    return out or "Hello! How can I help you today? You can ask me about this patient's vitals, medications, or a summary when you're ready."


def answer_patient_query(user_id: str, patient_id: str, question: str) -> str:
    """
    If the user is just chatting (e.g. "Hi"), reply like a normal bot without patient data.
    If the user explicitly asks about the patient, use patient data and return a clinical answer.
    """
    question = (question or "").strip()
    if not question:
        return "How can I help you today? You can ask about this patient's vitals, medications, or a summary."

    # Greeting or general chat → no patient data
    if not _is_patient_specific_query(question):
        return _generic_reply(question)

    patient = PATIENT_INDEX.get(patient_id)
    if patient is None:
        return f"No patient found for patient_id={patient_id}"

    patient_json = json.dumps(patient, separators=(",", ":"))

    prompt = f"""You are a clinical assistant. You will be given structured patient data in JSON and a clinician's question.

IMPORTANT: Use the patient data ONLY to answer the specific question asked. Do not volunteer extra patient information. Be concise.

PATIENT_DATA (JSON):
{patient_json}

QUESTION:
{question}

Answer in 3-5 sentences, clear and concise, using clinical but simple language. Address only what was asked.
"""

    out = _call_ollama(prompt)
    if not out:
        return "I couldn't generate a response. Please try rephrasing your question."
    return out
