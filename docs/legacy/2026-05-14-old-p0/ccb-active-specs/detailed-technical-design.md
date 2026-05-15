# 详细技术设计补充

## 元信息
- 创建时间: 2026-05-08
- 基于: architecture-optimization-v0.md
- 协商轮次: 2 (Codex 第二轮反馈)
- 状态: active

## 1. 并发事件顺序修正

### 问题
当前流程先写 `domain_events` 再获取项目锁，可能导致：
- 事务 A 写入 event_id=100
- 事务 B 写入 event_id=101
- 事务 B 先提交，reducer 处理到 watermark=101
- 事务 A 后提交，event_id=100 被跳过

### 解决方案：项目级事件序列号

**修正后的提交流程**:
```
1. 开启事务
2. 获取 pg_advisory_xact_lock(project_id) -- 提前到这里
3. 分配 project_event_seq = SELECT COALESCE(MAX(project_event_seq), 0) + 1 
   FROM domain_events WHERE project_id = ?
4. 解析校验 YAML
5. 保存 raw YAML + hash
6. 写入 context_packages
7. 确定性提取字段 → decisions/tasks/risks
8. 写入 domain_events (包含 project_event_seq)
9. 执行 reducer (已持有锁)
10. upsert project_contexts
11. 更新 source_project_event_seq_watermark
12. 提交事务 (释放锁)
```

**domain_events 表结构修正**:
```sql
CREATE TABLE domain_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  project_event_seq BIGINT NOT NULL,
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
);

CREATE INDEX idx_project_events ON domain_events (project_id, project_event_seq);
CREATE INDEX idx_aggregate_events ON domain_events (aggregate_type, aggregate_id, project_event_seq);
CREATE INDEX idx_event_type_time ON domain_events (project_id, event_type, created_at DESC);
```

**字段说明**:
- `project_event_seq`: 项目内严格递增的序列号，在项目锁内分配
- `event_version`: 事件 schema 版本，用于未来兼容
- `idempotency_key`: 幂等性保证，防止重复提交
- `correlation_id`: 关联同一业务流程的多个事件
- `causation_id`: 因果关系追踪

**project_contexts 表修正**:
```sql
ALTER TABLE project_contexts 
  DROP COLUMN source_event_high_watermark,
  ADD COLUMN source_project_event_seq_watermark BIGINT NOT NULL DEFAULT 0;
```

## 2. Decision 合并规则明确化

### 问题
"同名 Decision 保留最新"规则不够确定，容易误覆盖。

### 解决方案：显式关系 + 冲突检测

**Decision 表结构修正**:
```sql
CREATE TABLE decisions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  package_id UUID NOT NULL REFERENCES context_packages(id),
  decision_key VARCHAR(200) NOT NULL, -- 新增：唯一标识
  title VARCHAR(500) NOT NULL,
  detail TEXT,
  owner_id UUID,
  confidence DECIMAL(3,2),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  supersedes_decision_id UUID REFERENCES decisions(id),
  overridden_by_decision_id UUID, -- 投影字段，不是事实源
  overridden_at TIMESTAMPTZ,
  conflict_group_id UUID, -- 新增：冲突组
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT uq_decision_key_active UNIQUE (project_id, decision_key, status) 
    WHERE status = 'active'
);

CREATE INDEX idx_decision_project ON decisions (project_id, status, created_at DESC);
CREATE INDEX idx_decision_supersedes ON decisions (supersedes_decision_id);
CREATE INDEX idx_decision_conflict_group ON decisions (conflict_group_id);
```

**合并规则**:

1. **有显式 supersedes 关系**:
   ```
   新 Decision 包含 supersedes_decision_id
   → 旧 Decision 标记 status='overridden', overridden_by_decision_id=新ID
   → 新 Decision 进入 active
   ```

2. **无显式关系但 decision_key 相同**（用户确认）:
   ```
   检测到同 decision_key 的 active Decision
   → 生成 conflict_group_id
   → 两个 Decision 都保留，标记 conflict_group_id
   → 在 ProjectContext 中标记冲突
   → 需要人工通过 ContextPatch 解决
   ```

3. **完全独立**:
   ```
   直接进入 active
   ```

**decision_key 生成规则**:
- 优先使用 YAML 中的 `decision.id`
- 若无，使用 `slugify(title) + hash(detail前100字符)`
- 保证同一决策的不同版本有相同 key

## 3. ContextPatch Typed Schema

### patch_payload 结构

```typescript
interface ContextPatchPayload {
  schema_version: string; // "v1"
  op: 'update' | 'deprecate' | 'override';
  target: {
    type: 'decision' | 'task' | 'risk' | 'project_context';
    id: string;
    version?: string; // 目标对象的版本号
  };
  base_context_watermark: number; // 提案时的 project_event_seq
  base_target_updated_at: string; // 目标对象的 updated_at
  reason: string;
  changes: UpdateChanges | DeprecateChanges | OverrideChanges;
}

interface UpdateChanges {
  fields: {
    [fieldName: string]: {
      old_value: any;
      new_value: any;
    };
  };
}

interface DeprecateChanges {
  deprecation_reason: string;
  replacement_id?: string;
}

interface OverrideChanges {
  new_decision: {
    title: string;
    detail: string;
    confidence: number;
  };
  supersedes_decision_id: string;
}
```

### ContextPatch 状态机

```
proposed → pending_review → approved → applying → applied
         ↘ rejected
         ↘ superseded (其他 patch 先应用)
         ↘ stale (目标已变化，需要 rebase)
         ↘ failed (应用失败)
```

### 审批时的冲突检测

```typescript
async function validatePatchBeforeApproval(patch: ContextPatch): Promise<ValidationResult> {
  // 1. 检查项目上下文是否变化
  const currentWatermark = await getProjectWatermark(patch.project_id);
  if (currentWatermark > patch.base_context_watermark) {
    // 项目有新提交，警告但可继续
    warnings.push('Project has new submissions since patch was proposed');
  }
  
  // 2. 检查目标对象是否变化
  const target = await getTarget(patch.target.type, patch.target.id);
  if (target.updated_at > patch.base_target_updated_at) {
    // 目标已变化，标记为 stale，需要 rebase
    return { valid: false, reason: 'Target has been modified, rebase required' };
  }
  
  // 3. 检查是否有冲突的 patch 已应用
  const conflictingPatches = await findConflictingPatches(patch);
  if (conflictingPatches.length > 0) {
    return { valid: false, reason: 'Conflicting patch already applied', conflicts: conflictingPatches };
  }
  
  return { valid: true, warnings };
}
```

## 4. Embedding Jobs 与回填模型

### 问题
当前 `embedding_jobs` 只按 content hash 唯一，无法追踪哪些 chunk 需要回填。

### 解决方案：分离 embedding_jobs 和 embedding_results

**embedding_jobs 表**（任务队列）:
```sql
CREATE TABLE embedding_jobs (
  id BIGSERIAL PRIMARY KEY,
  chunk_id UUID NOT NULL, -- 关联到 context_index_chunks
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
CREATE INDEX idx_embedding_jobs_locked ON embedding_jobs (locked_by, locked_at) 
  WHERE status = 'processing';
```

**embedding_results 表**（去重缓存）:
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

**context_index_chunks 表**（chunk 元数据）:
```sql
CREATE TABLE context_index_chunks (
  id UUID PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES context_packages(id),
  project_id UUID NOT NULL,
  chunk_type VARCHAR(50) NOT NULL, -- summary/decision/task/risk/open_question
  source_field VARCHAR(100) NOT NULL,
  entity_id UUID, -- 关联的 decision/task/risk id
  entity_status VARCHAR(20), -- active/deprecated/overridden
  chunk_content TEXT NOT NULL,
  chunk_content_hash VARCHAR(64) NOT NULL,
  author_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  INDEX idx_chunk_project (project_id, chunk_type, entity_status)
);
```

**工作流程**:
```
1. 提交 ContextPackage
2. 提取字段，生成 context_index_chunks
3. 为每个 chunk 创建 embedding_job (如果 embedding_results 中不存在)
4. Worker 从 embedding_jobs 取任务 (FOR UPDATE SKIP LOCKED)
5. 调用 OpenAI API 生成 embedding
6. 写入 embedding_results (去重缓存)
7. 更新 embedding_job 状态为 completed
8. 查询时 JOIN context_index_chunks 和 embedding_results
```

## 5. 混合检索实现细节

### 查询流程

```typescript
async function hybridSearch(query: string, projectId: string, userId: string): Promise<SearchResult[]> {
  // 1. 权限过滤
  const allowedProjects = await getUserProjectAccess(userId);
  if (!allowedProjects.includes(projectId)) {
    throw new ForbiddenError();
  }
  
  // 2. 结构化查询（精确匹配）
  const structuredResults = await structuredQuery(query, projectId);
  
  // 3. 全文检索（关键词）
  const ftsResults = await fullTextSearch(query, projectId);
  
  // 4. 向量检索（语义相似）
  const queryEmbedding = await generateEmbedding(query);
  const vectorResults = await vectorSearch(queryEmbedding, projectId);
  
  // 5. 结果合并与重排序
  const mergedResults = mergeResults({
    structured: structuredResults,
    fts: ftsResults,
    vector: vectorResults
  });
  
  // 6. 状态过滤与标注
  const annotatedResults = annotateResultStatus(mergedResults);
  
  return annotatedResults;
}
```

### 重排序策略（RRF + 加权）

```typescript
function mergeResults(results: MultiSourceResults): SearchResult[] {
  const scoreMap = new Map<string, ResultScore>();
  
  // Reciprocal Rank Fusion
  results.structured.forEach((item, rank) => {
    const score = scoreMap.get(item.id) || { id: item.id, scores: {} };
    score.scores.structured = 1 / (rank + 60); // RRF k=60
    score.weight_structured = 3.0; // 最高权重
    scoreMap.set(item.id, score);
  });
  
  results.fts.forEach((item, rank) => {
    const score = scoreMap.get(item.id) || { id: item.id, scores: {} };
    score.scores.fts = 1 / (rank + 60);
    score.weight_fts = 2.0;
    scoreMap.set(item.id, score);
  });
  
  results.vector.forEach((item, rank) => {
    const score = scoreMap.get(item.id) || { id: item.id, scores: {} };
    score.scores.vector = 1 / (rank + 60);
    score.weight_vector = 1.0; // 补召回权重较低
    scoreMap.set(item.id, score);
  });
  
  // 加权求和
  const finalScores = Array.from(scoreMap.values()).map(item => ({
    id: item.id,
    finalScore: 
      (item.scores.structured || 0) * item.weight_structured +
      (item.scores.fts || 0) * item.weight_fts +
      (item.scores.vector || 0) * item.weight_vector
  }));
  
  // Boost 因子
  finalScores.forEach(item => {
    const metadata = getMetadata(item.id);
    if (metadata.status === 'active') item.finalScore *= 1.5;
    if (metadata.chunk_type === 'decision') item.finalScore *= 1.3;
    if (isRecent(metadata.created_at, 7)) item.finalScore *= 1.2;
  });
  
  return finalScores.sort((a, b) => b.finalScore - a.finalScore);
}
```

### 状态标注

```typescript
function annotateResultStatus(results: SearchResult[]): AnnotatedResult[] {
  return results.map(result => {
    const entity = getEntity(result.entity_id);
    
    return {
      ...result,
      status_label: entity.status === 'active' ? '当前结论' : 
                    entity.status === 'overridden' ? '已被覆盖' :
                    entity.status === 'deprecated' ? '已废弃' : '历史记录',
      is_current: entity.status === 'active',
      superseded_by: entity.overridden_by_decision_id,
      conflict_group: entity.conflict_group_id
    };
  });
}
```

## 6. POC 验证计划

### POC 1: 并发事件顺序（必需）
**目标**: 验证 project_event_seq 机制能保证事件不跳号
**方法**: 
- 10 个并发事务同时提交到同一项目
- 验证 project_event_seq 连续
- 验证 reducer watermark 不会跳过事件

**成功标准**: 所有事件都被处理，无跳号

### POC 2: Reducer 重建一致性（必需）
**目标**: 验证增量 reduce 和全量 rebuild 结果一致
**方法**:
- 提交 100 个 ContextPackage
- 记录增量 reduce 后的 ProjectContext
- 清空 ProjectContext，从 event 0 全量 rebuild
- 对比两个结果

**成功标准**: 结果完全一致（除了时间戳）

### POC 3: ContextPatch Rebase（重要）
**目标**: 验证审批时能检测目标变化
**方法**:
- 创建 patch A 针对 decision X
- 提交新 package 修改 decision X
- 尝试审批 patch A
- 验证系统标记为 stale

**成功标准**: 正确检测并阻止过期 patch

### POC 4: Hybrid Retrieval 性能（重要）
**目标**: 验证 1k/10k chunks 下查询 <1s
**方法**:
- 生成 10k 测试 chunks
- 执行 100 次混合查询
- 测量 p50/p95/p99 延迟

**成功标准**: p95 < 1s

### POC 5: Embedding Job 幂等性（中等）
**目标**: 验证 worker 崩溃后不会重复处理
**方法**:
- 启动 worker 处理 job
- 中途 kill worker
- 重启 worker
- 验证 job 被重试且不重复写入

**成功标准**: 每个 chunk 只有一条 embedding_result

### POC 6: YAML Repair UX（中等）
**目标**: 验证常见 AI 错误能给出可修复建议
**方法**:
- 收集 10 个典型 AI 生成的错误 YAML
- 运行 `ctx validate` 和 `ctx repair`
- 评估错误提示质量

**成功标准**: 80% 错误能自动修复或给出明确指引

## 7. 实施优先级与并行策略

### Phase 1: 基础设施（Week 1-2）
**串行**:
1. DB schema + migration
2. POC 1: 并发事件顺序
3. Domain events 基础设施

**并行**:
- YAML schema (Zod) + CLI skeleton
- API skeleton (NestJS)

### Phase 2: 核心逻辑（Week 2-3）
**串行**:
1. Deterministic extractor
2. Reducer + POC 2
3. ProjectContext rebuild 命令

**并行**:
- CLI validate/template/repair + POC 6
- 权限系统基础

### Phase 3: 高级功能（Week 3-4）
**串行**:
1. ContextPatch schema + apply
2. POC 3: Rebase 验证
3. Feedback → Patch 转换

**并行**:
- FTS + pgvector 索引
- Embedding job queue + POC 5

### Phase 4: 检索与问答（Week 4-5）
**串行**:
1. Hybrid retrieval + POC 4
2. LLM 问答集成
3. 状态标注与冲突展示

**并行**:
- CLI ask 命令
- Digest 生成

### Phase 5: 完善与测试（Week 5-6）
- 集成测试
- 性能优化
- 错误处理
- 文档

## 8. 修正后的工作量估算

| 模块 | 复杂度 | 工作量 | 依赖 |
|------|--------|--------|------|
| DB schema + POC 1 | 高 | 4-5 天 | - |
| YAML schema + CLI | 中 | 3-4 天 | - |
| Extractor + Reducer | 高 | 6-8 天 | DB schema |
| ContextPatch + POC 3 | 高 | 5-6 天 | Reducer |
| Hybrid retrieval + POC 4 | 高 | 6-7 天 | Extractor |
| Embedding queue + POC 5 | 中 | 4-5 天 | Retrieval |
| 权限系统 | 低 | 2-3 天 | - |
| LLM 集成 | 中 | 3-4 天 | Retrieval |
| 测试与完善 | 中 | 5-6 天 | 所有 |
| **总计** | - | **38-48 天** | - |

考虑并行开发和风险缓冲，**预计 6-7 周完成 MVP**。

## 9. 风险与缓解（更新）

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 并发事件跳号 | 高 | 中 | POC 1 提前验证 |
| Reducer 不确定性 | 高 | 中 | 充分测试 + POC 2 |
| ContextPatch 审批混乱 | 中 | 中 | Typed schema + POC 3 |
| Hybrid retrieval 性能不达标 | 中 | 低 | POC 4 提前验证 |
| YAML 工具链体验差 | 中 | 中 | POC 6 + 用户测试 |
| 工作量超预期 | 中 | 高 | 分阶段交付，优先核心功能 |

## 10. 技术栈最终确认

- **后端**: TypeScript + NestJS
- **CLI**: TypeScript + commander + Zod
- **数据库**: PostgreSQL 15+ + pgvector
- **Schema**: Zod (导出 JSON Schema)
- **队列**: PostgreSQL job queue (FOR UPDATE SKIP LOCKED)
- **LLM**: OpenAI API (text-embedding-3-small + gpt-4)
- **测试**: Jest + Supertest
- **部署**: Docker + Docker Compose (V0)

## 11. 下一步行动

1. ✅ 用户确认详细技术设计
2. 编写 API 设计文档
3. 编写数据库 migration 脚本
4. 开始 Phase 1 实施
