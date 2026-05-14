import { useCallback, useEffect, useMemo, useState } from "react";
import { RightPanel } from "./components/RightPanel";
import type {
  ArtifactArchiveInput,
  ArtifactSaveInput,
  RightPanelMode,
} from "./components/RightPanel";
import { SessionArea } from "./components/SessionArea";
import { Sidebar } from "./components/Sidebar";
import type { WorkbenchSession } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { api } from "./services/api";
import type {
  ArchivedDocument,
  Artifact,
  Folder,
  InitResult,
  Message,
} from "./services/api";

const STORAGE_KEY = "context-os-context";

const DEMO_USERS = [
  {
    name: "alex",
    label: "Alex",
    role: "Product lead",
    note: "需求、决策和项目上下文沉淀",
  },
  {
    name: "bella",
    label: "Bella",
    role: "Engineering lead",
    note: "技术方案、任务拆解和风险跟踪",
  },
  {
    name: "chen",
    label: "Chen",
    role: "Operations lead",
    note: "会议纪要、交付说明和跟进事项",
  },
];

type ContextFolders = {
  company: Folder | null;
  project: Folder | null;
};

function App() {
  const [initialized, setInitialized] = useState(false);
  const [context, setContext] = useState<InitResult | null>(null);
  const [contextFolders, setContextFolders] = useState<ContextFolders>({
    company: null,
    project: null,
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [recentSessions, setRecentSessions] = useState<WorkbenchSession[]>([]);
  const [allArchivedDocuments, setAllArchivedDocuments] = useState<
    ArchivedDocument[]
  >([]);
  const [attachedContexts, setAttachedContexts] = useState<ArchivedDocument[]>(
    [],
  );
  const [selectedContext, setSelectedContext] =
    useState<ArchivedDocument | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>("empty");
  const [selectedAgent, setSelectedAgent] = useState("context-copilot");
  const [selectedModel, setSelectedModel] = useState("gpt-4");
  const [notice, setNotice] = useState("");
  const [loadingUser, setLoadingUser] = useState("");
  const [sending, setSending] = useState(false);
  const [generatingMessageId, setGeneratingMessageId] = useState<string | null>(
    null,
  );

  const currentSessionTitle = useMemo(() => {
    return deriveSessionTitle(messages);
  }, [messages]);

  const companyContexts = useMemo(() => {
    return allArchivedDocuments.filter((doc) => doc.folder_type === "company");
  }, [allArchivedDocuments]);

  const projectContexts = useMemo(() => {
    return allArchivedDocuments.filter((doc) => doc.folder_type === "project");
  }, [allArchivedDocuments]);

  const loadArchivedDocuments = useCallback(async (folders: ContextFolders) => {
    const docs: ArchivedDocument[] = [];

    if (folders.company) {
      const companyDocs = await api.getArchivedDocuments(folders.company.id);
      docs.push(
        ...companyDocs.map((doc) => ({
          ...doc,
          folder_type: "company" as const,
          folder_name: folders.company?.name,
        })),
      );
    }

    if (folders.project) {
      const projectDocs = await api.getArchivedDocuments(folders.project.id);
      docs.push(
        ...projectDocs.map((doc) => ({
          ...doc,
          folder_type: "project" as const,
          folder_name: folders.project?.name,
        })),
      );
    }

    setAllArchivedDocuments(
      docs.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    );
  }, []);

  const ensureContextFolders = useCallback(
    async (ctx: InitResult): Promise<ContextFolders> => {
      const folders = await api.getFolders(ctx.user.id);

      const company =
        folders.find((folder) => folder.type === "company") ??
        (await api.createFolder({
          owner_id: ctx.user.id,
          name: "Company Context",
          type: "company",
        }));

      const project =
        folders.find(
          (folder) =>
            folder.type === "project" && folder.project_id === ctx.project.id,
        ) ??
        (await api.createFolder({
          owner_id: ctx.user.id,
          name: "Project Context",
          type: "project",
          project_id: ctx.project.id,
        }));

      return { company, project };
    },
    [],
  );

  const loadMessages = useCallback(
    async (sessionId = context?.session.id) => {
      if (!sessionId) {
        setMessages([]);
        return;
      }

      try {
        const loaded = await api.getMessages(sessionId);
        setMessages(loaded);
      } catch (error) {
        setMessages([]);
        setNotice(error instanceof Error ? error.message : "消息加载失败");
      }
    },
    [context?.session.id],
  );

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as InitResult;
      setContext(parsed);
      setInitialized(true);
      setRecentSessions([
        {
          id: parsed.session.id,
          title: "Current Session",
          session: parsed.session,
        },
      ]);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!context) {
      return;
    }

    void loadMessages(context.session.id);
  }, [context?.session.id, loadMessages, context]);

  useEffect(() => {
    if (!context) {
      return;
    }

    const currentContext = context;
    let cancelled = false;

    async function prepare() {
      try {
        const folders = await ensureContextFolders(currentContext);
        if (cancelled) {
          return;
        }

        setContextFolders(folders);
        await loadArchivedDocuments(folders);
      } catch (error) {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "资料库准备失败");
        }
      }
    }

    void prepare();

    return () => {
      cancelled = true;
    };
  }, [
    context?.user.id,
    context?.project.id,
    context?.folder.id,
    context,
    ensureContextFolders,
    loadArchivedDocuments,
  ]);

  useEffect(() => {
    if (!context) {
      return;
    }

    setRecentSessions((current) =>
      upsertSession(current, {
        id: context.session.id,
        title: currentSessionTitle,
        session: context.session,
      }),
    );
  }, [context, currentSessionTitle]);

  async function handleInitialize(userName: string) {
    setLoadingUser(userName);
    setNotice("");

    try {
      const result = await api.initialize(userName);
      setContext(result);
      setInitialized(true);
      setArtifact(null);
      setSelectedContext(null);
      setAttachedContexts([]);
      setRightPanelMode("empty");
      setMessages([]);
      setRecentSessions([
        {
          id: result.session.id,
          title: "Current Session",
          session: result.session,
        },
      ]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      setNotice(`${result.user.name} is ready`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "初始化失败");
    } finally {
      setLoadingUser("");
    }
  }

  async function handleNewSession() {
    if (!context) {
      return;
    }

    setLoadingUser(context.user.name);
    try {
      const session = await api.createSession(
        context.user.id,
        context.agent.id,
        context.project.id,
      );
      const next = { ...context, session };
      setContext(next);
      setArtifact(null);
      setSelectedContext(null);
      setAttachedContexts([]);
      setRightPanelMode("empty");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecentSessions((current) =>
        upsertSession(current, {
          id: session.id,
          title: "New Session",
          session,
        }),
      );
      setNotice("New session created");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建会话失败");
    } finally {
      setLoadingUser("");
    }
  }

  function handleSelectSession(session: WorkbenchSession) {
    if (!context || session.id === context.session.id) {
      return;
    }

    const next = { ...context, session: session.session };
    setContext(next);
    setArtifact(null);
    setSelectedContext(null);
    setAttachedContexts([]);
    setRightPanelMode("empty");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function handleSendMessage(content: string) {
    if (!context) {
      return;
    }

    const localMessage: Message = {
      id: `local-${Date.now()}`,
      session_id: context.session.id,
      role: "user",
      content,
      model: selectedModel,
      agent_id: context.agent.id,
      created_at: new Date().toISOString(),
    };

    setSending(true);
    setMessages((current) => [...current, localMessage]);

    try {
      await api.chat(
        context.session.id,
        content,
        selectedModel,
        context.agent.id,
      );
      await loadMessages(context.session.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "发送失败";
      setNotice(isApiKeyError(errorMsg) ? apiKeyNotice() : errorMsg);
      await loadMessages(context.session.id);
    } finally {
      setSending(false);
    }
  }

  async function handleGenerateArtifact(messageId: string) {
    if (!context || generatingMessageId) {
      return;
    }

    const sourceMessage = messages.find((message) => message.id === messageId);
    setGeneratingMessageId(messageId);

    try {
      const generated = await api.generateArtifact(
        context.session.id,
        context.user.id,
        artifactTitleFromMessage(sourceMessage?.content),
        buildArtifactRequest(sourceMessage?.content),
      );
      setArtifact(generated);
      setSelectedContext(null);
      setRightPanelMode("artifact");
      setNotice("Artifact generated");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成 Artifact 失败");
    } finally {
      setGeneratingMessageId(null);
    }
  }

  function handleSelectContext(contextDoc: ArchivedDocument) {
    setSelectedContext(contextDoc);
    setArtifact(null);
    setRightPanelMode("context");

    void api
      .getArchivedDocument(contextDoc.id)
      .then((fullDocument) => {
        const enriched = {
          ...fullDocument,
          folder_type: contextDoc.folder_type,
          folder_name: contextDoc.folder_name,
        };
        setSelectedContext(enriched);
      })
      .catch((error) => {
        setNotice(error instanceof Error ? error.message : "加载资料失败");
      });
  }

  function handleAttachContext(contextDoc: ArchivedDocument) {
    setAttachedContexts((current) => {
      if (current.some((item) => item.id === contextDoc.id)) {
        return current;
      }

      return [...current, contextDoc];
    });
    setNotice(`Attached: ${contextDoc.title}`);
  }

  function handleAttachSelectedContext() {
    if (!selectedContext) {
      return;
    }

    handleAttachContext(selectedContext);
  }

  function handleRemoveContext(contextId: string) {
    setAttachedContexts((current) =>
      current.filter((contextDoc) => contextDoc.id !== contextId),
    );
  }

  async function handleSaveArtifact(input: ArtifactSaveInput) {
    if (!artifact) {
      return;
    }

    try {
      const updated = await api.updateArtifactDraft(artifact.id, input);
      setArtifact(updated);
      setNotice("Artifact saved");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
      throw error;
    }
  }

  async function handleArchiveArtifact(input: ArtifactArchiveInput) {
    if (!artifact || !context) {
      return;
    }

    const folder =
      input.targetScope === "company"
        ? contextFolders.company
        : contextFolders.project;

    if (!folder) {
      const message = "目标资料库尚未准备好";
      setNotice(message);
      throw new Error(message);
    }

    try {
      const updated = await api.updateArtifactDraft(artifact.id, {
        title: input.title,
        content: input.content,
      });
      await api.archiveArtifact(
        updated.id,
        folder.id,
        context.user.id,
        input.summary,
        input.tags,
      );

      setArtifact(null);
      setRightPanelMode("empty");
      await loadArchivedDocuments(contextFolders);
      setNotice("Archived to context library");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "归档失败");
      throw error;
    }
  }

  function handleClosePanel() {
    setSelectedContext(null);
    setArtifact(null);
    setRightPanelMode("empty");
  }

  function handleResetAccount() {
    if (!window.confirm("切换账号会清除当前浏览器中的本地工作台状态。")) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    setInitialized(false);
    setContext(null);
    setMessages([]);
    setRecentSessions([]);
    setAllArchivedDocuments([]);
    setAttachedContexts([]);
    setSelectedContext(null);
    setArtifact(null);
    setRightPanelMode("empty");
    setNotice("");
  }

  if (!initialized || !context) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,#fff8e9_0,#f6f4ef_34%,#efebe3_100%)] px-6 text-[#20201d]">
        <div className="w-full max-w-5xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[20px] bg-gradient-to-br from-[#8b5cf6] to-[#ffb86b] font-bold text-white shadow-[0_16px_36px_rgba(124,77,255,0.24)]">
              AI
            </div>
            <h1 className="text-3xl font-semibold">AI Context Workbench</h1>
            <p className="mt-3 text-sm text-[#5d5b55]">
              选择一个工作身份进入产品界面。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {DEMO_USERS.map((user) => (
              <button
                key={user.name}
                type="button"
                onClick={() => void handleInitialize(user.name)}
                disabled={Boolean(loadingUser)}
                className="rounded-[22px] border border-[#ded7c9] bg-[#fffdf8] p-6 text-left shadow-[0_20px_50px_rgba(48,39,22,0.10)] transition hover:-translate-y-0.5 hover:border-[#cfc5b3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="grid h-11 w-11 place-items-center rounded-[16px] bg-[#7c4dff] text-sm font-semibold uppercase text-white">
                  {user.label.slice(0, 1)}
                </div>
                <div className="mt-5 text-lg font-semibold">{user.label}</div>
                <div className="mt-1 text-sm text-[#88847a]">{user.role}</div>
                <p className="mt-4 min-h-10 text-sm leading-6 text-[#5d5b55]">
                  {user.note}
                </p>
                <div className="mt-5 text-sm font-semibold text-[#5b35d5]">
                  {loadingUser === user.name ? "Preparing..." : "Enter"}
                </div>
              </button>
            ))}
          </div>

          {notice ? (
            <div className="mt-5 rounded-2xl border border-[#ded7c9] bg-[#fffdf8] px-4 py-3 text-sm text-[#5d5b55]">
              {notice}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-[1180px] flex-col bg-[radial-gradient(circle_at_top_left,#fff8e9_0,#f6f4ef_34%,#efebe3_100%)] text-[#20201d]">
      <Topbar
        userName={context.user.name}
        onInboxClick={() => setRightPanelMode("handoff")}
        onDreamClick={() =>
          setNotice("Dream review is running in the background")
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          sessions={recentSessions}
          companyContexts={companyContexts}
          projectContexts={projectContexts}
          currentSessionId={context.session.id}
          selectedContextId={selectedContext?.id}
          onNewSession={() => void handleNewSession()}
          onSelectSession={handleSelectSession}
          onSelectContext={handleSelectContext}
          onGitHubSync={() => setRightPanelMode("github")}
          userName={context.user.name}
          loading={Boolean(loadingUser)}
          onAccountClick={handleResetAccount}
        />

        <SessionArea
          sessionTitle={currentSessionTitle}
          messages={messages}
          attachedContexts={attachedContexts}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          sending={sending}
          generatingMessageId={generatingMessageId}
          canAttachSelectedContext={Boolean(
            selectedContext &&
            !attachedContexts.some((item) => item.id === selectedContext.id),
          )}
          onAgentChange={setSelectedAgent}
          onModelChange={setSelectedModel}
          onSendMessage={handleSendMessage}
          onGenerateArtifact={(messageId) =>
            void handleGenerateArtifact(messageId)
          }
          onRemoveContext={handleRemoveContext}
          onAttachSelectedContext={handleAttachSelectedContext}
        />

        <RightPanel
          mode={rightPanelMode}
          selectedContext={selectedContext}
          artifact={artifact}
          attachedContextIds={attachedContexts.map((item) => item.id)}
          onClose={handleClosePanel}
          onAttachContext={handleAttachContext}
          onSaveArtifact={handleSaveArtifact}
          onArchiveArtifact={handleArchiveArtifact}
        />
      </div>

      {notice ? (
        <div className="fixed bottom-4 right-4 max-w-xl rounded-2xl bg-[#20201d] px-4 py-3 text-sm text-white shadow-[0_16px_36px_rgba(48,39,22,0.18)]">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

function upsertSession(
  sessions: WorkbenchSession[],
  next: WorkbenchSession,
): WorkbenchSession[] {
  const existingIndex = sessions.findIndex((session) => session.id === next.id);

  if (existingIndex === -1) {
    return [next, ...sessions].slice(0, 8);
  }

  const existing = sessions[existingIndex];
  if (existing.title === next.title && existing.session === next.session) {
    return sessions;
  }

  const updated = [...sessions];
  updated.splice(existingIndex, 1);
  return [next, ...updated].slice(0, 8);
}

function deriveSessionTitle(messages: Message[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) {
    return "Current Session";
  }

  const normalized = firstUserMessage.content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Current Session";
  }

  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function artifactTitleFromMessage(content?: string): string {
  if (!content) {
    return "Conversation Artifact";
  }

  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "Conversation Artifact";
  }

  return firstLine.length > 32 ? `${firstLine.slice(0, 32)}...` : firstLine;
}

function buildArtifactRequest(content?: string): string {
  if (!content) {
    return "根据当前对话整理一份结构化文档，列出决策、任务、风险和开放问题。";
  }

  return `请基于这条 assistant 回复和当前会话上下文，整理一份结构化文档。重点保留决策、任务、风险和开放问题。\n\n${content}`;
}

function isApiKeyError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("api") ||
    normalized.includes("key") ||
    normalized.includes("401") ||
    normalized.includes("unauthorized")
  );
}

function apiKeyNotice(): string {
  return 'LLM API 配置错误。请检查后端 .env 中的 OPENAI_API_KEY，或设置为 "mock" 使用测试模式。';
}

export default App;
