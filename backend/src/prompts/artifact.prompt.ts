import { Message } from "../models/message";

export function buildArtifactPrompt(
  messages: Message[],
  userRequest?: string,
): string {
  const conversationText = messages
    .map(
      (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
    )
    .join("\n\n");

  const request = userRequest || "根据上述对话，生成一份结构化的文档";

  return `你是一个文档整理助手。

# 对话历史

${conversationText}

# 任务

${request}

# 要求

- 提取关键信息和决策
- 组织成清晰的结构
- 使用 Markdown 格式
- 包含标题、段落、列表等
- 如果有技术内容，包含代码示例
- 如果有决策，明确列出

# 输出

直接输出文档内容，不要额外说明。`;
}
