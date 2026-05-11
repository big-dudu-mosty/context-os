import { Request, Response } from "express";
import { DecisionRepository } from "../repositories/decision.repository";
import { RiskRepository } from "../repositories/risk.repository";
import { TaskRepository } from "../repositories/task.repository";
import { optionalString, sendControllerError, sendSuccess } from "./http";

export class QueryController {
  private readonly decisionRepo = new DecisionRepository();
  private readonly taskRepo = new TaskRepository();
  private readonly riskRepo = new RiskRepository();

  async getDecisions(req: Request, res: Response): Promise<void> {
    try {
      const status = optionalString(req.query.status) ?? "active";
      const decisions = await this.decisionRepo.findByProject(
        req.params.projectId,
        status,
      );
      sendSuccess(res, decisions);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const tasks = await this.taskRepo.findByProject(
        req.params.projectId,
        optionalString(req.query.status),
      );
      sendSuccess(res, tasks);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getRisks(req: Request, res: Response): Promise<void> {
    try {
      const status = optionalString(req.query.status) ?? "open";
      const risks = await this.riskRepo.findByProject(
        req.params.projectId,
        status,
      );
      sendSuccess(res, risks);
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}
