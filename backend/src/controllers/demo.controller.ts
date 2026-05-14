import { createHash, randomUUID } from "crypto";
import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Request, Response } from "express";
import { AgentRepository } from "../repositories/agent.repository";
import { ContextPackageRepository } from "../repositories/context-package.repository";
import { DecisionRepository } from "../repositories/decision.repository";
import { ObservationRepository } from "../repositories/observation.repository";
import { OpenQuestionRepository } from "../repositories/open-question.repository";
import { ProjectRepository } from "../repositories/project.repository";
import { RiskRepository } from "../repositories/risk.repository";
import { SessionRepository } from "../repositories/session.repository";
import { TaskRepository } from "../repositories/task.repository";
import { UserRepository } from "../repositories/user.repository";
import { DreamService } from "../services/dream.service";
import { requireString, sendControllerError, sendSuccess } from "./http";

export class DemoController {
  private readonly userRepo = new UserRepository();
  private readonly projectRepo = new ProjectRepository();
  private readonly agentRepo = new AgentRepository();
  private readonly sessionRepo = new SessionRepository();
  private readonly packageRepo = new ContextPackageRepository();
  private readonly decisionRepo = new DecisionRepository();
  private readonly taskRepo = new TaskRepository();
  private readonly riskRepo = new RiskRepository();
  private readonly questionRepo = new OpenQuestionRepository();
  private readonly observationRepo = new ObservationRepository();
  private readonly dreamService = new DreamService();

  async run(req: Request, res: Response): Promise<void> {
    try {
      const displayName = requireString(req.body.name, "name");
      const projectName = requireString(req.body.project_name, "project_name");
      const transcript = requireString(req.body.transcript, "transcript");
      const now = new Date();
      const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

      const user = await this.userRepo.create({
        name: displayName,
        email: `demo-${suffix}@context-os.local`,
      });
      const project = await this.projectRepo.create({
        slug: `demo-${slugify(projectName)}-${suffix}`,
        name: projectName,
        created_by: user.id,
      });
      const agent = await this.agentRepo.create({
        owner_id: user.id,
        name: `${displayName} Demo Agent`,
        type: "web-demo",
      });
      const session = await this.sessionRepo.create({
        agent_id: agent.id,
        owner_id: user.id,
        project_id: project.id,
      });

      const transcriptPath = join(tmpdir(), `context-os-demo-${session.id}.md`);
      await writeFile(transcriptPath, transcript, "utf8");
      await this.sessionRepo.update(session.id, {
        ended_at: now,
        transcript_path: transcriptPath,
        transcript_hash: createHash("sha256").update(transcript).digest("hex"),
        dream_status: "pending",
      });

      const dream = await this.dreamService.dreamForAgent(
        agent.id,
        startOfLocalDay(session.started_at),
      );
      const contextPackage = dream.packageId
        ? await this.packageRepo.findById(dream.packageId)
        : null;

      sendSuccess(res, {
        user,
        project,
        agent,
        session: await this.sessionRepo.findById(session.id),
        transcript_path: transcriptPath,
        dream,
        package: contextPackage,
        decisions: await this.decisionRepo.findByProject(project.id, "active"),
        tasks: await this.taskRepo.findByProject(project.id),
        risks: await this.riskRepo.findByProject(project.id, "open"),
        questions: await this.questionRepo.findByProject(project.id, "open"),
        observations: await this.observationRepo.findByProject(project.id),
      });
    } catch (error) {
      sendControllerError(res, error);
    }
  }
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return slug.length > 0 ? slug : "project";
}

function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}
