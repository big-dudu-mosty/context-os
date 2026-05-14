# AI Context Workbench Frontend

## 启动

1. 启动后端：

```bash
cd backend
npm run server
```

2. 启动前端：

```bash
cd frontend
npm run dev
```

3. 访问：http://localhost:5173

## 功能

- 与 AI 对话
- 生成 Artifact 草稿
- 编辑草稿
- 归档文档

## 注意

当前页面默认填入临时 `user_id` / `session_id` / `folder_id`，需要先通过 API 创建这些资源，或在左侧 Runtime IDs 中替换为真实 ID。
