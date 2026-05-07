# 企业共享上下文系统 V0 实施任务切片

## 元信息
- 创建时间: 2026-05-08
- 项目: inter-agent (企业共享上下文协作系统)
- 阶段: MVP V0
- 总工作量: 38-48 人天
- 预计周期: 6-7 周

## 任务模式说明

- **实施**: 明确需求，直接编码实现
- **半开放实施**: 大方向明确，细节可自行决定
- **勘探**: 技术验证，输出可行性报告

## Phase 1: 基础设施（Week 1-2）

### Task 1.1: 数据库 Schema 设计与 Migration

**模式**: 实施  
**风险**: 中  
**工作量**: 3-4 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 9-10)
- docs/.ccb/specs/active/implementation-details-supplement.md (Section 1-3)

**本轮只做**:
- 创建所有数据库表的 migration 脚本
- 实现 `projects.lock_id` 字段
- 实现 `domain_events` 表（包含 project_event_seq）
- 实现 `context_packages`、`context_indexes`、`decisions`、`tasks`、`risks` 表
- 实现 `feedback`、`context_patches` 表
- 实现 `embedding_jobs`、`embedding_results`、`context_index_chunks` 表
- 实现 `project_contexts`、`digests` 表
- 所有索引和约束

**本轮不要做**:
- 数据填充
- ORM 模型定义（下一个任务）
- API 实现

**验收标准**:
- Migration 脚本可以成功执行
- 所有表、索引、约束创建成功
- 通过 SQL 测试插入和查询基本数据
- 约束验证正确（如 Decision 的 partial unique index）

**回执格式**:
1. 创建的 migration 文件清单
2. 表结构验证结果
3. 约束测试结果
4. 遇到的问题和解决方案

---

### Task 1.2: POC - 并发事件顺序验证

**模式**: 勘探  
**风险**: 高  
**工作量**: 2 天

**先读文档**:
- docs/.ccb/specs/active/implementation-details-supplement.md (Section 1)
- docs/.ccb/specs/active/detailed-technical-design.md (Section 1)

**本轮只做**:
- 编写并发提交测试脚本
- 10 个并发事务同时提交到同一项目
- 验证 project_event_seq 连续性
- 验证 pg_advisory_xact_lock 正确工作
- 输出 POC 报告

**验收标准**:
- 100 次并发测试，project_event_seq 无跳号
- 所有事件都被正确记录
- 锁机制工作正常，无死锁

**回执格式**:
1. POC 测试代码路径
2. 测试结果统计
3. 发现的问题
4. 是否通过验证

---

### Task 1.3: NestJS 项目骨架与 ORM 模型

**模式**: 半开放实施  
**风险**: 低  
**工作量**: 2-3 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 10)

**本轮只做**:
- 初始化 NestJS 项目
- 配置 TypeORM 或 Prisma
- 定义所有数据库表的 Entity/Model
- 配置环境变量管理
- 配置日志系统
- 基础错误处理中间件

**本轮不要做**:
- 业务逻辑实现
- API 路由实现

**允许你自行决定**:
- ORM 选择（TypeORM vs Prisma）
- 项目目录结构
- 日志库选择

**验收标准**:
- 项目可以启动
- 数据库连接成功
- 所有 Entity/Model 定义完整
- 基础 CRUD 操作可用

---

### Task 1.4: CLI 项目骨架与 YAML Schema

**模式**: 实施  
**风险**: 低  
**工作量**: 2-3 天

**先读文档**:
- docs/context-sharing-architecture.md (Section 7)
- docs/.ccb/specs/active/detailed-technical-design.md (Section 5)

**本轮只做**:
- 初始化 TypeScript CLI 项目（commander）
- 定义 Zod schema for ContextPackage
- 导出 JSON Schema
- 实现 `ctx template` 命令
- 实现 `ctx validate` 命令
- 实现基础配置管理

**本轮不要做**:
- `ctx submit` 实现（需要 API）
- `ctx repair` 实现（下一阶段）
- 认证实现

**验收标准**:
- `ctx template` 生成有效 YAML 模板
- `ctx validate` 正确校验 YAML
- Schema 覆盖所有必需字段
- 错误提示清晰

---

## Phase 2: 核心逻辑（Week 2-3）

### Task 2.1: 确定性字段提取器

**模式**: 实施  
**风险**: 中  
**工作量**: 3-4 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 1)

**本轮只做**:
- 实现 YAML 解析
- 提取 decisions、tasks、risks、open_questions
- 生成 decision_key
- 写入结构化表
- 不使用 LLM，纯确定性逻辑

**验收标准**:
- 给定相同 YAML，提取结果完全一致
- decision_key 生成规则正确
- 所有字段正确映射到数据库

---

### Task 2.2: ProjectContext Reducer 实现

**模式**: 实施  
**风险**: 高  
**工作量**: 4-5 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 1, 4)
- docs/.ccb/specs/active/implementation-details-supplement.md (Section 2)

**本轮只做**:
- 实现 Reducer 核心逻辑
- 按 project_event_seq 顺序处理事件
- 实现 Decision 合并规则（冲突检测）
- 更新 ProjectContext
- 更新 source_project_event_seq_watermark

**本轮不要做**:
- LLM 摘要生成（V0 不做）
- 异步处理（V0 同步）

**这些情况必须回抛**:
- Reducer 逻辑不确定
- 冲突检测规则不清晰

**验收标准**:
- 同步更新 ProjectContext
- Decision 冲突正确检测并标记 conflict_group
- Watermark 正确更新

---

### Task 2.3: POC - Reducer 重建一致性验证

**模式**: 勘探  
**风险**: 高  
**工作量**: 2 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 6, POC 2)

**本轮只做**:
- 提交 100 个测试 ContextPackage
- 记录增量 reduce 后的 ProjectContext
- 清空 ProjectContext
- 从 event 0 全量 rebuild
- 对比两个结果

**验收标准**:
- 增量和全量结果完全一致（除时间戳）
- 输出一致性验证报告

---

### Task 2.4: 上下文提交 API 与 CLI

**模式**: 实施  
**风险**: 中  
**工作量**: 3-4 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 1)

**本轮只做**:
- 实现 POST /api/v1/contexts API
- 实现完整提交流程（获取锁 → 写 events → reducer → 提交）
- 实现 CLI `ctx submit` 命令
- 基础错误处理

**验收标准**:
- 提交成功后 ProjectContext 立即更新
- 并发提交不会跳号
- CLI 提供清晰的成功/失败反馈

---

### Task 2.5: POC - Hybrid Retrieval 性能验证（提前）

**模式**: 勘探  
**风险**: 中  
**工作量**: 2-3 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 5)

**本轮只做**:
- 生成 10k 测试 chunks
- 实现基础的全文 + 向量检索
- 测试查询性能（100 次查询）
- 输出性能报告

**验收标准**:
- p95 延迟 < 1s
- 索引策略验证通过

---

## Phase 3: 高级功能（Week 3-4）

### Task 3.1: ContextPatch Schema 与状态机

**模式**: 实施  
**风险**: 中  
**工作量**: 3-4 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 3)
- docs/.ccb/specs/active/implementation-details-supplement.md (Section 3, 5)

**本轮只做**:
- 定义 ContextPatch typed schema (Zod)
- 实现状态机转换
- 实现审批前的冲突检测
- 实现 patch apply 逻辑

**验收标准**:
- Patch schema 类型安全
- 状态转换正确
- 冲突检测工作正常

---

### Task 3.2: POC - Patch 并发审批验证

**模式**: 勘探  
**风险**: 中  
**工作量**: 1-2 天

**先读文档**:
- docs/.ccb/specs/active/implementation-details-supplement.md (Section 6, POC 7)

**本轮只做**:
- 创建两个 competing patch
- 并发审批测试
- 验证只有一个成功

**验收标准**:
- 无数据不一致
- 冲突正确处理

---

### Task 3.3: Feedback API 与 CLI

**模式**: 半开放实施  
**风险**: 低  
**工作量**: 2-3 天

**本轮只做**:
- 实现 POST /api/v1/feedback API
- 实现 Feedback → ContextPatch 转换（系统辅助生成）
- 实现 CLI `ctx feedback` 命令

**验收标准**:
- Feedback 正确保存
- 可以生成 ContextPatch 草案

---

### Task 3.4: Embedding Job Queue 实现

**模式**: 实施  
**风险**: 中  
**工作量**: 3-4 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 4)
- docs/.ccb/specs/active/implementation-details-supplement.md (Section 4)

**本轮只做**:
- 实现 embedding_jobs 队列
- 实现 worker (FOR UPDATE SKIP LOCKED)
- 实现 OpenAI embedding 调用
- 实现去重缓存（embedding_results）
- 实现回填到 context_index_chunks

**验收标准**:
- 批处理正常工作
- 去重正确
- 失败重试机制工作

---

### Task 3.5: POC - Embedding Job 幂等性验证

**模式**: 勘探  
**风险**: 低  
**工作量**: 1 天

**本轮只做**:
- 启动 worker 处理 job
- 中途 kill worker
- 重启验证幂等性

**验收标准**:
- 每个 chunk 只有一条 embedding_result
- 重试机制正确

---

## Phase 4: 检索与问答（Week 4-5）

### Task 4.1: 混合检索实现

**模式**: 实施  
**风险**: 中  
**工作量**: 4-5 天

**先读文档**:
- docs/.ccb/specs/active/detailed-technical-design.md (Section 5)
- docs/.ccb/specs/active/implementation-details-supplement.md (Section 5)

**本轮只做**:
- 实现结构化查询
- 实现全文检索（tsvector）
- 实现向量检索（pgvector + overfetch）
- 实现 RRF 合并与重排序
- 实现状态标注

**验收标准**:
- 三层检索都工作
- 合并算法正确（无 NaN）
- 状态标注正确

---

### Task 4.2: POC - 检索正确性验证

**模式**: 勘探  
**风险**: 低  
**工作量**: 1 天

**先读文档**:
- docs/.ccb/specs/active/implementation-details-supplement.md (Section 6, POC 8)

**本轮只做**:
- 创建多状态 Decision 测试数据
- 验证查询结果优先当前结论
- 验证历史结论正确标注

**验收标准**:
- 排序符合预期
- 状态标注正确

---

### Task 4.3: LLM 问答集成

**模式**: 半开放实施  
**风险**: 低  
**工作量**: 2-3 天

**本轮只做**:
- 实现 LLM 调用封装
- 实现 prompt 模板
- 集成混合检索结果
- 实现流式返回

**允许你自行决定**:
- Prompt 具体措辞
- 上下文组装策略

**验收标准**:
- 问答基本可用
- 流式返回正常

---

### Task 4.4: Ask API 与 CLI

**模式**: 实施  
**风险**: 低  
**工作量**: 2 天

**本轮只做**:
- 实现 POST /api/v1/ask API
- 实现 CLI `ctx ask` 命令
- 集成混合检索 + LLM

**验收标准**:
- CLI 可以查询并获得答案
- 响应时间可接受

---

### Task 4.5: Digest 生成实现

**模式**: 半开放实施  
**风险**: 低  
**工作量**: 2-3 天

**本轮只做**:
- 实现每日简报生成逻辑
- 汇总当天新增 ContextPackage
- 按成员分组
- 实现 CLI `ctx digest` 命令

**验收标准**:
- 简报内容完整
- 格式清晰易读

---

## Phase 5: 完善与测试（Week 5-6）

### Task 5.1: 权限系统实现

**模式**: 实施  
**风险**: 低  
**工作量**: 2-3 天

**先读文档**:
- docs/.ccb/specs/active/architecture-optimization-v0.md (Section 决策 7)

**本轮只做**:
- 实现角色定义（owner/admin/member/viewer）
- 实现操作级权限检查
- 实现可见性过滤

**验收标准**:
- 权限检查正确
- 未授权操作被拒绝

---

### Task 5.2: CLI 认证与会话管理

**模式**: 实施  
**风险**: 低  
**工作量**: 2 天

**先读文档**:
- docs/.ccb/specs/active/architecture-optimization-v0.md (Section 决策 8)

**本轮只做**:
- 实现 API Token 认证
- 实现 `ctx login/logout/whoami`
- Token 存储到 `~/.ctx/credentials`

**验收标准**:
- 登录流程正常
- Token 正确存储和使用

---

### Task 5.3: YAML Repair 工具

**模式**: 半开放实施  
**风险**: 低  
**工作量**: 2 天

**本轮只做**:
- 实现常见 YAML 错误检测
- 实现自动修复逻辑
- 实现 `ctx repair` 命令

**允许你自行决定**:
- 具体修复策略
- 错误提示措辞

**验收标准**:
- 常见错误能自动修复
- 无法修复时给出明确指引

---

### Task 5.4: POC - YAML Repair UX 验证

**模式**: 勘探  
**风险**: 低  
**工作量**: 1 天

**本轮只做**:
- 收集 10 个典型错误 YAML
- 测试 repair 工具
- 评估用户体验

**验收标准**:
- 80% 错误能自动修复或给出指引

---

### Task 5.5: 集成测试与文档

**模式**: 实施  
**风险**: 低  
**工作量**: 3-4 天

**本轮只做**:
- 编写端到端测试
- 编写 API 文档
- 编写 CLI 使用文档
- 编写部署文档

**验收标准**:
- 核心流程测试覆盖
- 文档完整可用

---

## 任务依赖关系

```
Phase 1:
  1.1 (DB Schema) → 1.2 (POC 并发)
  1.3 (NestJS) ← 1.1
  1.4 (CLI) (并行)

Phase 2:
  2.1 (Extractor) ← 1.1, 1.3
  2.2 (Reducer) ← 2.1, 1.2
  2.3 (POC Rebuild) ← 2.2
  2.4 (Submit API) ← 2.2, 1.4
  2.5 (POC Retrieval) (并行)

Phase 3:
  3.1 (ContextPatch) ← 2.2
  3.2 (POC Patch) ← 3.1
  3.3 (Feedback API) ← 3.1
  3.4 (Embedding Queue) ← 2.1
  3.5 (POC Embedding) ← 3.4

Phase 4:
  4.1 (Hybrid Retrieval) ← 3.4, 2.5
  4.2 (POC Retrieval) ← 4.1
  4.3 (LLM) ← 4.1
  4.4 (Ask API) ← 4.3
  4.5 (Digest) ← 2.2

Phase 5:
  5.1 (权限) ← 2.4
  5.2 (认证) ← 5.1
  5.3 (Repair) ← 1.4
  5.4 (POC Repair) ← 5.3
  5.5 (测试文档) ← 所有
```

## 总结

- **总任务数**: 25 个
- **POC 任务**: 8 个
- **实施任务**: 17 个
- **预计工作量**: 38-48 人天
- **预计周期**: 6-7 周

## 下一步

选择任务开始实施，建议按 Phase 顺序进行。
