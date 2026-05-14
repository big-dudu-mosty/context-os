import { Request, Response } from "express";
import { ArchiveService } from "../services/archive.service";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendSuccess,
} from "./http";

export class ArchiveController {
  private archiveService?: ArchiveService;

  async archive(req: Request, res: Response): Promise<void> {
    try {
      const artifactId = requireString(req.body.artifact_id, "artifact_id");
      const folderId = requireString(req.body.folder_id, "folder_id");
      const userId = requireString(req.body.user_id, "user_id");
      const summary = optionalString(req.body.summary);
      const tags = optionalStringArray(req.body.tags, "tags");

      const result = await this.getArchiveService().archiveArtifact(
        artifactId,
        folderId,
        userId,
        summary,
        tags,
      );

      sendSuccess(res, result, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getDocument(req: Request, res: Response): Promise<void> {
    try {
      const id = requireString(req.params.id, "id");
      const doc = await this.getArchiveService().getArchivedDocument(id);

      sendSuccess(res, doc);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async listDocuments(req: Request, res: Response): Promise<void> {
    try {
      const folderId = requireString(req.params.folderId, "folderId");
      const docs = await this.getArchiveService().listDocuments(folderId);

      sendSuccess(res, docs);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async attachToSession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = requireString(req.params.sessionId, "sessionId");
      const documentId = requireString(req.body.document_id, "document_id");

      const attachment = await this.getArchiveService().attachToSession(
        sessionId,
        documentId,
      );

      sendSuccess(res, attachment, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getAttachments(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = requireString(req.params.sessionId, "sessionId");
      const attachments =
        await this.getArchiveService().getSessionAttachments(sessionId);

      sendSuccess(res, attachments);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  private getArchiveService(): ArchiveService {
    this.archiveService ??= new ArchiveService();
    return this.archiveService;
  }
}

function optionalStringArray(
  value: unknown,
  fieldName: string,
): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings`);
  }

  return value.map((item) => requireString(item, fieldName));
}
