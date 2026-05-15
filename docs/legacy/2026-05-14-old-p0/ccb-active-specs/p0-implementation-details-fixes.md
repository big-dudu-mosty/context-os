# P0 实施细节补充与修正

## 元信息
- 创建时间: 2026-05-09
- 状态: active
- 基于: p0-implementation-plan.md Review
- 修正问题数: 8 个

## 修正清单

### 修正 1: Dream 的项目识别逻辑 ✅

**问题**：Dream 如何知道 session 涉及哪些项目？

**解决方案**：三级识别策略
```typescript
async function identifyProjects(sessions: Session[]): Promise<string[]> {
  const projectIds = new Set<string>();
  
  // 1. 优先使用用户显式标记的 project_id
  sessions.forEach(s => {
    if (s.project_id) {
      projectIds.add(s.project_id);
    }
  });
  
  // 2. 如果没有显式标记，让 Dream prompt 识别
  if (projectIds.size === 0) {
    const identified = await dreamPromptIdentifyProjects(sessions);
    identified.forEach(id => projectIds.add(id));
  }
  
  // 3. 如果仍然无法识别，返回空数组（标记为个人 observation）
  return Array.from(projectIds);
}
```

**影响**：
- 用户可以通过 `/project <slug>` 显式标记
- Dream prompt 作为备选识别方式
- 无法识别时，package 的 project_ids 为空数组

---

### 修正 2: Briefing 的数据边界 ✅

**问题**：如果用户多天没启动 agent，briefing 应该显示多少天的数据？

**解决方案**：限制最多 7 天，超过显示摘要
```typescript
async function generateBriefing(userId: string): Promise<string> {
  // 1. 计算上次启动时间
  const lastActive = await getLastActiveTime(userId);
  const daysSinceLastActive = Math.floor(
    (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // 2. 限制最多显示 7 天
  const daysToShow = Math.min(daysSinceLastActive, 7);
  
  // 3. 如果超过 7 天，显示摘要而非详细内容
  if (daysSinceLastActive > 7) {
    return generateSummaryBriefing(userId, daysSinceLastActive);
  }
  
  // 4. 正常生成 briefing
  return generateDetailedBriefing(userId, daysToShow);
}
```

**摘要 Briefing 格式**：
```
早上好，Dudu！

⚠️ 你已经 15 天没有启动 agent 了

【这段时间的重要变化】
• 项目 Context OS 完成了 Phase 1 实施
• 团队新增了 3 个成员
• 你有 5 个待处理的任务交接

💡 提示: 使用 /catch-up 查看详细内容
```

---

### 修正 3: Handoff 的权限边界 ✅

**问题**：B 接受 A 的 handoff 后，能访问 A 的哪些数据？

**解决方案**：明确权限范围
```typescript
interface HandoffAccess {
  // ✅ B 可以访问
  handoffMessage: true,
  contextSummary: true,
  relatedDecisions: true,  // 从 session 提取的 decisions
  relatedTasks: true,
  
  // ⚠️ B 需要额外权限才能访问
  fullTranscript: 'requires_project_membership',  // 如果 session 关联项目，且 B 是成员
  
  // ❌ B 不能访问
  otherSessions: false,
  privateObservations: false
}
```

**实现**：
```typescript
async function getHandoffContext(handoffId: string, userId: string) {
  const handoff = await getHandoff(handoffId);
  
  // 验证权限
  if (handoff.to_owner_id !== userId) {
    throw new ForbiddenError();
  }
  
  const session = await getSession(handoff.session_id);
  
  // 基础 context（总是可访问）
  const context = {
    message: handoff.message,
    summary: handoff.context_summary,
    relatedDecisions: await getRelatedDecisions(session.id),
    relatedTasks: await getRelatedTasks(session.id)
  };
  
  // 完整 transcript（需要项目权限）
  if (session.project_id) {
    const hasAccess = await checkProjectAccess(userId, session.project_id, 'viewer');
    if (hasAccess) {
      context.fullTranscript = await readTranscript(session.transcript_path);
    }
  }
  
  return context;
}
```

---

### 修正 4: 级联删除的影响 ✅

**问题**：删除 user 会导致数据不一致

**解决方案**：使用软删除
```sql
-- 用户表增加软删除字段
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- agents 不允许级联删除
ALTER TABLE agents 
  DROP CONSTRAINT fk_agents_owner,
  ADD CONSTRAINT fk_agents_owner 
  FOREIGN KEY (owner_id) REFERENCES users(id) 
  ON DELETE RESTRICT;

-- 查询时过滤已删除用户
SELECT * FROM users WHERE deleted_at IS NULL;
```

**删除用户流程**：
```typescript
async function deleteUser(userId: string) {
  // 1. 检查是否有关联数据
  const hasAgents = await db.query(`
    SELECT 1 FROM agents WHERE owner_id = $1 LIMIT 1
  `, [userId]);
  
  if (hasAgents) {
    throw new Error('无法删除：用户有关联的 agents');
  }
  
  // 2. 软删除
  await db.query(`
    UPDATE users SET deleted_at = NOW() WHERE id = $1
  `, [userId]);
}
```

---

### 修正 5: source_sessions 数组维护 ✅

**问题**：数组和关联表可能不一致

**解决方案**：移除数组，只用关联表
```sql
-- 修正前
CREATE TABLE context_packages (
  source_sessions UUID[] NOT NULL,  -- ❌ 难以维护
  ...
);

-- 修正后
CREATE TABLE context_packages (
  -- 移除 source_sessions 数组
  ...
);

-- 使用关联表
CREATE TABLE session_packages (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES context_packages(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, package_id)
);
```

**查询 package 的 sessions**：
```sql
SELECT s.* FROM sessions s
JOIN session_packages sp ON sp.session_id = s.id
WHERE sp.package_id = ?
ORDER BY s.started_at;
```

---

### 修正 6: Dream 失败重试策略 ✅

**问题**：Dream 失败后无限重试

**解决方案**：限制重试次数
```sql
ALTER TABLE sessions 
  ADD COLUMN dream_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN dream_max_attempts INT NOT NULL DEFAULT 3;
```

**重试逻辑**：
```typescript
async function markSessionsAsFailed(sessions: Session[], error: Error) {
  for (const session of sessions) {
    const attempts = session.dream_attempts + 1;
    
    if (attempts >= session.dream_max_attempts) {
      // 达到最大重试次数，标记为 failed_permanent
      await db.query(`
        UPDATE sessions
        SET 
          dream_status = 'failed_permanent',
          dream_attempts = $1,
          error_message = $2
        WHERE id = $3
      `, [attempts, error.message, session.id]);
      
      // 通知用户
      await notifyUser(session.owner_id, {
        type: 'dream_failed',
        sessionId: session.id,
        error: error.message
      });
    } else {
      // 标记为 failed，下次 cron 会重试
      await db.query(`
        UPDATE sessions
        SET 
          dream_status = 'failed',
          dream_attempts = $1,
          error_message = $2
        WHERE id = $3
      `, [attempts, error.message, session.id]);
    }
  }
}
```

**用户可以手动重试**：
```bash
> /dream-retry <session_id>
⏳ 正在重试 dream...
✅ Dream 完成
```

---

### 修正 7: 跨项目 Package 权限 ✅

**问题**：用户能看到 package，但能看到所有项目的 decisions 吗？

**解决方案**：过滤用户无权限的 decisions
```typescript
// 查询 package
async function getPackage(packageId: string, userId: string) {
  const package = await db.query(`
    SELECT * FROM context_packages
    WHERE id = $1
    AND (
      -- 用户是任意一个项目的成员
      project_ids && ARRAY(
        SELECT project_id FROM project_members WHERE user_id = $2
      )
      OR
      -- 或者是 package owner
      owner_id = $2
    )
  `, [packageId, userId]);
  
  return package;
}

// 查询 decisions（过滤权限）
async function getPackageDecisions(packageId: string, userId: string) {
  const decisions = await db.query(`
    SELECT d.* FROM decisions d
    WHERE d.package_id = $1
    AND (
      -- 用户是该 decision 所属项目的成员
      EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = d.project_id
        AND pm.user_id = $2
      )
      OR
      -- 或者是 decision owner
      d.owner_id = $2
    )
  `, [packageId, userId]);
  
  return decisions;
}
```

**示例**：
- Package 涉及 Project A 和 Project B
- User X 是 Project A 的成员，但不是 Project B 的成员
- User X 可以看到 package
- User X 只能看到 Project A 的 decisions
- User X 看不到 Project B 的 decisions

---

### 修正 8: Loading 状态一致性 ✅

**问题**：不同操作的 loading 提示不一致

**解决方案**：统一提示格式
```typescript
// 统一的 loading 提示
const LOADING_MESSAGES = {
  briefing: '⏳ 正在生成简报...',
  handoff: '⏳ 正在创建交接...',
  accept_handoff: '⏳ 正在加载 context...',
  ask: '⏳ 正在检索...',
  dream: '⏳ 正在消化 sessions...',
  dream_retry: '⏳ 正在重试 dream...'
};

// 统一的成功提示
const SUCCESS_MESSAGES = {
  briefing: '✅ 简报已生成',
  handoff: '✅ 交接已创建',
  accept_handoff: '✅ 交接已接受',
  ask: '✅ 检索完成',
  dream: '✅ Dream 完成',
  dream_retry: '✅ 重试成功'
};

// 统一的错误提示
const ERROR_MESSAGES = {
  network: '❌ 无法连接到服务器，请检查网络',
  timeout: '⚠️ 请求超时，请稍后重试',
  permission: '❌ 权限不足',
  not_found: '❌ 资源不存在',
  llm_rate_limit: '⚠️ API 请求过于频繁，请稍后重试',
  llm_error: '⚠️ LLM 服务暂时不可用，请稍后重试'
};

// 使用
function showLoading(type: keyof typeof LOADING_MESSAGES) {
  console.log(LOADING_MESSAGES[type]);
}

function showSuccess(type: keyof typeof SUCCESS_MESSAGES) {
  console.log(SUCCESS_MESSAGES[type]);
}

function showError(type: keyof typeof ERROR_MESSAGES, details?: string) {
  console.log(ERROR_MESSAGES[type]);
  if (details) {
    console.log(`详情: ${details}`);
  }
}
```

---

## Dream Consolidation 并发控制

### 问题
如果团队有 100 个 agents，Dream 可能需要很长时间

### 解决方案
```typescript
async function dreamConsolidationJob() {
  const MAX_CONCURRENT = 10;  // 最多同时处理 10 个 agents
  const TIMEOUT_PER_AGENT = 5 * 60 * 1000;  // 每个 agent 最多 5 分钟
  
  const sessionsByAgent = await getPendingSessionsByAgent();
  
  console.log(`[Dream Job] Found ${sessionsByAgent.length} agents to process`);
  
  // 分批处理
  for (let i = 0; i < sessionsByAgent.length; i += MAX_CONCURRENT) {
    const batch = sessionsByAgent.slice(i, i + MAX_CONCURRENT);
    
    console.log(`[Dream Job] Processing batch ${i / MAX_CONCURRENT + 1}`);
    
    await Promise.all(
      batch.map(([agentId, sessions]) => 
        Promise.race([
          dreamForAgent(agentId, sessions),
          timeout(TIMEOUT_PER_AGENT)
        ]).catch(error => {
          console.error(`[Dream Job] Failed for agent ${agentId}:`, error);
          markSessionsAsFailed(sessions, error);
        })
      )
    );
  }
  
  console.log('[Dream Job] Completed');
}
```

---

## 权限检查完整矩阵

| 操作 | 检查内容 | 实现位置 | 错误提示 |
|------|---------|---------|---------|
| 创建 session | 无需检查 | - | - |
| Dream 生成 package | 项目成员关系 | Dream worker | - |
| 查询 package | 项目成员或 owner | API 中间件 | `❌ 权限不足` |
| 查询 decisions | 项目成员或 owner | API 中间件 | `❌ 权限不足` |
| 创建 handoff | Session 所有权 | API 中间件 | `❌ 不是你的 session` |
| 接受 handoff | Handoff 接收方 | API 中间件 | `❌ 不是你的 handoff` |
| 查询 briefing | Briefing 所有权 | API 中间件 | `❌ 权限不足` |
| 管理项目成员 | 项目 admin 角色 | API 中间件 | `❌ 需要 admin 权限` |
| 删除用户 | 系统 admin | API 中间件 | `❌ 需要系统管理员权限` |

---

## 数据库 Schema 最终版本

### 关键修正

1. **users 表**：增加 `deleted_at` 字段（软删除）
2. **agents 表**：外键改为 `ON DELETE RESTRICT`
3. **sessions 表**：增加 `dream_attempts` 和 `dream_max_attempts`
4. **context_packages 表**：移除 `source_sessions` 数组
5. **session_packages 表**：作为唯一的关联方式

### 完整 Schema

参见 `p0-implementation-plan.md` 的 "数据库 Schema（完整版）" 章节。

---

## 新增命令

### `/dream-retry <session_id>`

**功能**：手动重试失败的 dream

**使用场景**：
- Dream 失败后，用户修复问题（如网络）
- 用户想立即重试，不等下次 cron

**实现**：
```typescript
async function handleDreamRetryCommand(user: User, sessionId: string) {
  // 1. 验证权限
  const session = await db.query(`
    SELECT * FROM sessions
    WHERE id = $1 AND owner_id = $2
  `, [sessionId, user.id]);
  
  if (!session) {
    return '❌ Session 不存在或不是你的';
  }
  
  if (session.dream_status === 'completed') {
    return '⚠️ Session 已经 dream 完成';
  }
  
  // 2. 重置状态
  await db.query(`
    UPDATE sessions
    SET dream_status = 'pending', dream_attempts = 0
    WHERE id = $1
  `, [sessionId]);
  
  // 3. 立即执行 dream
  console.log('⏳ 正在重试 dream...');
  await dreamForAgent(session.agent_id, [session]);
  
  return '✅ 重试成功';
}
```

### `/catch-up`

**功能**：查看长时间未登录期间的详细变化

**使用场景**：
- 用户超过 7 天未登录
- Briefing 只显示摘要，用户想看详细内容

**实现**：
```typescript
async function handleCatchUpCommand(user: User) {
  const lastActive = await getLastActiveTime(user.id);
  const daysSinceLastActive = Math.floor(
    (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSinceLastActive <= 7) {
    return '⚠️ 你最近一直在线，不需要 catch-up';
  }
  
  // 生成详细的 catch-up 报告
  const report = await generateCatchUpReport(user.id, daysSinceLastActive);
  
  return report;
}
```

---

## 测试场景

### 场景 1: Dream 失败重试
1. 模拟 OpenAI API 失败
2. 验证 session 标记为 `failed`
3. 验证 `dream_attempts` 增加
4. 下次 cron 自动重试
5. 3 次失败后标记为 `failed_permanent`
6. 用户收到通知

### 场景 2: 跨项目权限
1. User A 创建 package 涉及 Project X 和 Project Y
2. User B 是 Project X 成员，不是 Project Y 成员
3. User B 查询 package - ✅ 成功
4. User B 查询 decisions - ✅ 只看到 Project X 的
5. User B 查询 Project Y 的 decisions - ❌ 失败

### 场景 3: Handoff 权限
1. User A 创建 handoff 给 User B
2. User B 接受 handoff - ✅ 成功
3. User B 查看 context summary - ✅ 成功
4. User B 查看完整 transcript（session 无项目）- ❌ 失败
5. User B 查看完整 transcript（session 有项目且 B 是成员）- ✅ 成功

### 场景 4: 软删除用户
1. User A 有 agents 和 sessions
2. 尝试删除 User A - ❌ 失败（有关联数据）
3. 软删除 User A - ✅ 成功
4. 查询 users - User A 不出现
5. User A 的历史数据仍然存在

---

## 实施优先级

### P0 必须实现
- ✅ 修正 1-7（核心逻辑）
- ✅ 修正 8（用户体验）
- ✅ Dream 并发控制
- ✅ 权限检查矩阵

### P0.5 快速跟进
- `/dream-retry` 命令
- `/catch-up` 命令
- 测试场景 1-4

### P1 后续优化
- 更细粒度的权限控制
- 更智能的 Dream 项目识别
- 更丰富的错误提示

---

## 总结

所有 8 个问题已修正，文档已更新。核心改进：

1. ✅ **数据一致性**：软删除、关联表、重试限制
2. ✅ **权限清晰**：明确边界、过滤逻辑、错误提示
3. ✅ **用户体验**：统一提示、数据范围、降级策略
4. ✅ **系统稳定**：并发控制、超时处理、失败重试

下一步：提交所有修正，准备开始实施。
