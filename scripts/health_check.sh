#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
status=0
for command_name in python npm; do
  if command -v "$command_name" >/dev/null 2>&1; then
    printf 'FOUND: %s -> %s\\n' "$command_name" "$(command -v "$command_name")"
  else
    printf 'MISSING: %s\\n' "$command_name"
    status=1
  fi
done
python -c 'import sys; print("Python:", sys.version.split()[0])' || status=1
npm --version || status=1
test -f pyproject.toml && echo "FOUND: pyproject.toml" || status=1
test -f frontend/package.json && echo "FOUND: frontend/package.json" || status=1
test -f .env.example && echo "FOUND: .env.example" || status=1
exit "$status"
