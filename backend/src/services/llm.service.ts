import { config } from "dotenv";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

config({ override: true });

export type LLMChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LLMClient {
  chat(messages: LLMChatMessage[]): Promise<string>;
}

export class LLMService implements LLMClient {
  private readonly client?: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly useMock: boolean;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4";
    this.timeoutMs = this.getTimeoutMs();
    this.useMock = isMockApiKey(apiKey);

    if (this.useMock) {
      console.log("LLM Service running in MOCK mode");
      return;
    }

    this.client = new OpenAI({
      apiKey: apiKey as string,
      baseURL: process.env.OPENAI_BASE_URL,
      maxRetries: 0,
      timeout: this.timeoutMs,
    });
  }

  async chat(messages: LLMChatMessage[]): Promise<string> {
    if (this.useMock) {
      return this.mockChat(messages);
    }

    if (!this.client) {
      return this.mockChat(messages);
    }

    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create(
          {
            model: this.model,
            messages: messages as ChatCompletionMessageParam[],
            temperature: 0.7,
            max_tokens: 4000,
          },
          {
            timeout: this.timeoutMs,
          },
        );

        return response.choices[0]?.message?.content ?? "";
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }

    console.warn(
      "LLM request failed, falling back to MOCK response:",
      lastError instanceof Error ? lastError.message : lastError,
    );

    return this.mockChat(messages);
  }

  private getTimeoutMs(): number {
    const parsed = Number(process.env.OPENAI_TIMEOUT_MS ?? 45000);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 45000;
  }

  private mockChat(messages: LLMChatMessage[]): string {
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage?.content ?? "";

    if (isArtifactPrompt(content)) {
      return [
        "# 对话整理文档",
        "",
        "## 摘要",
        "这是 Mock 模式根据当前对话生成的结构化文档，用于在没有真实 LLM API key 时测试产品流程。",
        "",
        "## 决策",
        "- 使用 AI Context Workbench 进行多轮对话和上下文沉淀",
        "- 用户确认后再将 Artifact 归档到资料库",
        "",
        "## 任务",
        "- 继续完善前端交互体验",
        "- 测试 Artifact 生成、编辑、归档和结构化提取流程",
        "",
        "## 风险",
        "- Mock 模式不能代表真实模型输出质量",
        "- 生产环境需要配置真实 OPENAI_API_KEY",
        "",
        "## 开放问题",
        "- 是否需要为不同用户预置不同项目模板",
        "",
        "## 原始请求",
        trimForMock(content, 240),
      ].join("\n");
    }

    if (content.includes("你好") || content.toLowerCase().includes("hello")) {
      return "你好！我是 AI 助手，目前运行在 Mock 模式。我可以帮你测试对话、生成文档、归档和提取流程。";
    }

    if (content.includes("文档") || content.includes("整理")) {
      return "好的，我会帮你整理成结构化文档。你可以继续描述需求，稍后点击「生成文档」测试 Artifact 草稿流程。";
    }

    return `收到你的消息："${trimForMock(content, 50)}"

我理解你的需求。下面是 Mock 模式的模拟回复：

## 关键点
- 当前后端没有使用真实 LLM 响应
- 你仍然可以测试前端对话、生成文档和归档流程
- 配置 OPENAI_API_KEY 后即可切换为真实模型

## 建议
1. 继续输入几条消息，观察会话记录
2. 点击「生成文档」创建 Artifact 草稿
3. 在右侧编辑后归档`;
  }
}

function isMockApiKey(apiKey: string | undefined): boolean {
  return !apiKey || apiKey === "mock" || apiKey === "test";
}

function isArtifactPrompt(content: string): boolean {
  return (
    content.includes("你是一个文档整理助手") ||
    (content.includes("# 对话历史") && content.includes("# 输出"))
  );
}

function trimForMock(content: string, maxLength: number): string {
  const trimmed = content.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}...`
    : trimmed;
}
