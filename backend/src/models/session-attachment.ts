export interface SessionAttachment {
  id: string;
  session_id: string;
  document_id: string;
  attached_at: Date;
}

export interface CreateSessionAttachmentInput {
  session_id: string;
  document_id: string;
}
