import { randomUUID } from "crypto";
import YAML from "yaml";
import { DecisionRepository } from "../repositories/decision.repository";
import { ObservationRepository } from "../repositories/observation.repository";
import { OpenQuestionRepository } from "../repositories/open-question.repository";
import { RiskRepository } from "../repositories/risk.repository";
import { TaskRepository } from "../repositories/task.repository";

export interface ExtractionResult {
  decisionsCreated: number;
  tasksCreated: number;
  risksCreated: number;
  questionsCreated: number;
  observationsCreated: number;
  conflictsDetected: number;
}

export interface ExtractionServiceOptions {
  decisionRepo?: DecisionRepository;
  taskRepo?: TaskRepository;
  riskRepo?: RiskRepository;
  questionRepo?: OpenQuestionRepository;
  observationRepo?: ObservationRepository;
}

export class ExtractionService {
  private readonly decisionRepo: DecisionRepository;
  private readonly taskRepo: TaskRepository;
  private readonly riskRepo: RiskRepository;
  private readonly questionRepo: OpenQuestionRepository;
  private readonly observationRepo: ObservationRepository;

  constructor(options: ExtractionServiceOptions = {}) {
    this.decisionRepo = options.decisionRepo ?? new DecisionRepository();
    this.taskRepo = options.taskRepo ?? new TaskRepository();
    this.riskRepo = options.riskRepo ?? new RiskRepository();
    this.questionRepo = options.questionRepo ?? new OpenQuestionRepository();
    this.observationRepo =
      options.observationRepo ?? new ObservationRepository();
  }

  async extractFromYaml(
    packageId: string,
    ownerId: string,
    rawYaml: string,
    projectIds: string[],
  ): Promise<ExtractionResult> {
    const parsed = YAML.parse(rawYaml);
    const projectIdSet = Array.from(new Set(projectIds.filter(Boolean)));
    const result: ExtractionResult = {
      decisionsCreated: 0,
      tasksCreated: 0,
      risksCreated: 0,
      questionsCreated: 0,
      observationsCreated: 0,
      conflictsDetected: 0,
    };

    for (const item of toRecords(parsed?.decisions)) {
      const title = asString(item.title);
      if (!title) {
        continue;
      }

      for (const projectId of projectIdSet) {
        const decisionKey =
          asString(item.id) ?? `dec_${randomUUID().slice(0, 8)}`;
        const existing = await this.decisionRepo.findConflict(
          projectId,
          decisionKey,
        );
        const conflictGroupId = existing ? randomUUID() : undefined;

        if (existing && conflictGroupId) {
          await this.decisionRepo.markConflict(existing.id, conflictGroupId);
          result.conflictsDetected += 1;
        }

        await this.decisionRepo.create({
          package_id: packageId,
          project_id: projectId,
          decision_key: decisionKey,
          title,
          detail: asString(item.detail),
          confidence: asNumber(item.confidence),
          conflict_group_id: conflictGroupId,
          owner_id: ownerId,
        });
        result.decisionsCreated += 1;
      }
    }

    for (const item of toRecords(parsed?.tasks)) {
      const title = asString(item.title);
      if (!title) {
        continue;
      }

      for (const projectId of projectIdSet) {
        await this.taskRepo.create({
          package_id: packageId,
          project_id: projectId,
          title,
          description: asString(item.description),
          assignee_id: asUuid(item.assignee_id),
          status: asString(item.status) ?? "todo",
          priority: asString(item.priority),
          owner_id: ownerId,
        });
        result.tasksCreated += 1;
      }
    }

    for (const item of toRecords(parsed?.risks)) {
      const title = asString(item.title);
      if (!title) {
        continue;
      }

      for (const projectId of projectIdSet) {
        await this.riskRepo.create({
          package_id: packageId,
          project_id: projectId,
          title,
          description: asString(item.description),
          mitigation: asString(item.mitigation),
          severity: asString(item.severity),
          owner_id: ownerId,
        });
        result.risksCreated += 1;
      }
    }

    for (const item of toRecords(parsed?.open_questions)) {
      const question = asString(item.question);
      if (!question) {
        continue;
      }

      for (const projectId of projectIdSet) {
        await this.questionRepo.create({
          package_id: packageId,
          project_id: projectId,
          question,
          context: asString(item.context),
          priority: asString(item.priority),
          owner_id: ownerId,
        });
        result.questionsCreated += 1;
      }
    }

    for (const item of toRecords(parsed?.observations)) {
      const type = asString(item.type);
      const content = asString(item.content);
      if (!type || !content) {
        continue;
      }

      await this.observationRepo.create({
        package_id: packageId,
        project_id: projectIdSet[0] ?? null,
        type,
        content,
        relevance: asString(item.relevance),
        confidence: asNumber(item.confidence),
        tags: asStringArray(item.tags),
        related_to_type: asString(item.related_to_type),
        related_to_id: asUuid(item.related_to_id),
        owner_id: ownerId,
      });
      result.observationsCreated += 1;
    }

    return result;
  }
}

function toRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asUuid(value: unknown): string | undefined {
  const text = asString(value);
  if (!text) {
    return undefined;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text,
  )
    ? text
    : undefined;
}
