import { query, queryOne } from "../db";
import {
  ArchivedDocument,
  CreateArchivedDocumentInput,
} from "../models/archived-document";

export class ArchivedDocumentRepository {
  async findById(id: string): Promise<ArchivedDocument | null> {
    return queryOne<ArchivedDocument>(
      "SELECT * FROM archived_documents WHERE id = $1",
      [id],
    );
  }

  async findByFolder(folderId: string): Promise<ArchivedDocument[]> {
    return query<ArchivedDocument>(
      `SELECT * FROM archived_documents
       WHERE folder_id = $1
       ORDER BY created_at DESC`,
      [folderId],
    );
  }

  async findByCreator(createdBy: string): Promise<ArchivedDocument[]> {
    return query<ArchivedDocument>(
      `SELECT * FROM archived_documents
       WHERE created_by = $1
       ORDER BY created_at DESC`,
      [createdBy],
    );
  }

  async create(input: CreateArchivedDocumentInput): Promise<ArchivedDocument> {
    const result = await queryOne<ArchivedDocument>(
      `INSERT INTO archived_documents
         (artifact_id, folder_id, title, content, summary, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.artifact_id ?? null,
        input.folder_id,
        input.title,
        input.content,
        input.summary ?? null,
        input.tags ?? null,
        input.created_by,
      ],
    );

    if (!result) {
      throw new Error("Failed to create archived document");
    }

    return result;
  }

  async updateFolder(
    id: string,
    folderId: string,
  ): Promise<ArchivedDocument | null> {
    return queryOne<ArchivedDocument>(
      `UPDATE archived_documents
       SET folder_id = $2
       WHERE id = $1
       RETURNING *`,
      [id, folderId],
    );
  }
}
