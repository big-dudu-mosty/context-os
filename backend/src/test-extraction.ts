import { closeDb, query, queryOne } from "./db";
import { AgentRepository } from "./repositories/agent.repository";
import { ContextPackageRepository } from "./repositories/context-package.repository";
import { DecisionRepository } from "./repositories/decision.repository";
import { ProjectRepository } from "./repositories/project.repository";
import { UserRepository } from "./repositories/user.repository";
import { ExtractionService } from "./services/extraction.service";

async function main(): Promise<void> {
  console.log("Testing Extraction...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const projectRepo = new ProjectRepository();
  const packageRepo = new ContextPackageRepository();
  const extractionService = new ExtractionService();
  const decisionRepo = new DecisionRepository();

  let userId: string | null = null;
  let agentId: string | null = null;
  let projectId: string | null = null;
  const packageIds: string[] = [];

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;

    console.log("1. Creating test fixtures...");
    const user = await userRepo.create({
      name: "Extraction Test User",
      email: `extraction-test-${uniqueSuffix}@example.com`,
      role: "member",
    });
    userId = user.id;

    const agent = await agentRepo.create({
      owner_id: user.id,
      name: "Extraction Test Agent",
      type: "claude-code-cli",
    });
    agentId = agent.id;

    const project = await projectRepo.create({
      slug: `extraction-test-${uniqueSuffix}`,
      name: "Extraction Test Project",
      created_by: user.id,
    });
    projectId = project.id;

    const testYaml = `
schema_version: "context-package/v1"

package:
  id: "pkg_test"
  title: "Test Package"
  type: "development_context"

decisions:
  - id: "dec_001"
    title: "Use PostgreSQL for database"
    detail: "PostgreSQL provides better JSON support"
    confidence: 0.9

tasks:
  - title: "Implement user authentication"
    status: "todo"
    priority: "high"

risks:
  - title: "Database migration complexity"
    severity: "medium"
    mitigation: "Use migration tool"

open_questions:
  - question: "Which caching strategy to use?"
    priority: "high"

observations:
  - type: "insight"
    content: "Team prefers TypeScript"
    confidence: 0.8
    tags: ["language", "preference"]
`;

    console.log("2. Creating first context package...");
    const firstPackage = await packageRepo.create({
      source_type: "test",
      owner_id: user.id,
      agent_id: agent.id,
      title: "Extraction Test Package 1",
      raw_yaml: testYaml,
      raw_yaml_hash: "1".repeat(64),
      project_ids: [project.id],
    });
    packageIds.push(firstPackage.id);

    console.log("3. Running first extraction...");
    const firstResult = await extractionService.extractFromYaml(
      firstPackage.id,
      user.id,
      testYaml,
      [project.id],
    );

    assertEqual(firstResult.decisionsCreated, 1, "first decisionsCreated");
    assertEqual(firstResult.tasksCreated, 1, "first tasksCreated");
    assertEqual(firstResult.risksCreated, 1, "first risksCreated");
    assertEqual(firstResult.questionsCreated, 1, "first questionsCreated");
    assertEqual(
      firstResult.observationsCreated,
      1,
      "first observationsCreated",
    );
    assertEqual(firstResult.conflictsDetected, 0, "first conflictsDetected");

    console.log("4. Creating second context package for conflict check...");
    const secondPackage = await packageRepo.create({
      source_type: "test",
      owner_id: user.id,
      agent_id: agent.id,
      title: "Extraction Test Package 2",
      raw_yaml: testYaml,
      raw_yaml_hash: "2".repeat(64),
      project_ids: [project.id],
    });
    packageIds.push(secondPackage.id);

    console.log("5. Running second extraction...");
    const secondResult = await extractionService.extractFromYaml(
      secondPackage.id,
      user.id,
      testYaml,
      [project.id],
    );

    assertEqual(secondResult.decisionsCreated, 1, "second decisionsCreated");
    assertEqual(secondResult.conflictsDetected, 1, "second conflictsDetected");

    console.log("6. Verifying extracted rows...");
    const decisions = await decisionRepo.findByProject(project.id);
    assertEqual(decisions.length, 2, "decision row count");

    const conflictGroupIds = decisions
      .map((decision) => decision.conflict_group_id)
      .filter((value): value is string => Boolean(value));
    assertEqual(conflictGroupIds.length, 2, "conflicted decision row count");
    assertEqual(
      new Set(conflictGroupIds).size,
      1,
      "shared conflict group count",
    );

    const counts = await getExtractionCounts(packageIds);
    assertEqual(counts.tasks, 2, "task row count");
    assertEqual(counts.risks, 2, "risk row count");
    assertEqual(counts.open_questions, 2, "open question row count");
    assertEqual(counts.observations, 2, "observation row count");

    console.log("Extraction completed successfully.");
    console.log("Conflicts detected:", secondResult.conflictsDetected);
  } catch (error) {
    console.error("Extraction test failed:", error);
    process.exitCode = 1;
  } finally {
    if (packageIds.length > 0) {
      await deleteByPackageIds("observations", packageIds);
      await deleteByPackageIds("open_questions", packageIds);
      await deleteByPackageIds("risks", packageIds);
      await deleteByPackageIds("tasks", packageIds);
      await deleteByPackageIds("decisions", packageIds);
      await query("DELETE FROM context_packages WHERE id = ANY($1::uuid[])", [
        packageIds,
      ]);
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
  packageIds: string[],
): Promise<Record<string, number>> {
  const result = await queryOne<Record<string, number>>(
    `SELECT
       (SELECT COUNT(*) FROM tasks WHERE package_id = ANY($1::uuid[])) AS tasks,
       (SELECT COUNT(*) FROM risks WHERE package_id = ANY($1::uuid[])) AS risks,
       (SELECT COUNT(*) FROM open_questions WHERE package_id = ANY($1::uuid[])) AS open_questions,
       (SELECT COUNT(*) FROM observations WHERE package_id = ANY($1::uuid[])) AS observations`,
    [packageIds],
  );

  if (!result) {
    throw new Error("Failed to read extraction counts");
  }

  return result;
}

async function deleteByPackageIds(
  tableName: string,
  packageIds: string[],
): Promise<void> {
  await query(
    `DELETE FROM ${tableName}
     WHERE package_id = ANY($1::uuid[])`,
    [packageIds],
  );
}

void main();
