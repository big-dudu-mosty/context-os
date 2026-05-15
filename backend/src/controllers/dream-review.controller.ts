import { Request, Response } from "express";
import { DreamReviewStatus } from "../models/dream-review-item";
import { DreamReviewService } from "../services/dream-review.service";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendSuccess,
} from "./http";

export class DreamReviewController {
  private readonly dreamReviewService = new DreamReviewService();

  async list(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(req.params.userId, "userId");
      const status = parseStatus(optionalString(req.query.status));
      const items = await this.dreamReviewService.listForOwner(userId, status);

      sendSuccess(res, items);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async approve(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(
        req.body.user_id ?? req.body.owner_id,
        "user_id",
      );
      const item = await this.dreamReviewService.approve(req.params.id, userId);

      sendSuccess(res, item);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async reject(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(
        req.body.user_id ?? req.body.owner_id,
        "user_id",
      );
      const item = await this.dreamReviewService.reject(req.params.id, userId);

      sendSuccess(res, item);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async edit(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(
        req.body.user_id ?? req.body.owner_id,
        "user_id",
      );
      const title = optionalString(req.body.title);
      const summary = optionalString(req.body.summary);

      const item = await this.dreamReviewService.edit(req.params.id, userId, {
        title,
        summary,
      });

      sendSuccess(res, item);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async approveAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(
        req.body.user_id ?? req.params.userId,
        "user_id",
      );
      const items = await this.dreamReviewService.approveAll(userId);

      sendSuccess(res, items);
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}

function parseStatus(value: string | undefined): DreamReviewStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "edited"
  ) {
    return value;
  }

  throw new Error("status must be pending, approved, rejected, or edited");
}
