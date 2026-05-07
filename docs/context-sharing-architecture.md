# 企业共享上下文协作系统架构设计（V0 优化版）

> **文档状态**: 已优化 | **最后更新**: 2026-05-08  
> **协商轮次**: 3 轮 (Claude + Codex)  
> **实施状态**: 设计完成，可进入实施

## 1. 项目一句话

用户通过终端提交自己和 AI 协作后压缩出的上下文包，系统将其存入共享数据库并建立索引；团队成员随后可以通过终端查询项目进度、项目方向、成员方案、历史决策和自动生成的简报，实现团队上下文共享与协作。

## 2. 项目定位

本项目第一版不是一个完整的企业知识库，也不是一个自动监听所有 AI 对话的平台，而是一个终端优先的团队上下文共享系统。

核心思路是：

```text
个人 AI 负责思考
YAML 作为机器生成、人审阅的提交包
CLI 负责入口
数据库负责沉淀
索引负责检索
ProjectContext 作为可重建的项目记忆快照
Agent 负责回答和整理
Digest 负责同步
Feedback 作为待审批的校准提案
```

第一阶段要验证的不是复杂 UI，而是这个闭环：

```text
个人上下文包提交
-> 项目上下文沉淀
-> 终端查询
-> 简报同步
-> 反馈纠偏
```

## 2.1 关键工程约束

为了避免系统退化成"上传 YAML 后让 LLM 总结一下"，第一版设计需要满足以下工程约束：

```text
ContextPackage / Event 是事实源（追加写，不可变）
ContextIndex / Decision / Task / Risk 是提取层（可重算）
ProjectContext 是可重建的物化视图
Feedback 先生成校准提案（ContextPatch），不直接覆盖当前结论
Decision 必须有状态机和历史记录
检索使用全文 + 向量 + 结构化字段的混合策略
所有提取、索引、压缩流程必须带版本号
所有项目当前状态必须可以从原始 YAML 和事件日志重建
```

这意味着系统里有三类数据：

```text
原始事实：原始 YAML、domain_events、feedback，不轻易修改。
结构化提取：decisions、tasks、risks、open_questions、context_index_chunks，可以重算。
当前快照：ProjectContext、Digest，可以从事实源重新生成。
```

**核心架构模式**：轻量事件日志 + 投影视图（而非完整 Event Sourcing）

YAML 文件也不要求用户手写。正确使用方式是：

```text
CLI 提供模板
个人 AI 根据模板生成 YAML（推荐：结构化 JSON → 程序序列化 YAML）
用户审阅
CLI 做 schema 校验
校验通过后再提交
```

## 3. 核心业务闭环

完整工作流如下：

```text
个人在自己的 AI 工具中对话、思考、开发或写方案
-> 个人 AI 基于模板将对话和思路压缩成标准 YAML 上下文包
-> 用户本地执行 validate，修正格式问题
-> 用户通过 CLI 提交 YAML 文件
-> 后端获取项目锁（pg_advisory_xact_lock）
-> 分配 project_event_seq
-> 校验 YAML schema
-> 保存原始 YAML 文件路径、hash 和 metadata
-> 确定性提取结构化字段（不使用 LLM）
-> 写入 domain_events
-> 执行 Reducer 更新 ProjectContext（同步）
-> 更新 source_project_event_seq_watermark
-> 提交事务（释放锁）
-> 异步生成 embedding
-> 团队成员通过 CLI 查询项目状态、成员方案、历史决策
-> 系统按天生成项目简报
-> 管理者或负责人通过 Feedback 提交纠偏提案
-> 系统生成 ContextPatch（待审批的结构化变更）
-> 有权限的人审批后应用 patch
```

这个闭环的关键是：每个人不需要暴露完整聊天记录，只提交一份压缩后的上下文包。系统不直接把所有内容混在一起，而是负责解析、索引、归档、检索和治理。

## 4. 整体系统架构

```text
CLI 终端入口
submit / ask / digest / feedback / project / context / validate / template / repair

        ↓

Backend API (NestJS + TypeScript)
用户管理 / 项目管理 / 上下文提交 / 查询问答 / 简报生成 / 反馈处理 / Patch 审批

        ↓

Context Engine
YAML 校验 (Zod) / 确定性字段提取 / Decision 冲突检测 / Reducer 执行

        ↓

Retrieval Engine
结构化查询 / 全文检索 (tsvector) / 向量检索 (pgvector) / RRF 合并 / 状态标注

        ↓

Embedding Queue
PostgreSQL job queue / OpenAI API / 去重缓存 / 批处理

        ↓

Storage
PostgreSQL 15+ / pgvector / 原始 YAML 文件 / domain_events 日志
```

## 5. 核心技术决策

### 5.1 数据一致性与并发控制

**方案**：轻量事件日志 + 投影视图

**实现**：
- 事实源层（追加写）：`context_packages`、`domain_events`、`feedback`、`context_patches`
- 投影层（可重建）：`project_contexts`、`decisions`、`tasks`、`risks`、`digests`
- 并发控制：`pg_advisory_xact_lock(projects.lock_id)` + `project_event_seq`
- 更新模式：同步更新 ProjectContext（保证 read-your-writes）

**关键流程**：
```
1. 获取项目锁
2. 分配 project_event_seq（在锁内，保证顺序）
3. 写入 domain_events
4. 执行确定性 Reducer
5. 更新 ProjectContext 和 watermark
6. 提交事务
```

### 5.2 反馈纠偏机制

**方案**：拆分 Feedback 和 ContextPatch

**Feedback**（用户意见）：
```
submitted → converted_to_patch → closed
         ↘ needs_clarification / rejected / withdrawn
```

**ContextPatch**（可审批的结构化变更）：
```
proposed → pending_review → approved → applying → applied
         ↘ rejected / superseded / stale / failed
```

**Decision 生命周期**：
```
draft → active → deprecated / overridden
```

**冲突处理**：
- 同 `decision_key` 但无显式 `supersedes` 关系时，生成 `conflict_group_id`
- 两个 Decision 都保留为 `active`，但标记冲突
- 需要人工通过 ContextPatch 解决

### 5.3 混合检索策略

**三层检索**：

| 检索类型 | 适用场景 | 权重 |
|---------|---------|------|
| 结构化查询 | 当前状态、active 决策、任务负责人、日期范围 | 3.0 |
| 全文检索 | 人名、文件名、ID、明确关键词 | 2.0 |
| 向量检索 | 语义相近方案、背景讨论、模糊问题 | 1.0 |

**合并策略**：RRF (Reciprocal Rank Fusion) + 加权 + Boost

**Embedding 策略**：
- 字段级 chunk：summary、decision、task、risk、open_question、context_for_others
- 模型：text-embedding-3-small (1536 维)
- 去重：按 `chunk_content_hash + embedding_model + embedding_version`
- 批处理：PostgreSQL job queue (FOR UPDATE SKIP LOCKED)

**状态标注**：
- 优先展示 `active` 状态的内容
- 标注 `overridden`（已被覆盖）、`deprecated`（已废弃）
- 展示 `supersedes` 关系链

### 5.4 成本与性能优化

**LLM 使用边界**：
- ✅ 使用：摘要生成、归类、冲突提示、复杂问答
- ❌ 不用：schema 校验、字段提取、状态机、reducer

**性能目标**：
- 结构化查询：< 200ms
- 混合检索：< 1s
- LLM 问答：流式返回

**优化策略**：
- Embedding 批处理 + 去重缓存
- 向量检索 overfetch 10x（V0）
- 优先读 ProjectContext 和结构化表
- V0 使用 PostgreSQL job queue，暂不引入 Redis

### 5.5 权限模型

**V0 角色**：

| 角色 | 权限 |
|------|------|
| owner | 所有操作 |
| admin | 提交、查询、反馈、审批 patch |
| member | 提交、查询、反馈 |
| viewer | 查询 |

**可见性**：
- `project`: 项目成员可见
- `team`: 团队可见
- `private`: 仅作者和 admin 可见

### 5.6 YAML 工具链

**技术栈**：TypeScript CLI + Zod schema

**工具命令**：
```bash
ctx template <type>        # 生成模板
ctx validate <file>        # 校验 YAML
ctx repair <file>          # 自动修复常见问题
ctx submit <file>          # 提交
```

**AI 生成策略**：
- 推荐：结构化 JSON → 程序序列化 YAML
- 避免：让 LLM 直接自由写 YAML

## 6. 数据库表设计

### 6.1 核心表

**projects**：
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  lock_id BIGSERIAL UNIQUE, -- 用于 pg_advisory_xact_lock
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**domain_events**（事件日志）：
```sql
CREATE TABLE domain_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  project_event_seq BIGINT NOT NULL, -- 项目内严格递增
  event_type VARCHAR(50) NOT NULL,
  event_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key VARCHAR(100),
  correlation_id UUID,
  causation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_project_event_seq UNIQUE (project_id, project_event_seq),
  CONSTRAINT uq_idempotency_key UNIQUE (project_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL
);

CREATE INDEX idx_project_events ON domain_events (project_id, project_event_seq);
CREATE INDEX idx_aggregate_events ON domain_events (aggregate_type, aggregate_id, project_event_seq);
CREATE INDEX idx_event_type_time ON domain_events (project_id, event_type, created_at DESC);
```

**context_packages**（原始 YAML）：
```sql
CREATE TABLE context_packages (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  author_id UUID NOT NULL,
  title VARCHAR(500) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  raw_yaml_path VARCHAR(500) NOT NULL,
  raw_yaml_hash VARCHAR(64) NOT NULL,
  source_type VARCHAR(50),
  visibility VARCHAR(20) NOT NULL DEFAULT 'project',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**decisions**（决策投影）：
```sql
CREATE TABLE decisions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  package_id UUID REFERENCES context_packages(id),
  source_type VARCHAR(20) NOT NULL DEFAULT 'package',
  source_patch_id UUID REFERENCES context_patches(id),
  decision_key VARCHAR(200) NOT NULL,
  title VARCHAR(500) NOT NULL,
  detail TEXT,
  owner_id UUID,
  confidence DECIMAL(3,2),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  supersedes_decision_id UUID REFERENCES decisions(id),
  overridden_by_decision_id UUID,
  overridden_at TIMESTAMPTZ,
  conflict_group_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_decision_key_active_no_conflict 
    UNIQUE (project_id, decision_key, status) 
    WHERE status = 'active' AND conflict_group_id IS NULL,
  
  CONSTRAINT chk_decision_source 
    CHECK (
      (source_type = 'package' AND package_id IS NOT NULL AND source_patch_id IS NULL) OR
      (source_type = 'patch' AND source_patch_id IS NOT NULL AND package_id IS NULL)
    )
);

CREATE INDEX idx_decision_project ON decisions (project_id, status, created_at DESC);
CREATE INDEX idx_decision_supersedes ON decisions (supersedes_decision_id);
CREATE INDEX idx_decision_conflict_group ON decisions (conflict_group_id);
```

**project_contexts**（项目当前状态）：
```sql
CREATE TABLE project_contexts (
  project_id UUID PRIMARY KEY,
  current_summary TEXT,
  current_direction TEXT,
  current_progress JSONB,
  active_decisions JSONB,
  active_tasks JSONB,
  open_questions JSONB,
  risks JSONB,
  member_updates JSONB,
  reducer_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  source_project_event_seq_watermark BIGINT NOT NULL DEFAULT 0,
  last_reduced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**feedback**（用户反馈）：
```sql
CREATE TABLE feedback (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  author_id UUID NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  converted_patch_id UUID REFERENCES context_patches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**context_patches**（结构化变更提案）：
```sql
CREATE TABLE context_patches (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  feedback_id UUID REFERENCES feedback(id),
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  patch_type VARCHAR(50) NOT NULL,
  patch_payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'proposed',
  proposed_by UUID NOT NULL,
  reviewed_by UUID,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 6.2 Embedding 相关表

**context_index_chunks**（chunk 元数据）：
```sql
CREATE TABLE context_index_chunks (
  id UUID PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL,
  chunk_type VARCHAR(50) NOT NULL,
  source_field VARCHAR(100) NOT NULL,
  entity_id UUID,
  entity_status VARCHAR(20),
  chunk_content TEXT NOT NULL,
  chunk_content_hash VARCHAR(64) NOT NULL,
  author_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunk_project ON context_index_chunks (project_id, chunk_type, entity_status);
```

**embedding_jobs**（任务队列）：
```sql
CREATE TABLE embedding_jobs (
  id BIGSERIAL PRIMARY KEY,
  chunk_id UUID NOT NULL REFERENCES context_index_chunks(id),
  chunk_content_hash VARCHAR(64) NOT NULL,
  chunk_content TEXT NOT NULL,
  embedding_model VARCHAR(50) NOT NULL,
  embedding_version VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT uq_chunk_embedding UNIQUE (chunk_id, embedding_model, embedding_version)
);

CREATE INDEX idx_embedding_jobs_pending ON embedding_jobs (status, next_run_at) 
  WHERE status = 'pending';
```

**embedding_results**（去重缓存）：
```sql
CREATE TABLE embedding_results (
  id BIGSERIAL PRIMARY KEY,
  chunk_content_hash VARCHAR(64) NOT NULL,
  embedding_model VARCHAR(50) NOT NULL,
  embedding_version VARCHAR(20) NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_embedding_cache UNIQUE (chunk_content_hash, embedding_model, embedding_version)
);

CREATE INDEX idx_embedding_vector ON embedding_results 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## 7. 技术栈

- **后端**: TypeScript + NestJS
- **CLI**: TypeScript + commander + Zod
- **数据库**: PostgreSQL 15+ + pgvector
- **Schema**: Zod（导出 JSON Schema）
- **队列**: PostgreSQL job queue (FOR UPDATE SKIP LOCKED)
- **LLM**: OpenAI API (text-embedding-3-small + gpt-4)
- **测试**: Jest + Supertest
- **部署**: Docker + Docker Compose (V0)

## 8. MVP 范围

V0 必须做：

```text
✅ 项目创建
✅ YAML 上下文包提交（同步更新 ProjectContext）
✅ YAML schema 校验（Zod）
✅ 确定性字段提取（不使用 LLM）
✅ 结构化入库
✅ 全文检索（tsvector）
✅ 向量检索（pgvector）
✅ 混合检索（RRF + 加权）
✅ 项目问答（LLM）
✅ 每日简报
✅ 反馈纠偏（Feedback + ContextPatch + 审批流）
✅ 权限系统（角色 + 操作级）
✅ CLI 认证（API Token）
✅ YAML 工具链（template/validate/repair）
```

V0 暂时不做：

```text
❌ 复杂 Web 前端
❌ 自动监听所有 AI 对话
❌ 飞书/Slack 全量集成
❌ 复杂企业权限审批
❌ 多人共同编辑文档
❌ Excel 浏览器
❌ 完整工作流引擎
```

## 9. 实施计划

### Phase 1: 基础设施（Week 1-2）
- DB schema + migration
- POC: 并发事件顺序验证
- NestJS 项目骨架 + ORM
- CLI 项目骨架 + YAML schema

### Phase 2: 核心逻辑（Week 2-3）
- 确定性字段提取器
- ProjectContext Reducer
- POC: Reducer 重建一致性
- 上下文提交 API + CLI
- POC: Hybrid Retrieval 性能（提前）

### Phase 3: 高级功能（Week 3-4）
- ContextPatch schema + 状态机
- POC: Patch 并发审批
- Feedback API + CLI
- Embedding job queue
- POC: Embedding 幂等性

### Phase 4: 检索与问答（Week 4-5）
- 混合检索实现
- POC: 检索正确性
- LLM 问答集成
- Ask API + CLI
- Digest 生成

### Phase 5: 完善与测试（Week 5-6）
- 权限系统
- CLI 认证与会话管理
- YAML repair 工具
- POC: YAML repair UX
- 集成测试与文档

**总工作量**: 38-48 人天  
**预计周期**: 6-7 周

## 10. 关键设计原则

### 10.1 原始记录和当前结论分离

```text
原始 YAML 和 domain_events 是历史事实，不轻易修改。
ProjectContext 是当前结论，可以被更新。
所有状态可以从事实源重建。
```

### 10.2 人工确定项目边界，AI 负责整理

```text
项目大方向由人确定。
AI 负责归类、摘要、索引、压缩和检索。
高影响决策必须由人兜底。
```

### 10.3 先做上下文闭环，再做复杂 UI

```text
第一版的核心风险不是界面，而是上下文是否能沉淀、检索、复用和纠偏。
```

### 10.4 权限要早设计

```text
即使 V0 简化权限，也要在数据结构里预留 visibility、role、project_members 等字段。
```

### 10.5 所有重要行为都要记录 Event

```text
提交、查询、反馈、纠偏、简报生成都应该进入 domain_events。
```

### 10.6 确定性优先，LLM 辅助

```text
Schema 校验、字段提取、状态机、Reducer 全部用确定性代码。
LLM 只用于摘要、归类、冲突提示、复杂问答。
```

## 11. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 并发事件跳号 | 高 | project_event_seq + POC 验证 |
| Reducer 不确定性 | 高 | 充分测试 + 重建一致性 POC |
| ContextPatch 审批混乱 | 中 | Typed schema + 冲突检测 + POC |
| Hybrid retrieval 性能不达标 | 中 | 提前 POC 验证 |
| YAML 工具链体验差 | 中 | repair 工具 + UX POC |
| 工作量超预期 | 中 | 分阶段交付，优先核心功能 |

## 12. 演进路线

### V0：本地 Demo（当前版本）
```text
CLI
PostgreSQL + pgvector
确定性提取 + LLM 问答
submit / ask / digest / feedback
权限系统基础
```

### V1：团队协作版
```text
多用户
项目成员管理
完整权限系统
多人提交
反馈纠偏审批流
项目活动流
```

### V2：Agent 协作版
```text
Personal Agent
Project Agent
Supervisor Agent
自动生成周报
上下文冲突检测
主动通知相关成员
```

### V3：外部接入
```text
GitHub
飞书
Slack
Notion
VS Code
实验数据平台
```

### V4：Web 产品化
```text
项目空间
上下文浏览
简报 inbox
管理者反馈面板
权限管理
可视化项目进度
```

## 13. 总结

这个项目第一阶段的本质是：

```text
每个人把自己和 AI 协作后的压缩上下文，用 YAML 文件提交到共享项目库。
系统通过轻量事件日志 + 投影视图机制解析这些 YAML，沉淀为项目记忆。
团队通过终端查询、生成简报和进行反馈纠偏。
所有状态可以从原始数据重建，保证数据一致性和可审计性。
```

如果这个闭环跑通，后续再接入 Web、VS Code、GitHub、飞书、Slack 和自动化 Agent，系统就可以从一个 CLI demo 演进成真正的企业级 AI 原生团队协作工具。

---

## 附录：详细设计文档

完整的技术设计和实施计划请参考：

- **架构优化方案**: `docs/.ccb/specs/active/architecture-optimization-v0.md`
- **详细技术设计**: `docs/.ccb/specs/active/detailed-technical-design.md`
- **实施细节补充**: `docs/.ccb/specs/active/implementation-details-supplement.md`
- **任务切片**: `docs/.ccb/specs/active/task-breakdown-v0.md`
