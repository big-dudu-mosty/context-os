import { closeDb, query } from "./db";
import { AgentRepository } from "./repositories/agent.repository";
import { SessionRepository } from "./repositories/session.repository";
import { UserRepository } from "./repositories/user.repository";
import { DreamRunner, DreamScheduler } from "./schedulers/dream.scheduler";

async function main(): Promise<void> {
  console.log("Testing Dream Scheduler...");

  const userRepo = new UserRepository();
  const agentRepo = new AgentRepository();
  const sessionRepo = new SessionRepository();

  let userId: string | null = null;
  let successfulAgentId: string | null = null;
  let failingAgentId: string | null = null;
  const sessionIds: string[] = [];

  try {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;

    console.log("1. Creating test fixtures...");
    const user = await userRepo.create({
      name: "Scheduler Test User",
      email: `scheduler-test-${uniqueSuffix}@example.com`,
      role: "member",
    });
    userId = user.id;

    const successfulAgent = await agentRepo.create({
      owner_id: user.id,
      name: "Scheduler Success Agent",
      type: "claude-code-cli",
    });
    successfulAgentId = successfulAgent.id;

    const failingAgent = await agentRepo.create({
      owner_id: user.id,
      name: "Scheduler Failing Agent",
      type: "claude-code-cli",
    });
    failingAgentId = failingAgent.id;

    const yesterday = getYesterdayStart();

    console.log("2. Creating pending sessions...");
    const successfulSession = await sessionRepo.create({
      agent_id: successfulAgent.id,
      owner_id: user.id,
    });
    sessionIds.push(successfulSession.id);
    await setSchedulerSessionState(successfulSession.id, yesterday, 0);

    const retrySession = await sessionRepo.create({
      agent_id: failingAgent.id,
      owner_id: user.id,
    });
    sessionIds.push(retrySession.id);
    await setSchedulerSessionState(retrySession.id, yesterday, 0);

    const permanentFailureSession = await sessionRepo.create({
      agent_id: failingAgent.id,
      owner_id: user.id,
    });
    sessionIds.push(permanentFailureSession.id);
    await setSchedulerSessionState(permanentFailureSession.id, yesterday, 2);

    console.log("3. Running dream job manually...");
    const dreamScheduler = new DreamScheduler({
      enabled: true,
      sessionRepo,
      dreamService: createMockDreamRunner(sessionRepo, failingAgent.id),
    });

    await dreamScheduler.runNow();

    console.log("4. Verifying results...");
    const completed = await sessionRepo.findById(successfulSession.id);
    assertEqual(completed?.dream_status, "completed", "successful status");
    assertEqual(completed?.dream_attempts, 0, "successful attempts");

    const retry = await sessionRepo.findById(retrySession.id);
    assertEqual(retry?.dream_status, "pending", "retry status");
    assertEqual(retry?.dream_attempts, 1, "retry attempts");

    const permanent = await sessionRepo.findById(permanentFailureSession.id);
    assertEqual(
      permanent?.dream_status,
      "failed_permanent",
      "permanent failure status",
    );
    assertEqual(permanent?.dream_attempts, 3, "permanent failure attempts");

    console.log("Dream Scheduler completed successfully.");
  } catch (error) {
    console.error("Scheduler test failed:", error);
    process.exitCode = 1;
  } finally {
    if (sessionIds.length > 0) {
      await query("DELETE FROM sessions WHERE id = ANY($1::uuid[])", [
        sessionIds,
      ]);
    }

    if (successfulAgentId) {
      await query("DELETE FROM agents WHERE id = $1", [successfulAgentId]);
    }

    if (failingAgentId) {
      await query("DELETE FROM agents WHERE id = $1", [failingAgentId]);
    }

    if (userId) {
      await query("DELETE FROM users WHERE id = $1", [userId]);
    }

    await closeDb();
  }
}

function createMockDreamRunner(
  sessionRepo: SessionRepository,
  failingAgentId: string,
): DreamRunner {
  return {
    async dreamForAgent(agentId: string, date: Date) {
      if (agentId === failingAgentId) {
        return {
          packageId: "",
          success: false,
          error: "Intentional scheduler test failure",
        };
      }

      const sessions = await sessionRepo.findPendingDreams(date);
      const agentSessions = sessions.filter(
        (session) => session.agent_id === agentId,
      );

      for (const session of agentSessions) {
        await sessionRepo.update(session.id, {
          dream_status: "completed",
          dreamed_at: new Date(),
        });
      }

      return {
        packageId: "mock-package",
        success: true,
      };
    },
  };
}

async function setSchedulerSessionState(
  sessionId: string,
  startedAt: Date,
  attempts: number,
): Promise<void> {
  await query(
    `UPDATE sessions
     SET started_at = $2,
         ended_at = $2,
         transcript_path = '/tmp/scheduler-test.md',
         dream_status = 'pending',
         dream_attempts = $3,
         dream_max_attempts = 3
     WHERE id = $1`,
    [sessionId, startedAt, attempts],
  );
}

function getYesterdayStart(): Date {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return yesterday;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

void main();
