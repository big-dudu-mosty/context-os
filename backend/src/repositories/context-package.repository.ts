import { query, queryOne } from '../db';
import {
  ContextPackage,
  CreateContextPackageInput,
  UpdateContextPackageInput,
} from '../models/context-package';

export class ContextPackageRepository {
  async findById(id: string): Promise<ContextPackage | null> {
    return queryOne<ContextPackage>(
      'SELECT * FROM context_packages WHERE id = $1',
      [id]
    );
  }

  async findByOwner(ownerId: string, limit = 10): Promise<ContextPackage[]> {
    return query<ContextPackage>(
      `SELECT * FROM context_packages
       WHERE owner_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [ownerId, limit]
    );
  }

  async findByProject(
    projectId: string,
    limit = 10
  ): Promise<ContextPackage[]> {
    return query<ContextPackage>(
      `SELECT * FROM context_packages
       WHERE $1::uuid = ANY(project_ids)
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, limit]
    );
  }

  async create(input: CreateContextPackageInput): Promise<ContextPackage> {
    const result = await queryOne<ContextPackage>(
      `INSERT INTO context_packages (
        source_type, owner_id, agent_id, title, summary,
        raw_yaml, raw_yaml_hash, project_ids
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.source_type,
        input.owner_id,
        input.agent_id,
        input.title,
        input.summary ?? null,
        input.raw_yaml,
        input.raw_yaml_hash,
        input.project_ids,
      ]
    );

    if (!result) {
      throw new Error('Failed to create context package');
    }

    return result;
  }

  async update(
    id: string,
    input: UpdateContextPackageInput
  ): Promise<ContextPackage | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (input.summary !== undefined) {
      fields.push(`summary = $${paramIndex++}`);
      values.push(input.summary);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    return queryOne<ContextPackage>(
      `UPDATE context_packages SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }

  async linkSession(packageId: string, sessionId: string): Promise<void> {
    await query(
      `INSERT INTO session_packages (session_id, package_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [sessionId, packageId]
    );
  }

  async getSessionPackages(sessionId: string): Promise<ContextPackage[]> {
    return query<ContextPackage>(
      `SELECT cp.* FROM context_packages cp
       JOIN session_packages sp ON sp.package_id = cp.id
       WHERE sp.session_id = $1
       ORDER BY cp.created_at DESC`,
      [sessionId]
    );
  }
}
