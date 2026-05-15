export interface HandoffRecord {
  id: string;
  from_owner_id: string;
  to_owner_id: string;
  session_id: string;
  title: string | null;
  message: string;
  context_summary: string | null;
  related_document_id: string | null;
  package_id: string | null;
  status: string;
  accepted_at: Date | null;
  created_at: Date;
}

export interface HandoffRecordView extends HandoffRecord {
  from_user_name: string;
  to_user_name: string;
  related_document_title: string | null;
  source_project_id: string | null;
}

export interface CreateHandoffInput {
  from_owner_id: string;
  to_owner_id: string;
  session_id: string;
  title?: string;
  message: string;
  context_summary?: string;
  related_document_id?: string;
  package_id?: string;
}

export interface UpdateHandoffInput {
  status?: string;
  accepted_at?: Date;
}
