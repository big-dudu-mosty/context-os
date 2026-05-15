import { Request, Response } from "express";
import { CreateFolderInput } from "../models/folder";
import { FolderRepository } from "../repositories/folder.repository";
import { ProjectRepository } from "../repositories/project.repository";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendError,
  sendSuccess,
} from "./http";

type FolderType = CreateFolderInput["type"];

export class FolderController {
  private readonly folderRepo = new FolderRepository();
  private readonly projectRepo = new ProjectRepository();

  async create(req: Request, res: Response): Promise<void> {
    try {
      const owner_id = requireString(req.body.owner_id, "owner_id");
      const name = requireString(req.body.name, "name");
      const type = parseFolderType(req.body.type);
      const parent_folder_id = optionalString(req.body.parent_folder_id);
      const project_id = optionalString(req.body.project_id);

      const folder = await this.folderRepo.create({
        owner_id,
        parent_folder_id,
        name,
        type,
        project_id,
      });

      sendSuccess(res, folder, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = requireString(req.params.id, "id");
      const folder = await this.folderRepo.findById(id);
      if (!folder) {
        sendError(res, 404, "Folder not found");
        return;
      }

      sendSuccess(res, folder);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getByOwner(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(req.params.userId, "userId");
      const folders = await this.folderRepo.findByOwner(userId);
      sendSuccess(res, folders);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getByProject(req: Request, res: Response): Promise<void> {
    try {
      const projectId = requireString(req.params.projectId, "projectId");
      const userId = requireString(req.query.user_id, "user_id");

      if (!(await this.projectRepo.isMember(projectId, userId))) {
        sendError(res, 403, "您不是该项目的成员");
        return;
      }

      const folders = await this.folderRepo.findByProject(projectId);
      sendSuccess(res, folders);
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}

function parseFolderType(value: unknown): FolderType {
  if (value !== "company" && value !== "project") {
    throw new Error("type must be company or project");
  }

  return value;
}
