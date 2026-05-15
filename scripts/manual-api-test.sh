#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
EMAIL_SUFFIX="$(date +%s)"
STATE_FILE=".manual-api-test.env"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1"
    exit 1
  fi
}

need curl
need jq

echo "0. Health check"
curl -sS "$BASE/health" | jq

echo
echo "1. Create user"
USER_ID="$(
  curl -sS -X POST "$BASE/api/users" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Alice\",\"email\":\"alice-$EMAIL_SUFFIX@example.com\"}" |
    jq -r ".data.id"
)"
echo "USER_ID=$USER_ID"

echo
echo "2. Create agent"
AGENT_ID="$(
  curl -sS -X POST "$BASE/api/agents" \
    -H "Content-Type: application/json" \
    -d "{\"owner_id\":\"$USER_ID\",\"name\":\"Alice Agent\",\"type\":\"claude-code-cli\"}" |
    jq -r ".data.id"
)"
echo "AGENT_ID=$AGENT_ID"

echo
echo "3. Create session"
SESSION_ID="$(
  curl -sS -X POST "$BASE/api/sessions" \
    -H "Content-Type: application/json" \
    -d "{\"agent_id\":\"$AGENT_ID\",\"owner_id\":\"$USER_ID\"}" |
    jq -r ".data.id"
)"
echo "SESSION_ID=$SESSION_ID"

echo
echo "4. End session"
curl -sS -X PUT "$BASE/api/sessions/$SESSION_ID/end" \
  -H "Content-Type: application/json" \
  -d '{"transcript_path":"/tmp/manual-test.md"}' |
  jq

echo
echo "5. Get session"
curl -sS "$BASE/api/sessions/$SESSION_ID" | jq

echo
cat >"$STATE_FILE" <<EOF
BASE=$BASE
USER_ID=$USER_ID
AGENT_ID=$AGENT_ID
SESSION_ID=$SESSION_ID
EOF

echo "Saved IDs to $STATE_FILE"
echo
echo "Done."
