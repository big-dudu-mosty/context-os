import { Request, Response } from "express";
import { CreateFolderInput } from "../models/folder";
import { FolderRepository } from "../repositories/folder.repository";
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
}

function parseFolderType(value: unknown): FolderType {
  if (value !== "company" && value !== "project") {
    throw new Error("type must be company or project");
  }

  return value;
}
