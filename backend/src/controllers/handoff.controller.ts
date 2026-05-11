import { Request, Response } from "express";
import { HandoffService } from "../services/handoff.service";
import { requireString, sendControllerError, sendSuccess } from "./http";

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

      const result = await this.handoffService.createHandoff(
        fromOwnerId,
        toOwnerId,
        sessionId,
        message,
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
}
