import { Request, Response } from "express";
import { SessionRepository } from "../repositories/session.repository";
import {
  optionalDate,
  optionalString,
  requireString,
  sendControllerError,
  sendError,
  sendSuccess,
} from "./http";

export class SessionController {
  private readonly sessionRepo = new SessionRepository();

  async create(req: Request, res: Response): Promise<void> {
    try {
      const agent_id = requireString(req.body.agent_id, "agent_id");
      const owner_id = requireString(req.body.owner_id, "owner_id");
      const project_id = optionalString(req.body.project_id);

      const session = await this.sessionRepo.create({
        agent_id,
        owner_id,
        project_id,
      });
      sendSuccess(res, session, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const session = await this.sessionRepo.findById(req.params.id);
      if (!session) {
        sendError(res, 404, "Session not found");
        return;
      }

      sendSuccess(res, session);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async end(req: Request, res: Response): Promise<void> {
    try {
      const ended_at = optionalDate(req.body.ended_at) ?? new Date();
      const session = await this.sessionRepo.update(req.params.id, {
        ended_at,
        transcript_path: optionalString(req.body.transcript_path),
        transcript_hash: optionalString(req.body.transcript_hash),
        dream_status: optionalString(req.body.dream_status) ?? "pending",
      });

      if (!session) {
        sendError(res, 404, "Session not found");
        return;
      }

      sendSuccess(res, session);
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}
