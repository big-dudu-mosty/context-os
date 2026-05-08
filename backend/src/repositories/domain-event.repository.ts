import { query, queryOne } from '../db';
import {
  CreateDomainEventInput,
  DomainEvent,
} from '../models/domain-event';

export class DomainEventRepository {
  async create(input: CreateDomainEventInput): Promise<DomainEvent> {
    const result = await queryOne<DomainEvent>(
      `INSERT INTO domain_events (
        project_id, project_event_seq, event_type, aggregate_type, aggregate_id,
        owner_id, agent_id, session_id, payload, idempotency_key
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       RETURNING *`,
      [
        input.project_id,
        input.project_event_seq,
        input.event_type,
        input.aggregate_type,
        input.aggregate_id,
        input.owner_id,
        input.agent_id,
        input.session_id ?? null,
        JSON.stringify(input.payload),
        input.idempotency_key ?? null,
      ]
    );

    if (!result) {
      throw new Error('Failed to create domain event');
    }

    return result;
  }

  async findByProject(
    projectId: string,
    afterSeq = 0,
    limit = 100
  ): Promise<DomainEvent[]> {
    return query<DomainEvent>(
      `SELECT * FROM domain_events
       WHERE project_id = $1 AND project_event_seq > $2
       ORDER BY project_event_seq
       LIMIT $3`,
      [projectId, afterSeq, limit]
    );
  }

  async getLatestSeq(projectId: string): Promise<number> {
    const result = await queryOne<{ max_seq: number | null }>(
      `SELECT MAX(project_event_seq) AS max_seq
       FROM domain_events
       WHERE project_id = $1`,
      [projectId]
    );

    return result?.max_seq ?? 0;
  }
}
