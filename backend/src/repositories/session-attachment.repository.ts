import { query, queryOne } from "../db";
import {
  CreateSessionAttachmentInput,
  SessionAttachment,
  SessionAttachmentWithDocument,
} from "../models/session-attachment";

export class SessionAttachmentRepository {
  async findBySession(
    sessionId: string,
  ): Promise<SessionAttachmentWithDocument[]> {
    return query<SessionAttachmentWithDocument>(
      `SELECT sa.*, ad.title, ad.content, ad.summary
       FROM session_attachments sa
       JOIN archived_documents ad ON sa.document_id = ad.id
       WHERE sa.session_id = $1
       ORDER BY sa.attached_at DESC`,
      [sessionId],
    );
  }

  async findByDocument(documentId: string): Promise<SessionAttachment[]> {
    return query<SessionAttachment>(
      `SELECT * FROM session_attachments
       WHERE document_id = $1
       ORDER BY attached_at DESC`,
      [documentId],
    );
  }

  async create(
    input: CreateSessionAttachmentInput,
  ): Promise<SessionAttachment> {
    const result = await queryOne<SessionAttachment>(
      `INSERT INTO session_attachments (session_id, document_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id, document_id)
       DO UPDATE SET attached_at = session_attachments.attached_at
       RETURNING *`,
      [input.session_id, input.document_id],
    );

    if (!result) {
      throw new Error("Failed to create session attachment");
    }

    return result;
  }

  async delete(sessionId: string, documentId: string): Promise<void> {
    await query(
      `DELETE FROM session_attachments
       WHERE session_id = $1 AND document_id = $2`,
      [sessionId, documentId],
    );
  }
}
