import { query, queryOne } from "../db";
import {
  CreateHandoffInput,
  HandoffRecord,
  UpdateHandoffInput,
} from "../models/handoff";

export class HandoffRepository {
  async findById(id: string): Promise<HandoffRecord | null> {
    return queryOne<HandoffRecord>(
      "SELECT * FROM handoff_records WHERE id = $1",
      [id],
    );
  }

  async findPendingByReceiver(toOwnerId: string): Promise<HandoffRecord[]> {
    return query<HandoffRecord>(
      `SELECT * FROM handoff_records
       WHERE to_owner_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [toOwnerId],
    );
  }

  async findBySender(
    fromOwnerId: string,
    limit = 10,
  ): Promise<HandoffRecord[]> {
    return query<HandoffRecord>(
      `SELECT * FROM handoff_records
       WHERE from_owner_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [fromOwnerId, limit],
    );
  }

  async findBySession(sessionId: string): Promise<HandoffRecord[]> {
    return query<HandoffRecord>(
      `SELECT * FROM handoff_records
       WHERE session_id = $1
       ORDER BY created_at DESC`,
      [sessionId],
    );
  }

  async create(input: CreateHandoffInput): Promise<HandoffRecord> {
    const result = await queryOne<HandoffRecord>(
      `INSERT INTO handoff_records (
        from_owner_id, to_owner_id, session_id, message, context_summary
      )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.from_owner_id,
        input.to_owner_id,
        input.session_id,
        input.message,
        input.context_summary ?? null,
      ],
    );

    if (!result) {
      throw new Error("Failed to create handoff");
    }

    return result;
  }

  async update(
    id: string,
    input: UpdateHandoffInput,
  ): Promise<HandoffRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (input.accepted_at !== undefined) {
      fields.push(`accepted_at = $${paramIndex++}`);
      values.push(input.accepted_at);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    return queryOne<HandoffRecord>(
      `UPDATE handoff_records SET ${fields.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values,
    );
  }
}
