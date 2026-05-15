import { DreamReviewItem, DreamReviewStatus } from "../models/dream-review-item";
import { ArchivedDocumentRepository } from "../repositories/archived-document.repository";
import { DecisionRepository } from "../repositories/decision.repository";
import { DreamReviewItemRepository } from "../repositories/dream-review-item.repository";
import { FolderRepository } from "../repositories/folder.repository";
import { ObservationRepository } from "../repositories/observation.repository";
import { OpenQuestionRepository } from "../repositories/open-question.repository";
import { RiskRepository } from "../repositories/risk.repository";
import { TaskRepository } from "../repositories/task.repository";

export interface DreamReviewServiceOptions {
  reviewRepo?: DreamReviewItemRepository;
  decisionRepo?: DecisionRepository;
  taskRepo?: TaskRepository;
  riskRepo?: RiskRepository;
  questionRepo?: OpenQuestionRepository;
  observationRepo?: ObservationRepository;
  archivedDocRepo?: ArchivedDocumentRepository;
  folderRepo?: FolderRepository;
}

export class DreamReviewService {
  private readonly reviewRepo: DreamReviewItemRepository;
  private readonly decisionRepo: DecisionRepository;
  private readonly taskRepo: TaskRepository;
  private readonly riskRepo: RiskRepository;
  private readonly questionRepo: OpenQuestionRepository;
  private readonly observationRepo: ObservationRepository;
  private readonly archivedDocRepo: ArchivedDocumentRepository;
  private readonly folderRepo: FolderRepository;

  constructor(options: DreamReviewServiceOptions = {}) {
    this.reviewRepo = options.reviewRepo ?? new DreamReviewItemRepository();
    this.decisionRepo = options.decisionRepo ?? new DecisionRepository();
    this.taskRepo = options.taskRepo ?? new TaskRepository();
    this.riskRepo = options.riskRepo ?? new RiskRepository();
    this.questionRepo = options.questionRepo ?? new OpenQuestionRepository();
    this.observationRepo =
      options.observationRepo ?? new ObservationRepository();
    this.archivedDocRepo =
      options.archivedDocRepo ?? new ArchivedDocumentRepository();
    this.folderRepo = options.folderRepo ?? new FolderRepository();
  }

  async listForOwner(ownerId: string, status?: DreamReviewStatus) {
    await this.ensureItemsFromExtractedContext(ownerId);
    return this.reviewRepo.findByOwner(ownerId, status);
  }

  async approve(itemId: string, ownerId: string) {
    return this.review(itemId, ownerId, "approved");
  }

  async reject(itemId: string, ownerId: string) {
    return this.review(itemId, ownerId, "rejected");
  }

  async edit(
    itemId: string,
    ownerId: string,
    input: { title?: string; summary?: string },
  ) {
    const item = await this.assertOwnerItem(itemId, ownerId);
    const updated = await this.reviewRepo.update(item.id, {
      title: input.title ?? item.title,
      summary: input.summary ?? item.summary,
      status: "edited",
      reviewed_at: new Date(),
    });

    if (!updated) {
      throw new Error("Dream review item not found");
    }

    return updated;
  }

  async approveAll(ownerId: string) {
    await this.ensureItemsFromExtractedContext(ownerId);
    const pending = await this.reviewRepo.findByOwner(ownerId, "pending");
    const results: DreamReviewItem[] = [];
    for (const row of pending) {
      results.push(await this.approve(row.id, ownerId));
    }
    return results;
  }

  private async review(
    itemId: string,
    ownerId: string,
    status: "approved" | "rejected",
  ) {
    const item = await this.assertOwnerItem(itemId, ownerId);

    let mergedPayload: Record<string, unknown> | undefined;
    if (status === "approved") {
      const archivedId = readDreamArchivedDocId(item.payload);
      const canArchive =
        !archivedId &&
        (item.status === "pending" || item.status === "edited");
      if (canArchive) {
        const doc = await this.archiveDreamReviewToFolder(item, ownerId);
        mergedPayload = {
          ...((item.payload as Record<string, unknown>) ?? {}),
          dream_archived_doc_id: doc.id,
        };
      }
    }

    const updated = await this.reviewRepo.update(item.id, {
      status,
      reviewed_at: new Date(),
      ...(mergedPayload !== undefined ? { payload: mergedPayload } : {}),
    });

    if (!updated) {
      throw new Error("Dream review item not found");
    }

    return updated;
  }

  private async archiveDreamReviewToFolder(
    item: DreamReviewItem,
    ownerId: string,
  ) {
    const folder = await this.resolveArchiveFolder(ownerId, item.project_id);
    const content = buildDreamReviewArchiveBody(item);
    const tags = ["梦境评审", item.source_type];

    return this.archivedDocRepo.create({
      folder_id: folder.id,
      title: item.title,
      content,
      summary: item.summary ?? undefined,
      tags,
      created_by: ownerId,
    });
  }

  private async resolveArchiveFolder(
    ownerId: string,
    projectId: string | null,
  ) {
    const folders = await this.folderRepo.findByOwner(ownerId);
    if (projectId) {
      const projectFolder = folders.find(
        (f) => f.type === "project" && f.project_id === projectId,
      );
      if (projectFolder) {
        return projectFolder;
      }
    }
    const companyFolder = folders.find((f) => f.type === "company");
    if (!companyFolder) {
      throw new Error("未找到公司上下文文件夹，请先完成工作台初始化");
    }
    return companyFolder;
  }

  private async assertOwnerItem(itemId: string, ownerId: string) {
    const item = await this.reviewRepo.findById(itemId);
    if (!item) {
      throw new Error("Dream review item not found");
    }

    if (item.owner_id !== ownerId) {
      throw new Error("Dream review item does not belong to user");
    }

    return item;
  }

  private async ensureItemsFromExtractedContext(ownerId: string) {
    const [decisions, tasks, risks, questions, observations] =
      await Promise.all([
        this.decisionRepo.findRecentByOwner(ownerId, 12),
        this.taskRepo.findRecentByOwner(ownerId, 12),
        this.riskRepo.findRecentByOwner(ownerId, 12),
        this.questionRepo.findRecentByOwner(ownerId, 12),
        this.observationRepo.findRecentByOwner(ownerId, 12),
      ]);

    for (const decision of decisions) {
      await this.reviewRepo.createOrReturnExisting({
        owner_id: ownerId,
        project_id: decision.project_id,
        package_id: decision.package_id,
        source_type: "decision",
        source_id: decision.id,
        title: `新增 Decision：${decision.title}`,
        summary: decision.detail,
        confidence: decision.confidence,
        payload: {
          decision_key: decision.decision_key,
          status: decision.status,
        },
      });
    }

    for (const task of tasks) {
      await this.reviewRepo.createOrReturnExisting({
        owner_id: ownerId,
        project_id: task.project_id,
        package_id: task.package_id,
        source_type: "task",
        source_id: task.id,
        title: `新增 Task：${task.title}`,
        summary: task.description,
        payload: {
          assignee_id: task.assignee_id,
          priority: task.priority,
          status: task.status,
        },
      });
    }

    for (const risk of risks) {
      await this.reviewRepo.createOrReturnExisting({
        owner_id: ownerId,
        project_id: risk.project_id,
        package_id: risk.package_id,
        source_type: "risk",
        source_id: risk.id,
        title: `新增 Risk：${risk.title}`,
        summary: risk.description,
        payload: {
          mitigation: risk.mitigation,
          severity: risk.severity,
          status: risk.status,
        },
      });
    }

    for (const question of questions) {
      await this.reviewRepo.createOrReturnExisting({
        owner_id: ownerId,
        project_id: question.project_id,
        package_id: question.package_id,
        source_type: "open_question",
        source_id: question.id,
        title: `新增 Open Question：${question.question}`,
        summary: question.context,
        payload: {
          priority: question.priority,
          status: question.status,
        },
      });
    }

    for (const observation of observations) {
      await this.reviewRepo.createOrReturnExisting({
        owner_id: ownerId,
        project_id: observation.project_id,
        package_id: observation.package_id,
        source_type: "observation",
        source_id: observation.id,
        title: `新增 Observation：${observation.content.slice(0, 80)}`,
        summary: observation.content,
        confidence: observation.confidence,
        payload: {
          type: observation.type,
          relevance: observation.relevance,
          tags: observation.tags,
        },
      });
    }
  }
}

function readDreamArchivedDocId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const v = (payload as Record<string, unknown>).dream_archived_doc_id;
  return typeof v === "string" ? v : null;
}

function buildDreamReviewArchiveBody(item: DreamReviewItem): string {
  const lines: string[] = [
    `# ${item.title}`,
    "",
    item.summary?.trim() ? item.summary.trim() : "_（无摘要）_",
    "",
    "## 梦境评审元数据",
    `- 来源类型: ${item.source_type}`,
    item.source_id ? `- 来源记录 ID: ${item.source_id}` : "- 来源记录 ID: —",
    `- 评审项 ID: ${item.id}`,
    item.confidence != null
      ? `- 置信度: ${Number(item.confidence)}`
      : "- 置信度: —",
    "",
    "## 结构化负载",
    JSON.stringify(item.payload ?? {}, null, 2),
  ];
  return lines.join("\n");
}
