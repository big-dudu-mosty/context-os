# Context OS P0 使用指南

## 📋 目录

1. [系统概述](#系统概述)
2. [快速开始](#快速开始)
3. [核心功能使用](#核心功能使用)
4. [API 参考](#api-参考)
5. [常见问题](#常见问题)

---

## 系统概述

Context OS 是一个自动化的工作上下文管理系统，帮助团队：
- 自动整合每日工作上下文
- 提取结构化信息（决策、任务、风险等）
- 生成每日工作简报
- 支持团队协作和任务交接

### 核心概念

- **Session（会话）**：一次工作会话，记录你的工作内容
- **Dream（梦境整合）**：每晚自动整合工作上下文，生成结构化信息
- **Briefing（简报）**：每日工作摘要和建议
- **Handoff（交接）**：团队成员之间的任务交接

---

## 快速开始

### 1. 启动数据库

```bash
cd backend
npm run db:up
```

### 2. 运行数据库迁移

```bash
npm run migrate:up
```

### 3. 启动调度器（后台运行）

```bash
npm run scheduler
```

调度器会每晚 2:00 AM 自动执行 Dream Consolidation。

---

## 核心功能使用

### 功能 1: 记录工作会话

#### 步骤 1: 创建用户和 Agent

```typescript
import { UserRepository } from './repositories/user.repository';
import { AgentRepository } from './repositories/agent.repository';

const userRepo = new UserRepository();
const agentRepo = new AgentRepository();

// 创建用户
const user = await userRepo.create({
  name: 'Your Name',
  email: 'your.email@example.com'
});

// 创建 Agent
const agent = await agentRepo.create({
  owner_id: user.id,
  name: 'My Agent',
  type: 'claude-code-cli'
});
```

#### 步骤 2: 创建 Session

```typescript
import { SessionRepository } from './repositories/session.repository';

const sessionRepo = new SessionRepository();

// 开始工作会话
const session = await sessionRepo.create({
  agent_id: agent.id,
  owner_id: user.id,
  project_id: project.id  // 可选
});

console.log('Session started:', session.id);
```

#### 步骤 3: 结束 Session

```typescript
// 工作完成后，标记 session 结束
await sessionRepo.update(session.id, {
  ended_at: new Date(),
  transcript_path: '/path/to/your/work/notes.md',  // 可选
  dream_status: 'pending'  // 等待 Dream 处理
});

console.log('Session ended, waiting for dream...');
```

---

### 功能 2: Dream Consolidation（自动整合）

Dream 会在每晚 2:00 AM 自动执行，也可以手动触发。

#### 手动触发 Dream

```typescript
import { DreamService } from './services/dream.service';

const dreamService = new DreamService();

// 为特定 agent 执行 Dream
const result = await dreamService.dreamForAgent(
  agent.id,
  new Date()  // 处理今天的 sessions
);

if (result.success) {
  console.log('Dream completed!');
  console.log('Package ID:', result.packageId);
  console.log('Extraction:', result.extraction);
} else {
  console.error('Dream failed:', result.error);
}
```

#### Dream 会自动：
1. 分析你的工作 sessions
2. 调用 LLM 生成 YAML
3. 提取结构化信息：
   - Decisions（决策）
   - Tasks（任务）
   - Risks（风险）
   - Open Questions（开放问题）
   - Observations（观察）

---

### 功能 3: 查看提取的信息

#### 查看决策

```typescript
import { DecisionRepository } from './repositories/decision.repository';

const decisionRepo = new DecisionRepository();

// 查看项目的所有 active 决策
const decisions = await decisionRepo.findByProject(project.id, 'active');

decisions.forEach(dec => {
  console.log(`Decision: ${dec.title}`);
  console.log(`  Detail: ${dec.detail}`);
  console.log(`  Confidence: ${dec.confidence}`);
});
```

#### 查看任务

```typescript
import { TaskRepository } from './repositories/task.repository';

const taskRepo = new TaskRepository();

// 查看项目的所有任务
const tasks = await taskRepo.findByProject(project.id);

tasks.forEach(task => {
  console.log(`Task: ${task.title}`);
  console.log(`  Status: ${task.status}`);
  console.log(`  Priority: ${task.priority}`);
});
```

---

### 功能 4: 生成每日简报

```typescript
import { BriefingService } from './services/briefing.service';

const briefingService = new BriefingService();

// 生成今天的简报
const result = await briefingService.generateBriefing(
  user.id,
  new Date()
);

console.log('Briefing:');
console.log(result.content);
console.log('Generated:', result.generated);  // false 表示使用缓存
```

#### 简报内容包括：
- 最近的工作进展
- 需要关注的重点
- 今天的建议行动

---

### 功能 5: 任务交接

#### 创建 Handoff

```typescript
import { HandoffService } from './services/handoff.service';

const handoffService = new HandoffService();

// 将工作交接给其他人
const result = await handoffService.createHandoff(
  user.id,           // 发送人
  otherUser.id,      // 接收人
  session.id,        // 要交接的 session
  'Please continue this work on user authentication.'  // 交接消息
);

console.log('Handoff created:', result.handoffId);
console.log('Context:', result.contextSummary);
```

#### 查看待处理的 Handoffs

```typescript
// 接收人查看待处理的交接
const pending = await handoffService.getPendingHandoffs(otherUser.id);

pending.forEach(handoff => {
  console.log(`From: ${handoff.from_owner_id}`);
  console.log(`Message: ${handoff.message}`);
  console.log(`Context: ${handoff.context_summary}`);
});
```

#### 接受 Handoff

```typescript
// 接收人接受交接
await handoffService.acceptHandoff(handoff.id, otherUser.id);

console.log('Handoff accepted!');
```

---

## API 参考

### 环境变量配置

在 `backend/.env` 中配置：

```bash
# 数据库
DATABASE_URL=postgresql://context_os:context_os_dev@localhost:5432/context_os_dev
DB_POOL_MAX=10

# 服务器
PORT=3000
NODE_ENV=development

# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_CHAT_MODEL=gpt-4

# 调度器
ENABLE_SCHEDULERS=true
DREAM_CRON_SCHEDULE=0 2 * * *
```

### 主要 Repository

#### UserRepository
- `findById(id)` - 查找用户
- `findByEmail(email)` - 按邮箱查找
- `create(input)` - 创建用户
- `update(id, input)` - 更新用户

#### SessionRepository
- `findById(id)` - 查找会话
- `findByAgent(agentId)` - 查找 agent 的会话
- `findPendingDreams(date)` - 查找待处理的会话
- `create(input)` - 创建会话
- `update(id, input)` - 更新会话

#### DecisionRepository
- `findById(id)` - 查找决策
- `findByProject(projectId, status)` - 查找项目的决策
- `create(input)` - 创建决策

#### TaskRepository
- `findById(id)` - 查找任务
- `findByProject(projectId)` - 查找项目的任务
- `create(input)` - 创建任务

### 主要 Service

#### DreamService
- `dreamForAgent(agentId, date)` - 为 agent 执行 Dream

#### BriefingService
- `generateBriefing(ownerId, date)` - 生成简报

#### HandoffService
- `createHandoff(fromOwnerId, toOwnerId, sessionId, message)` - 创建交接
- `acceptHandoff(handoffId, toOwnerId)` - 接受交接
- `dismissHandoff(handoffId, toOwnerId)` - 拒绝交接
- `getPendingHandoffs(toOwnerId)` - 查看待处理的交接

---

## 常见问题

### Q1: Dream 什么时候执行？

**A**: Dream 默认每晚 2:00 AM 自动执行。你也可以：
- 手动触发：调用 `DreamService.dreamForAgent()`
- 修改时间：设置环境变量 `DREAM_CRON_SCHEDULE`

### Q2: 如何查看 Dream 的结果？

**A**: Dream 的结果存储在多个表中：
- `context_packages` - 原始 YAML
- `decisions` - 提取的决策
- `tasks` - 提取的任务
- `risks` - 提取的风险
- `open_questions` - 提取的问题
- `observations` - 提取的观察

### Q3: Briefing 会重复生成吗？

**A**: 不会。Briefing 每天只生成一次，第二次请求会返回缓存。

### Q4: 如何禁用调度器？

**A**: 设置环境变量 `ENABLE_SCHEDULERS=false`

### Q5: Dream 失败了怎么办？

**A**: Dream 会自动重试，最多 3 次。如果仍然失败，session 会被标记为 `failed_permanent`。

### Q6: 如何查看系统日志？

**A**: 调度器会输出详细日志到控制台：
```bash
npm run scheduler
```

### Q7: 可以同时处理多个项目吗？

**A**: 可以。每个 session 可以关联不同的 project_id。

### Q8: 如何备份数据？

**A**: 使用 PostgreSQL 的备份工具：
```bash
pg_dump context_os_dev > backup.sql
```

---

## 完整示例

### 示例：完整的工作流程

```typescript
import { UserRepository } from './repositories/user.repository';
import { AgentRepository } from './repositories/agent.repository';
import { ProjectRepository } from './repositories/project.repository';
import { SessionRepository } from './repositories/session.repository';
import { DreamService } from './services/dream.service';
import { BriefingService } from './services/briefing.service';

async function completeWorkflow() {
  // 1. 创建用户和 agent
  const userRepo = new UserRepository();
  const user = await userRepo.create({
    name: 'Alice',
    email: 'alice@example.com'
  });

  const agentRepo = new AgentRepository();
  const agent = await agentRepo.create({
    owner_id: user.id,
    name: 'Alice Agent',
    type: 'claude-code-cli'
  });

  // 2. 创建项目
  const projectRepo = new ProjectRepository();
  const project = await projectRepo.create({
    slug: 'my-project',
    name: 'My Project',
    created_by: user.id
  });

  // 3. 开始工作会话
  const sessionRepo = new SessionRepository();
  const session = await sessionRepo.create({
    agent_id: agent.id,
    owner_id: user.id,
    project_id: project.id
  });

  console.log('Started working...');

  // 4. 工作完成，结束会话
  await sessionRepo.update(session.id, {
    ended_at: new Date(),
    transcript_path: '/tmp/work.md',
    dream_status: 'pending'
  });

  console.log('Work completed, session ended');

  // 5. 执行 Dream（通常由调度器自动执行）
  const dreamService = new DreamService();
  const dreamResult = await dreamService.dreamForAgent(agent.id, new Date());

  if (dreamResult.success) {
    console.log('Dream completed!');
    console.log('Extracted:', dreamResult.extraction);
  }

  // 6. 生成简报
  const briefingService = new BriefingService();
  const briefing = await briefingService.generateBriefing(user.id, new Date());

  console.log('\nYour Daily Briefing:');
  console.log(briefing.content);
}

completeWorkflow();
```

---

## 下一步

现在你已经了解了如何使用 Context OS！

**建议的学习路径**：
1. 运行测试程序，了解各个功能
2. 创建自己的用户和 agent
3. 记录一些工作 sessions
4. 手动触发 Dream，查看结果
5. 生成 Briefing，查看摘要
6. 尝试 Handoff 功能

**需要帮助？**
- 查看测试文件：`backend/src/test-*.ts`
- 查看源代码：`backend/src/services/`
- 运行测试：`npm run test:*`

祝使用愉快！🎉
