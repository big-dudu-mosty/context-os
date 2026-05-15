# 项目当前逻辑与架构总览

## 1. 当前结论

项目逻辑已经完成重新梳理，新的产品主线是：

```text
用户进入 AI Context Workbench
-> 在左侧选择或创建 Session
-> 在中间选择 Agent 和 Model 进行对话
-> AI 在对话中生成 Artifact 草稿
-> 用户确认保存后进入 Company / Project Context
-> 后端对确认归档的内容做结构化提取
-> 生成 Decisions / Tasks / Risks / Questions / Observations
-> 后续用于 Briefing、Handoff、任务说明和邮件草稿
```

核心边界：

```text
聊天记录是过程数据，不自动进入资料库。
Artifact 是 AI 生成的草稿，不等于正式资料。
用户确认保存后的 Context 才是正式归档资料。
任务和邮件当前只生成内容草稿，不直接发送。
```

## 2. 前端原型基准

前端样式和交互基准使用当前 HTML 原型：

- 仓库内固定版本：[ai_context_collab_prototype_attach_label_fixed.html](/Users/dudu/Projects/Internship_Program/inter-agent/docs/prototypes/ai_context_collab_prototype_attach_label_fixed.html)
- 原始文件路径：`/Users/dudu/Desktop/ai_context_collab_prototype_attach_label_fixed.html`

后续前端实现应尽量贴近该 HTML 文件的布局、风格和交互节奏。

## 3. 整体架构图

单独文件：[overall-architecture.md](/Users/dudu/Projects/Internship_Program/inter-agent/docs/diagrams/overall-architecture.md)

```mermaid
flowchart LR
  U["用户"] --> FE["前端：AI Context Workbench"]

  subgraph FEUI["前端界面"]
    Top["顶部栏<br/>产品入口 / Inbox / Dream"]
    W["Workbench 主工作台"]
    Pages["辅助页面<br/>Handoff Inbox / Dream Review / GitHub Sync / Onboarding"]
  end

  subgraph Workbench["三栏 Workbench"]
    L["左侧 Sidebar<br/>Recent Sessions<br/>Company Context<br/>Project Context<br/>GitHub Sync"]
    C["中间 Session 区<br/>AI 对话<br/>Agent 选择<br/>Model 选择<br/>Artifact 生成"]
    R["右侧动态详情面板<br/>Context Detail<br/>Artifact Editor<br/>Handoff Panel<br/>GitHub File Detail"]
  end

  FE --> API["后端 API"]

  subgraph BE["后端核心模块"]
    Chat["Chat Service<br/>对话 / 消息 / 模型调用"]
    Artifact["Artifact Service<br/>整理文件草稿"]
    Archive["Archive Service<br/>确认归档 / 入库"]
    Extraction["Extraction Service<br/>结构化提取"]
    Briefing["Briefing Service<br/>简报生成"]
    Draft["Draft Service<br/>任务 / 邮件草稿"]
    Handoff["Handoff Service<br/>交接草稿 / 交接记录"]
  end

  API --> Chat
  API --> Artifact
  API --> Archive
  API --> Briefing
  API --> Draft
  API --> Handoff

  Chat --> LLM["LLM Provider<br/>Claude / Codex / DeepSeek / Qwen / OpenAI"]
  Artifact --> LLM
  Briefing --> LLM
  Draft --> LLM

  Archive --> Extraction

  subgraph DB["数据库"]
    Users["users / agents / projects"]
    Sessions["folders / sessions / messages"]
    Artifacts["artifacts"]
    Docs["archived_documents / context_packages"]
    Structured["decisions / tasks / risks / questions / observations"]
    Briefings["briefings"]
    Handoffs["handoff_records"]
    Retrieval["context_index_chunks / embeddings"]
  end

  Chat --> Sessions
  Artifact --> Artifacts
  Archive --> Docs
  Extraction --> Structured
  Briefing --> Briefings
  Handoff --> Handoffs
  Archive --> Retrieval
```

## 4. 前端页面结构图

单独文件：[frontend-page-structure.md](/Users/dudu/Projects/Internship_Program/inter-agent/docs/diagrams/frontend-page-structure.md)

```mermaid
flowchart TD
  App["App Shell"]

  App --> Topbar["顶部栏"]
  App --> Main["主区域"]

  Topbar --> Brand["产品名 / Logo"]
  Topbar --> InboxBtn["Inbox 入口"]
  Topbar --> DreamBtn["Dream 入口"]

  Main --> Workbench["Workbench 三栏工作台"]
  Main --> InboxPage["Handoff Inbox 页面"]
  Main --> DreamPage["Dream Review 页面"]
  Main --> GithubPage["GitHub Sync 页面"]
  Main --> OnboardingPage["Onboarding 页面"]

  Workbench --> Left["左侧 Sidebar"]
  Workbench --> Center["中间 Session 对话区"]
  Workbench --> Right["右侧动态详情面板"]
```

## 5. 前端三栏 Workbench 图

单独文件：[frontend-workbench.md](/Users/dudu/Projects/Internship_Program/inter-agent/docs/diagrams/frontend-workbench.md)

```mermaid
flowchart LR
  subgraph Left["左侧 Sidebar"]
    L1["New Session"]
    L2["Recent Sessions"]
    L3["Company Context"]
    L4["Project Context"]
    L5["GitHub Sync"]
    L6["账号 / 成员入口"]
  end

  subgraph Center["中间 AI Session"]
    C1["Session 标题"]
    C2["消息流"]
    C3["AI 回复下方操作"]
    C4["Context 引用链接"]
    C5["Composer Context Bar"]
    C6["输入框"]
    C7["Agent 选择"]
    C8["Model 选择"]
    C9["发送按钮"]
  end

  subgraph Right["右侧动态面板"]
    R1["Context 详情"]
    R2["Artifact Editor"]
    R3["Handoff 操作面板"]
    R4["GitHub 文件详情"]
  end

  Left --> Center
  Center --> Right
  Left --> Right
```

## 6. 右侧动态面板模式图

单独文件：[right-panel-modes.md](/Users/dudu/Projects/Internship_Program/inter-agent/docs/diagrams/right-panel-modes.md)

```mermaid
flowchart TD
  Action["用户操作"] --> Type{"打开什么对象？"}

  Type -- "点击 Company / Project Context" --> Context["右侧显示 Context Detail"]
  Type -- "AI 生成 Artifact" --> Artifact["右侧显示 Artifact Editor"]
  Type -- "Create Handoff" --> Handoff["右侧显示 Handoff 操作面板"]
  Type -- "点击 GitHub 文件" --> Github["右侧显示 GitHub 文件详情"]

  Context --> Attach["Attach to Session"]
  Artifact --> Save["Save as Company Context"]
  Artifact --> CreateHandoff["Create Handoff"]
  Handoff --> Send["Send / Save Handoff"]
  Github --> AttachGithub["Attach to Session"]
```

## 7. 产品主流程图

单独文件：[product-main-flow.md](/Users/dudu/Projects/Internship_Program/inter-agent/docs/diagrams/product-main-flow.md)

```mermaid
flowchart TD
  A["用户进入 Workbench"] --> B["左侧选择或新建 Session"]
  B --> C["中间选择 Agent 和 Model"]
  C --> D["用户与 AI 对话"]
  D --> E["AI 回复并保存消息记录"]

  E --> F{"用户是否要求整理文档？"}
  F -- "否" --> D
  F -- "是" --> G["AI 生成 Artifact 草稿"]

  G --> H["用户查看 / 修改 / 继续让 AI 优化"]
  H --> I{"用户是否确认保存？"}

  I -- "否" --> J["Artifact 保持草稿状态"]
  J --> D

  I -- "是" --> K["用户填写文件名 / 项目 / 标签 / 摘要"]
  K --> L["保存为 Company / Project Context"]
  L --> M["左侧 Context 树展示"]
  M --> N["点击后右侧查看详情"]
  L --> O["后端结构化提取"]

  O --> P["决策 / 任务 / 风险 / 问题 / 观察"]
  P --> Q["生成简报"]
  Q --> R["生成任务说明 / 邮件草稿"]
```

## 8. 内容状态流转图

单独文件：[content-state-flow.md](/Users/dudu/Projects/Internship_Program/inter-agent/docs/diagrams/content-state-flow.md)

```mermaid
flowchart LR
  Chat["聊天记录<br/>过程数据"] --> Artifact["Artifact 草稿<br/>AI 整理文件"]
  Artifact --> Review{"用户确认？"}
  Review -- "继续修改" --> Artifact
  Review -- "拒绝保存" --> DraftOnly["仅保留在当前 Session"]
  Review -- "确认保存" --> Archive["归档文件<br/>正式资料"]

  Archive --> Extraction["结构化提取"]
  Extraction --> Decision["Decision"]
  Extraction --> Task["Task"]
  Extraction --> Risk["Risk"]
  Extraction --> Question["Open Question"]
  Extraction --> Observation["Observation"]

  Archive --> Briefing["简报"]
  Archive --> Attach["可 Attach 到新对话"]
```

## 9. 后端最小闭环图

单独文件：[backend-minimal-loop.md](/Users/dudu/Projects/Internship_Program/inter-agent/docs/diagrams/backend-minimal-loop.md)

```mermaid
sequenceDiagram
  participant User as 用户
  participant UI as 前端
  participant Chat as ChatService
  participant LLM as 模型服务
  participant Artifact as ArtifactService
  participant Archive as ArchiveService
  participant Extract as ExtractionService
  participant DB as 数据库

  User->>UI: 输入消息
  UI->>Chat: 创建 message
  Chat->>DB: 保存用户消息
  Chat->>LLM: 携带当前 session + attach 文件请求回复
  LLM-->>Chat: 返回 AI 回复
  Chat->>DB: 保存 AI 回复
  Chat-->>UI: 展示回复

  User->>UI: 要求整理成文件
  UI->>Artifact: 生成 Artifact
  Artifact->>LLM: 根据 session 内容生成文档
  LLM-->>Artifact: 返回文档草稿
  Artifact->>DB: 保存 artifact draft
  Artifact-->>UI: 展示草稿

  User->>UI: 确认保存
  UI->>Archive: 保存为归档文件
  Archive->>DB: 写入 archived_document / context_package
  Archive->>Extract: 触发结构化提取
  Extract->>DB: 写入 decisions / tasks / risks / questions / observations
  Archive-->>UI: 左侧 Context 树展示，右侧可查看详情
```

## 10. 前端页面职责图

单独文件：[frontend-page-responsibilities.md](/Users/dudu/Projects/Internship_Program/inter-agent/docs/diagrams/frontend-page-responsibilities.md)

```mermaid
flowchart LR
  subgraph Top["顶部栏"]
    T1["产品入口"]
    T2["Inbox"]
    T3["Dream"]
  end

  subgraph Left["左侧 Sidebar"]
    L1["New Session"]
    L2["Recent Sessions"]
    L3["Company Context"]
    L4["Project Context"]
    L5["GitHub Sync"]
  end

  subgraph Center["中间 Session 区"]
    C1["当前 Session 消息流"]
    C2["Agent 选择"]
    C3["Model 选择"]
    C4["Artifact 草稿生成 / 展示"]
    C5["输入框"]
  end

  subgraph Right["右侧动态详情区"]
    R1["Context 详情"]
    R2["Artifact Editor"]
    R3["Handoff 面板"]
    R4["GitHub 文件详情"]
    R5["Attach 到当前 Session"]
  end

  Top --> Left
  Left --> Center
  Center --> Right
  Left --> Right
```

## 11. 当前代码状态

当前代码已经实现旧 P0 后端链路：

```text
Session transcript
-> Dream
-> ContextPackage
-> Extraction
-> Decisions / Tasks / Risks / Questions / Observations
-> Briefing / Handoff / Query
```

新版链路还需要补齐：

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

## 12. 后续开发原则

后续开发应遵循以下顺序，避免返工：

```text
1. 先接入前端原型的核心 Workbench 结构。
2. 先打通 Session / Message / Model 对话。
3. 再实现 Artifact 草稿生成和编辑。
4. 再实现用户确认保存为 Company / Project Context。
5. 再复用现有 ExtractionService 做结构化提取。
6. 再接 Briefing、Handoff、任务草稿和邮件草稿。
7. Dream Review、GitHub Sync、Onboarding 作为后续增强逐步接真实数据。
```
