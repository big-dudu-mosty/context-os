export interface Agent {
  id: string;
  owner_id: string;
  name: string;
  type: string;
  status: string;
  last_active_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAgentInput {
  owner_id: string;
  name: string;
  type: string;
}

export interface UpdateAgentInput {
  name?: string;
  status?: string;
  last_active_at?: Date;
}
