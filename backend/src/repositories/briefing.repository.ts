import { query, queryOne } from "../db";
import { Briefing, CreateBriefingInput } from "../models/briefing";

export class BriefingRepository {
  async findById(id: string): Promise<Briefing | null> {
    return queryOne<Briefing>("SELECT * FROM briefings WHERE id = $1", [id]);
  }

  async findByOwnerAndDate(
    ownerId: string,
    date: Date,
  ): Promise<Briefing | null> {
    return queryOne<Briefing>(
      "SELECT * FROM briefings WHERE owner_id = $1 AND date = $2::date",
      [ownerId, toDateString(date)],
    );
  }

  async findByOwner(ownerId: string, limit = 10): Promise<Briefing[]> {
    return query<Briefing>(
      `SELECT * FROM briefings
       WHERE owner_id = $1
       ORDER BY date DESC
       LIMIT $2`,
      [ownerId, limit],
    );
  }

  async create(input: CreateBriefingInput): Promise<Briefing> {
    const result = await queryOne<Briefing>(
      `INSERT INTO briefings (owner_id, date, content)
       VALUES ($1, $2::date, $3)
       RETURNING *`,
      [input.owner_id, toDateString(input.date), input.content],
    );

    if (!result) {
      throw new Error("Failed to create briefing");
    }

    return result;
  }

  async markViewed(id: string): Promise<void> {
    await query("UPDATE briefings SET viewed_at = NOW() WHERE id = $1", [id]);
  }
}

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
