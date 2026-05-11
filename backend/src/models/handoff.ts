export interface HandoffRecord {
  id: string;
  from_owner_id: string;
  to_owner_id: string;
  session_id: string;
  message: string;
  context_summary: string | null;
  status: string;
  accepted_at: Date | null;
  created_at: Date;
}

export interface CreateHandoffInput {
  from_owner_id: string;
  to_owner_id: string;
  session_id: string;
  message: string;
  context_summary?: string;
}

export interface UpdateHandoffInput {
  status?: string;
  accepted_at?: Date;
}
