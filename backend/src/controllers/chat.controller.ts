import { Request, Response } from "express";
import { ChatService } from "../services/chat.service";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendSuccess,
} from "./http";

export class ChatController {
  private chatService?: ChatService;

  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const session_id = requireString(req.body.session_id, "session_id");
      const content = requireString(req.body.content, "content");
      const model = requireString(req.body.model, "model");
      const agent_id = optionalString(req.body.agent_id);

      const message = await this.getChatService().chat(
        session_id,
        content,
        model,
        agent_id,
      );

      sendSuccess(res, message);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = requireString(req.params.sessionId, "sessionId");
      const limit = toPositiveInteger(req.query.limit, 50);
      const offset = toNonNegativeInteger(req.query.offset, 0);
      const messages = await this.getChatService().getMessages(
        sessionId,
        limit,
        offset,
      );

      sendSuccess(res, messages);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  private getChatService(): ChatService {
    this.chatService ??= new ChatService();
    return this.chatService;
  }
}

function toPositiveInteger(value: unknown, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("limit must be a positive integer");
  }

  return parsed;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  return parsed;
}
