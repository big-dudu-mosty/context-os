import { closeDb, query, queryOne } from "./db";
import { AgentRepository } from "./repositories/agent.repository";
import { ContextPackageRepository } from "./repositories/context-package.repository";
import { DecisionRepository } from "./repositories/decision.repository";
import { FolderRepository } from "./repositories/folder.repository";
import { ProjectRepository } from "./repositories/project.repository";
import { SessionRepository } from "./repositories/session.repository";
import { UserRepository } from "./repositories/user.repository";
import { DreamReviewService } from "./services/dream-review.service";
import { HandoffService } from "./services/handoff.service";

async function main(): Promise<void> {
  console.log("Testing workbench action support...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const projectRepo = new ProjectRepository();
  const sessionRepo = new SessionRepository();
  const packageRepo = new ContextPackageRepository();
  const decisionRepo = new DecisionRepository();
  const dreamReviewService = new DreamReviewService();
  const handoffService = new HandoffService();

  const sessionIds: string[] = [];
  let senderId: string | null = null;
  let receiverId: string | null = null;
  let projectId: string | null = null;
  let agentId: string | null = null;
  let receiverAgentId: string | null = null;
  let packageId: string | null = null;
  let decisionId: string | null = null;
  let handoffId: string | null = null;

  try {
    const suffix = `${Date.now()}-${process.pid}`;

    const sender = await userRepo.create({
      name: "Workbench Sender",
      email: `workbench-sender-${suffix}@example.com`,
    });
    senderId = sender.id;

    const receiver = await userRepo.create({
      name: "Workbench Receiver",
      email: `workbench-receiver-${suffix}@example.com`,
    });
    receiverId = receiver.id;

    const agent = await agentRepo.create({
      owner_id: sender.id,
      name: "Workbench Source Agent",
      type: "web-workbench",
    });
    agentId = agent.id;

    const project = await projectRepo.create({
      slug: `workbench-actions-${suffix}`,
      name: "Workbench Action Test",
      created_by: sender.id,
    });
    projectId = project.id;

    await projectRepo.addMember({
      project_id: project.id,
      user_id: sender.id,
      role: "owner",
    });

    const folderRepo = new FolderRepository();
    await folderRepo.create({
      owner_id: sender.id,
      name: "项目上下文",
      type: "project",
      project_id: project.id,
    });
    await folderRepo.create({
      owner_id: sender.id,
      name: "公司上下文",
      type: "company",
    });

    const sourceSession = await sessionRepo.create({
      agent_id: agent.id,
      owner_id: sender.id,
      project_id: project.id,
    });
    sessionIds.push(sourceSession.id);

    const contextPackage = await packageRepo.create({
      source_type: "artifact",
      owner_id: sender.id,
      agent_id: agent.id,
      title: "Workbench Package",
      summary: "Workbench package summary",
      raw_yaml: "package:\n  title: Workbench Package\nsummary: Test\n",
      raw_yaml_hash: `${suffix}`.padEnd(64, "0").slice(0, 64),
      project_ids: [project.id],
    });
    packageId = contextPackage.id;
    await packageRepo.linkSession(contextPackage.id, sourceSession.id);

    const decision = await decisionRepo.create({
      package_id: contextPackage.id,
      project_id: project.id,
      decision_key: `workbench-actions-${suffix}`,
      title: "Use handoff package for downstream session",
      detail: "The downstream session should start from a structured package.",
      confidence: 0.91,
      owner_id: sender.id,
    });
    decisionId = decision.id;

    const pendingReviewItems = await dreamReviewService.listForOwner(
      sender.id,
      "pending",
    );
    if (!pendingReviewItems.some((item) => item.source_id === decision.id)) {
      throw new Error("Dream review item was not created from decision");
    }

    const approved = await dreamReviewService.approveAll(sender.id);
    if (!approved.some((item) => item.source_id === decision.id)) {
      throw new Error("Dream review approve-all did not approve decision item");
    }

    const handoff = await handoffService.createHandoff(
      sender.id,
      receiver.id,
      sourceSession.id,
      "Please start from this package.",
      {
        title: "Strategy → Product Handoff",
        packageId: contextPackage.id,
      },
    );
    handoffId = handoff.handoffId;

    const inbox = await handoffService.getInbox(receiver.id);
    if (!inbox.some((item) => item.id === handoff.handoffId)) {
      throw new Error("Handoff inbox did not include created handoff");
    }

    const started = await handoffService.startSessionFromHandoff(
      handoff.handoffId,
      receiver.id,
    );
    sessionIds.push(started.session.id);
    receiverAgentId = started.session.agent_id;

    const linked = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM session_packages
       WHERE session_id = $1 AND package_id = $2`,
      [started.session.id, contextPackage.id],
    );
    if (linked?.count !== "1") {
      throw new Error("Started session was not linked to handoff package");
    }

    console.log("Workbench action support checks passed.");
  } catch (error) {
    console.error("Workbench action support test failed:", error);
    process.exitCode = 1;
  } finally {
    if (senderId) {
      await query("DELETE FROM archived_documents WHERE created_by = $1", [
        senderId,
      ]);
      await query("DELETE FROM folders WHERE owner_id = $1", [senderId]);
      await query("DELETE FROM dream_review_items WHERE owner_id = $1", [
        senderId,
      ]);
    }

    if (handoffId) {
      await query("DELETE FROM handoff_records WHERE id = $1", [handoffId]);
    }

    if (decisionId) {
      await query("DELETE FROM decisions WHERE id = $1", [decisionId]);
    }

    if (packageId) {
      await query("DELETE FROM session_packages WHERE package_id = $1", [
        packageId,
      ]);
      await query("DELETE FROM context_packages WHERE id = $1", [packageId]);
    }

    if (sessionIds.length > 0) {
      await query("DELETE FROM sessions WHERE id = ANY($1::uuid[])", [
        sessionIds,
      ]);
    }

    if (projectId) {
      await query("DELETE FROM project_members WHERE project_id = $1", [
        projectId,
      ]);
      await query("DELETE FROM projects WHERE id = $1", [projectId]);
    }

    for (const id of [agentId, receiverAgentId].filter(
      (value): value is string => Boolean(value),
    )) {
      await query("DELETE FROM agents WHERE id = $1", [id]);
    }

    for (const id of [senderId, receiverId].filter((value): value is string =>
      Boolean(value),
    )) {
      await query("DELETE FROM users WHERE id = $1", [id]);
    }

    await closeDb();
  }
}

void main();
