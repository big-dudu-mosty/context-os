export type ArtifactStatus = "draft" | "archived";

export interface Artifact {
  id: string;
  session_id: string;
  title: string;
  content: string;
  status: ArtifactStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateArtifactInput {
  session_id: string;
  title: string;
  content: string;
  created_by: string;
}
