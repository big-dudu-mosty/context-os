import { BriefingData, buildBriefingPrompt } from "../prompts/briefing.prompt";
import { BriefingRepository } from "../repositories/briefing.repository";
import { ContextPackageRepository } from "../repositories/context-package.repository";
import { DecisionRepository } from "../repositories/decision.repository";
import { OpenQuestionRepository } from "../repositories/open-question.repository";
import { RiskRepository } from "../repositories/risk.repository";
import { TaskRepository } from "../repositories/task.repository";
import { LLMClient, LLMService } from "./llm.service";

export interface BriefingResult {
  briefingId: string;
  content: string;
  generated: boolean;
}

export interface BriefingServiceOptions {
  llm?: LLMClient;
  briefingRepo?: BriefingRepository;
  packageRepo?: ContextPackageRepository;
  decisionRepo?: DecisionRepository;
  taskRepo?: TaskRepository;
  riskRepo?: RiskRepository;
  questionRepo?: OpenQuestionRepository;
}

export class BriefingService {
  private readonly llm: LLMClient;
  private readonly briefingRepo: BriefingRepository;
  private readonly packageRepo: ContextPackageRepository;
  private readonly decisionRepo: DecisionRepository;
  private readonly taskRepo: TaskRepository;
  private readonly riskRepo: RiskRepository;
  private readonly questionRepo: OpenQuestionRepository;

  constructor(options: BriefingServiceOptions = {}) {
    this.llm = options.llm ?? new LLMService();
    this.briefingRepo = options.briefingRepo ?? new BriefingRepository();
    this.packageRepo = options.packageRepo ?? new ContextPackageRepository();
    this.decisionRepo = options.decisionRepo ?? new DecisionRepository();
    this.taskRepo = options.taskRepo ?? new TaskRepository();
    this.riskRepo = options.riskRepo ?? new RiskRepository();
    this.questionRepo = options.questionRepo ?? new OpenQuestionRepository();
  }

  async generateBriefing(ownerId: string, date: Date): Promise<BriefingResult> {
    const briefingDate = startOfLocalDay(date);
    const existing = await this.briefingRepo.findByOwnerAndDate(
      ownerId,
      briefingDate,
    );

    if (existing) {
      return {
        briefingId: existing.id,
        content: existing.content,
        generated: false,
      };
    }

    const data = await this.collectBriefingData(ownerId, briefingDate);
    const prompt = buildBriefingPrompt(data);
    const content = await this.llm.chat([{ role: "user", content: prompt }]);

    const briefing = await this.briefingRepo.create({
      owner_id: ownerId,
      date: briefingDate,
      content,
    });

    return {
      briefingId: briefing.id,
      content: briefing.content,
      generated: true,
    };
  }

  private async collectBriefingData(
    ownerId: string,
    date: Date,
  ): Promise<BriefingData> {
    const sevenDaysAgo = new Date(date);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const packages = await this.packageRepo.findByOwner(ownerId, 20);
    const recentPackages = packages.filter(
      (contextPackage) => contextPackage.created_at >= sevenDaysAgo,
    );
    const projectIds = Array.from(
      new Set(
        recentPackages.flatMap((contextPackage) => contextPackage.project_ids),
      ),
    );

    const decisions = [];
    const tasks = [];
    const risks = [];
    const questions = [];

    for (const projectId of projectIds) {
      const projectDecisions = await this.decisionRepo.findByProject(
        projectId,
        "active",
      );
      decisions.push(
        ...projectDecisions.filter(
          (decision) => decision.created_at >= sevenDaysAgo,
        ),
      );

      const projectTasks = await this.taskRepo.findByProject(projectId);
      tasks.push(
        ...projectTasks.filter(
          (task) =>
            task.created_at >= sevenDaysAgo &&
            (task.status === "todo" || task.status === "in_progress"),
        ),
      );

      const projectRisks = await this.riskRepo.findByProject(projectId);
      risks.push(
        ...projectRisks.filter(
          (risk) => risk.created_at >= sevenDaysAgo && risk.status === "open",
        ),
      );

      const projectQuestions = await this.questionRepo.findByProject(projectId);
      questions.push(
        ...projectQuestions.filter(
          (question) =>
            question.created_at >= sevenDaysAgo && question.status === "open",
        ),
      );
    }

    return {
      packages: recentPackages,
      decisions,
      tasks,
      risks,
      questions,
    };
  }
}

function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}
