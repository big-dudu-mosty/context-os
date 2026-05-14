import { Request, Response } from "express";
import { ArtifactService } from "../services/artifact.service";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendSuccess,
} from "./http";

export class ArtifactController {
  private artifactService?: ArtifactService;

  async generate(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = requireString(req.body.session_id, "session_id");
      const userId = requireString(req.body.user_id, "user_id");
      const title = requireString(req.body.title, "title");
      const userRequest = optionalString(req.body.user_request);

      const artifact = await this.getArtifactService().generateArtifact(
        sessionId,
        userId,
        title,
        userRequest,
      );

      sendSuccess(res, artifact, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = requireString(req.params.id, "id");
      const content = requireString(req.body.content, "content");
      const title = optionalString(req.body.title);
      const artifact = await this.getArtifactService().updateArtifact(id, {
        content,
        title,
      });

      sendSuccess(res, artifact);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = requireString(req.params.id, "id");
      const artifact = await this.getArtifactService().getArtifact(id);

      sendSuccess(res, artifact);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async listBySession(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = requireString(req.params.sessionId, "sessionId");
      const artifacts =
        await this.getArtifactService().listArtifacts(sessionId);

      sendSuccess(res, artifacts);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = requireString(req.params.id, "id");
      await this.getArtifactService().deleteArtifact(id);

      sendSuccess(res, { deleted: true });
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  private getArtifactService(): ArtifactService {
    this.artifactService ??= new ArtifactService();
    return this.artifactService;
  }
}
