import { query, queryOne } from "../db";
import { CreateFolderInput, Folder } from "../models/folder";

export class FolderRepository {
  async findById(id: string): Promise<Folder | null> {
    return queryOne<Folder>("SELECT * FROM folders WHERE id = $1", [id]);
  }

  async findByOwner(ownerId: string): Promise<Folder[]> {
    return query<Folder>(
      "SELECT * FROM folders WHERE owner_id = $1 ORDER BY created_at DESC",
      [ownerId],
    );
  }

  async findByParent(parentId: string): Promise<Folder[]> {
    return query<Folder>(
      "SELECT * FROM folders WHERE parent_folder_id = $1 ORDER BY name",
      [parentId],
    );
  }

  async create(input: CreateFolderInput): Promise<Folder> {
    const result = await queryOne<Folder>(
      `INSERT INTO folders (owner_id, parent_folder_id, name, type, project_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.owner_id,
        input.parent_folder_id ?? null,
        input.name,
        input.type,
        input.project_id ?? null,
      ],
    );

    if (!result) {
      throw new Error("Failed to create folder");
    }

    return result;
  }
}
