# Context OS

> **Status**: 设计完成，可进入实施 | **Version**: V0 | **Last Updated**: 2026-05-08

Terminal-first shared context system for AI-native teams.

Context OS lets team members submit compressed YAML context packages from their own AI workflows, store them in a shared project database, build searchable project memory, query progress and decisions, generate digests, and capture feedback from the CLI.

## What It Is

Context OS is not a traditional knowledge base. It is a shared context layer for teams working with AI.

The core workflow is:

```text
Personal AI work
-> compressed YAML context package
-> CLI submit
-> database storage and indexing
-> project memory
-> CLI query and digest
-> human feedback and correction
```

## Core Idea

Each person keeps their own AI workflow, such as Codex, Claude, ChatGPT, Cursor, or local notes. After a work session, their AI compresses the useful output into a standard `.yaml` context package generated from a template. Context OS validates, parses, indexes, and stores that package as shared team context.

Team members can later ask questions like:

```bash
ctx template dev > dev-context.yaml
ctx validate dev-context.yaml
ctx submit dev-context.yaml --project ai-context-tool
ctx ask ai-context-tool "What is the current project progress?"
ctx ask ai-context-tool "What decisions have already been made?"
ctx ask ai-context-tool "What is Stella's product proposal?"
ctx digest ai-context-tool --today
```

## MVP Scope

The first version focuses on the smallest useful loop:

- Create projects
- Generate context package templates
- Submit YAML context packages
- Validate package schema
- Store original context packages
- Extract decisions, tasks, risks, and open questions
- Build full-text and vector indexes
- Query project context from the CLI
- Generate daily project digests
- Capture feedback as reviewable context patches
- Rebuild project context from source records

## Design Principles

- YAML is generated from templates and validated before submission, not hand-written from scratch.
- Raw context packages and events are the source of truth (append-only, immutable).
- Project memory is a rebuildable materialized view.
- Feedback creates proposed patches (ContextPatch) instead of directly overwriting decisions.
- Decisions use explicit states such as `draft`, `active`, `deprecated`, and `overridden`.
- Retrieval combines structured queries, full-text search (tsvector), and vector search (pgvector).
- Architecture: lightweight event log + projection views (not full Event Sourcing).
- Concurrency: `pg_advisory_xact_lock` + `project_event_seq` for event ordering.
- LLM usage: deterministic code for extraction, LLM for summarization and Q&A only.

## Example Context Package

```yaml
schema_version: "context-package/v1"

package:
  id: "ctxpkg_20260508_dev_arch_001"
  title: "Context OS V0 Architecture"
  type: "development_context"
  status: "draft"
  created_at: "2026-05-08T21:30:00+08:00"

project:
  id: "context-os"
  name: "Context OS"
  phase: "mvp_design"

author:
  id: "dev_001"
  name: "Dudu"
  role: "developer"

summary: |
  This package summarizes the V0 architecture for a terminal-first
  shared context system for AI-native teams.

decisions:
  - id: "dec_001"
    title: "Use YAML as the context package format"
    detail: "YAML is readable in terminal workflows and easy to parse into structured records."
    confidence: 0.9

tasks:
  - id: "task_001"
    title: "Define context package schema"
    assignee: "Dudu"
    status: "todo"
    priority: "high"

tags:
  - "AI collaboration"
  - "context engineering"
  - "CLI"
  - "MVP"
```

## Planned Architecture

```text
CLI (TypeScript + commander + Zod)
submit / ask / digest / feedback / project / context / validate / template / repair

        ↓

Backend API (NestJS + TypeScript)
users / projects / context packages / query / digest / feedback / patch approval

        ↓

Context Engine
YAML validation (Zod) / deterministic extraction / Decision conflict detection / Reducer

        ↓

Retrieval Engine
structured query / full-text search (tsvector) / vector search (pgvector) / RRF merge

        ↓

Embedding Queue
PostgreSQL job queue / OpenAI API / deduplication cache / batch processing

        ↓

Storage
PostgreSQL 15+ / pgvector / raw YAML files / domain_events log
```

## Tech Stack

- **Backend**: TypeScript + NestJS
- **CLI**: TypeScript + commander + Zod
- **Database**: PostgreSQL 15+ + pgvector
- **Schema**: Zod (exports JSON Schema)
- **Queue**: PostgreSQL job queue (FOR UPDATE SKIP LOCKED)
- **LLM**: OpenAI API (text-embedding-3-small + gpt-4)
- **Deployment**: Docker + Docker Compose (V0)

## Documentation

See the full architecture and design documents:

- **[Architecture Design (V0 Optimized)](docs/context-sharing-architecture.md)** - Complete architecture with technical decisions
- **[Architecture Optimization](docs/.ccb/specs/active/architecture-optimization-v0.md)** - Core technical decisions
- **[Detailed Technical Design](docs/.ccb/specs/active/detailed-technical-design.md)** - Implementation details
- **[Implementation Details Supplement](docs/.ccb/specs/active/implementation-details-supplement.md)** - Final implementation details
- **[Task Breakdown](docs/.ccb/specs/active/task-breakdown-v0.md)** - 25 tasks across 5 phases

## Implementation Plan

- **Total Effort**: 38-48 person-days
- **Timeline**: 6-7 weeks
- **Phases**: 
  1. Infrastructure (Week 1-2)
  2. Core Logic (Week 2-3)
  3. Advanced Features (Week 3-4)
  4. Retrieval & Q&A (Week 4-5)
  5. Polish & Testing (Week 5-6)

## Status

✅ **Design Complete** - Architecture optimized through 3 rounds of Claude + Codex collaboration  
🚀 **Ready for Implementation** - 25 tasks defined, ready to start Phase 1
