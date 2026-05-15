import { query, queryOne } from "../db";
import {
  CreateDreamReviewItemInput,
  DreamReviewItem,
  DreamReviewStatus,
  UpdateDreamReviewItemInput,
} from "../models/dream-review-item";

export class DreamReviewItemRepository {
  async findById(id: string): Promise<DreamReviewItem | null> {
    return queryOne<DreamReviewItem>(
      "SELECT * FROM dream_review_items WHERE id = $1",
      [id],
    );
  }

  async findByOwner(
    ownerId: string,
    status?: DreamReviewStatus,
  ): Promise<DreamReviewItem[]> {
    if (status) {
      return query<DreamReviewItem>(
        `SELECT * FROM dream_review_items
         WHERE owner_id = $1 AND status = $2
         ORDER BY created_at DESC`,
        [ownerId, status],
      );
    }

    return query<DreamReviewItem>(
      `SELECT * FROM dream_review_items
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [ownerId],
    );
  }

  async createOrReturnExisting(
    input: CreateDreamReviewItemInput,
  ): Promise<DreamReviewItem> {
    const result = await queryOne<DreamReviewItem>(
      `INSERT INTO dream_review_items (
        owner_id, project_id, package_id, source_type, source_id, title,
        summary, confidence, payload
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (owner_id, source_type, source_id)
       WHERE source_id IS NOT NULL
       DO UPDATE SET updated_at = dream_review_items.updated_at
       RETURNING *`,
      [
        input.owner_id,
        input.project_id ?? null,
        input.package_id ?? null,
        input.source_type,
        input.source_id ?? null,
        input.title,
        input.summary ?? null,
        input.confidence ?? null,
        input.payload ?? {},
      ],
    );

    if (!result) {
      throw new Error("Failed to create dream review item");
    }

    return result;
  }

  async update(
    id: string,
    input: UpdateDreamReviewItemInput,
  ): Promise<DreamReviewItem | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(input.title);
    }

    if (input.summary !== undefined) {
      fields.push(`summary = $${paramIndex++}`);
      values.push(input.summary);
    }

    if (input.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }

    if (input.payload !== undefined) {
      fields.push(`payload = $${paramIndex++}`);
      values.push(input.payload);
    }

    if (input.reviewed_at !== undefined) {
      fields.push(`reviewed_at = $${paramIndex++}`);
      values.push(input.reviewed_at);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    return queryOne<DreamReviewItem>(
      `UPDATE dream_review_items SET ${fields.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values,
    );
  }

  async approvePendingByOwner(ownerId: string): Promise<DreamReviewItem[]> {
    return query<DreamReviewItem>(
      `UPDATE dream_review_items
       SET status = 'approved', reviewed_at = NOW(), updated_at = NOW()
       WHERE owner_id = $1 AND status = 'pending'
       RETURNING *`,
      [ownerId],
    );
  }
}
