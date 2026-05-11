import { Request, Response } from "express";
import { UserRepository } from "../repositories/user.repository";
import {
  optionalString,
  requireString,
  sendControllerError,
  sendError,
  sendSuccess,
} from "./http";

export class UserController {
  private readonly userRepo = new UserRepository();

  async create(req: Request, res: Response): Promise<void> {
    try {
      const name = requireString(req.body.name, "name");
      const email = requireString(req.body.email, "email");
      const role = optionalString(req.body.role);

      const user = await this.userRepo.create({ name, email, role });
      sendSuccess(res, user, 201);
    } catch (error) {
      sendControllerError(res, error);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = await this.userRepo.findById(req.params.id);
      if (!user) {
        sendError(res, 404, "User not found");
        return;
      }

      sendSuccess(res, user);
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}
