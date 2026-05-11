import { Request, Response } from "express";
import { ProjectRepository } from "../repositories/project.repository";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendError,
  sendSuccess,
} from "./http";

export class ProjectController {
  private readonly projectRepo = new ProjectRepository();

  async create(req: Request, res: Response): Promise<void> {
    try {
      const slug = requireString(req.body.slug, "slug");
      const name = requireString(req.body.name, "name");
      const created_by = requireString(req.body.created_by, "created_by");
      const description = optionalString(req.body.description);

      const project = await this.projectRepo.create({
        slug,
        name,
        description,
        created_by,
      });
      sendSuccess(res, project, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const project = await this.projectRepo.findById(req.params.id);
      if (!project) {
        sendError(res, 404, "Project not found");
        return;
      }

      sendSuccess(res, project);
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}
