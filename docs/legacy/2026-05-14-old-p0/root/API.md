# Context OS P0 REST API

Base URL:

```text
http://localhost:3000
```

All API routes are under `/api`. Successful responses use:

```json
{
  "success": true,
  "data": {}
}
```

Errors use:

```json
{
  "error": "Message"
}
```

## Run

```bash
cd backend
npm run server
```

Health check:

```bash
curl http://localhost:3000/health
```

Browser tester for non-coding users:

```text
http://localhost:3000
```

## Demo

Run the one-call demo flow. This creates a user, project, agent, session, transcript file, runs Dream, and returns extracted structured data:

```bash
curl -X POST http://localhost:3000/api/demo/run \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo User","project_name":"Demo Project","transcript":"Decision: Use PostgreSQL plus pgvector. Task: Implement reducer. Risk: YAML may be malformed. Open question: Should reducer be async?"}'
```

## Users

Create user:

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","role":"member"}'
```

Get user:

```bash
curl http://localhost:3000/api/users/<user_id>
```

## Agents

Create agent:

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"owner_id":"<user_id>","name":"Claude Code","type":"claude-code-cli"}'
```

Get agent:

```bash
curl http://localhost:3000/api/agents/<agent_id>
```

## Sessions

Create session:

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"<agent_id>","owner_id":"<user_id>","project_id":"<project_id>"}'
```

`project_id` is optional.

Get session:

```bash
curl http://localhost:3000/api/sessions/<session_id>
```

End session:

```bash
curl -X PUT http://localhost:3000/api/sessions/<session_id>/end \
  -H "Content-Type: application/json" \
  -d '{"transcript_path":"/tmp/session.md","transcript_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
```

Ending a session defaults `dream_status` to `pending`.

## Projects

Create project:

```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"slug":"context-os","name":"Context OS","created_by":"<user_id>"}'
```

Get project:

```bash
curl http://localhost:3000/api/projects/<project_id>
```

## Dream

Trigger Dream Consolidation manually:

```bash
curl -X POST http://localhost:3000/api/dream/<agent_id> \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-05-11"}'
```

`date` is optional and defaults to today. This endpoint calls the configured LLM provider.

## Briefing

Generate or fetch today's cached briefing:

```bash
curl -X POST http://localhost:3000/api/briefing \
  -H "Content-Type: application/json" \
  -d '{"owner_id":"<user_id>","date":"2026-05-11"}'
```

Get briefing history:

```bash
curl "http://localhost:3000/api/briefing/<user_id>?limit=10"
```

## Handoff

Create handoff:

```bash
curl -X POST http://localhost:3000/api/handoff \
  -H "Content-Type: application/json" \
  -d '{"from_owner_id":"<sender_user_id>","to_owner_id":"<receiver_user_id>","session_id":"<session_id>","message":"Please continue this work."}'
```

Get pending handoffs:

```bash
curl http://localhost:3000/api/handoff/pending/<receiver_user_id>
```

Accept handoff:

```bash
curl -X PUT http://localhost:3000/api/handoff/<handoff_id>/accept \
  -H "Content-Type: application/json" \
  -d '{"to_owner_id":"<receiver_user_id>"}'
```

Dismiss handoff:

```bash
curl -X PUT http://localhost:3000/api/handoff/<handoff_id>/dismiss \
  -H "Content-Type: application/json" \
  -d '{"to_owner_id":"<receiver_user_id>"}'
```

## Queries

Get active decisions:

```bash
curl "http://localhost:3000/api/projects/<project_id>/decisions?status=active"
```

Get tasks:

```bash
curl "http://localhost:3000/api/projects/<project_id>/tasks?status=todo"
```

`status` is optional for tasks.

Get open risks:

```bash
curl "http://localhost:3000/api/projects/<project_id>/risks?status=open"
```

Get open questions:

```bash
curl "http://localhost:3000/api/projects/<project_id>/questions?status=open"
```
