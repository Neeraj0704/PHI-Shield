#!/usr/bin/env bash
# Create a fresh venv with Python 3.11 or 3.12 and install all requirements (including Pathway).
# Run from backend/: ./setup_venv.sh

set -e
cd "$(dirname "$0")"

PYTHON=""
for candidate in python3.12 python3.11 python3; do
  if command -v "$candidate" &>/dev/null; then
    ver=$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || true)
    if [[ "$ver" == "3.12" || "$ver" == "3.11" ]]; then
      PYTHON="$candidate"
      break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  echo "Need Python 3.11 or 3.12 for Pathway (pyarrow has no wheels for 3.14)."
  echo "Install with: brew install python@3.12"
  echo "Then run this script again."
  exit 1
fi

echo "Using: $($PYTHON --version)"
echo "Removing old .venv if present..."
rm -rf .venv
echo "Creating new venv..."
"$PYTHON" -m venv .venv
source .venv/bin/activate
echo "Upgrading pip..."
pip install --upgrade pip -q
echo "Installing requirements (including Pathway)..."
pip install -r requirements.txt
echo "Done. Activate with: source .venv/bin/activate"
echo "Then run: python -m uvicorn app.server:app --reload --host 0.0.0.0 --port 8000"
echo "And in a second terminal: PYTHONPATH=. python -m pipeline.phi_monitoring"
