import { query, queryOne } from "../db";
import { CreateMessageInput, Message } from "../models/message";

export class MessageRepository {
  async findById(id: string): Promise<Message | null> {
    return queryOne<Message>("SELECT * FROM messages WHERE id = $1", [id]);
  }

  async findBySession(
    sessionId: string,
    limit = 50,
    offset = 0,
  ): Promise<Message[]> {
    return query<Message>(
      `SELECT * FROM messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [sessionId, limit, offset],
    );
  }

  async create(input: CreateMessageInput): Promise<Message> {
    const result = await queryOne<Message>(
      `INSERT INTO messages (session_id, role, content, model, agent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.session_id,
        input.role,
        input.content,
        input.model ?? null,
        input.agent_id ?? null,
      ],
    );

    if (!result) {
      throw new Error("Failed to create message");
    }

    return result;
  }
}
