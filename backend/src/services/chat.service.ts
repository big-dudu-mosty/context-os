import { Message, MessageRole } from "../models/message";
import { MessageRepository } from "../repositories/message.repository";
import { LLMClient, LLMService } from "./llm.service";

export interface ChatServiceOptions {
  messageRepo?: MessageRepository;
  llm?: LLMClient;
}

export interface ChatContextDocument {
  id: string;
  title: string;
  content: string;
  summary?: string | null;
  tags?: string[] | null;
}

export class ChatService {
  private readonly messageRepo: MessageRepository;
  private readonly llm: LLMClient;

  constructor(options: ChatServiceOptions = {}) {
    this.messageRepo = options.messageRepo ?? new MessageRepository();
    this.llm = options.llm ?? new LLMService();
  }

  async createMessage(
    sessionId: string,
    role: MessageRole,
    content: string,
    model?: string,
    agentId?: string,
  ): Promise<Message> {
    return this.messageRepo.create({
      session_id: sessionId,
      role,
      content,
      model,
      agent_id: agentId,
    });
  }

  async getMessages(
    sessionId: string,
    limit = 50,
    offset = 0,
  ): Promise<Message[]> {
    return this.messageRepo.findBySession(sessionId, limit, offset);
  }

  async chat(
    sessionId: string,
    userMessage: string,
    model: string,
    agentId?: string,
    contextDocuments: ChatContextDocument[] = [],
  ): Promise<Message> {
    await this.createMessage(sessionId, "user", userMessage);

    const history = await this.getMessages(sessionId, 20);
    const messages = [...history].reverse().map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const llmMessages =
      contextDocuments.length > 0
        ? [buildContextSystemMessage(contextDocuments), ...messages]
        : messages;

    const response = sanitizeAssistantResponse(await this.llm.chat(llmMessages));

    return this.createMessage(sessionId, "assistant", response, model, agentId);
  }
}

function buildContextSystemMessage(contextDocuments: ChatContextDocument[]) {
  const contextText = contextDocuments
    .slice(0, 8)
    .map((doc, index) => {
      const tags = doc.tags && doc.tags.length > 0 ? doc.tags.join(", ") : "无";
      return [
        `## 引用上下文 ${index + 1}: ${doc.title}`,
        `ID: ${doc.id}`,
        `摘要: ${doc.summary ?? "无"}`,
        `标签: ${tags}`,
        "",
        doc.content.trim(),
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return {
    role: "system" as const,
    content: [
      "你是 AI Context Workbench 的上下文助手。",
      "用户已经手动引用了下列上下文。回答必须优先基于这些上下文，不要忽略它们。",
      "如果用户问题与引用上下文有关，请明确结合上下文中的事实、结论、风险或任务来回答。",
      "如果引用上下文不足以回答，请直接说明还缺什么信息，不要编造。",
      "不要输出工具调用、function_calls、XML、MCP 调用或内部实现过程。",
      "",
      "# 已引用上下文",
      contextText,
    ].join("\n"),
  };
}

function sanitizeAssistantResponse(content: string): string {
  const cleaned = content
    .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, "")
    .replace(/<invoke[\s\S]*?<\/invoke>/gi, "")
    .replace(/<parameter[\s\S]*?<\/parameter>/gi, "")
    .trim();

  return cleaned.length > 0
    ? cleaned
    : "我没有生成有效回答。请重新提问，或补充更明确的上下文。";
}
