import { Message, MessageRole } from "../models/message";
import { MessageRepository } from "../repositories/message.repository";
import { LLMClient, LLMService } from "./llm.service";

export interface ChatServiceOptions {
  messageRepo?: MessageRepository;
  llm?: LLMClient;
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
  ): Promise<Message> {
    await this.createMessage(sessionId, "user", userMessage);

    const history = await this.getMessages(sessionId, 20);
    const messages = [...history].reverse().map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const response = await this.llm.chat(messages);

    return this.createMessage(sessionId, "assistant", response, model, agentId);
  }
}
