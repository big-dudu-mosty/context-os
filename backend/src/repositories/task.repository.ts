import { query, queryOne } from "../db";
import { CreateTaskInput, Task } from "../models/task";

export class TaskRepository {
  async findById(id: string): Promise<Task | null> {
    return queryOne<Task>("SELECT * FROM tasks WHERE id = $1", [id]);
  }

  async findByProject(projectId: string, status?: string): Promise<Task[]> {
    if (status) {
      return query<Task>(
        `SELECT * FROM tasks
         WHERE project_id = $1 AND status = $2
         ORDER BY created_at DESC`,
        [projectId, status],
      );
    }

    return query<Task>(
      `SELECT * FROM tasks
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId],
    );
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const result = await queryOne<Task>(
      `INSERT INTO tasks (
        package_id, project_id, title, description, assignee_id, status,
        priority, owner_id
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.package_id,
        input.project_id,
        input.title,
        input.description ?? null,
        input.assignee_id ?? null,
        input.status ?? "todo",
        input.priority ?? null,
        input.owner_id,
      ],
    );

    if (!result) {
      throw new Error("Failed to create task");
    }

    return result;
  }
}
