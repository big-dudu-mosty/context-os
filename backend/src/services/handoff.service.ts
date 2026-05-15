import { AgentRepository } from "../repositories/agent.repository";
import { ArchivedDocumentRepository } from "../repositories/archived-document.repository";
import { HandoffRecord } from "../models/handoff";
import { ContextPackageRepository } from "../repositories/context-package.repository";
import { HandoffRepository } from "../repositories/handoff.repository";
import { SessionAttachmentRepository } from "../repositories/session-attachment.repository";
import { SessionRepository } from "../repositories/session.repository";

export interface CreateHandoffResult {
  handoffId: string;
  contextSummary: string;
}

export interface CreateHandoffOptions {
  title?: string;
  relatedDocumentId?: string;
  packageId?: string;
}

export interface HandoffServiceOptions {
  handoffRepo?: HandoffRepository;
  sessionRepo?: SessionRepository;
  packageRepo?: ContextPackageRepository;
  agentRepo?: AgentRepository;
  documentRepo?: ArchivedDocumentRepository;
  attachmentRepo?: SessionAttachmentRepository;
}

export class HandoffService {
  private readonly handoffRepo: HandoffRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly packageRepo: ContextPackageRepository;
  private readonly agentRepo: AgentRepository;
  private readonly documentRepo: ArchivedDocumentRepository;
  private readonly attachmentRepo: SessionAttachmentRepository;

  constructor(options: HandoffServiceOptions = {}) {
    this.handoffRepo = options.handoffRepo ?? new HandoffRepository();
    this.sessionRepo = options.sessionRepo ?? new SessionRepository();
    this.packageRepo = options.packageRepo ?? new ContextPackageRepository();
    this.agentRepo = options.agentRepo ?? new AgentRepository();
    this.documentRepo =
      options.documentRepo ?? new ArchivedDocumentRepository();
    this.attachmentRepo =
      options.attachmentRepo ?? new SessionAttachmentRepository();
  }

  async createHandoff(
    fromOwnerId: string,
    toOwnerId: string,
    sessionId: string,
    message: string,
    options: CreateHandoffOptions = {},
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

    if (options.relatedDocumentId) {
      const document = await this.documentRepo.findById(
        options.relatedDocumentId,
      );
      if (!document) {
        throw new Error("Related document not found");
      }
    }

    if (options.packageId) {
      const contextPackage = await this.packageRepo.findById(options.packageId);
      if (!contextPackage) {
        throw new Error("Context package not found");
      }
    }

    const contextSummary = await this.generateContextSummary(sessionId);
    const handoff = await this.handoffRepo.create({
      from_owner_id: fromOwnerId,
      to_owner_id: toOwnerId,
      session_id: sessionId,
      title: options.title,
      message: message.trim(),
      context_summary: contextSummary,
      related_document_id: options.relatedDocumentId,
      package_id: options.packageId,
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

  async getInbox(toOwnerId: string, limit = 20) {
    return this.handoffRepo.findInboxView(toOwnerId, limit);
  }

  async getSent(fromOwnerId: string, limit = 20) {
    return this.handoffRepo.findSentView(fromOwnerId, limit);
  }

  async startSessionFromHandoff(handoffId: string, toOwnerId: string) {
    const handoff = await this.assertPendingReceiverHandoff(
      handoffId,
      toOwnerId,
    );
    const sourceSession = await this.sessionRepo.findById(handoff.session_id);
    if (!sourceSession) {
      throw new Error("Source session not found");
    }

    const agent = await this.findOrCreateWorkbenchAgent(toOwnerId);
    const session = await this.sessionRepo.create({
      agent_id: agent.id,
      owner_id: toOwnerId,
      project_id: sourceSession.project_id ?? undefined,
    });

    if (handoff.package_id) {
      await this.packageRepo.linkSession(handoff.package_id, session.id);
    } else {
      const packages = await this.packageRepo.getSessionPackages(
        sourceSession.id,
      );
      for (const contextPackage of packages) {
        await this.packageRepo.linkSession(contextPackage.id, session.id);
      }
    }

    if (handoff.related_document_id) {
      await this.attachmentRepo.create({
        session_id: session.id,
        document_id: handoff.related_document_id,
      });
    }

    await this.handoffRepo.update(handoff.id, {
      status: "accepted",
      accepted_at: new Date(),
    });

    return {
      handoffId: handoff.id,
      session,
      attachedDocumentId: handoff.related_document_id,
      linkedPackageId: handoff.package_id,
    };
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

  private async findOrCreateWorkbenchAgent(ownerId: string) {
    const agents = await this.agentRepo.findByOwner(ownerId);
    const existing = agents.find(
      (agent) => agent.type === "web-workbench" && agent.status === "active",
    );

    if (existing) {
      return existing;
    }

    return this.agentRepo.create({
      owner_id: ownerId,
      name: "Workbench Agent",
      type: "web-workbench",
    });
  }
}
