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
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required");
    }

    this.model = process.env.OPENAI_CHAT_MODEL ?? "gpt-4";
    this.timeoutMs = this.getTimeoutMs();
    this.client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
      maxRetries: 0,
      timeout: this.timeoutMs,
    });
  }

  async chat(messages: LLMChatMessage[]): Promise<string> {
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

    throw lastError instanceof Error
      ? lastError
      : new Error("LLM request failed");
  }

  private getTimeoutMs(): number {
    const parsed = Number(process.env.OPENAI_TIMEOUT_MS ?? 45000);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 45000;
  }
}
