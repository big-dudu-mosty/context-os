import { Request, Response } from "express";
import { BriefingRepository } from "../repositories/briefing.repository";
import { BriefingService } from "../services/briefing.service";
import {
  optionalDate,
  requireString,
  sendControllerError,
  sendSuccess,
  startOfLocalDay,
} from "./http";

export class BriefingController {
  private readonly briefingRepo = new BriefingRepository();
  private briefingService?: BriefingService;

  async generate(req: Request, res: Response): Promise<void> {
    try {
      const ownerId = requireString(
        req.body.owner_id ?? req.body.user_id,
        "owner_id",
      );
      const date = startOfLocalDay(optionalDate(req.body.date) ?? new Date());
      const result = await this.getBriefingService().generateBriefing(
        ownerId,
        date,
      );

      sendSuccess(res, result);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getHistory(req: Request, res: Response): Promise<void> {
    try {
      const limitValue = req.query.limit;
      const limit =
        typeof limitValue === "string" && Number.isFinite(Number(limitValue))
          ? Number(limitValue)
          : 10;
      const briefings = await this.briefingRepo.findByOwner(
        req.params.userId,
        limit,
      );

      sendSuccess(res, briefings);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  private getBriefingService(): BriefingService {
    this.briefingService ??= new BriefingService();
    return this.briefingService;
  }
}
