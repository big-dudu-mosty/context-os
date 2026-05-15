import { Request, Response } from "express";
import { HandoffService } from "../services/handoff.service";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendSuccess,
} from "./http";

export class HandoffController {
  private readonly handoffService = new HandoffService();

  async create(req: Request, res: Response): Promise<void> {
    try {
      const fromOwnerId = requireString(
        req.body.from_owner_id,
        "from_owner_id",
      );
      const toOwnerId = requireString(req.body.to_owner_id, "to_owner_id");
      const sessionId = requireString(req.body.session_id, "session_id");
      const message = requireString(req.body.message, "message");
      const title = optionalString(req.body.title);
      const relatedDocumentId = optionalString(req.body.related_document_id);
      const packageId = optionalString(req.body.package_id);

      const result = await this.handoffService.createHandoff(
        fromOwnerId,
        toOwnerId,
        sessionId,
        message,
        {
          title,
          relatedDocumentId,
          packageId,
        },
      );
      sendSuccess(res, result, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getPending(req: Request, res: Response): Promise<void> {
    try {
      const handoffs = await this.handoffService.getPendingHandoffs(
        req.params.userId,
      );
      sendSuccess(res, handoffs);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getInbox(req: Request, res: Response): Promise<void> {
    try {
      const limit = toPositiveInteger(req.query.limit, 20);
      const handoffs = await this.handoffService.getInbox(
        req.params.userId,
        limit,
      );
      sendSuccess(res, handoffs);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getSent(req: Request, res: Response): Promise<void> {
    try {
      const limit = toPositiveInteger(req.query.limit, 20);
      const handoffs = await this.handoffService.getSent(
        req.params.userId,
        limit,
      );
      sendSuccess(res, handoffs);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async accept(req: Request, res: Response): Promise<void> {
    try {
      const toOwnerId = requireString(
        req.body.to_owner_id ?? req.body.user_id,
        "to_owner_id",
      );
      await this.handoffService.acceptHandoff(req.params.id, toOwnerId);
      sendSuccess(res, { id: req.params.id, status: "accepted" });
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async dismiss(req: Request, res: Response): Promise<void> {
    try {
      const toOwnerId = requireString(
        req.body.to_owner_id ?? req.body.user_id,
        "to_owner_id",
      );
      await this.handoffService.dismissHandoff(req.params.id, toOwnerId);
      sendSuccess(res, { id: req.params.id, status: "dismissed" });
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async startSession(req: Request, res: Response): Promise<void> {
    try {
      const toOwnerId = requireString(
        req.body.to_owner_id ?? req.body.user_id,
        "to_owner_id",
      );
      const result = await this.handoffService.startSessionFromHandoff(
        req.params.id,
        toOwnerId,
      );
      sendSuccess(res, result, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
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
