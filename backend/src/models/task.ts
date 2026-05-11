export interface Task {
  id: string;
  package_id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  status: string;
  priority: string | null;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskInput {
  package_id: string;
  project_id: string;
  title: string;
  description?: string;
  assignee_id?: string;
  status?: string;
  priority?: string;
  owner_id: string;
}
