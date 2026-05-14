const API_BASE = "http://localhost:3000/api";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
};

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  created_at: string;
}

export interface Artifact {
  id: string;
  session_id: string;
  title: string;
  content: string;
  status: "draft" | "archived" | string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ArchivedDocument {
  id: string;
  artifact_id: string | null;
  folder_id: string;
  title: string;
  content: string;
  summary: string | null;
  tags: string[] | null;
  created_by: string;
  created_at: string;
}

export interface ArchiveResult {
  archivedDocument: ArchivedDocument;
  contextPackage: {
    id: string;
    title: string;
    source_type: string;
  };
  extraction: {
    decisionsCreated: number;
    tasksCreated: number;
    risksCreated: number;
    questionsCreated: number;
    observationsCreated: number;
    conflictsDetected: number;
  };
}

export class ApiService {
  async chat(
    sessionId: string,
    content: string,
    model: string,
    agentId?: string,
  ): Promise<Message> {
    const data = await request<Message>("/chat", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        content,
        model,
        agent_id: agentId || undefined,
      }),
    });

    return data;
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const messages = await request<Message[]>(
      `/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    return [...messages].reverse();
  }

  async generateArtifact(
    sessionId: string,
    userId: string,
    title: string,
    userRequest?: string,
  ): Promise<Artifact> {
    return request<Artifact>("/artifacts", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        title,
        user_request: userRequest || undefined,
      }),
    });
  }

  async updateArtifact(artifactId: string, content: string): Promise<Artifact> {
    return request<Artifact>(`/artifacts/${encodeURIComponent(artifactId)}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
  }

  async archiveArtifact(
    artifactId: string,
    folderId: string,
    userId: string,
    summary?: string,
    tags?: string[],
  ): Promise<ArchiveResult> {
    return request<ArchiveResult>("/archive", {
      method: "POST",
      body: JSON.stringify({
        artifact_id: artifactId,
        folder_id: folderId,
        user_id: userId,
        summary: summary || undefined,
        tags: tags && tags.length > 0 ? tags : undefined,
      }),
    });
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!res.ok || payload.error) {
    throw new Error(payload.error || `Request failed: ${res.status}`);
  }

  return payload.data as T;
}

export const api = new ApiService();
