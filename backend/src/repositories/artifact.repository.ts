import { query, queryOne } from "../db";
import {
  Artifact,
  ArtifactStatus,
  CreateArtifactInput,
} from "../models/artifact";

export class ArtifactRepository {
  async findById(id: string): Promise<Artifact | null> {
    return queryOne<Artifact>("SELECT * FROM artifacts WHERE id = $1", [id]);
  }

  async findBySession(
    sessionId: string,
    status?: ArtifactStatus,
  ): Promise<Artifact[]> {
    if (status) {
      return query<Artifact>(
        `SELECT * FROM artifacts
         WHERE session_id = $1 AND status = $2
         ORDER BY created_at DESC`,
        [sessionId, status],
      );
    }

    return query<Artifact>(
      `SELECT * FROM artifacts
       WHERE session_id = $1
       ORDER BY created_at DESC`,
      [sessionId],
    );
  }

  async create(input: CreateArtifactInput): Promise<Artifact> {
    const result = await queryOne<Artifact>(
      `INSERT INTO artifacts (session_id, title, content, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.session_id, input.title, input.content, input.created_by],
    );

    if (!result) {
      throw new Error("Failed to create artifact");
    }

    return result;
  }

  async updateStatus(
    id: string,
    status: ArtifactStatus,
  ): Promise<Artifact | null> {
    return queryOne<Artifact>(
      `UPDATE artifacts
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status],
    );
  }
}
