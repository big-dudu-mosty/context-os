export interface SessionAttachment {
  id: string;
  session_id: string;
  document_id: string;
  attached_at: Date;
}

export interface SessionAttachmentWithDocument extends SessionAttachment {
  title: string;
  content: string;
  summary: string | null;
}

export interface CreateSessionAttachmentInput {
  session_id: string;
  document_id: string;
}
