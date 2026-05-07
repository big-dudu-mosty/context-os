# 企业共享上下文协作系统架构梳理

## 1. 项目一句话

用户通过终端提交自己和 AI 协作后压缩出的上下文包，系统将其存入共享数据库并建立索引；团队成员随后可以通过终端查询项目进度、项目方向、成员方案、历史决策和自动生成的简报，实现团队上下文共享与协作。

## 2. 项目定位

本项目第一版不是一个完整的企业知识库，也不是一个自动监听所有 AI 对话的平台，而是一个终端优先的团队上下文共享系统。

核心思路是：

```text
个人 AI 负责思考
YAML 负责压缩提交
CLI 负责入口
数据库负责沉淀
索引负责检索
ProjectContext 负责项目记忆
Agent 负责回答和整理
Digest 负责同步
Feedback 负责校准
```

第一阶段要验证的不是复杂 UI，而是这个闭环：

```text
个人上下文包提交
-> 项目上下文沉淀
-> 终端查询
-> 简报同步
-> 反馈纠偏
```

## 3. 核心业务闭环

完整工作流如下：

```text
个人在自己的 AI 工具中对话、思考、开发或写方案
-> 个人 AI 将对话和思路压缩成标准 YAML 上下文包
-> 用户通过 CLI 提交 YAML 文件
-> 后端校验 YAML schema
-> 保存原始 YAML
-> 解析结构化字段
-> 生成全文索引和向量索引
-> 更新项目当前上下文 ProjectContext
-> 团队成员通过 CLI 查询项目状态、成员方案、历史决策
-> 系统按天生成项目简报
-> 管理者或负责人通过 Feedback 纠偏
-> 纠偏结果写回项目当前上下文
```

这个闭环的关键是：每个人不需要暴露完整聊天记录，只提交一份压缩后的上下文包。系统不直接把所有内容混在一起，而是负责解析、索引、归档、检索和治理。

## 4. 整体系统架构

```text
CLI 终端入口
submit / ask / digest / feedback / project / context

        ↓

Backend API
用户管理 / 项目管理 / 上下文提交 / 查询问答 / 简报生成 / 反馈处理

        ↓

Context Engine
YAML 校验 / 内容解析 / 摘要标准化 / 决策提取 / 任务提取 / 风险提取 / 标签提取

        ↓

Retrieval Engine
全文检索 / 向量检索 / 项目上下文读取 / 权限过滤 / 相关上下文召回

        ↓

Agent Runtime
Project Agent / Personal Agent / Supervisor Agent

        ↓

Storage
PostgreSQL / pgvector / 原始 YAML 文件 / events 日志
```

## 5. 系统分层

### 5.1 个人工作层

个人仍然使用自己熟悉的 AI 工具和工作方式，例如：

- Codex
- Claude
- ChatGPT
- Cursor
- 本地 Markdown 文档
- IDE 或终端开发环境

个人工作层不要求一开始接入系统。用户只需要在工作完成后，让自己的 AI 生成一份标准 YAML 上下文包。

### 5.2 上下文包层

上下文包是系统最核心的输入格式。

它不是完整聊天记录，而是压缩后的结构化工作记忆，包含：

- 本次工作摘要
- 当前进展
- 已确定决策
- 待办任务
- 未解决问题
- 风险
- 给其他成员看的交接信息
- 相关文件、仓库、链接
- 标签

### 5.3 提交入口层

V0 以 CLI 为主。

示例命令：

```bash
ctx submit ./dev-architecture.yaml --project ai-context-tool
ctx ask ai-context-tool "当前项目进度是什么？"
ctx digest ai-context-tool --today
ctx feedback ai-context-tool --target ctxpkg_001 "这个方向不对，V0 先不要做飞书集成"
```

后续可以扩展：

- Web 上传
- API
- VS Code 插件
- GitHub Action
- 飞书或 Slack bot

### 5.4 共享上下文库

共享上下文库负责保存团队上下文。

它可以拆成三类：

```text
Company Context
公司级方向、原则、战略、全局决策。

Project Context
项目目标、进展、决策、风险、任务、成员方案。

Personal Context
个人任务、个人偏好、个人工作状态、历史贡献。
```

V0 重点先做 Project Context。

### 5.5 AI 处理层

AI 处理层负责把 YAML 上下文包变成系统可用的数据。

主要能力包括：

- 解析 YAML
- 校验字段
- 提取 summary
- 提取 decisions
- 提取 tasks
- 提取 risks
- 提取 open questions
- 生成 tags
- 生成 embedding
- 更新项目上下文
- 生成简报
- 处理反馈纠偏

### 5.6 协作使用层

团队成员可以通过系统做这些事：

- 查询项目当前进度
- 查询项目方向
- 查询某个成员的方案
- 查询历史决策
- 查询还有哪些阻塞
- 生成每日简报
- 对上下文进行反馈和纠偏

## 6. 核心对象模型

### 6.1 User

代表团队成员。

常见字段：

```text
id
name
email
role
created_at
```

### 6.2 Project

代表项目空间。

常见字段：

```text
id
name
slug
description
status
created_by
created_at
```

### 6.3 ContextPackage

用户提交的 YAML 上下文包，是系统核心输入。

常见字段：

```text
id
project_id
author_id
title
type
status
raw_yaml
source_type
visibility
created_at
```

### 6.4 ContextIndex

系统从 ContextPackage 中提取出的索引数据。

常见字段：

```text
id
package_id
project_id
summary
decisions
tasks
risks
open_questions
tags
embedding
created_at
```

### 6.5 ProjectContext

项目当前的压缩上下文，相当于项目的当前记忆。

常见字段：

```text
project_id
current_summary
current_direction
current_progress
active_decisions
active_tasks
open_questions
risks
member_updates
updated_at
```

### 6.6 Event

系统中发生过的操作记录。

事件类型包括：

```text
context_submitted
context_indexed
project_context_updated
question_asked
digest_generated
feedback_created
context_corrected
```

### 6.7 Feedback

用户或管理者对上下文的评论、补充、纠偏。

常见字段：

```text
id
project_id
target_type
target_id
author_id
content
action
created_at
```

### 6.8 Digest

系统生成的每日或每周项目简报。

常见字段：

```text
id
project_id
period
summary
member_updates
new_decisions
new_tasks
risks
open_questions
created_at
```

## 7. YAML 上下文包格式

YAML 文件是用户提交给系统的标准上下文入口文件。

它适合做这个格式的原因：

- 人能直接阅读和编辑
- 比 JSON 更适合写摘要、任务、决策等结构化内容
- 支持多行文本
- 适合终端工作流
- 可以被系统稳定解析后入库

需要注意的问题：

- YAML 对缩进敏感
- 包含冒号、时间、特殊字符时最好加引号
- 不适合存完整聊天原文
- 不适合存 embedding
- 必须使用安全解析器，不使用不安全反序列化

建议原则：

```text
YAML 存压缩后的工作上下文
数据库存结构化事实
向量索引用于检索
原始聊天记录可选，不强制提交
```

### 7.1 示例

```yaml
schema_version: "context-package/v1"

package:
  id: "ctxpkg_20260508_dev_arch_001"
  title: "企业共享上下文系统 V0 架构梳理"
  type: "development_context"
  status: "draft"
  created_at: "2026-05-08T21:30:00+08:00"

project:
  id: "ai-context-tool"
  name: "企业共享上下文协作工具"
  phase: "mvp_design"

author:
  id: "dev_001"
  name: "Dudu"
  role: "developer"

source:
  type: "personal_ai_chat"
  tool: "Codex"
  original_refs:
    - "local-chat-2026-05-08"
  generated_by_ai: true

visibility:
  level: "project"
  allowed_roles:
    - "developer"
    - "product"
    - "manager"

summary: |
  本次讨论主要梳理了企业共享上下文系统的 V0 架构。
  核心思路是每个人先在自己的 AI 工作流中完成思考，
  再提交压缩后的上下文包到共享项目库。

current_progress:
  - "确定 V0 采用终端优先方案"
  - "确定用户提交 YAML 上下文包"
  - "确定系统负责解析、索引、问答和简报生成"

decisions:
  - id: "dec_001"
    title: "第一版采用 CLI 入口"
    detail: "先不做复杂 Web 前端，通过终端提交和查询上下文。"
    owner: "Dudu"
    confidence: 0.9

  - id: "dec_002"
    title: "上下文包使用 YAML 格式"
    detail: "YAML 作为用户提交的标准结构化文件，系统解析后入库。"
    owner: "Dudu"
    confidence: 0.85

tasks:
  - id: "task_001"
    title: "设计 context package schema"
    assignee: "Dudu"
    status: "todo"
    priority: "high"

  - id: "task_002"
    title: "设计数据库表结构"
    assignee: "Dudu"
    status: "todo"
    priority: "high"

open_questions:
  - id: "q_001"
    question: "Context Package 是否允许包含原始对话片段？"
    owner: "team"
    priority: "medium"

risks:
  - id: "risk_001"
    title: "多人提交内容后项目上下文可能变乱"
    mitigation: "通过权限、项目边界、每日摘要和管理者反馈来治理。"

context_for_others: |
  其他成员需要知道：当前项目不是先做完整知识库，
  而是先验证“提交上下文包 -> 入库索引 -> 项目问答 -> 简报生成”的闭环。

related_artifacts:
  files:
    - path: "docs/architecture.md"
      description: "后续架构文档"
  repos:
    - url: "https://github.com/example/ai-context-tool"
      description: "项目代码仓库"

tags:
  - "AI协作"
  - "企业知识库"
  - "上下文工程"
  - "CLI"
  - "MVP"
```

## 8. 提交流程

用户提交：

```bash
ctx submit ./dev-architecture.yaml --project ai-context-tool
```

系统处理：

```text
读取 YAML 文件
-> schema 校验
-> 保存原始 YAML
-> 解析 metadata
-> 写入 context_packages
-> 抽取 decisions / tasks / risks / open_questions
-> 写入 context_indexes
-> 生成 embedding
-> 更新 project_contexts
-> 记录 context_submitted event
```

关键原则：

```text
原始 YAML 不轻易修改
AI 生成的索引和项目上下文可以重算
```

## 9. 查询流程

用户查询：

```bash
ctx ask ai-context-tool "当前项目进度是什么？"
ctx ask ai-context-tool "某某的技术方案是什么？"
ctx ask ai-context-tool "MVP 现在确定不做什么？"
```

系统处理：

```text
识别用户身份
-> 判断项目权限
-> 分析问题意图
-> 读取 ProjectContext
-> 检索相关 ContextPackage / ContextIndex
-> 必要时读取原始 YAML
-> 组装 prompt
-> 调用模型
-> 返回答案
-> 保存 question_asked event
```

回答时优先使用：

```text
项目当前上下文
最近提交
相关成员方案
历史决策
必要时读取原始 YAML
```

## 10. 项目上下文更新逻辑

ProjectContext 是每个项目当前状态的压缩快照。

每次提交新的 YAML 后，系统需要判断：

```text
是否更新项目进度
是否新增决策
是否改变项目方向
是否产生新任务
是否出现新的风险
是否和之前内容冲突
是否需要进入每日简报
是否需要通知相关成员
```

ProjectContext 不等于所有历史记录，而是项目当前状态。历史记录保存在 ContextPackage 和 Event 中。

## 11. 简报生成逻辑

用户生成简报：

```bash
ctx digest ai-context-tool --today
```

系统处理：

```text
查询当天新增 ContextPackage
-> 汇总新增进展
-> 按成员分组
-> 提取新增决策
-> 提取新增任务
-> 提取风险和阻塞
-> 提取需要确认的问题
-> 读取项目当前状态
-> 生成项目简报
-> 写入 digests
-> 记录 digest_generated event
```

简报建议结构：

```text
今日新增内容
成员提交摘要
项目当前进度
新增决策
新增任务
风险和阻塞
需要确认的问题
```

## 12. 反馈纠偏逻辑

用户提交反馈：

```bash
ctx feedback ai-context-tool --target ctxpkg_001 "这个方向不对，V0 先不要做飞书集成"
```

系统处理：

```text
保存 Feedback
-> 判断影响哪个 context package / decision / project context
-> 标记原内容被纠偏
-> 更新项目当前方向
-> 记录覆盖人、时间和原因
-> 后续简报体现该变化
-> 记录 feedback_created / context_corrected event
```

治理原则：

```text
原始记录保留
当前结论可覆盖
覆盖必须有操作者、时间和原因
```

## 13. 推荐技术栈

### 13.1 CLI

推荐：

```text
Node.js + TypeScript + commander
```

原因：

- 适合做终端工具
- 和后续 Web / VS Code 插件生态兼容
- 前后端都可以统一 TypeScript

也可以选择：

```text
Python + Typer
```

如果团队更偏 Python 和 AI pipeline，Python 也可行。

### 13.2 Backend

推荐二选一：

```text
NestJS
FastAPI
```

如果团队希望全栈 TypeScript，选 NestJS。

如果团队希望快速写 AI pipeline，选 FastAPI。

### 13.3 Database

推荐：

```text
PostgreSQL
```

原因：

- 适合存结构化数据
- 稳定可靠
- 可以直接使用 pgvector

### 13.4 Vector Search

推荐：

```text
pgvector
```

V0 不建议引入单独向量数据库，避免系统复杂化。

### 13.5 YAML Parser

Node.js 可用：

```text
yaml
js-yaml
```

Python 可用：

```text
PyYAML safe_load
ruamel.yaml
```

要求：

```text
必须使用安全解析模式
必须做 schema 校验
```

### 13.6 LLM Provider

支持：

```text
OpenAI
Claude
Gemini
本地模型
```

实现上应该做一层 LLM adapter，不要把业务逻辑绑死在某一个模型上。

### 13.7 File Storage

V0：

```text
本地文件系统
```

后续：

```text
S3
R2
OSS
```

### 13.8 Queue

V0 可以同步处理。

V1 再引入：

```text
Redis Queue
BullMQ
Celery
```

## 14. 数据库表设计草案

最小表：

```text
users
projects
project_members
context_packages
context_indexes
project_contexts
events
feedback
digests
```

### 14.1 users

```text
id
name
email
role
created_at
updated_at
```

### 14.2 projects

```text
id
slug
name
description
status
created_by
created_at
updated_at
```

### 14.3 project_members

```text
id
project_id
user_id
role
created_at
```

### 14.4 context_packages

```text
id
project_id
author_id
title
type
status
raw_yaml
source_type
visibility
created_at
updated_at
```

### 14.5 context_indexes

```text
id
package_id
project_id
summary
decisions
tasks
risks
open_questions
tags
embedding
created_at
updated_at
```

### 14.6 project_contexts

```text
project_id
current_summary
current_direction
current_progress
active_decisions
active_tasks
open_questions
risks
member_updates
updated_at
```

### 14.7 events

```text
id
project_id
actor_id
event_type
target_type
target_id
payload
created_at
```

### 14.8 feedback

```text
id
project_id
target_type
target_id
author_id
content
action
created_at
```

### 14.9 digests

```text
id
project_id
period
summary
member_updates
new_decisions
new_tasks
risks
open_questions
created_at
```

## 15. CLI 命令设计草案

### 15.1 初始化

```bash
ctx init
ctx login
```

### 15.2 项目

```bash
ctx project create ai-context-tool
ctx project list
ctx project show ai-context-tool
```

### 15.3 提交上下文

```bash
ctx submit ./dev-context.yaml --project ai-context-tool
ctx submit ./prd-context.yaml --project ai-context-tool
```

### 15.4 查询

```bash
ctx ask ai-context-tool "当前项目进度是什么？"
ctx ask ai-context-tool "现在有哪些未解决问题？"
ctx ask ai-context-tool "Stella 的产品方案是什么？"
```

### 15.5 简报

```bash
ctx digest ai-context-tool --today
ctx digest ai-context-tool --week
```

### 15.6 反馈

```bash
ctx feedback ai-context-tool --target ctxpkg_001 "这个方向需要调整"
```

### 15.7 查看上下文

```bash
ctx context show ai-context-tool
ctx context history ai-context-tool
```

## 16. MVP 范围

V0 必须做：

```text
项目创建
YAML 上下文包提交
YAML schema 校验
结构化入库
全文检索
向量检索
项目问答
每日简报
反馈纠偏
```

V0 暂时不做：

```text
复杂 Web 前端
自动监听所有 AI 对话
飞书 / Slack 全量集成
复杂企业权限审批
多人共同编辑文档
Excel 浏览器
完整工作流引擎
```

## 17. 演进路线

### V0：本地 Demo

```text
CLI
PostgreSQL
pgvector
LLM 解析
submit
ask
digest
feedback
```

### V1：团队协作版

```text
多用户
项目成员
基础权限
多人提交
反馈纠偏
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

## 18. 第一阶段实现顺序

建议按以下顺序开发：

```text
1. 定义 YAML schema
2. 实现 CLI submit
3. 实现后端接收和 schema 校验
4. 设计并创建数据库表
5. 保存原始 YAML 和结构化字段
6. 实现基础全文检索
7. 接入 embedding 和 pgvector
8. 实现 ctx ask
9. 实现 ProjectContext 更新
10. 实现 ctx digest
11. 实现 ctx feedback
12. 增加事件日志
```

## 19. 关键设计原则

### 19.1 原始记录和当前结论分离

```text
原始 YAML 是历史事实，不轻易修改。
ProjectContext 是当前结论，可以被更新。
```

### 19.2 人工确定项目边界，AI 负责整理

```text
项目大方向由人确定。
AI 负责归类、摘要、索引、压缩和检索。
```

### 19.3 先做上下文闭环，再做复杂 UI

```text
第一版的核心风险不是界面，而是上下文是否能沉淀、检索、复用和纠偏。
```

### 19.4 权限要早设计

```text
即使 V0 简化权限，也要在数据结构里预留 visibility、role、project_members 等字段。
```

### 19.5 所有重要行为都要记录 Event

```text
提交、查询、反馈、纠偏、简报生成都应该进入事件日志。
```

## 20. 总结

这个项目第一阶段的本质是：

```text
每个人把自己和 AI 协作后的压缩上下文，用 YAML 文件提交到共享项目库。
系统解析这些 YAML，沉淀为项目记忆，并支持团队通过终端查询、生成简报和进行反馈纠偏。
```

如果这个闭环跑通，后续再接入 Web、VS Code、GitHub、飞书、Slack 和自动化 Agent，系统就可以从一个 CLI demo 演进成真正的企业级 AI 原生团队协作工具。
