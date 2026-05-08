import { query, queryOne } from '../db';
import { Agent, CreateAgentInput, UpdateAgentInput } from '../models/agent';

export class AgentRepository {
  async findById(id: string): Promise<Agent | null> {
    return queryOne<Agent>('SELECT * FROM agents WHERE id = $1', [id]);
  }

  async findByOwner(ownerId: string): Promise<Agent[]> {
    return query<Agent>(
      'SELECT * FROM agents WHERE owner_id = $1 ORDER BY created_at DESC',
      [ownerId]
    );
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const result = await queryOne<Agent>(
      `INSERT INTO agents (owner_id, name, type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.owner_id, input.name, input.type]
    );

    if (!result) {
      throw new Error('Failed to create agent');
    }

    return result;
  }

  async update(id: string, input: UpdateAgentInput): Promise<Agent | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }

    if (input.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (input.last_active_at !== undefined) {
      fields.push(`last_active_at = $${paramIndex++}`);
      values.push(input.last_active_at);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    return queryOne<Agent>(
      `UPDATE agents SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }
}
