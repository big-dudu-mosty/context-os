import { closeDb, query } from "./db";
import { LLMChatMessage, LLMClient } from "./services/llm.service";
import { AgentRepository } from "./repositories/agent.repository";
import { ArchivedDocumentRepository } from "./repositories/archived-document.repository";
import { ArtifactRepository } from "./repositories/artifact.repository";
import { FolderRepository } from "./repositories/folder.repository";
import { MessageRepository } from "./repositories/message.repository";
import { ProjectRepository } from "./repositories/project.repository";
import { SessionAttachmentRepository } from "./repositories/session-attachment.repository";
import { SessionRepository } from "./repositories/session.repository";
import { UserRepository } from "./repositories/user.repository";
import { ChatService } from "./services/chat.service";

class MockLLM implements LLMClient {
  readonly calls: LLMChatMessage[][] = [];

  async chat(messages: LLMChatMessage[]): Promise<string> {
    this.calls.push(messages);
    const latest = messages[messages.length - 1];
    return `Mock reply ${this.calls.length}: ${latest?.content ?? ""}`;
  }
}

async function main(): Promise<void> {
  console.log("Testing chat flow...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const projectRepo = new ProjectRepository();
  const sessionRepo = new SessionRepository();
  const messageRepo = new MessageRepository();
  const folderRepo = new FolderRepository();
  const artifactRepo = new ArtifactRepository();
  const archivedDocumentRepo = new ArchivedDocumentRepository();
  const sessionAttachmentRepo = new SessionAttachmentRepository();
  const mockLLM = new MockLLM();
  const chatService = new ChatService({
    messageRepo,
    llm: mockLLM,
  });

  let userId: string | null = null;
  let agentId: string | null = null;
  let projectId: string | null = null;
  let sessionId: string | null = null;
  let folderId: string | null = null;
  let artifactId: string | null = null;
  let documentId: string | null = null;

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;
    const email = `chat-test-${uniqueSuffix}@example.com`;
    const projectSlug = `chat-test-project-${uniqueSuffix}`;

    console.log("1. Creating user, agent, project, and session...");
    const user = await userRepo.create({
      name: "Chat Test User",
      email,
      role: "member",
    });
    userId = user.id;

    const agent = await agentRepo.create({
      owner_id: user.id,
      name: "Chat Test Agent",
      type: "codex",
    });
    agentId = agent.id;

    const project = await projectRepo.create({
      slug: projectSlug,
      name: "Chat Test Project",
      description: "Temporary chat flow project",
      created_by: user.id,
    });
    projectId = project.id;

    await projectRepo.addMember({
      project_id: project.id,
      user_id: user.id,
      role: "owner",
    });

    const session = await sessionRepo.create({
      agent_id: agent.id,
      owner_id: user.id,
      project_id: project.id,
    });
    sessionId = session.id;

    console.log("2. Creating project context folder...");
    const folder = await folderRepo.create({
      owner_id: user.id,
      name: "Chat Test Folder",
      type: "project",
      project_id: project.id,
    });
    folderId = folder.id;

    console.log("3. Running two chat turns with mock LLM...");
    const firstReply = await chatService.chat(
      session.id,
      "请总结今天的项目目标",
      "mock-model",
      agent.id,
    );
    const secondReply = await chatService.chat(
      session.id,
      "继续补充风险",
      "mock-model",
      agent.id,
    );

    if (!firstReply.content.includes("请总结今天的项目目标")) {
      throw new Error("First assistant reply did not use user message");
    }

    if (!secondReply.content.includes("继续补充风险")) {
      throw new Error("Second assistant reply did not use latest user message");
    }

    if (mockLLM.calls.length !== 2) {
      throw new Error(`Expected 2 LLM calls, found ${mockLLM.calls.length}`);
    }

    const latestMessages = await chatService.getMessages(session.id, 10);
    if (latestMessages.length !== 4) {
      throw new Error(`Expected 4 messages, found ${latestMessages.length}`);
    }

    if (
      latestMessages[0]?.role !== "assistant" ||
      latestMessages[1]?.role !== "user" ||
      latestMessages[2]?.role !== "assistant" ||
      latestMessages[3]?.role !== "user"
    ) {
      throw new Error("Messages are not returned in descending time order");
    }

    console.log("4. Creating artifact, archived document, and attachment...");
    const artifact = await artifactRepo.create({
      session_id: session.id,
      title: "项目目标整理",
      content: firstReply.content,
      created_by: user.id,
    });
    artifactId = artifact.id;

    const archived = await archivedDocumentRepo.create({
      artifact_id: artifact.id,
      folder_id: folder.id,
      title: artifact.title,
      content: artifact.content,
      summary: "由对话生成并确认归档的项目目标整理。",
      tags: ["chat-test", "project-context"],
      created_by: user.id,
    });
    documentId = archived.id;

    const updatedArtifact = await artifactRepo.updateStatus(
      artifact.id,
      "archived",
    );
    if (updatedArtifact?.status !== "archived") {
      throw new Error("Artifact status was not updated to archived");
    }

    await sessionAttachmentRepo.create({
      session_id: session.id,
      document_id: archived.id,
    });

    const attachments = await sessionAttachmentRepo.findBySession(session.id);
    if (
      attachments.length !== 1 ||
      attachments[0]?.document_id !== archived.id
    ) {
      throw new Error("Session attachment query failed");
    }

    console.log("All chat flow checks passed.");
  } catch (error) {
    console.error("Chat test failed:", error);
    process.exitCode = 1;
  } finally {
    if (sessionId && documentId) {
      await query(
        `DELETE FROM session_attachments
         WHERE session_id = $1 AND document_id = $2`,
        [sessionId, documentId],
      );
    }

    if (documentId) {
      await query("DELETE FROM archived_documents WHERE id = $1", [documentId]);
    }

    if (artifactId) {
      await query("DELETE FROM artifacts WHERE id = $1", [artifactId]);
    }

    if (sessionId) {
      await query("DELETE FROM messages WHERE session_id = $1", [sessionId]);
      await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
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

void main();
