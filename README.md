# PHI-Shield

HIPAA-compliant PHI monitoring system for LLM workflows. Redacts sensitive patient data from logs before storage while allowing clinicians to see full responses.

## How It Works

1. **User asks a question** → API writes request to `request_events.jsonl`
2. **Pathway pipeline** reads request → calls Ollama (local LLM) → redacts PHI → writes to `redacted_logs.jsonl`
3. **API returns** raw answer to user; only redacted data is stored

## Requirements

- Python 3.11 or 3.12
- [Ollama](https://ollama.com) (local LLM)

## Quick Start

### 1. Setup Backend

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Start Ollama

```bash
ollama serve
ollama pull llama3.2
```

### 3. Run Backend (2 terminals)

**Terminal 1 — API server:**
```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.server:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Pathway pipeline:**
```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. python -m pipeline.phi_monitoring
```

### 4. Run Frontend

```bash
cd frontend
npm install
npm run build
npx http-server -p 8080 -o
```

Open http://localhost:8080 → Login → Chatbot

## Seed Sample Data (Optional)

```bash
cd backend
PYTHONPATH=. python -m scripts.seed_logs
PYTHONPATH=. python -m app.metrics_alerts
```

## Project Structure

```
backend/
├── app/           # FastAPI: server.py, llm.py, redaction.py
├── pipeline/      # Pathway: phi_monitoring.py (LLM + redact)
├── data/          # patients_100.json, redacted_logs.jsonl, metrics.json
└── scripts/       # seed_logs.py

frontend/
├── pages/         # chatbot.html, compliance.html, phi-access.html
├── src/           # TypeScript source
└── js/            # Compiled JavaScript
```

## Key Endpoints

| Endpoint | Description |
|----------|-------------|
| POST /ask | Ask a question (Pathway processes, returns answer) |
| GET /patients | List patients |
| GET /logs | Get redacted logs |
| GET /metrics | Dashboard metrics |
| GET /alerts | Compliance alerts |

## Redaction

Uses **Microsoft Presidio** (person, SSN, dates, phone, email, etc.) with regex fallback. All stored logs are redacted; clinicians see full answers in the chat UI.
