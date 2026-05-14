import { closeDb, query } from "./db";
import { LLMChatMessage, LLMClient } from "./services/llm.service";
import { AgentRepository } from "./repositories/agent.repository";
import { ArtifactRepository } from "./repositories/artifact.repository";
import { MessageRepository } from "./repositories/message.repository";
import { ProjectRepository } from "./repositories/project.repository";
import { SessionRepository } from "./repositories/session.repository";
import { UserRepository } from "./repositories/user.repository";
import { ArtifactService } from "./services/artifact.service";

class MockArtifactLLM implements LLMClient {
  readonly calls: LLMChatMessage[][] = [];

  async chat(messages: LLMChatMessage[]): Promise<string> {
    this.calls.push(messages);
    const prompt = messages[0]?.content ?? "";

    if (!prompt.includes("请整理成产品需求文档")) {
      throw new Error("Artifact prompt did not include custom user request");
    }

    if (
      !prompt.includes("用户需要一个三栏 AI Context Workbench") ||
      !prompt.includes("右侧只显示确认归档的文档")
    ) {
      throw new Error("Artifact prompt did not include conversation history");
    }

    return [
      "# AI Context Workbench 产品需求",
      "",
      "## 核心决策",
      "- 采用左中右三栏工作台。",
      "- 右侧只显示用户确认归档的文档。",
    ].join("\n");
  }
}

async function main(): Promise<void> {
  console.log("Testing artifact flow...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const projectRepo = new ProjectRepository();
  const sessionRepo = new SessionRepository();
  const messageRepo = new MessageRepository();
  const artifactRepo = new ArtifactRepository();
  const mockLLM =
    process.env.ARTIFACT_TEST_USE_MOCK === "1"
      ? new MockArtifactLLM()
      : undefined;
  const artifactService = new ArtifactService({
    artifactRepo,
    messageRepo,
    llm: mockLLM,
  });

  let userId: string | null = null;
  let agentId: string | null = null;
  let projectId: string | null = null;
  let sessionId: string | null = null;
  let artifactId: string | null = null;

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;
    const email = `artifact-test-${uniqueSuffix}@example.com`;
    const projectSlug = `artifact-test-project-${uniqueSuffix}`;

    console.log("1. Creating user, agent, project, and session...");
    const user = await userRepo.create({
      name: "Artifact Test User",
      email,
      role: "member",
    });
    userId = user.id;

    const agent = await agentRepo.create({
      owner_id: user.id,
      name: "Artifact Test Agent",
      type: "codex",
    });
    agentId = agent.id;

    const project = await projectRepo.create({
      slug: projectSlug,
      name: "Artifact Test Project",
      description: "Temporary artifact flow project",
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

    console.log("2. Creating conversation messages...");
    await messageRepo.create({
      session_id: session.id,
      role: "user",
      content: "用户需要一个三栏 AI Context Workbench。",
    });
    await messageRepo.create({
      session_id: session.id,
      role: "assistant",
      content: "建议左侧放会话和上下文，中间对话，右侧详情。",
      model: "mock-model",
      agent_id: agent.id,
    });
    await messageRepo.create({
      session_id: session.id,
      role: "user",
      content: "右侧只显示确认归档的文档。",
    });

    console.log("3. Generating artifact draft...");
    const artifact = await artifactService.generateArtifact(
      session.id,
      user.id,
      "产品需求整理",
      "请整理成产品需求文档",
    );
    artifactId = artifact.id;

    if (!artifact.content.includes("# AI Context Workbench 产品需求")) {
      throw new Error("Generated artifact content is incorrect");
    }

    if (mockLLM && mockLLM.calls.length !== 1) {
      throw new Error(
        `Expected 1 mock LLM call, found ${mockLLM.calls.length}`,
      );
    }

    console.log("4. Updating and querying artifact...");
    const updated = await artifactService.updateArtifact(
      artifact.id,
      `${artifact.content}\n\n## 后续动作\n- 进入归档流程。`,
    );

    if (!updated.content.includes("进入归档流程")) {
      throw new Error("Artifact update failed");
    }

    const found = await artifactService.getArtifact(artifact.id);
    if (found.id !== artifact.id) {
      throw new Error("Artifact getById returned wrong artifact");
    }

    const artifacts = await artifactService.listArtifacts(session.id);
    if (artifacts.length !== 1 || artifacts[0]?.id !== artifact.id) {
      throw new Error("Artifact listBySession failed");
    }

    console.log("5. Deleting artifact...");
    await artifactService.deleteArtifact(artifact.id);
    artifactId = null;

    const deleted = await artifactRepo.findById(artifact.id);
    if (deleted) {
      throw new Error("Artifact delete failed");
    }

    console.log("All artifact flow checks passed.");
  } catch (error) {
    console.error("Artifact test failed:", error);
    process.exitCode = 1;
  } finally {
    if (artifactId) {
      await query("DELETE FROM artifacts WHERE id = $1", [artifactId]);
    }

    if (sessionId) {
      await query("DELETE FROM messages WHERE session_id = $1", [sessionId]);
      await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
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
