# AI Context Workbench

AI Context Workbench 是一个面向个人和团队的 AI 工作台。

当前新版产品逻辑已经从旧的 terminal-first Context OS 方案，调整为：

```text
AI 对话
-> Artifact 草稿
-> 用户确认保存
-> Company / Project Context
-> 结构化提取
-> Briefing / Handoff / 任务说明 / 邮件草稿
```

## 当前权威文档

请以后续实现优先参考：

- [项目逻辑与架构总览](docs/project-logic-and-architecture.md)
- [整体架构图](docs/diagrams/overall-architecture.md)
- [前端页面结构图](docs/diagrams/frontend-page-structure.md)
- [前端三栏 Workbench 图](docs/diagrams/frontend-workbench.md)
- [右侧动态面板模式图](docs/diagrams/right-panel-modes.md)
- [产品主流程图](docs/diagrams/product-main-flow.md)
- [内容状态流转图](docs/diagrams/content-state-flow.md)
- [后端最小闭环图](docs/diagrams/backend-minimal-loop.md)
- [前端页面职责图](docs/diagrams/frontend-page-responsibilities.md)
- [前端 HTML 原型](docs/prototypes/ai_context_collab_prototype_attach_label_fixed.html)

旧 P0 文档已经移入：

```text
docs/legacy/2026-05-14-old-p0/
```

这些旧文档仅作为历史参考，不再作为后续实现依据。

## 当前代码状态

当前后端已经实现旧 P0 的一部分能力：

```text
Session transcript
-> Dream
-> ContextPackage
-> Extraction
-> Decisions / Tasks / Risks / Questions / Observations
-> Briefing / Handoff / Query
```

后续要补齐新版主链路：

```text
folders
messages
artifacts
archived_documents
session_attachments
ChatService
ArtifactService
ArchiveService
DraftService
```

## 后端技术栈

- TypeScript + Express
- PostgreSQL 15 + pgvector
- node-pg-migrate
- OpenAI-compatible Chat Completions API
- node-cron
- Docker Compose + Node.js

## 本地启动旧 P0 后端

当前启动方式仍然保留：

```bash
cd backend
npm install
npm run db:up
npm run migrate:up
npm run server
```

健康检查：

```bash
curl http://localhost:3000/health
```

注意：当前 API 仍是旧 P0 后端能力，尚未完全接入新版 AI Context Workbench 链路。
