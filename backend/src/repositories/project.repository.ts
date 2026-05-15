import { query, queryOne } from '../db';
import {
  AddProjectMemberInput,
  CreateProjectInput,
  Project,
  ProjectMember,
  UpdateProjectInput,
} from '../models/project';

export class ProjectRepository {
  async findById(id: string): Promise<Project | null> {
    return queryOne<Project>('SELECT * FROM projects WHERE id = $1', [id]);
  }

  async findBySlug(slug: string): Promise<Project | null> {
    return queryOne<Project>('SELECT * FROM projects WHERE slug = $1', [slug]);
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const result = await queryOne<Project>(
      `INSERT INTO projects (slug, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.slug, input.name, input.description ?? null, input.created_by]
    );

    if (!result) {
      throw new Error('Failed to create project');
    }

    return result;
  }

  async update(
    id: string,
    input: UpdateProjectInput
  ): Promise<Project | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }

    if (input.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }

    if (input.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    return queryOne<Project>(
      `UPDATE projects SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }

  async addMember(input: AddProjectMemberInput): Promise<ProjectMember> {
    const result = await queryOne<ProjectMember>(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.project_id, input.user_id, input.role ?? 'member']
    );

    if (!result) {
      throw new Error('Failed to add project member');
    }

    return result;
  }

  async getMembers(projectId: string): Promise<ProjectMember[]> {
    return query<ProjectMember>(
      'SELECT * FROM project_members WHERE project_id = $1 ORDER BY created_at',
      [projectId]
    );
  }

  async listMemberUsers(
    projectId: string,
  ): Promise<
    { user_id: string; name: string; email: string; role: string }[]
  > {
    return query(
      `SELECT u.id AS user_id, u.name, u.email, pm.role
       FROM project_members pm
       INNER JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY pm.created_at ASC`,
      [projectId],
    );
  }

  async listForUser(userId: string): Promise<Project[]> {
    return query<Project>(
      `SELECT p.*
       FROM projects p
       INNER JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1
       ORDER BY p.name ASC`,
      [userId],
    );
  }

  async isMember(projectId: string, userId: string): Promise<boolean> {
    const result = await queryOne<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM project_members
         WHERE project_id = $1 AND user_id = $2
       ) AS exists`,
      [projectId, userId]
    );

    return result?.exists ?? false;
  }
}
