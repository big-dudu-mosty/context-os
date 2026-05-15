import { Request, Response } from "express";
import { ProjectRepository } from "../repositories/project.repository";
import { UserRepository } from "../repositories/user.repository";
import { demoEmailFromLoginName } from "../utils/demo-user";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendError,
  sendSuccess,
} from "./http";

export class ProjectController {
  private readonly projectRepo = new ProjectRepository();
  private readonly userRepo = new UserRepository();

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

  async listMemberUsers(req: Request, res: Response): Promise<void> {
    try {
      const projectId = requireString(req.params.projectId, "projectId");
      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        sendError(res, 404, "Project not found");
        return;
      }

      const members = await this.projectRepo.listMemberUsers(projectId);
      sendSuccess(res, members);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async listForUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = requireString(req.params.userId, "userId");
      const projects = await this.projectRepo.listForUser(userId);
      sendSuccess(res, projects);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  /** 按演示登录名（与 /init 相同邮箱规则）将已存在用户加入项目 */
  async addMemberUser(req: Request, res: Response): Promise<void> {
    try {
      const projectId = requireString(req.params.projectId, "projectId");
      const actorUserId = requireString(req.body.actor_user_id, "actor_user_id");
      const inviteUserName = requireString(
        req.body.invite_user_name,
        "invite_user_name",
      );
      const role = optionalString(req.body.role) ?? "member";

      const project = await this.projectRepo.findById(projectId);
      if (!project) {
        sendError(res, 404, "项目不存在");
        return;
      }

      if (!(await this.projectRepo.isMember(projectId, actorUserId))) {
        sendError(res, 403, "只有项目成员可以添加其他成员");
        return;
      }

      const email = demoEmailFromLoginName(inviteUserName);
      const invitee =
        (await this.userRepo.findByEmail(email)) ??
        (await this.userRepo.create({
          name:
            inviteUserName.trim().slice(0, 1).toUpperCase() +
            inviteUserName.trim().slice(1),
          email,
          role: "member",
        }));

      if (await this.projectRepo.isMember(projectId, invitee.id)) {
        const members = await this.projectRepo.listMemberUsers(projectId);
        sendSuccess(res, { alreadyMember: true, members });
        return;
      }

      await this.projectRepo.addMember({
        project_id: projectId,
        user_id: invitee.id,
        role,
      });

      const members = await this.projectRepo.listMemberUsers(projectId);
      sendSuccess(res, { members }, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}
