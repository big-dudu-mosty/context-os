# Context OS

> Status: P0 core flow implemented and manually verified | Version: P0 | Last updated: 2026-05-12

Context OS is a terminal-first shared context system for AI-native teams. It captures work sessions, consolidates transcripts with an LLM, stores the generated YAML context package, extracts structured decisions/tasks/risks/questions/observations, and exposes the result through a REST API.

## Current P0 Flow

```text
User
  -> Project
  -> Agent
  -> Session
  -> Transcript file
  -> End Session with transcript_path
  -> Dream Consolidation
  -> ContextPackage YAML
  -> Extraction
  -> Decisions / Tasks / Risks / Open Questions / Observations
  -> Briefing / Handoff / Query APIs
```

Important: Dream only extracts useful structured data if the session has a `transcript_path`. If you create a session and trigger Dream before ending the session, the system will treat it as an empty/inactive session.

## Tech Stack

- Backend: TypeScript + Express
- Database: PostgreSQL 15 + pgvector
- Migrations: node-pg-migrate
- LLM client: OpenAI-compatible Chat Completions API
- Scheduler: node-cron
- Runtime: Docker Compose + Node.js

## Prerequisites

- Docker
- Node.js 18+
- npm
- jq, for readable curl output

## Environment

Create `backend/.env` from `backend/.env.example`.

Required values:

```env
DATABASE_URL=postgresql://context_os:context_os_dev@localhost:5432/context_os_dev
DB_POOL_MAX=10
PORT=3000
NODE_ENV=development

OPENAI_API_KEY=your_key_here
OPENAI_BASE_URL=https://your-openai-compatible-provider/v1
OPENAI_CHAT_MODEL=your-chat-model
OPENAI_TIMEOUT_MS=45000

ENABLE_SCHEDULERS=true
DREAM_CRON_SCHEDULE=0 2 * * *
```

Do not commit `backend/.env`. It is ignored by Git.

## Install And Start

From the repo root:

```bash
cd backend && npm install
```

Start PostgreSQL:

```bash
cd backend && npm run db:up
```

Run migrations:

```bash
cd backend && npm run migrate:up
```

Build:

```bash
cd backend && npm run build
```

Start the API server:

```bash
cd backend && npm run server
```

Health check:

```bash
curl -sS http://localhost:3000/health | jq
```

Expected:

```json
{
  "status": "ok"
}
```

## Manual End-To-End Test

Use two terminals:

- Terminal 1: keep the API server running with `cd backend && npm run server`
- Terminal 2: run the commands below from the repo root

1. Create a user:

```bash
USER_ID=$(curl -sS -X POST "http://localhost:3000/api/users" -H "Content-Type: application/json" -d '{"name":"Manual User","email":"manual-'"$(date +%s)"'@example.com"}' | jq -r '.data.id') && echo $USER_ID
```

2. Create a project:

```bash
PROJECT_ID=$(curl -sS -X POST "http://localhost:3000/api/projects" -H "Content-Type: application/json" -d '{"slug":"manual-project-'"$(date +%s)"'","name":"Manual Test Project","created_by":"'"$USER_ID"'"}' | jq -r '.data.id') && echo $PROJECT_ID
```

3. Create an agent:

```bash
AGENT_ID=$(curl -sS -X POST "http://localhost:3000/api/agents" -H "Content-Type: application/json" -d '{"owner_id":"'"$USER_ID"'","name":"Manual Agent","type":"codex-cli"}' | jq -r '.data.id') && echo $AGENT_ID
```

Agent `type` is only an identity label, for example `codex-cli` or `claude-code-cli`. It does not choose the LLM model. The LLM provider/model is controlled by `OPENAI_BASE_URL` and `OPENAI_CHAT_MODEL`.

4. Create a transcript file:

```bash
printf '%s\n' 'Decision: Use PostgreSQL plus pgvector for Context OS storage.' 'Task: Implement ProjectContext reducer next. Status: todo. Priority: high.' 'Risk: LLM YAML may be malformed. Severity: medium. Mitigation: add schema validation.' 'Open question: Should reducer run synchronously or asynchronously?' 'Observation: Project-bound sessions allow structured extraction.' > /tmp/context-os-manual-test.md
```

5. Create a project-bound session:

```bash
SESSION_ID=$(curl -sS -X POST "http://localhost:3000/api/sessions" -H "Content-Type: application/json" -d '{"agent_id":"'"$AGENT_ID"'","owner_id":"'"$USER_ID"'","project_id":"'"$PROJECT_ID"'"}' | jq -r '.data.id') && echo $SESSION_ID
```

6. End the session and attach the transcript:

```bash
curl -sS -X PUT "http://localhost:3000/api/sessions/$SESSION_ID/end" -H "Content-Type: application/json" -d '{"transcript_path":"/tmp/context-os-manual-test.md","dream_status":"pending"}' | jq
```

7. Trigger Dream Consolidation:

```bash
curl --max-time 120 -sS -X POST "http://localhost:3000/api/dream/$AGENT_ID" -H "Content-Type: application/json" -d '{"date":"2026-05-12"}' | jq
```

Expected extraction result:

```json
{
  "decisionsCreated": 1,
  "tasksCreated": 1,
  "risksCreated": 1,
  "questionsCreated": 1,
  "observationsCreated": 1,
  "conflictsDetected": 0
}
```

8. Query extracted decisions:

```bash
curl -sS "http://localhost:3000/api/projects/$PROJECT_ID/decisions" | jq
```

9. Query extracted tasks:

```bash
curl -sS "http://localhost:3000/api/projects/$PROJECT_ID/tasks" | jq
```

10. Query extracted risks:

```bash
curl -sS "http://localhost:3000/api/projects/$PROJECT_ID/risks" | jq
```

11. Query extracted open questions:

```bash
curl -sS "http://localhost:3000/api/projects/$PROJECT_ID/questions" | jq
```

12. Generate a briefing:

```bash
curl --max-time 120 -sS -X POST "http://localhost:3000/api/briefing" -H "Content-Type: application/json" -d '{"owner_id":"'"$USER_ID"'","date":"2026-05-12"}' | jq
```

## Handoff Test

Create a receiver:

```bash
RECEIVER_ID=$(curl -sS -X POST "http://localhost:3000/api/users" -H "Content-Type: application/json" -d '{"name":"Manual Receiver","email":"receiver-'"$(date +%s)"'@example.com"}' | jq -r '.data.id') && echo $RECEIVER_ID
```

Create a handoff:

```bash
HANDOFF_ID=$(curl -sS -X POST "http://localhost:3000/api/handoff" -H "Content-Type: application/json" -d '{"from_owner_id":"'"$USER_ID"'","to_owner_id":"'"$RECEIVER_ID"'","session_id":"'"$SESSION_ID"'","message":"Please continue this work."}' | jq -r '.data.handoffId') && echo $HANDOFF_ID
```

List pending handoffs:

```bash
curl -sS "http://localhost:3000/api/handoff/pending/$RECEIVER_ID" | jq
```

Accept the handoff:

```bash
curl -sS -X PUT "http://localhost:3000/api/handoff/$HANDOFF_ID/accept" -H "Content-Type: application/json" -d '{"to_owner_id":"'"$RECEIVER_ID"'"}' | jq
```

## View Data In PostgreSQL

List tables:

```bash
docker exec context-os-db psql -U context_os -d context_os_dev -c "\dt"
```

Show recent users:

```bash
docker exec context-os-db psql -U context_os -d context_os_dev -P pager=off -c "SELECT id, name, email, created_at FROM users ORDER BY created_at DESC LIMIT 10;"
```

Show recent sessions:

```bash
docker exec context-os-db psql -U context_os -d context_os_dev -P pager=off -c "SELECT id, agent_id, owner_id, project_id, dream_status, transcript_path, dreamed_at FROM sessions ORDER BY started_at DESC LIMIT 10;"
```

Show context packages:

```bash
docker exec context-os-db psql -U context_os -d context_os_dev -P pager=off -c "SELECT id, source_type, title, project_ids, status, created_at FROM context_packages ORDER BY created_at DESC LIMIT 10;"
```

Show structured extraction counts:

```bash
docker exec context-os-db psql -U context_os -d context_os_dev -P pager=off -c "SELECT 'decisions' AS table_name, count(*) FROM decisions UNION ALL SELECT 'tasks', count(*) FROM tasks UNION ALL SELECT 'risks', count(*) FROM risks UNION ALL SELECT 'open_questions', count(*) FROM open_questions UNION ALL SELECT 'observations', count(*) FROM observations;"
```

## Automated Test Scripts

Backend scripts:

```bash
cd backend && npm run test:crud
```

```bash
cd backend && npm run test:extraction
```

```bash
cd backend && npm run test:briefing
```

```bash
cd backend && npm run test:handoff
```

```bash
cd backend && npm run test:scheduler
```

Live LLM tests:

```bash
cd backend && npm run test:dream:live
```

```bash
cd backend && npm run test:briefing:live
```

## Common Problems

### Dream only creates observations

Cause: the session probably did not have `transcript_path`, or the transcript file could not be read.

Check the session:

```bash
curl -sS "http://localhost:3000/api/sessions/$SESSION_ID" | jq
```

Fix by ending the session with a transcript path before triggering Dream:

```bash
curl -sS -X PUT "http://localhost:3000/api/sessions/$SESSION_ID/end" -H "Content-Type: application/json" -d '{"transcript_path":"/tmp/context-os-manual-test.md","dream_status":"pending"}' | jq
```

### Dream times out

Check `backend/.env`:

```bash
grep -nE '^(OPENAI_BASE_URL|OPENAI_CHAT_MODEL|OPENAI_TIMEOUT_MS)=' backend/.env
```

The provider must support the configured model. If you change `.env`, restart the API server.

### No decisions/tasks/risks/questions are written

The session must be linked to a project. Create the session with `project_id`:

```bash
SESSION_ID=$(curl -sS -X POST "http://localhost:3000/api/sessions" -H "Content-Type: application/json" -d '{"agent_id":"'"$AGENT_ID"'","owner_id":"'"$USER_ID"'","project_id":"'"$PROJECT_ID"'"}' | jq -r '.data.id') && echo $SESSION_ID
```

### API server is not running

Start it:

```bash
cd backend && npm run server
```

Check it:

```bash
curl -sS http://localhost:3000/health | jq
```

## Documentation

- [REST API Reference](docs/API.md)
- [Context Sharing Architecture](docs/context-sharing-architecture.md)
- [P0 Implementation Plan](docs/.ccb/specs/active/p0-implementation-plan.md)
- [Detailed Technical Design](docs/.ccb/specs/active/detailed-technical-design.md)

