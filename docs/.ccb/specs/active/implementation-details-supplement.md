# 实施前细节补充

## 元信息
- 创建时间: 2026-05-08
- 基于: detailed-technical-design.md
- 协商轮次: 3 (Codex 最终确认)
- 状态: ready_for_implementation

## 1. Advisory Lock Key 生成规则

### 问题
`pg_advisory_xact_lock(project_id)` 需要 BIGINT，但 project_id 是 UUID。

### 解决方案

**方案 A: 使用 UUID 的 hashtext**
```sql
SELECT pg_advisory_xact_lock(hashtext(project_id::text));
```

**方案 B: 专用 project_lock_id 字段（推荐）**
```sql
ALTER TABLE projects ADD COLUMN lock_id BIGSERIAL UNIQUE;

-- 使用时
SELECT pg_advisory_xact_lock(lock_id) FROM projects WHERE id = ?;
```

**采用方案 B**，理由：
- 稳定且可预测
- 避免 hash 冲突风险
- 便于调试和监控

## 2. Decision Active Conflict 唯一约束

### 问题
当前约束禁止同 decision_key 的多个 active Decision，但设计要求允许冲突并标记 conflict_group。

### 解决方案

**修正后的约束**:
```sql
CREATE TABLE decisions (
  -- ... 其他字段
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  conflict_group_id UUID,
  
  -- 修正：只约束无冲突的 active Decision
  CONSTRAINT uq_decision_key_active_no_conflict 
    UNIQUE (project_id, decision_key, status) 
    WHERE status = 'active' AND conflict_group_id IS NULL
);
```

**冲突处理逻辑**:
```typescript
// Reducer 中检测冲突
const existingActive = await findActiveDecision(projectId, decisionKey);

if (existingActive && !newDecision.supersedes_decision_id) {
  // 生成冲突组
  const conflictGroupId = uuid();
  
  // 标记现有 Decision
  await updateDecision(existingActive.id, {
    conflict_group_id: conflictGroupId
  });
  
  // 新 Decision 也进入冲突组
  newDecision.conflict_group_id = conflictGroupId;
  newDecision.status = 'active'; // 仍然是 active，但有冲突标记
  
  // 记录冲突事件
  await createEvent({
    type: 'decision_conflict_detected',
    payload: { conflict_group_id: conflictGroupId, decisions: [existingActive.id, newDecision.id] }
  });
}
```

## 3. Patch-Generated Decision 的来源字段

### 问题
`decisions.package_id NOT NULL`，但通过 ContextPatch 创建的 Decision 没有 package。

### 解决方案

**修正 decisions 表**:
```sql
ALTER TABLE decisions 
  ALTER COLUMN package_id DROP NOT NULL,
  ADD COLUMN source_type VARCHAR(20) NOT NULL DEFAULT 'package',
  ADD COLUMN source_patch_id UUID REFERENCES context_patches(id);

-- 约束：必须有一个来源
ALTER TABLE decisions ADD CONSTRAINT chk_decision_source 
  CHECK (
    (source_type = 'package' AND package_id IS NOT NULL AND source_patch_id IS NULL) OR
    (source_type = 'patch' AND source_patch_id IS NOT NULL AND package_id IS NULL)
  );
```

**source_type 枚举**:
- `package`: 从 ContextPackage 提取
- `patch`: 通过 ContextPatch 创建（override 操作）

## 4. Embedding 跨项目查询的 Overfetch 策略

### 问题
`embedding_results` 没有 `project_id`，vector topK 会从全局召回再过滤项目，可能漏召回。

### 解决方案（V0）

**Overfetch 策略**:
```typescript
async function vectorSearch(
  queryEmbedding: number[], 
  projectId: string, 
  limit: number = 20
): Promise<SearchResult[]> {
  // V0: overfetch 10x，然后过滤项目
  const overfetchLimit = limit * 10;
  
  const results = await db.query(`
    SELECT 
      c.id,
      c.project_id,
      c.chunk_content,
      c.chunk_type,
      c.entity_id,
      c.entity_status,
      1 - (e.embedding <=> $1::vector) as similarity
    FROM context_index_chunks c
    JOIN embedding_results e ON c.chunk_content_hash = e.chunk_content_hash
    WHERE e.embedding_model = 'text-embedding-3-small'
      AND e.embedding_version = 'v1'
    ORDER BY e.embedding <=> $1::vector
    LIMIT $2
  `, [queryEmbedding, overfetchLimit]);
  
  // 过滤项目并限制数量
  return results
    .filter(r => r.project_id === projectId)
    .slice(0, limit);
}
```

**V1 优化方向**:
- 在 `context_index_chunks` 上冗余 embedding
- 或创建 `chunk_embeddings` 表包含 project_id
- 使用 pgvector 的 filtered index

## 5. RRF 权重默认值处理

### 问题
只有 vector 命中的 item 没有 `weight_structured`，`0 * undefined` 会变成 NaN。

### 解决方案

**修正后的合并逻辑**:
```typescript
function mergeResults(results: MultiSourceResults): SearchResult[] {
  const scoreMap = new Map<string, ResultScore>();
  
  // 初始化默认权重
  const DEFAULT_WEIGHTS = {
    structured: 3.0,
    fts: 2.0,
    vector: 1.0
  };
  
  // RRF 合并
  results.structured.forEach((item, rank) => {
    const score = scoreMap.get(item.id) || { 
      id: item.id, 
      scores: { structured: 0, fts: 0, vector: 0 } 
    };
    score.scores.structured = 1 / (rank + 60);
    scoreMap.set(item.id, score);
  });
  
  results.fts.forEach((item, rank) => {
    const score = scoreMap.get(item.id) || { 
      id: item.id, 
      scores: { structured: 0, fts: 0, vector: 0 } 
    };
    score.scores.fts = 1 / (rank + 60);
    scoreMap.set(item.id, score);
  });
  
  results.vector.forEach((item, rank) => {
    const score = scoreMap.get(item.id) || { 
      id: item.id, 
      scores: { structured: 0, fts: 0, vector: 0 } 
    };
    score.scores.vector = 1 / (rank + 60);
    scoreMap.set(item.id, score);
  });
  
  // 加权求和（使用默认权重，避免 NaN）
  const finalScores = Array.from(scoreMap.values()).map(item => ({
    id: item.id,
    finalScore: 
      item.scores.structured * DEFAULT_WEIGHTS.structured +
      item.scores.fts * DEFAULT_WEIGHTS.fts +
      item.scores.vector * DEFAULT_WEIGHTS.vector
  }));
  
  // Boost 因子（根据 query intent 动态调整）
  finalScores.forEach(item => {
    const metadata = getMetadata(item.id);
    if (metadata.status === 'active') item.finalScore *= 1.5;
    
    // 根据查询意图调整 chunk_type boost
    const queryIntent = detectQueryIntent(query);
    if (queryIntent === 'decision' && metadata.chunk_type === 'decision') {
      item.finalScore *= 1.3;
    } else if (queryIntent === 'task' && metadata.chunk_type === 'task') {
      item.finalScore *= 1.3;
    } else if (queryIntent === 'risk' && metadata.chunk_type === 'risk') {
      item.finalScore *= 1.3;
    }
    
    if (isRecent(metadata.created_at, 7)) item.finalScore *= 1.2;
  });
  
  return finalScores.sort((a, b) => b.finalScore - a.finalScore);
}

function detectQueryIntent(query: string): 'decision' | 'task' | 'risk' | 'general' {
  if (/决策|方案|选择|确定/.test(query)) return 'decision';
  if (/任务|待办|todo|负责/.test(query)) return 'task';
  if (/风险|问题|阻塞|隐患/.test(query)) return 'risk';
  return 'general';
}
```

## 6. 补充 POC

### POC 7: Patch 并发审批
**目标**: 验证两个 admin 同时审批同一 target 的 competing patch，只能一个成功

**方法**:
- 创建两个 patch (A, B) 针对同一 Decision
- 两个事务并发执行审批
- 验证只有一个 applied，另一个变为 superseded

**成功标准**: 无数据不一致，冲突被正确检测

### POC 8: 检索正确性
**目标**: 验证同一主题存在多个状态的 Decision 时，答案优先当前结论

**方法**:
- 创建 Decision A (active)
- 创建 Decision B 覆盖 A (A → overridden, B → active)
- 创建 Decision C 废弃 (deprecated)
- 查询该主题
- 验证结果优先展示 B，并标注 A 为"已被覆盖"，C 为"已废弃"

**成功标准**: 状态标注正确，排序符合预期

## 7. 调整后的实施计划

### Phase 1: 基础设施（Week 1-2）
**串行**:
1. DB schema + migration（包含上述 5 个细节）
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
4. **提前：Hybrid retrieval POC 4**（避免 Week 4 才发现索引问题）

**并行**:
- CLI validate/template/repair + POC 6
- 权限系统基础

### Phase 3-5: 保持不变

## 8. 最终检查清单

在开始 Phase 1 前确认：

- [ ] Advisory lock 使用 `projects.lock_id`
- [ ] Decision 唯一约束改为 partial index
- [ ] decisions 表增加 `source_type` 和 `source_patch_id`
- [ ] Vector search 使用 10x overfetch
- [ ] RRF 合并使用默认权重避免 NaN
- [ ] 补充 POC 7 和 POC 8
- [ ] Hybrid retrieval POC 提前到 Phase 2

## 9. 状态

✅ **设计完成，可以开始实施**

所有关键风险已闭合，技术细节已补充完整。

下一步：
1. 用户最终确认
2. 创建 Phase 1 任务列表
3. 开始编写 DB migration 脚本
