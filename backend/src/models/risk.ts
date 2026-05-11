export interface Risk {
  id: string;
  package_id: string;
  project_id: string;
  title: string;
  description: string | null;
  mitigation: string | null;
  severity: string | null;
  status: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateRiskInput {
  package_id: string;
  project_id: string;
  title: string;
  description?: string;
  mitigation?: string;
  severity?: string;
  status?: string;
  owner_id: string;
}
