import { closeDb, query } from "./db";
import { AgentRepository } from "./repositories/agent.repository";
import { ContextPackageRepository } from "./repositories/context-package.repository";
import { HandoffRepository } from "./repositories/handoff.repository";
import { SessionRepository } from "./repositories/session.repository";
import { UserRepository } from "./repositories/user.repository";
import { HandoffService } from "./services/handoff.service";

async function main(): Promise<void> {
  console.log("Testing Task Handoff...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const sessionRepo = new SessionRepository();
  const packageRepo = new ContextPackageRepository();
  const handoffService = new HandoffService();
  const handoffRepo = new HandoffRepository();

  let senderId: string | null = null;
  let receiverId: string | null = null;
  let agentId: string | null = null;
  let sessionId: string | null = null;
  let packageId: string | null = null;
  const handoffIds: string[] = [];

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;

    console.log("1. Creating test users...");
    const sender = await userRepo.create({
      name: "Handoff Sender",
      email: `handoff-sender-${uniqueSuffix}@example.com`,
      role: "member",
    });
    senderId = sender.id;

    const receiver = await userRepo.create({
      name: "Handoff Receiver",
      email: `handoff-receiver-${uniqueSuffix}@example.com`,
      role: "member",
    });
    receiverId = receiver.id;

    console.log("2. Creating agent and session...");
    const agent = await agentRepo.create({
      owner_id: sender.id,
      name: "Handoff Test Agent",
      type: "claude-code-cli",
    });
    agentId = agent.id;

    const session = await sessionRepo.create({
      agent_id: agent.id,
      owner_id: sender.id,
    });
    sessionId = session.id;

    console.log("3. Creating context package...");
    const contextPackage = await packageRepo.create({
      source_type: "test",
      owner_id: sender.id,
      agent_id: agent.id,
      title: "Test Work Package",
      summary: "Implemented user authentication",
      raw_yaml: "test: yaml",
      raw_yaml_hash: "4".repeat(64),
      project_ids: [],
    });
    packageId = contextPackage.id;

    await packageRepo.linkSession(contextPackage.id, session.id);

    console.log("4. Creating handoff...");
    const result = await handoffService.createHandoff(
      sender.id,
      receiver.id,
      session.id,
      "Please continue this work on user authentication.",
    );
    handoffIds.push(result.handoffId);

    if (!result.contextSummary.includes("Test Work Package")) {
      throw new Error("Context summary did not include linked package");
    }

    console.log("Handoff created successfully.");
    console.log("ID:", result.handoffId);

    console.log("5. Querying pending handoffs...");
    const pending = await handoffService.getPendingHandoffs(receiver.id);
    if (!pending.some((handoff) => handoff.id === result.handoffId)) {
      throw new Error("Created handoff was not pending for receiver");
    }

    console.log("6. Verifying receiver permission check...");
    await expectRejects(
      () => handoffService.acceptHandoff(result.handoffId, sender.id),
      "wrong receiver accept",
    );

    console.log("7. Accepting handoff...");
    await handoffService.acceptHandoff(result.handoffId, receiver.id);
    const accepted = await handoffRepo.findById(result.handoffId);
    if (accepted?.status !== "accepted" || !accepted.accepted_at) {
      throw new Error("Accepted handoff state was not persisted");
    }

    await expectRejects(
      () => handoffService.acceptHandoff(result.handoffId, receiver.id),
      "duplicate accept",
    );

    console.log("8. Creating and dismissing second handoff...");
    const dismissResult = await handoffService.createHandoff(
      sender.id,
      receiver.id,
      session.id,
      "This handoff will be dismissed.",
    );
    handoffIds.push(dismissResult.handoffId);

    await handoffService.dismissHandoff(dismissResult.handoffId, receiver.id);
    const dismissed = await handoffRepo.findById(dismissResult.handoffId);
    if (dismissed?.status !== "dismissed") {
      throw new Error("Dismissed handoff state was not persisted");
    }

    console.log("9. Verifying sender ownership check...");
    await expectRejects(
      () =>
        handoffService.createHandoff(
          receiver.id,
          sender.id,
          session.id,
          "Invalid ownership handoff.",
        ),
      "sender does not own session",
    );

    console.log("Task Handoff completed successfully.");
  } catch (error) {
    console.error("Handoff test failed:", error);
    process.exitCode = 1;
  } finally {
    if (handoffIds.length > 0) {
      await query("DELETE FROM handoff_records WHERE id = ANY($1::uuid[])", [
        handoffIds,
      ]);
    }

    if (sessionId) {
      await query("DELETE FROM session_packages WHERE session_id = $1", [
        sessionId,
      ]);
    }

    if (packageId) {
      await query("DELETE FROM context_packages WHERE id = $1", [packageId]);
    }

    if (sessionId) {
      await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
    }

    if (agentId) {
      await query("DELETE FROM agents WHERE id = $1", [agentId]);
    }

    if (senderId) {
      await query("DELETE FROM users WHERE id = $1", [senderId]);
    }

    if (receiverId) {
      await query("DELETE FROM users WHERE id = $1", [receiverId]);
    }

    await closeDb();
  }
}

async function expectRejects(
  action: () => Promise<unknown>,
  label: string,
): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }

  throw new Error(`Expected ${label} to reject`);
}

void main();
