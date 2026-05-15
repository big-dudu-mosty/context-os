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

- 选择预置账号自动初始化工作台
- 与 AI 对话
- 生成 Artifact 草稿
- 编辑草稿
- 归档文档

## 注意

页面会通过 `/api/init` 自动创建或复用用户、智能体、项目、文件夹和会话；无需手动填写 UUID。
