import { buildArtifactPrompt } from "../prompts/artifact.prompt";
import { ArtifactRepository } from "../repositories/artifact.repository";
import { MessageRepository } from "../repositories/message.repository";
import { LLMClient, LLMService } from "./llm.service";

export interface ArtifactServiceOptions {
  artifactRepo?: ArtifactRepository;
  messageRepo?: MessageRepository;
  llm?: LLMClient;
}

export class ArtifactService {
  private readonly artifactRepo: ArtifactRepository;
  private readonly messageRepo: MessageRepository;
  private readonly llm: LLMClient;

  constructor(options: ArtifactServiceOptions = {}) {
    this.artifactRepo = options.artifactRepo ?? new ArtifactRepository();
    this.messageRepo = options.messageRepo ?? new MessageRepository();
    this.llm = options.llm ?? new LLMService();
  }

  async generateArtifact(
    sessionId: string,
    userId: string,
    title: string,
    userRequest?: string,
  ) {
    const messages = await this.messageRepo.findBySession(sessionId, 50);

    if (messages.length === 0) {
      throw new Error("No messages found in session");
    }

    const prompt = buildArtifactPrompt([...messages].reverse(), userRequest);
    const content = await this.llm.chat([{ role: "user", content: prompt }]);

    return this.artifactRepo.create({
      session_id: sessionId,
      title,
      content,
      created_by: userId,
    });
  }

  async updateArtifact(
    artifactId: string,
    input: string | { content?: string; title?: string },
  ) {
    return this.artifactRepo.update(
      artifactId,
      typeof input === "string" ? { content: input } : input,
    );
  }

  async getArtifact(artifactId: string) {
    const artifact = await this.artifactRepo.findById(artifactId);
    if (!artifact) {
      throw new Error("Artifact not found");
    }

    return artifact;
  }

  async listArtifacts(sessionId: string) {
    return this.artifactRepo.findBySession(sessionId);
  }

  async deleteArtifact(artifactId: string): Promise<void> {
    await this.artifactRepo.delete(artifactId);
  }
}
