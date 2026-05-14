import { createHash } from "crypto";
import YAML from "yaml";
import { ArchivedDocumentRepository } from "../repositories/archived-document.repository";
import { ArtifactRepository } from "../repositories/artifact.repository";
import { ContextPackageRepository } from "../repositories/context-package.repository";
import { FolderRepository } from "../repositories/folder.repository";
import { SessionAttachmentRepository } from "../repositories/session-attachment.repository";
import { SessionRepository } from "../repositories/session.repository";
import { ExtractionResult, ExtractionService } from "./extraction.service";

export interface ArchiveServiceOptions {
  archivedDocRepo?: ArchivedDocumentRepository;
  artifactRepo?: ArtifactRepository;
  folderRepo?: FolderRepository;
  packageRepo?: ContextPackageRepository;
  attachmentRepo?: SessionAttachmentRepository;
  sessionRepo?: SessionRepository;
  extractionService?: ExtractionService;
}

interface ExtractedArtifactItems {
  decisions: string[];
  tasks: string[];
  risks: string[];
  questions: string[];
}

export class ArchiveService {
  private readonly archivedDocRepo: ArchivedDocumentRepository;
  private readonly artifactRepo: ArtifactRepository;
  private readonly folderRepo: FolderRepository;
  private readonly packageRepo: ContextPackageRepository;
  private readonly attachmentRepo: SessionAttachmentRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly extractionService: ExtractionService;

  constructor(options: ArchiveServiceOptions = {}) {
    this.archivedDocRepo =
      options.archivedDocRepo ?? new ArchivedDocumentRepository();
    this.artifactRepo = options.artifactRepo ?? new ArtifactRepository();
    this.folderRepo = options.folderRepo ?? new FolderRepository();
    this.packageRepo = options.packageRepo ?? new ContextPackageRepository();
    this.attachmentRepo =
      options.attachmentRepo ?? new SessionAttachmentRepository();
    this.sessionRepo = options.sessionRepo ?? new SessionRepository();
    this.extractionService =
      options.extractionService ?? new ExtractionService();
  }

  async archiveArtifact(
    artifactId: string,
    folderId: string,
    userId: string,
    summary?: string,
    tags?: string[],
  ): Promise<{
    archivedDocument: Awaited<ReturnType<ArchivedDocumentRepository["create"]>>;
    contextPackage: Awaited<ReturnType<ContextPackageRepository["create"]>>;
    extraction: ExtractionResult;
  }> {
    const artifact = await this.artifactRepo.findById(artifactId);
    if (!artifact) {
      throw new Error("Artifact not found");
    }

    if (artifact.created_by !== userId) {
      throw new Error("Artifact does not belong to user");
    }

    const folder = await this.folderRepo.findById(folderId);
    if (!folder) {
      throw new Error("Folder not found");
    }

    if (folder.owner_id !== userId) {
      throw new Error("Folder does not belong to user");
    }

    const session = await this.sessionRepo.findById(artifact.session_id);
    if (!session) {
      throw new Error("Session not found");
    }

    const archivedDoc = await this.archivedDocRepo.create({
      artifact_id: artifactId,
      folder_id: folderId,
      title: artifact.title,
      content: artifact.content,
      summary,
      tags,
      created_by: userId,
    });

    await this.artifactRepo.update(artifactId, { status: "archived" });

    const projectIds = folder.project_id ? [folder.project_id] : [];
    const rawYaml = this.convertToYAML(artifact.content, artifact.title, {
      summary,
      tags,
    });
    const contextPackage = await this.packageRepo.create({
      source_type: "artifact",
      owner_id: userId,
      agent_id: session.agent_id,
      title: artifact.title,
      summary: summary ?? artifact.title,
      raw_yaml: rawYaml,
      raw_yaml_hash: this.hashContent(rawYaml),
      project_ids: projectIds,
    });

    await this.packageRepo.linkSession(contextPackage.id, artifact.session_id);

    const extraction = await this.extractionService.extractFromYaml(
      contextPackage.id,
      userId,
      rawYaml,
      projectIds,
    );

    return {
      archivedDocument: archivedDoc,
      contextPackage,
      extraction,
    };
  }

  async getArchivedDocument(documentId: string) {
    const doc = await this.archivedDocRepo.findById(documentId);
    if (!doc) {
      throw new Error("Archived document not found");
    }

    return doc;
  }

  async listDocuments(folderId: string) {
    return this.archivedDocRepo.findByFolder(folderId);
  }

  async attachToSession(sessionId: string, documentId: string) {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const doc = await this.archivedDocRepo.findById(documentId);
    if (!doc) {
      throw new Error("Document not found");
    }

    return this.attachmentRepo.create({
      session_id: sessionId,
      document_id: documentId,
    });
  }

  async getSessionAttachments(sessionId: string) {
    return this.attachmentRepo.findBySession(sessionId);
  }

  private convertToYAML(
    content: string,
    title: string,
    options: { summary?: string; tags?: string[] } = {},
  ): string {
    const items = this.extractMarkdownItems(content);
    const summary = options.summary ?? firstMeaningfulLine(content) ?? title;
    const tags = options.tags ?? [];

    return YAML.stringify({
      schema_version: "context-package/v1",
      package: {
        title,
        type: "artifact",
      },
      summary,
      content,
      decisions: items.decisions.map((item, index) => ({
        id: `artifact_dec_${index + 1}`,
        title: item,
        detail: item,
        confidence: 0.8,
      })),
      tasks: items.tasks.map((item) => ({
        title: item,
        status: "todo",
      })),
      risks: items.risks.map((item) => ({
        title: item,
        severity: "medium",
      })),
      open_questions: items.questions.map((item) => ({
        question: item,
      })),
      observations: [
        {
          type: "artifact",
          content: summary,
          confidence: 0.8,
          tags,
        },
      ],
    });
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private extractMarkdownItems(content: string): ExtractedArtifactItems {
    const items: ExtractedArtifactItems = {
      decisions: [],
      tasks: [],
      risks: [],
      questions: [],
    };
    let currentSection = "";

    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      if (heading?.[1]) {
        currentSection = heading[1].toLowerCase();
        continue;
      }

      const bullet = line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
      if (!bullet?.[1]) {
        continue;
      }

      const value = cleanMarkdownListItem(bullet[1]);
      if (!value) {
        continue;
      }

      if (isDecisionSection(currentSection)) {
        items.decisions.push(value);
      } else if (isTaskSection(currentSection)) {
        items.tasks.push(value);
      } else if (isRiskSection(currentSection)) {
        items.risks.push(value);
      } else if (isQuestionSection(currentSection)) {
        items.questions.push(value);
      }
    }

    return items;
  }
}

function isDecisionSection(section: string): boolean {
  return section.includes("决策") || section.includes("decision");
}

function isTaskSection(section: string): boolean {
  return (
    section.includes("任务") ||
    section.includes("待办") ||
    section.includes("task") ||
    section.includes("todo")
  );
}

function isRiskSection(section: string): boolean {
  return section.includes("风险") || section.includes("risk");
}

function isQuestionSection(section: string): boolean {
  return section.includes("问题") || section.includes("question");
}

function cleanMarkdownListItem(value: string): string {
  return value
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function firstMeaningfulLine(content: string): string | undefined {
  return content
    .split("\n")
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
    .find(Boolean);
}
