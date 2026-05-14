export interface Folder {
  id: string;
  owner_id: string;
  parent_folder_id: string | null;
  name: string;
  type: "company" | "project";
  project_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFolderInput {
  owner_id: string;
  parent_folder_id?: string;
  name: string;
  type: "company" | "project";
  project_id?: string;
}
