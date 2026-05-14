import { closeDb, query, queryOne } from "./db";
import { LLMChatMessage, LLMClient } from "./services/llm.service";
import { AgentRepository } from "./repositories/agent.repository";
import { ArchivedDocumentRepository } from "./repositories/archived-document.repository";
import { ArtifactRepository } from "./repositories/artifact.repository";
import { ContextPackageRepository } from "./repositories/context-package.repository";
import { FolderRepository } from "./repositories/folder.repository";
import { MessageRepository } from "./repositories/message.repository";
import { ProjectRepository } from "./repositories/project.repository";
import { SessionAttachmentRepository } from "./repositories/session-attachment.repository";
import { SessionRepository } from "./repositories/session.repository";
import { UserRepository } from "./repositories/user.repository";
import { ArchiveService } from "./services/archive.service";
import { ArtifactService } from "./services/artifact.service";

class MockArtifactLLM implements LLMClient {
  readonly calls: LLMChatMessage[][] = [];

  async chat(messages: LLMChatMessage[]): Promise<string> {
    this.calls.push(messages);
    return [
      "# 归档测试文档",
      "",
      "## 决策",
      "- 使用三栏 AI Context Workbench 作为主界面",
      "",
      "## 任务",
      "- 实现用户确认后归档 Artifact 的流程",
      "",
      "## 风险",
      "- ContextPackage 兼容旧链路时 agent_id 不能为空",
      "",
      "## 开放问题",
      "- 后续邮件草稿是否需要直接发送",
    ].join("\n");
  }
}

async function main(): Promise<void> {
  console.log("Testing archive flow...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const projectRepo = new ProjectRepository();
  const sessionRepo = new SessionRepository();
  const messageRepo = new MessageRepository();
  const folderRepo = new FolderRepository();
  const artifactRepo = new ArtifactRepository();
  const archivedDocRepo = new ArchivedDocumentRepository();
  const packageRepo = new ContextPackageRepository();
  const attachmentRepo = new SessionAttachmentRepository();
  const mockLLM =
    process.env.ARCHIVE_TEST_USE_MOCK === "1"
      ? new MockArtifactLLM()
      : undefined;
  const artifactService = new ArtifactService({
    artifactRepo,
    messageRepo,
    llm: mockLLM,
  });
  const archiveService = new ArchiveService({
    archivedDocRepo,
    artifactRepo,
    folderRepo,
    packageRepo,
    attachmentRepo,
    sessionRepo,
  });

  let userId: string | null = null;
  let agentId: string | null = null;
  let projectId: string | null = null;
  const sessionIds: string[] = [];
  let folderId: string | null = null;
  let artifactId: string | null = null;
  let documentId: string | null = null;
  let packageId: string | null = null;

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;
    const email = `archive-test-${uniqueSuffix}@example.com`;
    const projectSlug = `archive-test-project-${uniqueSuffix}`;

    console.log("1. Creating user, agent, project, session, and folder...");
    const user = await userRepo.create({
      name: "Archive Test User",
      email,
      role: "member",
    });
    userId = user.id;

    const agent = await agentRepo.create({
      owner_id: user.id,
      name: "Archive Test Agent",
      type: "codex",
    });
    agentId = agent.id;

    const project = await projectRepo.create({
      slug: projectSlug,
      name: "Archive Test Project",
      description: "Temporary archive flow project",
      created_by: user.id,
    });
    projectId = project.id;

    await projectRepo.addMember({
      project_id: project.id,
      user_id: user.id,
      role: "owner",
    });

    const sourceSession = await sessionRepo.create({
      agent_id: agent.id,
      owner_id: user.id,
      project_id: project.id,
    });
    sessionIds.push(sourceSession.id);

    const folder = await folderRepo.create({
      owner_id: user.id,
      name: "Archive Test Folder",
      type: "project",
      project_id: project.id,
    });
    folderId = folder.id;

    console.log("2. Creating conversation and generating artifact...");
    await messageRepo.create({
      session_id: sourceSession.id,
      role: "user",
      content: "请把我们的归档和提取流程整理成文档。",
    });
    await messageRepo.create({
      session_id: sourceSession.id,
      role: "assistant",
      content: "需要覆盖 Artifact、归档、ContextPackage 和结构化提取。",
      model: "mock-model",
      agent_id: agent.id,
    });

    const artifact = await artifactService.generateArtifact(
      sourceSession.id,
      user.id,
      "归档测试文档",
      "请生成归档测试文档",
    );
    artifactId = artifact.id;

    if (!artifact.content.includes("## 决策")) {
      throw new Error("Artifact mock content missing decision section");
    }

    console.log("3. Archiving artifact and running extraction...");
    const archived = await archiveService.archiveArtifact(
      artifact.id,
      folder.id,
      user.id,
      "归档测试摘要",
      ["archive-test", "phase-3"],
    );
    documentId = archived.archivedDocument.id;
    packageId = archived.contextPackage.id;

    if (archived.archivedDocument.artifact_id !== artifact.id) {
      throw new Error("Archived document is not linked to artifact");
    }

    if (archived.contextPackage.source_type !== "artifact") {
      throw new Error("Context package source_type is not artifact");
    }

    assertEqual(archived.extraction.decisionsCreated, 1, "decisionsCreated");
    assertEqual(archived.extraction.tasksCreated, 1, "tasksCreated");
    assertEqual(archived.extraction.risksCreated, 1, "risksCreated");
    assertEqual(archived.extraction.questionsCreated, 1, "questionsCreated");
    assertEqual(
      archived.extraction.observationsCreated,
      1,
      "observationsCreated",
    );

    const archivedArtifact = await artifactRepo.findById(artifact.id);
    if (archivedArtifact?.status !== "archived") {
      throw new Error("Artifact status was not archived");
    }

    const listedDocs = await archiveService.listDocuments(folder.id);
    if (listedDocs.length !== 1 || listedDocs[0]?.id !== documentId) {
      throw new Error("Archived document list failed");
    }

    const foundDoc = await archiveService.getArchivedDocument(documentId);
    if (foundDoc.title !== artifact.title) {
      throw new Error("Archived document lookup failed");
    }

    console.log("4. Verifying extracted rows...");
    const counts = await getExtractionCounts(packageId);
    assertEqual(counts.decisions, 1, "decision row count");
    assertEqual(counts.tasks, 1, "task row count");
    assertEqual(counts.risks, 1, "risk row count");
    assertEqual(counts.open_questions, 1, "open question row count");
    assertEqual(counts.observations, 1, "observation row count");

    console.log("5. Attaching archived document to a new session...");
    const targetSession = await sessionRepo.create({
      agent_id: agent.id,
      owner_id: user.id,
      project_id: project.id,
    });
    sessionIds.push(targetSession.id);

    await archiveService.attachToSession(targetSession.id, documentId);
    const attachments = await archiveService.getSessionAttachments(
      targetSession.id,
    );

    if (
      attachments.length !== 1 ||
      attachments[0]?.document_id !== documentId ||
      attachments[0]?.title !== artifact.title
    ) {
      throw new Error("Session attachment with document detail failed");
    }

    console.log("All archive flow checks passed.");
  } catch (error) {
    console.error("Archive test failed:", error);
    process.exitCode = 1;
  } finally {
    if (sessionIds.length > 0) {
      await query(
        "DELETE FROM session_attachments WHERE session_id = ANY($1::uuid[])",
        [sessionIds],
      );
    }

    if (documentId) {
      await query("DELETE FROM archived_documents WHERE id = $1", [documentId]);
    }

    if (packageId) {
      await deleteByPackageId("observations", packageId);
      await deleteByPackageId("open_questions", packageId);
      await deleteByPackageId("risks", packageId);
      await deleteByPackageId("tasks", packageId);
      await deleteByPackageId("decisions", packageId);
      await query("DELETE FROM session_packages WHERE package_id = $1", [
        packageId,
      ]);
      await query("DELETE FROM context_packages WHERE id = $1", [packageId]);
    }

    if (artifactId) {
      await query("DELETE FROM artifacts WHERE id = $1", [artifactId]);
    }

    if (sessionIds.length > 0) {
      await query("DELETE FROM messages WHERE session_id = ANY($1::uuid[])", [
        sessionIds,
      ]);
      await query("DELETE FROM sessions WHERE id = ANY($1::uuid[])", [
        sessionIds,
      ]);
    }

    if (folderId) {
      await query("DELETE FROM folders WHERE id = $1", [folderId]);
    }

    if (projectId) {
      await query("DELETE FROM project_members WHERE project_id = $1", [
        projectId,
      ]);
      await query("DELETE FROM projects WHERE id = $1", [projectId]);
    }

    if (agentId) {
      await query("DELETE FROM agents WHERE id = $1", [agentId]);
    }

    if (userId) {
      await query("DELETE FROM users WHERE id = $1", [userId]);
    }

    await closeDb();
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function getExtractionCounts(
  packageId: string,
): Promise<Record<string, number>> {
  const result = await queryOne<Record<string, number>>(
    `SELECT
       (SELECT COUNT(*) FROM decisions WHERE package_id = $1) AS decisions,
       (SELECT COUNT(*) FROM tasks WHERE package_id = $1) AS tasks,
       (SELECT COUNT(*) FROM risks WHERE package_id = $1) AS risks,
       (SELECT COUNT(*) FROM open_questions WHERE package_id = $1) AS open_questions,
       (SELECT COUNT(*) FROM observations WHERE package_id = $1) AS observations`,
    [packageId],
  );

  if (!result) {
    throw new Error("Failed to read extraction counts");
  }

  return result;
}

async function deleteByPackageId(
  tableName: string,
  packageId: string,
): Promise<void> {
  await query(`DELETE FROM ${tableName} WHERE package_id = $1`, [packageId]);
}

void main();
