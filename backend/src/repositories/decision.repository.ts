import { query, queryOne } from "../db";
import { CreateDecisionInput, Decision } from "../models/decision";

export class DecisionRepository {
  async findById(id: string): Promise<Decision | null> {
    return queryOne<Decision>("SELECT * FROM decisions WHERE id = $1", [id]);
  }

  async findByProject(
    projectId: string,
    status = "active",
  ): Promise<Decision[]> {
    return query<Decision>(
      `SELECT * FROM decisions
       WHERE project_id = $1 AND status = $2
       ORDER BY created_at DESC`,
      [projectId, status],
    );
  }

  async findRecentByOwner(ownerId: string, limit = 20): Promise<Decision[]> {
    return query<Decision>(
      `SELECT * FROM decisions
       WHERE owner_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [ownerId, limit],
    );
  }

  async findConflict(
    projectId: string,
    decisionKey: string,
  ): Promise<Decision | null> {
    return queryOne<Decision>(
      `SELECT * FROM decisions
       WHERE project_id = $1
       AND decision_key = $2
       AND status = 'active'
       AND conflict_group_id IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [projectId, decisionKey],
    );
  }

  async create(input: CreateDecisionInput): Promise<Decision> {
    const result = await queryOne<Decision>(
      `INSERT INTO decisions (
        package_id, project_id, decision_key, title, detail, confidence,
        conflict_group_id, owner_id
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.package_id,
        input.project_id,
        input.decision_key,
        input.title,
        input.detail ?? null,
        input.confidence ?? null,
        input.conflict_group_id ?? null,
        input.owner_id,
      ],
    );

    if (!result) {
      throw new Error("Failed to create decision");
    }

    return result;
  }

  async markConflict(
    decisionId: string,
    conflictGroupId: string,
  ): Promise<void> {
    await query(
      `UPDATE decisions
       SET conflict_group_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [conflictGroupId, decisionId],
    );
  }
}
