const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000/api";

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
  agent_id: string | null;
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

export interface InitResult {
  user: {
    id: string;
    name: string;
    email: string;
  };
  agent: {
    id: string;
    name: string;
    type?: string;
  };
  project: {
    id: string;
    name: string;
    slug?: string;
  };
  folder: {
    id: string;
    name: string;
  };
  session: {
    id: string;
    owner_id?: string;
    project_id?: string | null;
  };
}

export interface SessionRecord {
  id: string;
  agent_id: string;
  owner_id: string;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  transcript_path: string | null;
  transcript_hash: string | null;
  dream_status: string;
  dream_attempts: number;
  dream_max_attempts: number;
  dreamed_at: string | null;
}

export interface Folder {
  id: string;
  owner_id: string;
  parent_folder_id: string | null;
  name: string;
  type: "company" | "project";
  project_id: string | null;
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
  folder_type?: "company" | "project";
  folder_name?: string;
}

export interface ChatContextDocument {
  id: string;
  title: string;
  content: string;
  summary?: string | null;
  tags?: string[] | null;
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
  accepted_at: string | null;
  created_at: string;
  from_user_name?: string;
  to_user_name?: string;
  related_document_title?: string | null;
  source_project_id?: string | null;
}

export interface HandoffStartResult {
  handoffId: string;
  session: InitResult["session"] & {
    agent_id?: string;
    owner_id?: string;
  };
  attachedDocumentId: string | null;
  linkedPackageId: string | null;
}

export interface ProjectMember {
  user_id: string;
  name: string;
  email: string;
  role: string;
}

/** 当前用户参与的项目（列表） */
export interface UserProject {
  id: string;
  name: string;
  slug: string;
}

export interface CreateHandoffResult {
  handoffId: string;
  contextSummary: string;
}

export interface DreamReviewItem {
  id: string;
  owner_id: string;
  project_id: string | null;
  package_id: string | null;
  source_type: string;
  source_id: string | null;
  title: string;
  summary: string | null;
  status: "pending" | "approved" | "rejected" | "edited" | string;
  confidence: number | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

export class ApiService {
  async initialize(userName: string): Promise<InitResult> {
    return request<InitResult>("/init", {
      method: "POST",
      body: JSON.stringify({ user_name: userName }),
    });
  }

  async createSession(
    userId: string,
    agentId: string,
    projectId?: string | null,
  ): Promise<InitResult["session"]> {
    return request<InitResult["session"]>("/sessions/new", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        agent_id: agentId,
        project_id: projectId || undefined,
      }),
    });
  }

  async getUserSessions(userId: string, limit = 20): Promise<SessionRecord[]> {
    return request<SessionRecord[]>(
      `/users/${encodeURIComponent(userId)}/sessions?limit=${limit}`,
    );
  }

  async chat(
    sessionId: string,
    content: string,
    model: string,
    agentId?: string,
    contextDocuments: ChatContextDocument[] = [],
  ): Promise<Message> {
    const data = await request<Message>("/chat", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        content,
        model,
        agent_id: agentId || undefined,
        context_documents:
          contextDocuments.length > 0 ? contextDocuments : undefined,
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

  async updateArtifactDraft(
    artifactId: string,
    input: { title?: string; content: string },
  ): Promise<Artifact> {
    return request<Artifact>(`/artifacts/${encodeURIComponent(artifactId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
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

  async getArchivedDocuments(folderId: string): Promise<ArchivedDocument[]> {
    return request<ArchivedDocument[]>(
      `/folders/${encodeURIComponent(folderId)}/documents`,
    );
  }

  async getArchivedDocument(documentId: string): Promise<ArchivedDocument> {
    return request<ArchivedDocument>(
      `/documents/${encodeURIComponent(documentId)}`,
    );
  }

  async getFolders(userId: string): Promise<Folder[]> {
    return request<Folder[]>(`/users/${encodeURIComponent(userId)}/folders`);
  }

  async getProjectFolders(projectId: string, userId: string): Promise<Folder[]> {
    return request<Folder[]>(
      `/projects/${encodeURIComponent(projectId)}/folders?user_id=${encodeURIComponent(userId)}`,
    );
  }

  async createFolder(input: {
    owner_id: string;
    name: string;
    type: "company" | "project";
    project_id?: string;
    parent_folder_id?: string | null;
  }): Promise<Folder> {
    return request<Folder>("/folders", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async attachDocumentToSession(
    sessionId: string,
    documentId: string,
  ): Promise<unknown> {
    return request<unknown>(
      `/sessions/${encodeURIComponent(sessionId)}/attach`,
      {
        method: "POST",
        body: JSON.stringify({ document_id: documentId }),
      },
    );
  }

  async listProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return request<ProjectMember[]>(
      `/projects/${encodeURIComponent(projectId)}/members`,
    );
  }

  async addProjectMember(
    projectId: string,
    body: {
      actor_user_id: string;
      invite_user_name: string;
      role?: string;
    },
  ): Promise<{ members: ProjectMember[]; alreadyMember?: boolean }> {
    return request<{ members: ProjectMember[]; alreadyMember?: boolean }>(
      `/projects/${encodeURIComponent(projectId)}/members`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async listUserProjects(userId: string): Promise<UserProject[]> {
    return request<UserProject[]>(
      `/users/${encodeURIComponent(userId)}/projects`,
    );
  }

  async setSessionProject(
    sessionId: string,
    body: { user_id: string; project_id: string },
  ): Promise<SessionRecord> {
    return request<SessionRecord>(
      `/sessions/${encodeURIComponent(sessionId)}/project`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async moveArchivedDocument(
    documentId: string,
    body: { user_id: string; folder_id: string },
  ): Promise<ArchivedDocument> {
    return request<ArchivedDocument>(
      `/documents/${encodeURIComponent(documentId)}/folder`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  }

  async createHandoff(input: {
    from_owner_id: string;
    to_owner_id: string;
    session_id: string;
    message: string;
    title?: string;
    related_document_id?: string;
    package_id?: string;
  }): Promise<CreateHandoffResult> {
    return request<CreateHandoffResult>("/handoff", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async getHandoffInbox(userId: string): Promise<HandoffRecord[]> {
    return request<HandoffRecord[]>(
      `/handoff/inbox/${encodeURIComponent(userId)}`,
    );
  }

  async getHandoffSent(userId: string): Promise<HandoffRecord[]> {
    return request<HandoffRecord[]>(
      `/handoff/sent/${encodeURIComponent(userId)}`,
    );
  }

  async startSessionFromHandoff(
    handoffId: string,
    userId: string,
  ): Promise<HandoffStartResult> {
    return request<HandoffStartResult>(
      `/handoff/${encodeURIComponent(handoffId)}/start-session`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      },
    );
  }

  async getDreamReviewItems(userId: string): Promise<DreamReviewItem[]> {
    return request<DreamReviewItem[]>(
      `/dream-review/${encodeURIComponent(userId)}`,
    );
  }

  async approveAllDreamReview(userId: string): Promise<DreamReviewItem[]> {
    return request<DreamReviewItem[]>(
      `/dream-review/${encodeURIComponent(userId)}/approve-all`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      },
    );
  }

  async approveDreamReviewItem(
    itemId: string,
    userId: string,
  ): Promise<DreamReviewItem> {
    return request<DreamReviewItem>(
      `/dream-review/${encodeURIComponent(itemId)}/approve`,
      {
        method: "PUT",
        body: JSON.stringify({ user_id: userId }),
      },
    );
  }

  async rejectDreamReviewItem(
    itemId: string,
    userId: string,
  ): Promise<DreamReviewItem> {
    return request<DreamReviewItem>(
      `/dream-review/${encodeURIComponent(itemId)}/reject`,
      {
        method: "PUT",
        body: JSON.stringify({ user_id: userId }),
      },
    );
  }

  async editDreamReviewItem(
    itemId: string,
    userId: string,
    input: { title?: string; summary?: string },
  ): Promise<DreamReviewItem> {
    return request<DreamReviewItem>(
      `/dream-review/${encodeURIComponent(itemId)}/edit`,
      {
        method: "PUT",
        body: JSON.stringify({ user_id: userId, ...input }),
      },
    );
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!res.ok || payload.error) {
    throw new Error(payload.error || `请求失败：${res.status}`);
  }

  return payload.data as T;
}

export const api = new ApiService();
