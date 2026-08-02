#!/usr/bin/env bash
# Idempotent local seed: registers the dev user and creates the bar with the
# bundled base-cocktails datapack. Safe to re-run.
set -euo pipefail

API=${API_URL:-http://localhost:8000}
NAME=${SEED_NAME:-Chris}
EMAIL=${SEED_EMAIL:-admin@example.com}
PASSWORD=${SEED_PASSWORD:-password}
BAR_NAME=${SEED_BAR_NAME:-Pezza Bar}

json() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }

echo "waiting for API at $API ..."
until curl -sf "$API/api/server/version" >/dev/null; do sleep 2; done

curl -sf -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "{\"name\":\"$NAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  >/dev/null 2>&1 && echo "registered $EMAIL" || echo "user exists, continuing"

TOKEN=$(curl -sf -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' -H 'Accept: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | json "['data']['token']")

EXISTING=$(curl -sf "$API/api/bars" -H "Authorization: Bearer $TOKEN" \
  -H 'Accept: application/json' | json "['data'].__len__()")

if [ "$EXISTING" -gt 0 ]; then
  echo "a bar already exists, skipping creation"
else
  curl -sf -X POST "$API/api/bars" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -H 'Accept: application/json' \
    -d "{\"name\":\"$BAR_NAME\",\"default_units\":\"oz\",\"options\":\"cocktails\"}" \
    | json "['data']['name']" | xargs -I{} echo "created bar: {}"
fi

echo "done — UI: http://localhost:3000 ($EMAIL / $PASSWORD)"
