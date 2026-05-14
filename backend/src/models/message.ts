export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  agent_id: string | null;
  created_at: Date;
}

export interface CreateMessageInput {
  session_id: string;
  role: MessageRole;
  content: string;
  model?: string;
  agent_id?: string;
}
