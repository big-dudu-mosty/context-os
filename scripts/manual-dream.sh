#!/usr/bin/env bash
set -euo pipefail

STATE_FILE=".manual-api-test.env"

if [ ! -f "$STATE_FILE" ]; then
  echo "Missing $STATE_FILE"
  echo "Run ./scripts/manual-api-test.sh first."
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

BASE="${BASE:-http://localhost:3000}"
DATE="${DATE:-$(date +%F)}"

if [ -z "${AGENT_ID:-}" ]; then
  echo "AGENT_ID is missing. Run ./scripts/manual-api-test.sh first."
  exit 1
fi

echo "Triggering Dream"
echo "AGENT_ID=$AGENT_ID"
echo "DATE=$DATE"

curl -sS -X POST "$BASE/api/dream/$AGENT_ID" \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$DATE\"}" |
  jq
