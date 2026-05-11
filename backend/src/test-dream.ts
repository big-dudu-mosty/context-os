import { closeDb, query } from "./db";
import { AgentRepository } from "./repositories/agent.repository";
import { ContextPackageRepository } from "./repositories/context-package.repository";
import { ProjectRepository } from "./repositories/project.repository";
import { SessionRepository } from "./repositories/session.repository";
import { UserRepository } from "./repositories/user.repository";
import { DreamService } from "./services/dream.service";

async function main(): Promise<void> {
  console.log("Testing Dream Consolidation...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const projectRepo = new ProjectRepository();
  const sessionRepo = new SessionRepository();
  const packageRepo = new ContextPackageRepository();

  let userId: string | null = null;
  let agentId: string | null = null;
  let projectId: string | null = null;
  let sessionId: string | null = null;
  let packageId: string | null = null;

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;

    console.log("1. Creating test user and agent...");
    const user = await userRepo.create({
      name: "Dream Test User",
      email: `dream-test-${uniqueSuffix}@example.com`,
      role: "member",
    });
    userId = user.id;

    const agent = await agentRepo.create({
      owner_id: user.id,
      name: "Dream Test Agent",
      type: "claude-code-cli",
    });
    agentId = agent.id;

    const project = await projectRepo.create({
      slug: `dream-test-${uniqueSuffix}`,
      name: "Dream Test Project",
      description: "Temporary dream test project",
      created_by: user.id,
    });
    projectId = project.id;

    await projectRepo.addMember({
      project_id: project.id,
      user_id: user.id,
      role: "owner",
    });

    console.log("2. Creating test session...");
    const session = await sessionRepo.create({
      agent_id: agent.id,
      owner_id: user.id,
      project_id: project.id,
    });
    sessionId = session.id;

    await sessionRepo.update(session.id, {
      ended_at: new Date(),
      transcript_path: "/tmp/test-session.md",
      transcript_hash: "2".repeat(64),
      dream_status: "pending",
    });

    console.log("3. Running dream consolidation...");
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const dreamService =
      process.env.DREAM_TEST_USE_MOCK === "1"
        ? new DreamService({ llm: createMockLlm(project.id) })
        : new DreamService();
    const result = await dreamService.dreamForAgent(agent.id, dayStart);

    if (!result.success) {
      throw new Error(result.error ?? "Dream failed");
    }

    if (!result.packageId) {
      throw new Error("Dream succeeded but did not create a package");
    }

    packageId = result.packageId;

    const pkg = await packageRepo.findById(result.packageId);
    if (!pkg) {
      throw new Error("Dream package was not found");
    }

    const updatedSession = await sessionRepo.findById(session.id);
    if (updatedSession?.dream_status !== "completed") {
      throw new Error("Session dream_status was not updated to completed");
    }

    const sessionPackages = await packageRepo.getSessionPackages(session.id);
    if (sessionPackages.length !== 1) {
      throw new Error("Dream package was not linked to the session");
    }

    console.log("Dream completed successfully.");
    console.log("Package ID:", result.packageId);
  } catch (error) {
    console.error("Dream test failed:", error);
    process.exitCode = 1;
  } finally {
    if (sessionId) {
      await query("DELETE FROM session_packages WHERE session_id = $1", [
        sessionId,
      ]);
    }

    if (packageId) {
      await query("DELETE FROM observations WHERE package_id = $1", [
        packageId,
      ]);
      await query("DELETE FROM open_questions WHERE package_id = $1", [
        packageId,
      ]);
      await query("DELETE FROM risks WHERE package_id = $1", [packageId]);
      await query("DELETE FROM tasks WHERE package_id = $1", [packageId]);
      await query("DELETE FROM decisions WHERE package_id = $1", [packageId]);
      await query("DELETE FROM context_packages WHERE id = $1", [packageId]);
    }

    if (sessionId) {
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

function createMockLlm(projectId: string) {
  return {
    async chat(): Promise<string> {
      return `schema_version: "context-package/v1"

package:
  id: "pkg_test"
  title: "Dream test consolidation"
  type: "development_context"
  created_at: "${new Date().toISOString()}"

project_ids:
  - "${projectId}"

summary: |
  A deterministic test consolidation package was generated for the Dream flow.
  It validates package creation, session linking, and session status updates.

decisions:
  - id: "dec_001"
    title: "Use repository-backed Dream persistence"
    detail: "Dream output is persisted as an immutable context package."
    confidence: 0.9

tasks:
  - id: "task_001"
    title: "Verify Dream consolidation flow"
    status: "todo"
    priority: "high"

risks: []
open_questions: []

observations:
  - type: "insight"
    content: "Dream consolidation can be verified independently of the live LLM provider."
    relevance: "testing"
    confidence: 0.8
    tags: ["dream", "repository"]
`;
    },
  };
}

void main();
