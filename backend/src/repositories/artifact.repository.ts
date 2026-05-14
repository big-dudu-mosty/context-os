import { query, queryOne } from "../db";
import {
  Artifact,
  ArtifactStatus,
  CreateArtifactInput,
} from "../models/artifact";

export interface UpdateArtifactInput {
  content?: string;
  title?: string;
  status?: ArtifactStatus;
}

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

  async update(id: string, input: UpdateArtifactInput): Promise<Artifact> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.content !== undefined) {
      fields.push(`content = $${paramIndex++}`);
      values.push(input.content);
    }

    if (input.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }

    if (input.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (fields.length === 0) {
      const artifact = await this.findById(id);
      if (!artifact) {
        throw new Error("Artifact not found");
      }

      return artifact;
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    const result = await queryOne<Artifact>(
      `UPDATE artifacts SET ${fields.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values,
    );

    if (!result) {
      throw new Error("Artifact not found");
    }

    return result;
  }

  async delete(id: string): Promise<void> {
    const result = await queryOne<{ id: string }>(
      "DELETE FROM artifacts WHERE id = $1 RETURNING id",
      [id],
    );

    if (!result) {
      throw new Error("Artifact not found");
    }
  }
}
