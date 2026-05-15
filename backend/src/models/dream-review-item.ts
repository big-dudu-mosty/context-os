export type DreamReviewSourceType =
  | "decision"
  | "task"
  | "risk"
  | "open_question"
  | "observation"
  | "artifact"
  | "handoff";

export type DreamReviewStatus = "pending" | "approved" | "rejected" | "edited";

export interface DreamReviewItem {
  id: string;
  owner_id: string;
  project_id: string | null;
  package_id: string | null;
  source_type: DreamReviewSourceType;
  source_id: string | null;
  title: string;
  summary: string | null;
  status: DreamReviewStatus;
  confidence: number | null;
  payload: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  reviewed_at: Date | null;
}

export interface CreateDreamReviewItemInput {
  owner_id: string;
  project_id?: string | null;
  package_id?: string | null;
  source_type: DreamReviewSourceType;
  source_id?: string | null;
  title: string;
  summary?: string | null;
  confidence?: number | null;
  payload?: Record<string, unknown>;
}

export interface UpdateDreamReviewItemInput {
  title?: string;
  summary?: string | null;
  status?: DreamReviewStatus;
  payload?: Record<string, unknown>;
  reviewed_at?: Date | null;
}
