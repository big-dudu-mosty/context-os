import { Request, Response } from "express";
import { DreamService } from "../services/dream.service";
import {
  optionalDate,
  sendControllerError,
  sendSuccess,
  startOfLocalDay,
} from "./http";

export class DreamController {
  private dreamService?: DreamService;

  async trigger(req: Request, res: Response): Promise<void> {
    try {
      const date = startOfLocalDay(optionalDate(req.body.date) ?? new Date());
      const result = await this.getDreamService().dreamForAgent(
        req.params.agentId,
        date,
      );

      sendSuccess(res, result);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  private getDreamService(): DreamService {
    this.dreamService ??= new DreamService();
    return this.dreamService;
  }
}
