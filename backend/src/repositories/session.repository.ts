import { query, queryOne } from '../db';
import {
  CreateSessionInput,
  Session,
  UpdateSessionInput,
} from '../models/session';

export class SessionRepository {
  async findById(id: string): Promise<Session | null> {
    return queryOne<Session>('SELECT * FROM sessions WHERE id = $1', [id]);
  }

  async findByAgent(agentId: string, limit = 10): Promise<Session[]> {
    return query<Session>(
      'SELECT * FROM sessions WHERE agent_id = $1 ORDER BY started_at DESC LIMIT $2',
      [agentId, limit]
    );
  }

  async findPendingDreams(date: Date): Promise<Session[]> {
    return query<Session>(
      `SELECT * FROM sessions
       WHERE dream_status = 'pending'
       AND started_at >= $1
       AND started_at < $1 + INTERVAL '1 day'
       ORDER BY agent_id, started_at`,
      [date]
    );
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const result = await queryOne<Session>(
      `INSERT INTO sessions (agent_id, owner_id, project_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.agent_id, input.owner_id, input.project_id ?? null]
    );

    if (!result) {
      throw new Error('Failed to create session');
    }

    return result;
  }

  async update(id: string, input: UpdateSessionInput): Promise<Session | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.ended_at !== undefined) {
      fields.push(`ended_at = $${paramIndex++}`);
      values.push(input.ended_at);
    }

    if (input.transcript_path !== undefined) {
      fields.push(`transcript_path = $${paramIndex++}`);
      values.push(input.transcript_path);
    }

    if (input.transcript_hash !== undefined) {
      fields.push(`transcript_hash = $${paramIndex++}`);
      values.push(input.transcript_hash);
    }

    if (input.dream_status !== undefined) {
      fields.push(`dream_status = $${paramIndex++}`);
      values.push(input.dream_status);
    }

    if (input.dream_attempts !== undefined) {
      fields.push(`dream_attempts = $${paramIndex++}`);
      values.push(input.dream_attempts);
    }

    if (input.dreamed_at !== undefined) {
      fields.push(`dreamed_at = $${paramIndex++}`);
      values.push(input.dreamed_at);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    return queryOne<Session>(
      `UPDATE sessions SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }
}
