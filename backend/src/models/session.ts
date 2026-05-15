export interface Session {
  id: string;
  agent_id: string;
  owner_id: string;
  project_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  transcript_path: string | null;
  transcript_hash: string | null;
  dream_status: string;
  dream_attempts: number;
  dream_max_attempts: number;
  dreamed_at: Date | null;
}

export interface CreateSessionInput {
  agent_id: string;
  owner_id: string;
  project_id?: string;
}

export interface UpdateSessionInput {
  ended_at?: Date;
  transcript_path?: string;
  transcript_hash?: string;
  dream_status?: string;
  dream_attempts?: number;
  dreamed_at?: Date;
  project_id?: string | null;
}
