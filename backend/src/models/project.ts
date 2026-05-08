export interface Project {
  id: string;
  lock_id: number;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectInput {
  slug: string;
  name: string;
  description?: string;
  created_by: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: Date;
}

export interface AddProjectMemberInput {
  project_id: string;
  user_id: string;
  role?: string;
}
