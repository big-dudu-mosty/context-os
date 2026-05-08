export interface ContextPackage {
  id: string;
  source_type: string;
  owner_id: string;
  agent_id: string;
  title: string;
  summary: string | null;
  raw_yaml: string;
  raw_yaml_hash: string;
  project_ids: string[];
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateContextPackageInput {
  source_type: string;
  owner_id: string;
  agent_id: string;
  title: string;
  summary?: string;
  raw_yaml: string;
  raw_yaml_hash: string;
  project_ids: string[];
}

export interface UpdateContextPackageInput {
  status?: string;
  summary?: string;
}
