import { closeDb, query } from "./db";
import { AgentRepository } from "./repositories/agent.repository";
import { ContextPackageRepository } from "./repositories/context-package.repository";
import { DecisionRepository } from "./repositories/decision.repository";
import { OpenQuestionRepository } from "./repositories/open-question.repository";
import { ProjectRepository } from "./repositories/project.repository";
import { RiskRepository } from "./repositories/risk.repository";
import { TaskRepository } from "./repositories/task.repository";
import { UserRepository } from "./repositories/user.repository";
import { BriefingService } from "./services/briefing.service";

async function main(): Promise<void> {
  console.log("Testing Briefing Generation...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const projectRepo = new ProjectRepository();
  const packageRepo = new ContextPackageRepository();
  const decisionRepo = new DecisionRepository();
  const taskRepo = new TaskRepository();
  const riskRepo = new RiskRepository();
  const questionRepo = new OpenQuestionRepository();

  let userId: string | null = null;
  let agentId: string | null = null;
  let projectId: string | null = null;
  let packageId: string | null = null;

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;

    console.log("1. Creating test fixtures...");
    const user = await userRepo.create({
      name: "Briefing Test User",
      email: `briefing-test-${uniqueSuffix}@example.com`,
      role: "member",
    });
    userId = user.id;

    const agent = await agentRepo.create({
      owner_id: user.id,
      name: "Briefing Test Agent",
      type: "claude-code-cli",
    });
    agentId = agent.id;

    const project = await projectRepo.create({
      slug: `briefing-test-${uniqueSuffix}`,
      name: "Briefing Test Project",
      created_by: user.id,
    });
    projectId = project.id;

    console.log("2. Creating test context...");
    const contextPackage = await packageRepo.create({
      source_type: "test",
      owner_id: user.id,
      agent_id: agent.id,
      title: "Test Work Package",
      summary: "Implemented user authentication",
      raw_yaml: "test: yaml",
      raw_yaml_hash: "3".repeat(64),
      project_ids: [project.id],
    });
    packageId = contextPackage.id;

    await decisionRepo.create({
      package_id: contextPackage.id,
      project_id: project.id,
      decision_key: `use_postgres_${uniqueSuffix}`,
      title: "Use PostgreSQL for database",
      detail: "Better JSON support",
      confidence: 0.9,
      owner_id: user.id,
    });

    await taskRepo.create({
      package_id: contextPackage.id,
      project_id: project.id,
      title: "Implement user login",
      status: "todo",
      priority: "high",
      owner_id: user.id,
    });

    await riskRepo.create({
      package_id: contextPackage.id,
      project_id: project.id,
      title: "Authentication rollout risk",
      severity: "medium",
      mitigation: "Run staged rollout",
      owner_id: user.id,
    });

    await questionRepo.create({
      package_id: contextPackage.id,
      project_id: project.id,
      question: "Which session timeout should be used?",
      priority: "medium",
      owner_id: user.id,
    });

    console.log("3. Generating briefing...");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const briefingService =
      process.env.BRIEFING_TEST_USE_MOCK === "1"
        ? new BriefingService({ llm: createMockLlm() })
        : new BriefingService();
    const result = await briefingService.generateBriefing(user.id, today);

    if (!result.generated) {
      throw new Error("Expected briefing to be newly generated");
    }

    if (!result.briefingId || result.content.length === 0) {
      throw new Error("Briefing result was empty");
    }

    console.log("Briefing generated successfully.");
    console.log("ID:", result.briefingId);
    console.log("Content length:", result.content.length);

    console.log("4. Testing cache...");
    const cached = await briefingService.generateBriefing(user.id, today);

    if (cached.generated) {
      throw new Error("Expected briefing to be returned from cache");
    }

    if (cached.briefingId !== result.briefingId) {
      throw new Error("Cached briefing id did not match original id");
    }

    console.log("Cached briefing returned successfully.");
  } catch (error) {
    console.error("Briefing test failed:", error);
    process.exitCode = 1;
  } finally {
    if (userId) {
      await query("DELETE FROM briefings WHERE owner_id = $1", [userId]);
    }

    if (packageId) {
      await query("DELETE FROM open_questions WHERE package_id = $1", [
        packageId,
      ]);
      await query("DELETE FROM risks WHERE package_id = $1", [packageId]);
      await query("DELETE FROM tasks WHERE package_id = $1", [packageId]);
      await query("DELETE FROM decisions WHERE package_id = $1", [packageId]);
      await query("DELETE FROM context_packages WHERE id = $1", [packageId]);
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

function createMockLlm() {
  return {
    async chat(
      messages: Array<{ role: string; content: string }>,
    ): Promise<string> {
      const prompt = messages[0]?.content ?? "";
      if (!prompt.includes("Test Work Package")) {
        throw new Error("Briefing prompt did not include recent work context");
      }

      return `## Daily Briefing

Recent progress centered on authentication work, including a PostgreSQL-backed implementation plan and an initial login task.

Today's focus should be completing the login flow, deciding the session timeout, and reducing rollout risk with a staged release.

Recommended actions:
1. Finish the high-priority login task.
2. Decide the timeout policy.
3. Prepare the staged rollout checklist.`;
    },
  };
}

void main();
