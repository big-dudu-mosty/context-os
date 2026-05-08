export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: string;
}
