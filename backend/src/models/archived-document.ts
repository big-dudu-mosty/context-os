export interface ArchivedDocument {
  id: string;
  artifact_id: string | null;
  folder_id: string;
  title: string;
  content: string;
  summary: string | null;
  tags: string[] | null;
  created_by: string;
  created_at: Date;
}

export interface CreateArchivedDocumentInput {
  artifact_id?: string;
  folder_id: string;
  title: string;
  content: string;
  summary?: string;
  tags?: string[];
  created_by: string;
}
