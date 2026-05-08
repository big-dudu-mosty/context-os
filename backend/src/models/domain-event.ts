export interface DomainEvent {
  id: number;
  project_id: string;
  project_event_seq: number;
  event_type: string;
  event_version: string;
  aggregate_type: string;
  aggregate_id: string;
  owner_id: string;
  agent_id: string;
  session_id: string | null;
  payload: unknown;
  idempotency_key: string | null;
  created_at: Date;
}

export interface CreateDomainEventInput {
  project_id: string;
  project_event_seq: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  owner_id: string;
  agent_id: string;
  session_id?: string;
  payload: unknown;
  idempotency_key?: string;
}
