#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if ! docker compose ps --status running --services | grep -qx db; then
  echo "Local Compose database is not running. Start it with: docker compose up -d db" >&2
  exit 1
fi
mkdir -p backups
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="backups/infinitegx7-${timestamp}.sql"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$output"
echo "Local database backup created: $output"
