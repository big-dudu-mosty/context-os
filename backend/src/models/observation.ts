export interface Observation {
  id: string;
  package_id: string;
  project_id: string | null;
  type: string;
  content: string;
  relevance: string | null;
  confidence: number | null;
  tags: string[] | null;
  related_to_type: string | null;
  related_to_id: string | null;
  owner_id: string;
  created_at: Date;
}

export interface CreateObservationInput {
  package_id: string;
  project_id?: string | null;
  type: string;
  content: string;
  relevance?: string;
  confidence?: number;
  tags?: string[];
  related_to_type?: string;
  related_to_id?: string;
  owner_id: string;
}
