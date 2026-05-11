export interface Decision {
  id: string;
  package_id: string;
  project_id: string;
  decision_key: string;
  title: string;
  detail: string | null;
  confidence: number | null;
  status: string;
  supersedes_decision_id: string | null;
  overridden_by_decision_id: string | null;
  conflict_group_id: string | null;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDecisionInput {
  package_id: string;
  project_id: string;
  decision_key: string;
  title: string;
  detail?: string;
  confidence?: number;
  conflict_group_id?: string;
  owner_id: string;
}
