# Context OS

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
- Raw context packages and events are the source of truth.
- Project memory is a rebuildable materialized view.
- Feedback creates proposed patches instead of directly overwriting decisions.
- Decisions use explicit states such as `draft`, `active`, `challenged`, `deprecated`, and `overridden`.
- Retrieval combines structured queries, full-text search, vector search, and the current project context.

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
CLI
submit / ask / digest / feedback / project / context

        ↓

Backend API
users / projects / context packages / query / digest / feedback

        ↓

Context Engine
YAML validation / parsing / extraction / summarization / indexing

        ↓

Retrieval Engine
full-text search / vector search / permission filtering

        ↓

Agent Runtime
Project Agent / Personal Agent / Supervisor Agent

        ↓

Storage
PostgreSQL / pgvector / raw YAML files / event log
```

## Documentation

See the full architecture draft:

- [Enterprise Shared Context Collaboration System Architecture](docs/context-sharing-architecture.md)

## Status

Early architecture and MVP design stage.
