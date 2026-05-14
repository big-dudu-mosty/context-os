import { Request, Response } from "express";
import { Agent } from "../models/agent";
import { Folder } from "../models/folder";
import { Project } from "../models/project";
import { AgentRepository } from "../repositories/agent.repository";
import { FolderRepository } from "../repositories/folder.repository";
import { ProjectRepository } from "../repositories/project.repository";
import { SessionRepository } from "../repositories/session.repository";
import { UserRepository } from "../repositories/user.repository";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendSuccess,
} from "./http";

export class InitController {
  private readonly userRepo = new UserRepository();
  private readonly agentRepo = new AgentRepository();
  private readonly projectRepo = new ProjectRepository();
  private readonly sessionRepo = new SessionRepository();
  private readonly folderRepo = new FolderRepository();

  async initialize(req: Request, res: Response): Promise<void> {
    try {
      const userName = requireString(req.body.user_name, "user_name");
      const slug = toSlug(userName);
      const email = `${slug}@local`;

      const user =
        (await this.userRepo.findByEmail(email)) ??
        (await this.userRepo.create({
          name: userName,
          email,
          role: "member",
        }));

      const agent = await this.findOrCreateAgent(user.id, `${userName} Agent`);
      const project = await this.findOrCreateProject(
        `${slug}-workspace`,
        `${userName} 的工作空间`,
        user.id,
      );

      if (!(await this.projectRepo.isMember(project.id, user.id))) {
        await this.projectRepo.addMember({
          project_id: project.id,
          user_id: user.id,
          role: "owner",
        });
      }

      const folder = await this.findOrCreateFolder(
        user.id,
        project.id,
        "我的文档",
      );
      const session = await this.sessionRepo.create({
        agent_id: agent.id,
        owner_id: user.id,
        project_id: project.id,
      });

      sendSuccess(
        res,
        {
          user,
          agent,
          project,
          folder,
          session,
        },
        201,
      );
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async createSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(req.body.user_id, "user_id");
      const agentId = requireString(req.body.agent_id, "agent_id");
      const projectId = optionalString(req.body.project_id);

      const session = await this.sessionRepo.create({
        agent_id: agentId,
        owner_id: userId,
        project_id: projectId,
      });

      sendSuccess(res, session, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  private async findOrCreateAgent(
    ownerId: string,
    name: string,
  ): Promise<Agent> {
    const agents = await this.agentRepo.findByOwner(ownerId);
    const existing = agents.find(
      (agent) => agent.type === "web-workbench" && agent.status === "active",
    );

    if (existing) {
      return existing;
    }

    return this.agentRepo.create({
      owner_id: ownerId,
      name,
      type: "web-workbench",
    });
  }

  private async findOrCreateProject(
    slug: string,
    name: string,
    createdBy: string,
  ): Promise<Project> {
    const existing = await this.projectRepo.findBySlug(slug);
    if (existing) {
      return existing;
    }

    return this.projectRepo.create({
      slug,
      name,
      created_by: createdBy,
    });
  }

  private async findOrCreateFolder(
    ownerId: string,
    projectId: string,
    name: string,
  ): Promise<Folder> {
    const folders = await this.folderRepo.findByOwner(ownerId);
    const existing = folders.find(
      (folder) =>
        folder.type === "project" &&
        folder.project_id === projectId &&
        folder.name === name,
    );

    if (existing) {
      return existing;
    }

    return this.folderRepo.create({
      owner_id: ownerId,
      name,
      type: "project",
      project_id: projectId,
    });
  }
}

function toSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "local-user";
}
