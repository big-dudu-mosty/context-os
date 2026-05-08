import { queryOne } from '../db';
import { CreateUserInput, UpdateUserInput, User } from '../models/user';

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    return queryOne<User>(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    return queryOne<User>(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
  }

  async create(input: CreateUserInput): Promise<User> {
    const result = await queryOne<User>(
      `INSERT INTO users (name, email, role)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.name, input.email, input.role ?? 'member']
    );

    if (!result) {
      throw new Error('Failed to create user');
    }

    return result;
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }

    if (input.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(input.email);
    }

    if (input.role !== undefined) {
      fields.push(`role = $${paramIndex++}`);
      values.push(input.role);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = NOW()');
    values.push(id);

    return queryOne<User>(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING *`,
      values
    );
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await queryOne<{ id: string }>(
      `UPDATE users
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    return result !== null;
  }
}
