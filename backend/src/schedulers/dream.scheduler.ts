import cron from "node-cron";
import { Session } from "../models/session";
import { SessionRepository } from "../repositories/session.repository";
import { DreamResult, DreamService } from "../services/dream.service";

export interface DreamRunner {
  dreamForAgent(agentId: string, date: Date): Promise<DreamResult>;
}

export interface DreamSchedulerOptions {
  dreamService?: DreamRunner;
  sessionRepo?: SessionRepository;
  enabled?: boolean;
}

export class DreamScheduler {
  private dreamService?: DreamRunner;
  private readonly sessionRepo: SessionRepository;
  private readonly enabled: boolean;
  private task: cron.ScheduledTask | null = null;

  constructor(options: DreamSchedulerOptions = {}) {
    this.dreamService = options.dreamService;
    this.sessionRepo = options.sessionRepo ?? new SessionRepository();
    this.enabled = options.enabled ?? true;
  }

  start(): void {
    if (!this.enabled) {
      console.log("Dream scheduler is disabled");
      return;
    }

    const cronExpression = process.env.DREAM_CRON_SCHEDULE ?? "0 2 * * *";
    this.task = cron.schedule(cronExpression, async () => {
      console.log("Starting dream consolidation job...");
      await this.runDreamJob();
    });

    console.log(`Dream scheduler started (schedule: ${cronExpression})`);
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("Dream scheduler stopped");
    }
  }

  async runNow(): Promise<void> {
    console.log("Manually triggering dream consolidation...");
    await this.runDreamJob();
  }

  private async runDreamJob(): Promise<void> {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const sessions = await this.sessionRepo.findPendingDreams(yesterday);

      if (sessions.length === 0) {
        console.log("No pending sessions to dream");
        return;
      }

      console.log(`Found ${sessions.length} pending sessions`);
      const sessionsByAgent = this.groupSessionsByAgent(sessions);
      console.log(`Processing ${sessionsByAgent.size} agents`);

      for (const [agentId, agentSessions] of sessionsByAgent) {
        try {
          console.log(
            `Dreaming for agent ${agentId} (${agentSessions.length} sessions)...`,
          );

          const result = await this.getDreamService().dreamForAgent(
            agentId,
            yesterday,
          );

          if (result.success) {
            successCount += agentSessions.length;
            console.log(`Dream completed for agent ${agentId}`);
          } else {
            failureCount += agentSessions.length;
            console.error(`Dream failed for agent ${agentId}:`, result.error);

            for (const session of agentSessions) {
              await this.handleDreamFailure(
                session.id,
                result.error ?? "Unknown error",
              );
            }
          }
        } catch (error) {
          failureCount += agentSessions.length;
          console.error(`Error dreaming for agent ${agentId}:`, error);

          for (const session of agentSessions) {
            await this.handleDreamFailure(
              session.id,
              error instanceof Error ? error.message : "Unknown error",
            );
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Dream job completed in ${duration}ms`);
      console.log(`Success: ${successCount}, Failure: ${failureCount}`);
    } catch (error) {
      console.error("Dream job failed:", error);
    }
  }

  private groupSessionsByAgent(sessions: Session[]): Map<string, Session[]> {
    const sessionsByAgent = new Map<string, Session[]>();

    for (const session of sessions) {
      const agentSessions = sessionsByAgent.get(session.agent_id) ?? [];
      agentSessions.push(session);
      sessionsByAgent.set(session.agent_id, agentSessions);
    }

    return sessionsByAgent;
  }

  private getDreamService(): DreamRunner {
    this.dreamService ??= new DreamService();
    return this.dreamService;
  }

  private async handleDreamFailure(
    sessionId: string,
    _errorMessage: string,
  ): Promise<void> {
    try {
      const session = await this.sessionRepo.findById(sessionId);
      if (!session) {
        return;
      }

      const newAttempts =
        session.dream_status === "failed"
          ? session.dream_attempts
          : session.dream_attempts + 1;
      const maxAttempts = session.dream_max_attempts;

      if (newAttempts >= maxAttempts) {
        await this.sessionRepo.update(sessionId, {
          dream_status: "failed_permanent",
          dream_attempts: newAttempts,
        });
        console.log(
          `Session ${sessionId} marked as failed_permanent after ${newAttempts} attempts`,
        );
      } else {
        await this.sessionRepo.update(sessionId, {
          dream_status: "pending",
          dream_attempts: newAttempts,
        });
        console.log(
          `Session ${sessionId} attempt ${newAttempts}/${maxAttempts} failed, will retry`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to handle dream failure for session ${sessionId}:`,
        error,
      );
    }
  }
}
