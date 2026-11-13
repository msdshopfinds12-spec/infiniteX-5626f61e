#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v python >/dev/null 2>&1 || { echo "Python 3.11+ is required." >&2; exit 1; }
python -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e ".[dev]"

command -v npm >/dev/null 2>&1 || { echo "Node.js 20+ and npm are required." >&2; exit 1; }
npm ci
echo "Development dependencies installed."
