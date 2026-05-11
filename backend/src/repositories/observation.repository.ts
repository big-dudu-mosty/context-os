import { query, queryOne } from "../db";
import { CreateObservationInput, Observation } from "../models/observation";

export class ObservationRepository {
  async findById(id: string): Promise<Observation | null> {
    return queryOne<Observation>("SELECT * FROM observations WHERE id = $1", [
      id,
    ]);
  }

  async findByPackage(packageId: string): Promise<Observation[]> {
    return query<Observation>(
      `SELECT * FROM observations
       WHERE package_id = $1
       ORDER BY created_at DESC`,
      [packageId],
    );
  }

  async findByProject(projectId: string): Promise<Observation[]> {
    return query<Observation>(
      `SELECT * FROM observations
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId],
    );
  }

  async create(input: CreateObservationInput): Promise<Observation> {
    const result = await queryOne<Observation>(
      `INSERT INTO observations (
        package_id, project_id, type, content, relevance, confidence, tags,
        related_to_type, related_to_id, owner_id
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        input.package_id,
        input.project_id ?? null,
        input.type,
        input.content,
        input.relevance ?? null,
        input.confidence ?? null,
        input.tags ?? [],
        input.related_to_type ?? null,
        input.related_to_id ?? null,
        input.owner_id,
      ],
    );

    if (!result) {
      throw new Error("Failed to create observation");
    }

    return result;
  }
}
