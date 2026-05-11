import { createHash } from "crypto";
import YAML from "yaml";
import { Session } from "../models/session";
import { buildDreamPrompt } from "../prompts/dream.prompt";
import { ContextPackageRepository } from "../repositories/context-package.repository";
import { SessionRepository } from "../repositories/session.repository";
import { ExtractionResult, ExtractionService } from "./extraction.service";
import { LLMClient, LLMService } from "./llm.service";

export interface DreamResult {
  packageId: string;
  success: boolean;
  error?: string;
  extraction?: ExtractionResult;
}

export interface DreamServiceOptions {
  llm?: LLMClient;
  sessionRepo?: SessionRepository;
  packageRepo?: ContextPackageRepository;
  extractionService?: ExtractionService;
}

interface DreamYaml {
  package?: {
    title?: unknown;
  };
  summary?: unknown;
  project_ids?: unknown;
}

export class DreamService {
  private readonly llm: LLMClient;
  private readonly sessionRepo: SessionRepository;
  private readonly packageRepo: ContextPackageRepository;
  private readonly extractionService: ExtractionService;

  constructor(options: DreamServiceOptions = {}) {
    this.llm = options.llm ?? new LLMService();
    this.sessionRepo = options.sessionRepo ?? new SessionRepository();
    this.packageRepo = options.packageRepo ?? new ContextPackageRepository();
    this.extractionService =
      options.extractionService ?? new ExtractionService();
  }

  async dreamForAgent(agentId: string, date: Date): Promise<DreamResult> {
    let agentSessions: Session[] = [];

    try {
      const sessions = await this.sessionRepo.findPendingDreams(date);
      agentSessions = sessions.filter(
        (session) => session.agent_id === agentId,
      );

      if (agentSessions.length === 0) {
        return { packageId: "", success: true };
      }

      const prompt = buildDreamPrompt(agentSessions);
      const yamlOutput = await this.llm.chat([
        { role: "user", content: prompt },
      ]);
      const rawYaml = this.stripMarkdownFence(yamlOutput);
      const parsed = YAML.parse(rawYaml) as DreamYaml;
      const title = this.getPackageTitle(parsed);
      const summary =
        typeof parsed.summary === "string" ? parsed.summary : null;
      const projectIds = this.getProjectIds(parsed, agentSessions);
      const hash = createHash("sha256").update(rawYaml).digest("hex");

      const pkg = await this.packageRepo.create({
        source_type: "dream",
        owner_id: agentSessions[0].owner_id,
        agent_id: agentId,
        title,
        summary: summary ?? undefined,
        raw_yaml: rawYaml,
        raw_yaml_hash: hash,
        project_ids: projectIds,
      });

      const extractionResult = await this.extractionService.extractFromYaml(
        pkg.id,
        agentSessions[0].owner_id,
        rawYaml,
        projectIds,
      );
      console.log("Extraction result:", extractionResult);

      for (const session of agentSessions) {
        await this.packageRepo.linkSession(pkg.id, session.id);
      }

      for (const session of agentSessions) {
        await this.sessionRepo.update(session.id, {
          dream_status: "completed",
          dreamed_at: new Date(),
        });
      }

      return { packageId: pkg.id, success: true, extraction: extractionResult };
    } catch (error) {
      await this.markFailed(agentSessions);

      return {
        packageId: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private stripMarkdownFence(value: string): string {
    const trimmed = value.trim();
    const match = trimmed.match(/^```(?:yaml|yml)?\s*([\s\S]*?)\s*```$/i);
    return match?.[1]?.trim() ?? trimmed;
  }

  private getPackageTitle(parsed: DreamYaml): string {
    const title = parsed.package?.title;
    if (typeof title !== "string" || title.trim().length === 0) {
      throw new Error("Invalid YAML structure: package.title is required");
    }

    return title.trim();
  }

  private getProjectIds(parsed: DreamYaml, sessions: Session[]): string[] {
    const sessionProjectIds = new Set(
      sessions
        .map((session) => session.project_id)
        .filter((projectId): projectId is string => Boolean(projectId)),
    );

    if (!Array.isArray(parsed.project_ids)) {
      return Array.from(sessionProjectIds);
    }

    const parsedIds = parsed.project_ids.filter(
      (projectId): projectId is string =>
        typeof projectId === "string" && sessionProjectIds.has(projectId),
    );

    return Array.from(
      new Set(parsedIds.length > 0 ? parsedIds : sessionProjectIds),
    );
  }

  private async markFailed(sessions: Session[]): Promise<void> {
    for (const session of sessions) {
      await this.sessionRepo.update(session.id, {
        dream_status: "failed",
        dream_attempts: session.dream_attempts + 1,
      });
    }
  }
}
