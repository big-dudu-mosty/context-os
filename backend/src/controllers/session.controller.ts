import { Request, Response } from "express";
import { SessionRepository } from "../repositories/session.repository";
import { ProjectRepository } from "../repositories/project.repository";
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
  private readonly projectRepo = new ProjectRepository();

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

  async listByOwner(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(req.params.userId, "userId");
      const limit = toPositiveInteger(req.query.limit, 20);
      const sessions = await this.sessionRepo.findByOwner(userId, limit);

      sendSuccess(res, sessions);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async setProject(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = requireString(req.params.id, "id");
      const userId = requireString(req.body.user_id, "user_id");
      const projectId = requireString(req.body.project_id, "project_id");

      const session = await this.sessionRepo.findById(sessionId);
      if (!session) {
        sendError(res, 404, "Session not found");
        return;
      }
      if (session.owner_id !== userId) {
        sendError(res, 403, "无权修改此会话");
        return;
      }

      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        sendError(res, 404, "项目不存在");
        return;
      }
      if (!(await this.projectRepo.isMember(projectId, userId))) {
        sendError(res, 403, "您不是该项目的成员");
        return;
      }

      const updated = await this.sessionRepo.update(sessionId, {
        project_id: projectId,
      });
      if (!updated) {
        sendError(res, 404, "Session not found");
        return;
      }

      sendSuccess(res, updated);
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
