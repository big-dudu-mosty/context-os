import { query, queryOne } from "../db";
import { CreateOpenQuestionInput, OpenQuestion } from "../models/open-question";

export class OpenQuestionRepository {
  async findById(id: string): Promise<OpenQuestion | null> {
    return queryOne<OpenQuestion>(
      "SELECT * FROM open_questions WHERE id = $1",
      [id],
    );
  }

  async findByProject(
    projectId: string,
    status = "open",
  ): Promise<OpenQuestion[]> {
    return query<OpenQuestion>(
      `SELECT * FROM open_questions
       WHERE project_id = $1 AND status = $2
       ORDER BY created_at DESC`,
      [projectId, status],
    );
  }

  async findRecentByOwner(
    ownerId: string,
    limit = 20,
  ): Promise<OpenQuestion[]> {
    return query<OpenQuestion>(
      `SELECT * FROM open_questions
       WHERE owner_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [ownerId, limit],
    );
  }

  async create(input: CreateOpenQuestionInput): Promise<OpenQuestion> {
    const result = await queryOne<OpenQuestion>(
      `INSERT INTO open_questions (
        package_id, project_id, question, context, priority, owner_id
      )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.package_id,
        input.project_id,
        input.question,
        input.context ?? null,
        input.priority ?? null,
        input.owner_id,
      ],
    );

    if (!result) {
      throw new Error("Failed to create open question");
    }

    return result;
  }
}
