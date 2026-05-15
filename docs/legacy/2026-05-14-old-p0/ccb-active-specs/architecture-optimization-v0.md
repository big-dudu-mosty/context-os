# 架构优化方案 V0

## 元信息
- 创建时间: 2026-05-08
- 状态: active
- 复杂度: 高
- 协商轮次: 1 (Codex)

## 目标

将现有概念架构优化为可实施的技术方案，解决已识别的 8 个核心问题：
1. ProjectContext 更新逻辑不明确
2. 权限模型过于简化
3. 向量检索应用场景不清晰
4. 反馈纠偏机制可能导致混乱
5. 缺少数据一致性保证
6. LLM 调用成本和延迟未考虑
7. YAML 格式实际可行性存疑
8. CLI 认证和会话管理缺失

## 核心技术决策

### 决策 1: 轻量事件日志 + 投影视图

**方案**: PostgreSQL 内的轻量事件日志，而非完整 Event Sourcing

**理由**:
- 保持"事实源不可变、提取层可重算、状态可重建"的工程约束
- 避免 V0 引入完整 Event Sourcing 的复杂度（事件建模、回放、投影、版本兼容）
- 使用 PostgreSQL 事务和锁机制保证一致性

**实现**:
```
事实源层（追加写）:
- context_packages: 原始 YAML + metadata
- domain_events: 所有领域事件（context_submitted, feedback_created, patch_applied）
- feedback: 用户反馈意见
- context_patches: 可审批的结构化变更

投影层（可重建）:
- project_contexts: 项目当前状态快照
- decisions: 决策当前状态
- tasks: 任务当前状态
- risks: 风险当前状态
- digests: 简报缓存
```

### 决策 2: 反馈纠偏机制拆分

**方案**: 拆分 Feedback 和 ContextPatch

**Feedback 状态机**:
```
submitted → converted_to_patch → closed
         ↘ needs_clarification
         ↘ rejected
         ↘ withdrawn
```

**ContextPatch 状态机**:
```
proposed → pending_review → approved → applied
         ↘ rejected
         ↘ superseded
         ↘ failed
```

**Decision 生命周期**:
```
draft → active → deprecated
              ↘ overridden
```

**冲突处理**:
- 同一 target 的 destructive patch 进入冲突组
- 审批一个后，其它 pending patch 标记为 `superseded`
- 不自动合并，保留为 competing proposal

### 决策 3: 混合检索策略

**三层检索**:

| 检索类型 | 适用场景 | 实现 |
|---------|---------|------|
| 结构化查询 | 当前状态、active 决策、任务负责人、风险状态、日期范围 | PostgreSQL WHERE + JOIN |
| 全文检索 | 人名、文件名、ID、明确关键词、精确短语 | PostgreSQL `tsvector` + GIN 索引 |
| 向量检索 | 语义相近方案、背景讨论、模糊问题 | pgvector + cosine similarity |

**Embedding 策略**:
- 字段级 chunk: summary, decision, task, risk, open_question, context_for_others
- 每个 chunk 保留元数据: chunk_type, source_field, entity_id, status, created_at, author_id
- 语义相似但结论相反时，向量只召回候选，最终按 Decision.status 和 ProjectContext 裁决

### 决策 4: ProjectContext 更新算法

**同步更新流程** (用户确认):

```
1. 开启事务
2. 解析校验 YAML
3. 保存 raw YAML + hash
4. 写入 context_packages
5. 确定性提取字段 → decisions/tasks/risks/open_questions
6. 写入 domain_events(context_submitted)
7. 获取 pg_advisory_xact_lock(project_id) 或锁定 project_contexts 行
8. 读取 source_event_high_watermark 之后的 events
9. 按确定性顺序执行 reducer
10. upsert project_contexts
11. 更新 high_watermark
12. 提交事务
```

**Reducer 逻辑**:
- 确定性合并规则（不依赖 LLM）
- 新 Decision 直接进入 `active` 状态（用户确认）
- 冲突检测：同名 Decision 保留最新，旧的标记 `overridden`
- 版本号：reducer_version 用于重建时兼容

### 决策 5: 成本与性能优化

**LLM 使用边界**:
- ✅ 使用 LLM: 摘要生成、归类、冲突提示、复杂问答
- ❌ 不用 LLM: schema 校验、字段提取、状态机、reducer

**Embedding 优化**:
- 批处理表: embedding_jobs
- 去重: 按 `chunk_content_hash + embedding_model + embedding_version`
- 失败重试机制

**查询优化**:
- 优先读 ProjectContext 和结构化表
- 只有 hybrid retrieval 后仍需综合表达时才调 LLM
- 目标延迟: 结构化查询 <200ms, hybrid retrieval <1s, LLM 回答流式返回

**队列方案**:
- V0 使用 PostgreSQL job queue: `FOR UPDATE SKIP LOCKED`
- 暂不引入 Redis/BullMQ/Celery

### 决策 6: YAML 工具链

**技术栈**: TypeScript CLI + Zod schema（用户确认）

**工具命令**:
```bash
ctx template <type>        # 生成模板
ctx validate <file>        # 校验 YAML
ctx repair <file>          # 自动修复常见问题
ctx submit <file>          # 提交
```

**AI 生成策略**:
- 推荐: 结构化 JSON → 程序序列化 YAML
- 避免: 让 LLM 直接自由写 YAML
- 外部生成的 YAML: 通过 parser + schema + semantic validator 给出字段级错误

**Schema 共享**:
- Zod schema 导出 JSON Schema
- 前后端复用同一 schema 包

### 决策 7: 权限模型

**V0 简化权限**:

| 角色 | 权限 |
|------|------|
| owner | 所有操作 |
| admin | 提交、查询、反馈、审批 patch |
| member | 提交、查询、反馈 |
| viewer | 查询 |

**操作级控制**:
- submit: member+
- ask: viewer+
- feedback: member+
- approve_patch: admin+
- project_settings: owner

**可见性**:
- project: 项目成员可见
- team: 团队可见
- private: 仅作者和 admin 可见

**V1 扩展方向**:
- 细粒度权限（按 Decision/Task 级别）
- 审批流配置
- 外部集成权限

### 决策 8: CLI 认证与会话

**认证方式**:
- V0: API Token
- V1: OAuth2 / SSO

**会话管理**:
- Token 存储: `~/.ctx/credentials`
- 自动刷新机制
- 多环境支持（dev/staging/prod）

**命令**:
```bash
ctx login                  # 登录
ctx logout                 # 登出
ctx whoami                 # 查看当前用户
ctx config set <key> <val> # 配置
```

## 数据库表设计优化

### 新增表

**domain_events**:
```sql
CREATE TABLE domain_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  INDEX idx_project_events (project_id, id)
);
```

**context_patches**:
```sql
CREATE TABLE context_patches (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  feedback_id UUID REFERENCES feedback(id),
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  patch_type VARCHAR(50) NOT NULL, -- update/deprecate/override
  patch_payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL,
  proposed_by UUID NOT NULL,
  reviewed_by UUID,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**embedding_jobs**:
```sql
CREATE TABLE embedding_jobs (
  id BIGSERIAL PRIMARY KEY,
  chunk_content_hash VARCHAR(64) NOT NULL,
  chunk_content TEXT NOT NULL,
  chunk_metadata JSONB NOT NULL,
  embedding_model VARCHAR(50) NOT NULL,
  embedding_version VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL, -- pending/processing/completed/failed
  embedding VECTOR(1536),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (chunk_content_hash, embedding_model, embedding_version)
);
```

### 修改表

**project_contexts** 增加字段:
```sql
ALTER TABLE project_contexts ADD COLUMN reducer_version VARCHAR(20) NOT NULL DEFAULT 'v1';
ALTER TABLE project_contexts ADD COLUMN source_event_high_watermark BIGINT NOT NULL DEFAULT 0;
ALTER TABLE project_contexts ADD COLUMN last_reduced_at TIMESTAMPTZ;
```

**decisions** 增加字段:
```sql
ALTER TABLE decisions ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE decisions ADD COLUMN supersedes UUID REFERENCES decisions(id);
ALTER TABLE decisions ADD COLUMN overridden_by UUID REFERENCES decisions(id);
ALTER TABLE decisions ADD COLUMN overridden_at TIMESTAMPTZ;
```

## 技术栈确认

**后端**: TypeScript + NestJS（用户确认）
**CLI**: TypeScript + commander + Zod
**数据库**: PostgreSQL 15+ + pgvector
**Schema**: Zod（导出 JSON Schema）
**队列**: PostgreSQL job queue (V0)
**LLM**: OpenAI API（可配置其他 provider）

## 实施复杂度评估

| 模块 | 复杂度 | 工作量估算 |
|------|--------|-----------|
| 数据库表设计 | 中 | 2-3 天 |
| Reducer 逻辑 | 高 | 5-7 天 |
| 混合检索 | 高 | 5-7 天 |
| ContextPatch 审批流 | 中 | 3-4 天 |
| CLI 工具链 | 中 | 4-5 天 |
| 权限系统 | 低 | 2-3 天 |
| Embedding 批处理 | 中 | 3-4 天 |
| 总计 | - | 24-33 天 |

## 风险与缓解

**风险 1**: Reducer 逻辑复杂，难以保证确定性
- 缓解: 充分测试 + 版本号 + 重建验证

**风险 2**: 同步更新 ProjectContext 可能影响提交性能
- 缓解: 优化 reducer 性能 + 监控 + 必要时降级为异步

**风险 3**: ContextPatch 设计不当可能导致审批流混乱
- 缓解: 明确 patch_payload schema + 冲突检测 + 审批前预览

**风险 4**: YAML 工具链用户体验不佳
- 缓解: 提供清晰的错误提示 + repair 命令 + 模板生成

## 未解决问题

1. ContextPatch 的 `base_context_high_watermark` 是否需要？用于审批时检测目标已变化
2. Decision 的 `review_state` 是否需要独立于 `status`？
3. Embedding model 选择（OpenAI text-embedding-3-small vs large）
4. 重建机制的触发时机和验证策略

## 下一步

1. 用户确认技术设计
2. 补充详细的 API 设计文档
3. 补充详细的数据库 schema 文档
4. 拆分实施任务
5. 开始编码实现
