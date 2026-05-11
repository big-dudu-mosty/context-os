export interface OpenQuestion {
  id: string;
  package_id: string;
  project_id: string;
  question: string;
  context: string | null;
  priority: string | null;
  status: string;
  answered_at: Date | null;
  answer: string | null;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateOpenQuestionInput {
  package_id: string;
  project_id: string;
  question: string;
  context?: string;
  priority?: string;
  owner_id: string;
}
