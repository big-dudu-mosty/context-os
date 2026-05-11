import { HandoffRecord } from "../models/handoff";
import { ContextPackageRepository } from "../repositories/context-package.repository";
import { HandoffRepository } from "../repositories/handoff.repository";
import { SessionRepository } from "../repositories/session.repository";

export interface CreateHandoffResult {
  handoffId: string;
  contextSummary: string;
}

export interface HandoffServiceOptions {
  handoffRepo?: HandoffRepository;
  sessionRepo?: SessionRepository;
  packageRepo?: ContextPackageRepository;
}

export class HandoffService {
  private readonly handoffRepo: HandoffRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly packageRepo: ContextPackageRepository;

  constructor(options: HandoffServiceOptions = {}) {
    this.handoffRepo = options.handoffRepo ?? new HandoffRepository();
    this.sessionRepo = options.sessionRepo ?? new SessionRepository();
    this.packageRepo = options.packageRepo ?? new ContextPackageRepository();
  }

  async createHandoff(
    fromOwnerId: string,
    toOwnerId: string,
    sessionId: string,
    message: string,
  ): Promise<CreateHandoffResult> {
    if (message.trim().length === 0) {
      throw new Error("Handoff message is required");
    }

    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    if (session.owner_id !== fromOwnerId) {
      throw new Error("Session does not belong to sender");
    }

    const contextSummary = await this.generateContextSummary(sessionId);
    const handoff = await this.handoffRepo.create({
      from_owner_id: fromOwnerId,
      to_owner_id: toOwnerId,
      session_id: sessionId,
      message: message.trim(),
      context_summary: contextSummary,
    });

    return {
      handoffId: handoff.id,
      contextSummary,
    };
  }

  async acceptHandoff(handoffId: string, toOwnerId: string): Promise<void> {
    const handoff = await this.assertPendingReceiverHandoff(
      handoffId,
      toOwnerId,
    );

    await this.handoffRepo.update(handoff.id, {
      status: "accepted",
      accepted_at: new Date(),
    });
  }

  async dismissHandoff(handoffId: string, toOwnerId: string): Promise<void> {
    const handoff = await this.assertPendingReceiverHandoff(
      handoffId,
      toOwnerId,
    );

    await this.handoffRepo.update(handoff.id, {
      status: "dismissed",
    });
  }

  async getPendingHandoffs(toOwnerId: string): Promise<HandoffRecord[]> {
    return this.handoffRepo.findPendingByReceiver(toOwnerId);
  }

  private async assertPendingReceiverHandoff(
    handoffId: string,
    toOwnerId: string,
  ): Promise<HandoffRecord> {
    const handoff = await this.handoffRepo.findById(handoffId);
    if (!handoff) {
      throw new Error("Handoff not found");
    }

    if (handoff.to_owner_id !== toOwnerId) {
      throw new Error("Handoff does not belong to receiver");
    }

    if (handoff.status !== "pending") {
      throw new Error("Handoff is not pending");
    }

    return handoff;
  }

  private async generateContextSummary(sessionId: string): Promise<string> {
    const packages = await this.packageRepo.getSessionPackages(sessionId);

    if (packages.length === 0) {
      return "No context available for this session.";
    }

    const summaries = packages
      .map((contextPackage) => {
        const summary = contextPackage.summary ?? "No summary";
        return `- ${contextPackage.title}: ${summary}`;
      })
      .join("\n");

    return `Session context:\n${summaries}`;
  }
}
