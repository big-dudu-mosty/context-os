import { Request, Response } from "express";
import { AgentRepository } from "../repositories/agent.repository";
import {
  requireString,
  sendControllerError,
  sendError,
  sendSuccess,
} from "./http";

export class AgentController {
  private readonly agentRepo = new AgentRepository();

  async create(req: Request, res: Response): Promise<void> {
    try {
      const owner_id = requireString(req.body.owner_id, "owner_id");
      const name = requireString(req.body.name, "name");
      const type = requireString(req.body.type, "type");

      const agent = await this.agentRepo.create({ owner_id, name, type });
      sendSuccess(res, agent, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const agent = await this.agentRepo.findById(req.params.id);
      if (!agent) {
        sendError(res, 404, "Agent not found");
        return;
      }

      sendSuccess(res, agent);
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}
