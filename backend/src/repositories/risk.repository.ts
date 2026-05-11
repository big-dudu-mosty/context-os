import { query, queryOne } from "../db";
import { CreateRiskInput, Risk } from "../models/risk";

export class RiskRepository {
  async findById(id: string): Promise<Risk | null> {
    return queryOne<Risk>("SELECT * FROM risks WHERE id = $1", [id]);
  }

  async findByProject(projectId: string, status = "open"): Promise<Risk[]> {
    return query<Risk>(
      `SELECT * FROM risks
       WHERE project_id = $1 AND status = $2
       ORDER BY created_at DESC`,
      [projectId, status],
    );
  }

  async create(input: CreateRiskInput): Promise<Risk> {
    const result = await queryOne<Risk>(
      `INSERT INTO risks (
        package_id, project_id, title, description, mitigation, severity,
        status, owner_id
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.package_id,
        input.project_id,
        input.title,
        input.description ?? null,
        input.mitigation ?? null,
        input.severity ?? null,
        input.status ?? "open",
        input.owner_id,
      ],
    );

    if (!result) {
      throw new Error("Failed to create risk");
    }

    return result;
  }
}
