# P0 实施计划（基于新架构）

## 元信息
- 创建时间: 2026-05-09
- 状态: active
- 基于: 2026-05-08 架构优化 + 2026-05-09 新方案讨论
- 协商轮次: 4 轮（Claude + Codex + 新方案调整）

## 核心变化

### 从原方案到新方案的关键调整

| 维度 | 原方案 | 新方案 | 理由 |
|------|--------|--------|------|
| 基础设施 | 自建 CLI + NestJS | Fork Claude Code + 参考 Multica | 快速启动，站在成熟产品上 |
| 捕获机制 | 手动 `ctx submit` | Session stop hook 自动捕获 | 真正的 daily driver |
| 消化机制 | 同步 Reducer | 每晚 Dream consolidation | 质量优先，深度消化 |
| 协作机制 | ContextPatch 审批流 | Task handoff + Morning briefing | 简化 P0，聚焦核心闭环 |
| 身份模型 | 简单用户表 | Sandpile Owner→Agent→Session | 为未来扩展打基础 |

## P0 范围（6 项核心功能）

### 1. 统一入口（Fork Claude Code）

**目标**：提供类似 CCC 的统一入口，支持调用不同 LLM

**实现**：
- Fork Claude Code（CLI + VS Code extension）
- 集成多 LLM 支持（基于 Nano Claude Code）
- 保留 agent loop、tool calling、session lifecycle

**工作量**：2 周

**验收标准**：
- ✅ 可以启动 agent（CLI 和 VS Code）
- ✅ 支持 Claude、GPT-4、Gemini
- ✅ Session 正常工作

---

### 2. 自动 Capture + Dream Consolidation

**目标**：Session 自动捕获，每晚 dream 消化

**实现**：

#### 2.1 Session Auto-Capture
- Session stop hook 自动持久化 transcript
- 写入 `sessions` 表，标记 `dream_status = 'pending'`

#### 2.2 Dream Consolidation
- Cron job 每晚 2:00 触发
- 按 agent 分组处理 pending sessions
- 调用 Dream Prompt（核心 IP）
- 生成 context_package（YAML）

#### 2.3 Dream Prompt 设计
**输入**：
- 今天所有 session transcripts
- 昨天的 context packages
- 相关 projects 的 project_context

**输出**：
```yaml
schema_version: "context-package/v1"

package:
  id: "pkg_20260509_dudu_001"
  title: "Context OS 架构设计与数据库设计"
  type: "development_context"
  created_at: "2026-05-09T02:05:00Z"

project_ids:
  - "context-os"

author:
  id: "dudu_id"
  name: "Dudu"

summary: |
  完成了架构优化方案，确定使用轻量事件日志 + 投影视图...

decisions:
  - id: "dec_001"
    title: "使用轻量事件日志而非完整 Event Sourcing"
    detail: "..."
    confidence: 0.9

tasks:
  - id: "task_001"
    title: "实现 dream consolidation"
    assignee: "Dudu"
    status: "todo"
    priority: "high"

risks:
  - id: "risk_001"
    title: "PostgreSQL advisory lock 性能瓶颈"
    severity: "medium"
    mitigation: "提前 POC 验证"

open_questions:
  - id: "q_001"
    question: "Dream prompt 如何识别项目？"
    priority: "high"

observations:
  - type: "insight"
    content: "发现 pgvector 的 ivfflat 索引在 10k chunks 下性能足够"
    relevance: "architecture"
    confidence: 0.8
    tags: ["performance", "database"]
```

**工作量**：3 周（Dream prompt 是核心 IP，需要持续迭代）

**验收标准**：
- ✅ Session 结束后自动保存
- ✅ 每晚 dream 正常运行
- ✅ 生成的 context package 质量高（80% 有用）
- ✅ Extraction 正确提取 decisions/tasks/risks/observations

---

### 3. Task Handoff（最小形态）

**目标**：成员 A 完成的任务可以交接给成员 B

**实现**：

#### 3.1 `/handoff` 命令
```bash
> /handoff @Stella "架构设计完成，需要你 review"
✅ Handoff created. Stella will see it in their next briefing.
```

#### 3.2 Handoff 数据流
```
A 执行 /handoff
  ↓
创建 handoff_record (status = 'pending')
  ↓
B 启动 agent
  ↓
Briefing 中显示 handoff
  ↓
B 执行 /accept-handoff <id>
  ↓
加载 A 的 session context
```

#### 3.3 数据库表
```sql
CREATE TABLE handoff_records (
  id UUID PRIMARY KEY,
  from_owner_id UUID NOT NULL,
  to_owner_id UUID NOT NULL,
  session_id UUID NOT NULL,
  message TEXT NOT NULL,
  context_summary TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**工作量**：1 周

**验收标准**：
- ✅ `/handoff` 命令正常工作
- ✅ Briefing 中显示 pending handoffs
- ✅ `/accept-handoff` 可以加载 context

---

### 4. Sandpile Identity（最小实现）

**目标**：实现 Owner→Agent→Session 三层身份模型

**实现**：

#### 4.1 数据库表
```sql
-- Owner（用户）
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member'
);

-- Agent（每个 forked Claude Code 实例）
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
);

-- Session（每次对话）
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  transcript_path VARCHAR(500),
  dream_status VARCHAR(20) NOT NULL DEFAULT 'pending'
);
```

#### 4.2 所有 domain_events 带完整 identity
```sql
ALTER TABLE domain_events 
  ADD COLUMN owner_id UUID NOT NULL,
  ADD COLUMN agent_id UUID NOT NULL,
  ADD COLUMN session_id UUID;
```

**工作量**：1 周

**验收标准**：
- ✅ 三层表结构完整
- ✅ 所有事件可追溯到 owner/agent/session
- ✅ 权限检查正常工作

---

### 5. Relaxed Schema（Observations）

**目标**：放宽 extraction schema，增加灵活性

**实现**：

#### 5.1 保留严格字段
- decisions
- tasks
- risks
- open_questions

#### 5.2 新增 observations 槽位
```sql
CREATE TABLE observations (
  id UUID PRIMARY KEY,
  package_id UUID NOT NULL,
  project_id UUID,
  type VARCHAR(50) NOT NULL,  -- insight | concern | idea | question
  content TEXT NOT NULL,
  relevance VARCHAR(50),  -- architecture | implementation | process | product
  confidence DECIMAL(3,2),
  tags TEXT[],
  owner_id UUID NOT NULL
);
```

#### 5.3 约束
- 每个 package 最多 10 条 observations
- 必须有 type 和 relevance
- Dream 时，confidence > 0.8 的 insight 可能升级为 decision

**工作量**：0.5 周

**验收标准**：
- ✅ Observations 表创建
- ✅ Extraction 正确提取 observations
- ✅ 约束生效

---

### 6. Morning Briefing

**目标**：每天早上启动 agent 时看到有价值的 briefing

**实现**：

#### 6.1 Briefing 生成逻辑
```typescript
async function generateBriefing(userId: string): Promise<string> {
  // 1. 查询用户昨天的 context packages
  const myPackages = await getMyPackages(userId, 1);
  
  // 2. 查询团队其他人的 packages
  const teamPackages = await getTeamPackages(userId, 1);
  
  // 3. 查询 pending handoffs
  const handoffs = await getPendingHandoffs(userId);
  
  // 4. 查询项目状态变化
  const projectUpdates = await getProjectUpdates(userId);
  
  // 5. 调用 Briefing Prompt
  const briefing = await callBriefingPrompt({
    myPackages,
    teamPackages,
    handoffs,
    projectUpdates
  });
  
  return briefing;
}
```

#### 6.2 Briefing 格式
```
早上好，Dudu！

【我昨晚的思考】
- 确定了轻量事件日志方案
- 完成了数据库 schema 设计
- 发现 PostgreSQL advisory lock 可能有性能瓶颈

【团队动态】
- Stella 完成了产品需求文档

【需要我关注的】
- [Handoff] Stella 等待你 review 架构设计
  /accept-handoff 1 | /discuss-handoff 1

【项目状态】
- Context OS: 架构设计 90% 完成
```

#### 6.3 生成时机
- 按需生成（用户启动 agent 时）
- 异步 + 流式显示
- 缓存 1 小时（避免重复生成）

**工作量**：1 周

**验收标准**：
- ✅ Briefing 包含 4 个部分
- ✅ 生成时间 < 5 秒
- ✅ 内容有价值（用户反馈）

---

## 数据库 Schema（完整版）

### 核心表

```sql
-- ============================================
-- 身份层
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_agents_owner (owner_id, status)
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  transcript_path VARCHAR(500),
  transcript_hash VARCHAR(64),
  dream_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  dreamed_at TIMESTAMPTZ,
  
  INDEX idx_sessions_agent (agent_id, started_at DESC),
  INDEX idx_sessions_dream (dream_status, started_at) WHERE dream_status = 'pending',
  
  CONSTRAINT chk_sessions_owner_match CHECK (
    owner_id = (SELECT owner_id FROM agents WHERE id = agent_id)
  )
);

-- ============================================
-- 项目层
-- ============================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_id BIGSERIAL UNIQUE,
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE (project_id, user_id)
);

-- ============================================
-- 事件与上下文层
-- ============================================

CREATE TABLE domain_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id),
  project_event_seq BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id UUID NOT NULL,
  
  owner_id UUID NOT NULL REFERENCES users(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  session_id UUID REFERENCES sessions(id),
  
  payload JSONB NOT NULL,
  idempotency_key VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_project_event_seq UNIQUE (project_id, project_event_seq),
  CONSTRAINT uq_idempotency_key UNIQUE (project_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL,
  
  INDEX idx_domain_events_project (project_id, project_event_seq)
);

CREATE TABLE context_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(20) NOT NULL,
  source_sessions UUID[] NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  raw_yaml TEXT NOT NULL,
  raw_yaml_hash VARCHAR(64) NOT NULL,
  project_ids UUID[] NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_context_packages_owner (owner_id, created_at DESC),
  INDEX idx_context_packages_projects (project_ids) USING GIN
);

CREATE TABLE session_packages (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES context_packages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (session_id, package_id)
);

-- ============================================
-- 提取层
-- ============================================

CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  decision_key VARCHAR(200) NOT NULL,
  title VARCHAR(500) NOT NULL,
  detail TEXT,
  confidence DECIMAL(3,2),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  supersedes_decision_id UUID REFERENCES decisions(id),
  conflict_group_id UUID,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_decision_key_active_no_conflict 
    UNIQUE (project_id, decision_key, status) 
    WHERE status = 'active' AND conflict_group_id IS NULL,
  
  INDEX idx_decisions_project (project_id, status, created_at DESC)
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  priority VARCHAR(20),
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_tasks_project (project_id, status),
  INDEX idx_tasks_assignee (assignee_id, status)
);

CREATE TABLE risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  mitigation TEXT,
  severity VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_risks_project (project_id, status)
);

CREATE TABLE open_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  question TEXT NOT NULL,
  context TEXT,
  priority VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_open_questions_project (project_id, status)
);

CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID REFERENCES projects(id),
  type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  relevance VARCHAR(50),
  confidence DECIMAL(3,2),
  tags TEXT[],
  related_to_type VARCHAR(50),
  related_to_id UUID,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_observations_package (package_id),
  INDEX idx_observations_project (project_id, type) WHERE project_id IS NOT NULL,
  INDEX idx_observations_tags (tags) USING GIN
);

-- ============================================
-- 投影层
-- ============================================

CREATE TABLE project_contexts (
  project_id UUID PRIMARY KEY REFERENCES projects(id),
  current_summary TEXT,
  current_direction TEXT,
  current_progress JSONB,
  active_decisions JSONB,
  active_tasks JSONB,
  open_questions JSONB,
  risks JSONB,
  reducer_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  source_project_event_seq_watermark BIGINT NOT NULL DEFAULT 0,
  last_reduced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 协作层
-- ============================================

CREATE TABLE handoff_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_owner_id UUID NOT NULL REFERENCES users(id),
  to_owner_id UUID NOT NULL REFERENCES users(id),
  session_id UUID NOT NULL REFERENCES sessions(id),
  message TEXT NOT NULL,
  context_summary TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_handoff_to (to_owner_id, status, created_at DESC),
  INDEX idx_handoff_from (from_owner_id, created_at DESC)
);

CREATE TABLE briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  content TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  
  UNIQUE (owner_id, date)
);

-- ============================================
-- 检索层
-- ============================================

CREATE TABLE context_index_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID REFERENCES projects(id),
  chunk_type VARCHAR(50) NOT NULL,
  source_field VARCHAR(100) NOT NULL,
  entity_id UUID,
  entity_status VARCHAR(20),
  chunk_content TEXT NOT NULL,
  chunk_content_hash VARCHAR(64) NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_chunks_package (package_id),
  INDEX idx_chunks_project (project_id, chunk_type) WHERE project_id IS NOT NULL
);

CREATE TABLE embedding_jobs (
  id BIGSERIAL PRIMARY KEY,
  chunk_id UUID NOT NULL REFERENCES context_index_chunks(id),
  chunk_content_hash VARCHAR(64) NOT NULL,
  chunk_content TEXT NOT NULL,
  embedding_model VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',
  embedding_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  CONSTRAINT uq_chunk_embedding UNIQUE (chunk_id, embedding_model, embedding_version),
  
  INDEX idx_embedding_jobs_pending (status, next_run_at) WHERE status = 'pending'
);

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

## 时序与触发逻辑

### Cron Jobs

#### 1. Dream Consolidation
- **时间**：每天凌晨 2:00
- **Cron**：`0 2 * * *`
- **逻辑**：
  1. 查询昨天 pending sessions
  2. 按 agent 分组
  3. 对每个 agent 执行 dream
  4. 生成 context_package
  5. Extraction
  6. Reduce project_context
  7. 创建 embedding_jobs

#### 2. Embedding Worker
- **时间**：每 5 分钟
- **Cron**：`*/5 * * * *`
- **逻辑**：
  1. 获取 pending jobs (FOR UPDATE SKIP LOCKED)
  2. 检查缓存
  3. 调用 OpenAI API
  4. 保存到 embedding_results
  5. 更新 job 状态

### Hooks

#### 1. Session Stop Hook
- **触发**：Session 结束时
- **逻辑**：
  1. 保存 transcript
  2. 更新 sessions 表
  3. 标记 dream_status = 'pending'

#### 2. Session Start Hook
- **触发**：Session 开始时
- **逻辑**：
  1. 创建 session 记录
  2. 生成 briefing
  3. 显示 briefing

### 命令

1. `/handoff @user "message"` - 交接任务
2. `/dream-now` - 立即触发 dream
3. `/accept-handoff <id>` - 接受交接
4. `/discuss-handoff <id>` - 讨论交接
5. `/project <slug>` - 标记项目
6. `/today` - 查看 briefing
7. `/ask <project> "<question>"` - 查询项目

## 实施计划

### Week 1-2: 基础设施
- Fork Claude Code
- 搭建开发环境
- 集成多 LLM 支持
- 数据库 schema 实现

### Week 3: Identity + Capture
- 实现 Sandpile Identity
- 实现 Session auto-capture
- 实现 stop hook

### Week 4-6: Dream（核心）
- Week 4: Single-session dream
- Week 5: Multi-session consolidation
- Week 6: Dream prompt 迭代优化

### Week 7: Briefing + Handoff
- 实现 Morning briefing
- 实现 Task handoff
- 集成到 briefing

### Week 8-9: Integration + Polish
- 端到端测试
- 性能优化
- 文档
- 团队 dogfooding

### Week 10: Buffer
- 处理意外问题
- 最后的 polish

## 成功标准

P0 完成的标志：

1. ✅ **每天都用**：团队所有人每天启动 agent 工作
2. ✅ **Briefing 有价值**：每天早上的 briefing 包含至少 3 条有用信息
3. ✅ **Handoff 发生**：每周至少发生 5 次 task handoff
4. ✅ **Context 累积**：项目 context 每周增长，查询能找到历史决策
5. ✅ **Dream 质量**：80% 的 dream 输出被认为"有用"

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Dream prompt 质量不达标 | 高 | 持续迭代，每周 review |
| Fork Claude Code 理解成本高 | 中 | 先理解核心机制，逐步扩展 |
| Briefing 生成太慢 | 中 | 异步 + 流式，优化 prompt |
| Handoff 使用频率低 | 中 | 简化流程，降低摩擦 |
| 工作量超预期 | 中 | 分阶段交付，优先核心功能 |

## 技术栈

- **Personal Agent**: Forked Claude Code (CLI + VS Code extension)
- **Backend**: TypeScript + NestJS
- **Database**: PostgreSQL 15+ + pgvector
- **Schema**: Zod (exports JSON Schema)
- **Queue**: PostgreSQL job queue (FOR UPDATE SKIP LOCKED)
- **LLM**: OpenAI API (text-embedding-3-small + gpt-4)
- **Deployment**: Docker + Docker Compose (V0)

## 参考文档

- Claude Code: https://github.com/anthropics/claude-code
- Nano Claude Code: https://github.com/anthropics/nano-claude-code
- Multica: https://github.com/multica-ai/multica
- Sandpile Protocol: (内部文档)
