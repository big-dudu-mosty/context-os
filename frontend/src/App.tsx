import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { RightPanel } from "./components/RightPanel";
import type {
  ArtifactArchiveInput,
  ArtifactSaveInput,
  HandoffDraftState,
  HandoffSendInput,
  RightPanelMode,
} from "./components/RightPanel";
import { SessionArea } from "./components/SessionArea";
import { Sidebar } from "./components/Sidebar";
import type {
  ProjectContextGroup,
  WorkbenchSession,
} from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import type { AppView } from "./components/Topbar";
import { api } from "./services/api";
import type {
  ArchivedDocument,
  Artifact,
  DreamReviewItem,
  Folder,
  HandoffRecord,
  InitResult,
  Message,
  ProjectMember,
  SessionRecord,
  UserProject,
} from "./services/api";

const STORAGE_KEY = "context-os-context";

const DEMO_USERS = [
  {
    name: "alex",
    label: "Alex",
    role: "产品负责人",
    note: "需求、决策和项目上下文沉淀",
  },
  {
    name: "bella",
    label: "Bella",
    role: "工程负责人",
    note: "技术方案、任务拆解和风险跟踪",
  },
  {
    name: "chen",
    label: "Chen",
    role: "运营负责人",
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
  const [handoffInbox, setHandoffInbox] = useState<HandoffRecord[]>([]);
  const [handoffSent, setHandoffSent] = useState<HandoffRecord[]>([]);
  const [selectedHandoffId, setSelectedHandoffId] = useState<string | null>(
    null,
  );
  const [dreamReviewItems, setDreamReviewItems] = useState<DreamReviewItem[]>(
    [],
  );
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
  const [handoffDraft, setHandoffDraft] = useState<HandoffDraftState | null>(
    null,
  );
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectSubFolders, setProjectSubFolders] = useState<Folder[]>([]);
  const [userProjects, setUserProjects] = useState<UserProject[]>([]);
  const [projectFoldersByProject, setProjectFoldersByProject] = useState<
    Record<string, Folder[]>
  >({});
  const [projectMembersModalOpen, setProjectMembersModalOpen] =
    useState(false);
  const [activeView, setActiveView] = useState<AppView>("workbench");
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

  const sessionMetaLine = useMemo(() => {
    if (!context) {
      return "";
    }
    const raw = context.user.name?.trim() || "";
    const display =
      raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : "用户";
    let latestTs = 0;
    let latestIso = "";
    for (const m of messages) {
      const t = new Date(m.created_at).getTime();
      if (!Number.isNaN(t) && t >= latestTs) {
        latestTs = t;
        latestIso = m.created_at;
      }
    }
    const timePart = latestIso
      ? new Date(latestIso).toLocaleString("zh-CN", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    return timePart
      ? `AI 原生上下文协作 · ${display} · ${timePart}`
      : `AI 原生上下文协作 · ${display}`;
  }, [context, messages]);

  const handoffRecipients = useMemo(() => {
    if (!context) {
      return [];
    }
    return projectMembers.filter((m) => m.user_id !== context.user.id);
  }, [context, projectMembers]);

  const dreamPendingCount = useMemo(
    () =>
      dreamReviewItems.filter(
        (item) => item.status === "pending" || item.status === "edited",
      ).length,
    [dreamReviewItems],
  );

  const handoffPendingCount = useMemo(
    () => handoffInbox.filter((handoff) => handoff.status === "pending").length,
    [handoffInbox],
  );

  const companyContexts = useMemo(() => {
    return allArchivedDocuments.filter((doc) => doc.folder_type === "company");
  }, [allArchivedDocuments]);

  const projectContexts = useMemo(() => {
    return allArchivedDocuments.filter((doc) => doc.folder_type === "project");
  }, [allArchivedDocuments]);

  const projectRootDocuments = useMemo(() => {
    const rootId = contextFolders.project?.id;
    if (!rootId) {
      return [];
    }
    return projectContexts.filter((doc) => doc.folder_id === rootId);
  }, [projectContexts, contextFolders.project?.id]);

  const projectContextGroups = useMemo((): ProjectContextGroup[] => {
    if (!context?.project?.id || !contextFolders.project) {
      return [];
    }
    const rootId = contextFolders.project.id;
    const map = new Map<string, { label: string; docs: ArchivedDocument[] }>();

    for (const doc of projectContexts) {
      if (doc.folder_id === rootId) {
        continue;
      }
      const fid = doc.folder_id;
      if (!map.has(fid)) {
        map.set(fid, { label: doc.folder_name || "资料夹", docs: [] });
      }
      map.get(fid)!.docs.push(doc);
    }

    for (const sub of projectSubFolders) {
      if (sub.id === rootId) {
        continue;
      }
      if (!map.has(sub.id)) {
        map.set(sub.id, { label: sub.name, docs: [] });
      }
    }

    const ids = [...map.keys()];
    ids.sort((a, b) =>
      map.get(a)!.label.localeCompare(map.get(b)!.label, "zh-CN"),
    );

    const labelCounts = new Map<string, number>();
    for (const folderId of ids) {
      const label = map.get(folderId)!.label;
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }

    return ids.map((folderId) => {
      const label = map.get(folderId)!.label;
      return {
        folderId,
        folderLabel:
          (labelCounts.get(label) ?? 0) > 1
            ? `${label} · ${folderId.slice(0, 8)}`
            : label,
        documents: map.get(folderId)!.docs,
      };
    });
  }, [
    projectContexts,
    projectSubFolders,
    context?.project,
    contextFolders.project,
  ]);

  const projectArchiveFolderOptions = useMemo(() => {
    if (!context?.project) {
      return [];
    }
    const projects = uniqueProjects([context.project, ...userProjects]);
    const projectLabels = buildProjectLabelMap(projects);
    const options: { id: string; label: string }[] = [];

    for (const project of projects) {
      const folders =
        projectFoldersByProject[project.id] ??
        (project.id === context.project.id && contextFolders.project
          ? [contextFolders.project, ...projectSubFolders]
          : []);
      const roots = folders.filter((f) => !f.parent_folder_id);

      for (const root of roots) {
        options.push({
          id: root.id,
          label: `${projectLabels.get(project.id) ?? project.name} / ${root.name}（项目根）`,
        });
        const children = folders
          .filter((f) => f.parent_folder_id === root.id)
          .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        for (const child of children) {
          options.push({
            id: child.id,
            label: `${projectLabels.get(project.id) ?? project.name} / ${child.name}`,
          });
        }
      }
    }

    return options;
  }, [
    context,
    contextFolders.project,
    projectFoldersByProject,
    projectSubFolders,
    userProjects,
  ]);

  const allProjectFolders = useMemo(() => {
    const map = new Map<string, Folder>();
    for (const folders of Object.values(projectFoldersByProject)) {
      for (const folder of folders) {
        map.set(folder.id, folder);
      }
    }
    if (contextFolders.project) {
      map.set(contextFolders.project.id, contextFolders.project);
    }
    for (const folder of projectSubFolders) {
      map.set(folder.id, folder);
    }
    return [...map.values()];
  }, [contextFolders.project, projectFoldersByProject, projectSubFolders]);

  const suggestedProjectUsers = useMemo(() => {
    const existingEmails = new Set(projectMembers.map((m) => m.email));
    const currentEmail = context?.user.email ?? "";
    return DEMO_USERS.filter((user) => {
      const email = `${user.name}@local`;
      return email !== currentEmail && !existingEmails.has(email);
    });
  }, [context?.user.email, projectMembers]);

  const loadArchivedDocuments = useCallback(
    async (
      folders: ContextFolders,
      userId: string,
      projectId: string | undefined,
    ) => {
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

      if (folders.project && projectId) {
        const projectFolders = await api
          .getProjectFolders(projectId, userId)
          .catch(() => [folders.project as Folder]);
        setProjectFoldersByProject((current) => ({
          ...current,
          [projectId]: projectFolders,
        }));
        const rootFolder =
          projectFolders.find((f) => !f.parent_folder_id) ?? folders.project;
        const childFolders = projectFolders.filter(
          (f) => f.type === "project" && f.parent_folder_id === rootFolder.id,
        );
        childFolders.sort((a, b) =>
          a.name.localeCompare(b.name, "zh-CN"),
        );
        setProjectSubFolders(childFolders);

        const rootDocs = await api.getArchivedDocuments(rootFolder.id);
        docs.push(
          ...rootDocs.map((doc) => ({
            ...doc,
            folder_type: "project" as const,
            folder_name: rootFolder.name,
          })),
        );

        for (const child of childFolders) {
          const childDocs = await api.getArchivedDocuments(child.id);
          docs.push(
            ...childDocs.map((doc) => ({
              ...doc,
              folder_type: "project" as const,
              folder_name: child.name,
            })),
          );
        }
      } else if (folders.project) {
        setProjectSubFolders([]);
        const projectDocs = await api.getArchivedDocuments(folders.project.id);
        docs.push(
          ...projectDocs.map((doc) => ({
            ...doc,
            folder_type: "project" as const,
            folder_name: folders.project?.name,
          })),
        );
      } else {
        setProjectSubFolders([]);
      }

      setAllArchivedDocuments(
        docs.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        ),
      );
    },
    [],
  );

  const ensureContextFolders = useCallback(
    async (ctx: InitResult): Promise<ContextFolders> => {
      const folders = await api.getFolders(ctx.user.id);
      const projectFolders = await api
        .getProjectFolders(ctx.project.id, ctx.user.id)
        .catch(() => [] as Folder[]);

      const company =
        folders.find((folder) => folder.type === "company") ??
        (await api.createFolder({
          owner_id: ctx.user.id,
          name: "公司上下文",
          type: "company",
        }));

      const project =
        projectFolders.find(
          (folder) => folder.type === "project" && !folder.parent_folder_id,
        ) ??
        folders.find(
          (folder) =>
            folder.type === "project" && folder.project_id === ctx.project.id,
        ) ??
        (await api.createFolder({
          owner_id: ctx.user.id,
          name: "项目上下文",
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

  const loadUserSessions = useCallback(async (ctx: InitResult) => {
    try {
      const sessionRecords = await api.getUserSessions(ctx.user.id);
      const sessions: WorkbenchSession[] = await Promise.all(
        sessionRecords.map(async (session) => {
          let title = sessionTitleFromRecord(session);

          try {
            const sessionMessages = await api.getMessages(session.id);
            const derivedTitle = deriveSessionTitle(sessionMessages);
            if (derivedTitle !== "当前会话") {
              title = derivedTitle;
            }
          } catch {
            title = sessionTitleFromRecord(session);
          }

          return {
            id: session.id,
            title,
            session: {
              id: session.id,
              owner_id: session.owner_id,
              project_id: session.project_id,
            },
          };
        }),
      );

      if (!sessions.some((session) => session.id === ctx.session.id)) {
        sessions.unshift({
          id: ctx.session.id,
          title: sessionTitleFromRecord(ctx.session),
          session: ctx.session,
        });
      }

      setRecentSessions(sessions.slice(0, 8));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "会话列表加载失败");
    }
  }, []);

  const loadHandoffs = useCallback(async () => {
    if (!context) {
      setHandoffInbox([]);
      setHandoffSent([]);
      return;
    }

    try {
      const [inbox, sent] = await Promise.all([
        api.getHandoffInbox(context.user.id),
        api.getHandoffSent(context.user.id),
      ]);
      setHandoffInbox(inbox);
      setHandoffSent(sent);
      setSelectedHandoffId(
        (current) =>
          current ??
          inbox.find((handoff) => handoff.status === "pending")?.id ??
          inbox[0]?.id ??
          sent[0]?.id ??
          null,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "交接加载失败");
    }
  }, [context]);

  const loadDreamReviewItems = useCallback(async () => {
    if (!context) {
      setDreamReviewItems([]);
      return;
    }

    try {
      setDreamReviewItems(await api.getDreamReviewItems(context.user.id));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "梦境评审加载失败",
      );
    }
  }, [context]);

  useEffect(() => {
    if (!context?.project.id) {
      setProjectMembers([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const members = await api.listProjectMembers(context.project.id);
        if (!cancelled) {
          setProjectMembers(members);
        }
      } catch {
        if (!cancelled) {
          setProjectMembers([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context?.project.id]);

  useEffect(() => {
    if (!context?.user.id) {
      setUserProjects([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const list = await api.listUserProjects(context.user.id);
        if (!cancelled) {
          setUserProjects(list);
        }
      } catch {
        if (!cancelled) {
          setUserProjects([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context?.user.id]);

  useEffect(() => {
    if (!context?.user.id || !context.project.id) {
      setProjectFoldersByProject({});
      return;
    }

    const projects = uniqueProjects([context.project, ...userProjects]);
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        projects.map(async (project) => {
          const folders = await api
            .getProjectFolders(project.id, context.user.id)
            .catch(() => [] as Folder[]);
          return [project.id, folders] as const;
        }),
      );

      if (!cancelled) {
        setProjectFoldersByProject(Object.fromEntries(entries));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [context?.user.id, context?.project.id, context?.project, userProjects]);

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
          title: sessionTitleFromRecord(parsed.session),
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

    void loadUserSessions(context);
  }, [context?.user.id, context, loadUserSessions]);

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
        await loadArchivedDocuments(
          folders,
          currentContext.user.id,
          currentContext.project.id,
        );
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

  useEffect(() => {
    if (activeView === "inbox") {
      void loadHandoffs();
    }

    if (activeView === "dream") {
      void loadDreamReviewItems();
    }
  }, [activeView, loadDreamReviewItems, loadHandoffs]);

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
      setHandoffDraft(null);
      setRightPanelMode("empty");
      setActiveView("workbench");
      setMessages([]);
      setRecentSessions([
        {
          id: result.session.id,
          title: sessionTitleFromRecord(result.session),
          session: result.session,
        },
      ]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      setNotice(`${result.user.name} 已就绪`);
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
      setHandoffDraft(null);
      setRightPanelMode("empty");
      setActiveView("workbench");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecentSessions((current) =>
        upsertSession(current, {
          id: session.id,
          title: sessionTitleFromRecord(session),
          session,
        }),
      );
      setNotice("新会话已创建");
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

    const sessionPid = session.session.project_id ?? null;
    let nextProject = context.project;
    if (sessionPid) {
      const fromList = userProjects.find((p) => p.id === sessionPid);
      if (fromList) {
        nextProject = {
          id: fromList.id,
          name: fromList.name,
          slug: fromList.slug,
        };
      } else if (sessionPid === context.project.id) {
        nextProject = context.project;
      }
    }

    const next = { ...context, session: session.session, project: nextProject };
    setContext(next);
    setArtifact(null);
    setSelectedContext(null);
    setAttachedContexts([]);
    setHandoffDraft(null);
    setRightPanelMode("empty");
    setActiveView("workbench");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function handleSessionProjectChange(projectId: string) {
    if (!context || projectId === context.project.id) {
      return;
    }

    const target = userProjects.find((p) => p.id === projectId);
    if (!target) {
      setNotice("未找到该项目或你不在成员列表中");
      return;
    }

    setLoadingUser(context.user.name);
    try {
      const updatedSession = await api.setSessionProject(context.session.id, {
        user_id: context.user.id,
        project_id: projectId,
      });
      const nextProject = {
        id: target.id,
        name: target.name,
        slug: target.slug,
      };
      const next: InitResult = {
        ...context,
        project: nextProject,
        session: {
          id: updatedSession.id,
          owner_id: updatedSession.owner_id,
          project_id: updatedSession.project_id,
        },
      };
      setContext(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      void loadUserSessions(next);
      setNotice("已切换当前会话所属项目");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "切换项目失败");
    } finally {
      setLoadingUser("");
    }
  }

  async function handleMoveArchivedDocument(
    documentId: string,
    targetFolderId: string,
  ) {
    if (!context) {
      return;
    }

    try {
      await api.moveArchivedDocument(documentId, {
        user_id: context.user.id,
        folder_id: targetFolderId,
      });
      setSelectedContext((cur) => (cur?.id === documentId ? null : cur));
      setRightPanelMode((mode) =>
        selectedContext?.id === documentId && mode === "context"
          ? "empty"
          : mode,
      );
      await loadArchivedDocuments(
        contextFolders,
        context.user.id,
        context.project.id,
      );
      setNotice("已转移到所选资料夹");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "转移失败");
    }
  }

  async function handleSendMessage(content: string) {
    if (!context) {
      return;
    }

    if (!ownsCurrentSession(context)) {
      setNotice("来源会话是只读引用，不能在这里继续发送。请先从交接启动自己的新会话。");
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
        attachedContexts.map((contextDoc) => ({
          id: contextDoc.id,
          title: contextDoc.title,
          content: contextDoc.content,
          summary: contextDoc.summary,
          tags: contextDoc.tags,
        })),
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
      setHandoffDraft(null);
      setRightPanelMode("artifact");
      setActiveView("workbench");
      setNotice("产物已生成");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成产物失败");
    } finally {
      setGeneratingMessageId(null);
    }
  }

  function handleSelectContext(contextDoc: ArchivedDocument) {
    setSelectedContext(contextDoc);
    setArtifact(null);
    setHandoffDraft(null);
    setRightPanelMode("context");
    setActiveView("workbench");

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
    setNotice(`已引用：${contextDoc.title}`);
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

  async function handleStartHandoffSession(handoff?: HandoffRecord | null) {
    if (!context) {
      return;
    }

    if (!handoff) {
      setNotice("暂无可启动的交接");
      return;
    }

    if (handoff.to_owner_id !== context.user.id) {
      setNotice("只有接收人可以从交接新建会话；你发出的交接可打开来源会话查看。");
      return;
    }

    if (handoff.status !== "pending") {
      setNotice("此交接已处理，不能重复启动；可以打开来源会话查看。");
      return;
    }

    try {
      const result = await api.startSessionFromHandoff(
        handoff.id,
        context.user.id,
      );
      const nextSession = {
        id: result.session.id,
        owner_id: result.session.owner_id ?? context.user.id,
        project_id:
          result.session.project_id ??
          handoff.source_project_id ??
          context.project.id,
      };
      const next = { ...context, session: nextSession };
      setContext(next);
      setArtifact(null);
      setSelectedContext(null);
      setAttachedContexts([]);
      setHandoffDraft(null);
      setRightPanelMode("empty");
      setActiveView("workbench");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecentSessions((current) =>
        upsertSession(current, {
          id: nextSession.id,
          title: handoff.title ?? "交接会话",
          session: nextSession,
        }),
      );
      await loadMessages(nextSession.id);
      await loadHandoffs();
      setNotice("已从交接启动会话");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "启动交接会话失败",
      );
    }
  }

  async function handleAttachHandoffDocument(handoff?: HandoffRecord | null) {
    if (!context) {
      return;
    }

    if (!handoff?.related_document_id) {
      setNotice("当前交接没有关联文件可附加");
      return;
    }

    try {
      await api.attachDocumentToSession(
        context.session.id,
        handoff.related_document_id,
      );
      const document = await api.getArchivedDocument(
        handoff.related_document_id,
      );
      handleAttachContext(document);
      setNotice(`已引用：${document.title}`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "附加交接文件失败",
      );
    }
  }

  async function handleOpenSourceSession(handoff?: HandoffRecord | null) {
    if (!context) {
      return;
    }

    if (!handoff) {
      setNotice("暂无可打开的来源会话");
      return;
    }

    const nextSession = {
      id: handoff.session_id,
      owner_id: handoff.from_owner_id,
      project_id: handoff.source_project_id ?? context.project.id,
    };
    const next = { ...context, session: nextSession };
    setContext(next);
    setArtifact(null);
    setSelectedContext(null);
    setAttachedContexts([]);
    setHandoffDraft(null);
    setRightPanelMode("empty");
    setActiveView("workbench");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRecentSessions((current) =>
      upsertSession(current, {
        id: nextSession.id,
        title: `${handoff.title ?? "来源"} · 来源`,
        session: nextSession,
      }),
    );
    await loadMessages(nextSession.id);
    setNotice("已打开来源会话");
  }

  async function handleApproveAllDream() {
    if (!context) {
      return;
    }

    try {
      const approved = await api.approveAllDreamReview(context.user.id);
      await loadDreamReviewItems();
      await loadArchivedDocuments(
        contextFolders,
        context.user.id,
        context.project.id,
      );
      setNotice(
        approved.length > 0
          ? `已批准并归档 ${approved.length} 条到上下文资料库`
          : "当前没有待批准的梦境建议",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "批量审批失败");
    }
  }

  async function handleApproveDreamItem(item?: DreamReviewItem | null) {
    if (!context) {
      return;
    }

    if (!item) {
      setNotice("暂无可审批的梦境建议");
      return;
    }

    try {
      await api.approveDreamReviewItem(item.id, context.user.id);
      await loadDreamReviewItems();
      await loadArchivedDocuments(
        contextFolders,
        context.user.id,
        context.project.id,
      );
      setNotice("已批准并写入上下文资料库");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "审批失败");
    }
  }

  async function handleRejectDreamItem(item?: DreamReviewItem | null) {
    if (!context) {
      return;
    }

    if (!item) {
      setNotice("暂无可拒绝的梦境建议");
      return;
    }

    try {
      await api.rejectDreamReviewItem(item.id, context.user.id);
      await loadDreamReviewItems();
      setNotice("梦境建议已拒绝");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "拒绝失败");
    }
  }

  async function handleEditDreamItem(item?: DreamReviewItem | null) {
    if (!context) {
      return;
    }

    if (!item) {
      setNotice("暂无可编辑的梦境建议");
      return;
    }

    const summary = window.prompt("编辑建议摘要", item.summary ?? "");
    if (summary === null) {
      return;
    }

    try {
      await api.editDreamReviewItem(item.id, context.user.id, { summary });
      await loadDreamReviewItems();
      setNotice("梦境建议已编辑");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "编辑失败");
    }
  }

  async function handleSaveArtifact(input: ArtifactSaveInput) {
    if (!artifact) {
      return;
    }

    try {
      const updated = await api.updateArtifactDraft(artifact.id, input);
      setArtifact(updated);
      setNotice("产物已保存");
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

    const archiveFolderId =
      input.targetScope === "project" &&
      input.projectFolderId &&
      input.projectFolderId.trim() !== ""
        ? input.projectFolderId
        : folder.id;

    try {
      const updated = await api.updateArtifactDraft(artifact.id, {
        title: input.title,
        content: input.content,
      });
      await api.archiveArtifact(
        updated.id,
        archiveFolderId,
        context.user.id,
        input.summary,
        input.tags,
      );

      setArtifact(null);
      setHandoffDraft(null);
      setRightPanelMode("empty");
      await loadArchivedDocuments(
        contextFolders,
        context.user.id,
        context.project.id,
      );
      setNotice("已归档到上下文库");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "归档失败");
      throw error;
    }
  }

  function handleClosePanel() {
    setSelectedContext(null);
    setArtifact(null);
    setHandoffDraft(null);
    setRightPanelMode("empty");
    setActiveView("workbench");
  }

  function handleDiscardHandoff() {
    setHandoffDraft(null);
    setRightPanelMode("empty");
  }

  function handleStartHandoffFromMessage(message: Message) {
    if (message.role !== "assistant") {
      return;
    }
    if (context && !ownsCurrentSession(context)) {
      setNotice("来源会话是只读引用，不能从这里继续发起交接。请先从交接启动自己的新会话。");
      return;
    }
    setSelectedContext(null);
    setArtifact(null);
    setHandoffDraft({ messageId: message.id, aiReply: message.content });
    setRightPanelMode("handoff");
    setActiveView("workbench");
  }

  async function handleSendHandoff(input: HandoffSendInput) {
    if (!context) {
      return;
    }
    if (!ownsCurrentSession(context)) {
      setNotice("当前打开的是来源会话，不属于当前用户，不能发送交接。");
      return;
    }
    const body =
      input.note.trim().length > 0
        ? `${input.note.trim()}\n\n---\n【助手回复】\n${input.aiReply.trim()}`
        : `【助手回复】\n${input.aiReply.trim()}`;
    try {
      await api.createHandoff({
        from_owner_id: context.user.id,
        to_owner_id: input.toOwnerId,
        session_id: context.session.id,
        message: body,
        title: input.title.trim() || undefined,
      });
      setHandoffDraft(null);
      setRightPanelMode("empty");
      await loadHandoffs();
      setNotice("交接已发送");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "交接发送失败");
    }
  }

  async function handleCreateProjectSubfolder() {
    if (!context || !contextFolders.project) {
      return;
    }
    const name = window.prompt("新项目资料夹名称", "新主题");
    if (!name?.trim()) {
      return;
    }
    try {
      await api.createFolder({
        owner_id: context.user.id,
        name: name.trim(),
        type: "project",
        project_id: context.project.id,
        parent_folder_id: contextFolders.project.id,
      });
      await loadArchivedDocuments(
        contextFolders,
        context.user.id,
        context.project.id,
      );
      setNotice("资料夹已创建");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建资料夹失败");
    }
  }

  async function handleAddProjectMember(inviteLogin: string) {
    if (!context?.project.id) {
      return;
    }
    try {
      const result = await api.addProjectMember(context.project.id, {
        actor_user_id: context.user.id,
        invite_user_name: inviteLogin,
      });
      setProjectMembers(result.members);
      setNotice(result.alreadyMember ? "该用户已在项目中" : "已添加成员");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "添加成员失败");
    }
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
    setHandoffDraft(null);
    setProjectSubFolders([]);
    setProjectMembersModalOpen(false);
    setRightPanelMode("empty");
    setActiveView("workbench");
    setNotice("");
  }

  const selectedHandoff =
    handoffInbox.find((handoff) => handoff.id === selectedHandoffId) ??
    handoffSent.find((handoff) => handoff.id === selectedHandoffId) ??
    null;
  const canStartSelectedHandoff =
    Boolean(context) &&
    selectedHandoff?.to_owner_id === context?.user.id &&
    selectedHandoff?.status === "pending";
  const currentSessionReadOnly = context ? !ownsCurrentSession(context) : false;

  if (!initialized || !context) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf1] px-6 text-[#5b4c39]">
        <div className="w-full max-w-5xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-md bg-[#3287a8] text-base font-bold text-white">
              AI
            </div>
            <h1 className="text-2xl font-bold">
              AI 原生上下文协作
            </h1>
            <p className="mt-2 text-sm font-medium text-[#746b5c]">
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
                className="rounded-md border border-[#ded7c9] bg-[#fffdf8] p-5 text-left transition hover:border-[#cfc5b3] hover:bg-[#fffaf1] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="grid h-9 w-9 place-items-center rounded-md bg-[#fff8ea] text-sm font-bold uppercase text-[#3287a8]">
                  {user.label.slice(0, 1)}
                </div>
                <div className="mt-4 text-lg font-bold">{user.label}</div>
                <div className="mt-1 text-sm font-medium text-[#746b5c]">
                  {user.role}
                </div>
                <p className="mt-3 min-h-10 text-sm font-medium leading-6 text-[#746b5c]">
                  {user.note}
                </p>
                <div className="mt-4 text-sm font-bold text-[#5b4c39]">
                  {loadingUser === user.name ? "准备中…" : "进入"}
                </div>
              </button>
            ))}
          </div>

          {notice ? (
            <div className="mt-5 rounded-md border border-[#ded7c9] bg-[#fffdf8] px-4 py-3 text-sm font-medium text-[#746b5c]">
              {notice}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-[1180px] flex-col bg-[#fffaf1] text-[#5b4c39]">
      <Topbar
        activeView={activeView}
        inboxCount={handoffPendingCount}
        dreamPendingCount={dreamPendingCount}
        onWorkbenchClick={() => setActiveView("workbench")}
        onInboxClick={() => setActiveView("inbox")}
        onDreamClick={() => setActiveView("dream")}
      />

      {activeView === "inbox" ? (
        <InboxPage
          onBack={() => setActiveView("workbench")}
          inbox={handoffInbox}
          sent={handoffSent}
          selectedHandoff={selectedHandoff}
          canStartSession={canStartSelectedHandoff}
          onSelectHandoff={(handoff) => setSelectedHandoffId(handoff.id)}
          onClearSelection={() => setSelectedHandoffId(null)}
          onStartSession={() => void handleStartHandoffSession(selectedHandoff)}
          onAttach={() => void handleAttachHandoffDocument(selectedHandoff)}
          onOpenSourceSession={() =>
            void handleOpenSourceSession(selectedHandoff)
          }
        />
      ) : activeView === "dream" ? (
        <DreamPage
          onBack={() => setActiveView("workbench")}
          items={dreamReviewItems}
          onApproveAll={() => void handleApproveAllDream()}
          onApproveItem={(item) => void handleApproveDreamItem(item)}
          onEditItem={(item) => void handleEditDreamItem(item)}
          onRejectItem={(item) => void handleRejectDreamItem(item)}
        />
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar
            sessions={recentSessions}
            companyContexts={companyContexts}
            companyGroupTitle={contextFolders.company?.name ?? "公司上下文"}
            projectName={context.project.name}
            projectRootDocuments={projectRootDocuments}
            projectContextGroups={projectContextGroups}
            githubStatusLabel="GitHub · 未连接"
            currentSessionId={context.session.id}
            selectedContextId={selectedContext?.id}
            onNewSession={() => void handleNewSession()}
            onSelectSession={handleSelectSession}
            onSelectContext={handleSelectContext}
            onManageProjectMembers={() => setProjectMembersModalOpen(true)}
            onCreateProjectSubfolder={() => void handleCreateProjectSubfolder()}
            onGitHubSync={() => {
              setActiveView("workbench");
              setHandoffDraft(null);
              setRightPanelMode("github");
            }}
            userName={context.user.name}
            loading={Boolean(loadingUser)}
            onAccountClick={handleResetAccount}
          />

          <SessionArea
            sessionTitle={currentSessionTitle}
            sessionMetaLine={sessionMetaLine}
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
            onShowNotice={setNotice}
            onStartHandoff={handleStartHandoffFromMessage}
            userProjects={userProjects}
            currentProjectId={context.project.id}
            onSessionProjectChange={(id) =>
              void handleSessionProjectChange(id)
            }
            projectSwitchDisabled={Boolean(loadingUser) || sending}
            readOnly={currentSessionReadOnly}
          />

          {rightPanelMode !== "empty" ? (
            <RightPanel
              mode={rightPanelMode}
              selectedContext={selectedContext}
              artifact={artifact}
              attachedContextIds={attachedContexts.map((item) => item.id)}
              handoffDraft={handoffDraft}
              handoffRecipients={handoffRecipients}
              onClose={handleClosePanel}
              onAttachContext={handleAttachContext}
              onSaveArtifact={handleSaveArtifact}
              onArchiveArtifact={handleArchiveArtifact}
              onSendHandoff={handleSendHandoff}
              onDiscardHandoff={handleDiscardHandoff}
              projectArchiveTargets={projectArchiveFolderOptions}
              userProjects={uniqueProjects([context.project, ...userProjects]).map(
                toUserProject,
              )}
              userFolders={allProjectFolders}
              currentProjectId={context.project.id}
              onMoveArchivedDocument={handleMoveArchivedDocument}
            />
          ) : null}
        </div>
      )}

      {notice ? (
        <div className="fixed bottom-4 right-4 max-w-xl rounded-2xl bg-[#20201d] px-4 py-3 text-sm text-white shadow-[0_16px_36px_rgba(48,39,22,0.18)]">
          {notice}
        </div>
      ) : null}

      <ProjectMembersModal
        open={projectMembersModalOpen}
        members={projectMembers}
        suggestedUsers={suggestedProjectUsers}
        currentUserId={context.user.id}
        onClose={() => setProjectMembersModalOpen(false)}
        onAdd={(name) => handleAddProjectMember(name)}
      />
    </div>
  );
}

function ProjectMembersModal({
  open,
  members,
  suggestedUsers,
  currentUserId,
  onClose,
  onAdd,
}: {
  open: boolean;
  members: ProjectMember[];
  suggestedUsers: typeof DEMO_USERS;
  currentUserId: string;
  onClose: () => void;
  onAdd: (inviteLogin: string) => Promise<void>;
}) {
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 px-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#ded7c9] bg-[#fffdf8] p-5 text-[#5b4c39] shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="project-members-title"
      >
        <h2 id="project-members-title" className="text-lg font-bold">
          项目成员
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-[#746b5c]">
          添加已用演示入口登录过的用户：输入对方登录名（如 alex），系统会按与登录页相同的规则匹配账号。
        </p>
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm font-medium">
          {members.map((m) => (
            <li key={m.user_id}>
              {m.name} · {m.role}
              {m.user_id === currentUserId ? "（我）" : ""}
            </li>
          ))}
        </ul>
        {suggestedUsers.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 text-sm font-bold text-[#746b5c]">
              可添加成员
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedUsers.map((user) => (
                <button
                  key={user.name}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        await onAdd(user.name);
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                  className="rounded-md border border-[#ded7c9] bg-[#fffaf1] px-3 py-1.5 text-sm font-bold text-[#5b4c39] hover:bg-[#f8f1e3] disabled:opacity-50"
                >
                  {user.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label className="mt-4 block text-sm font-bold text-[#746b5c]">
          登录名
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#ded7c9] bg-white px-3 py-2 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39]"
            placeholder="alex"
            autoComplete="off"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-[#ded7c9] bg-[#fffaf1] px-3 py-2 text-sm font-bold text-[#5b4c39] hover:bg-[#f8f1e3]"
            onClick={onClose}
          >
            关闭
          </button>
          <button
            type="button"
            disabled={busy || !invite.trim()}
            className="rounded-md bg-[#5b4c39] px-3 py-2 text-sm font-bold text-[#fffaf1] hover:bg-[#4b3f30] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await onAdd(invite.trim());
                  setInvite("");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}

function InboxPage({
  onBack,
  inbox,
  sent,
  selectedHandoff,
  canStartSession,
  onSelectHandoff,
  onClearSelection,
  onStartSession,
  onAttach,
  onOpenSourceSession,
}: {
  onBack: () => void;
  inbox: HandoffRecord[];
  sent: HandoffRecord[];
  selectedHandoff: HandoffRecord | null;
  canStartSession: boolean;
  onSelectHandoff: (handoff: HandoffRecord) => void;
  onClearSelection: () => void;
  onStartSession: () => void;
  onAttach: () => void;
  onOpenSourceSession: () => void;
}) {
  const [listMode, setListMode] = useState<"inbox" | "sent">("inbox");
  const list = listMode === "inbox" ? inbox : sent;
  const pendingInboxCount = inbox.filter(
    (handoff) => handoff.status === "pending",
  ).length;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#fffaf1] px-7 py-7 text-[#5b4c39]">
      <div className="mx-auto grid max-w-[1580px] grid-cols-[104px_minmax(0,1fr)] gap-6">
        <button
          type="button"
          onClick={onBack}
          className="grid h-11 w-11 place-items-center rounded-md border border-[#ded7c9] bg-[#fffdf8] text-xl text-[#746b5c] hover:border-[#cfc5b3]"
          aria-label="返回工作台"
        >
          ←
        </button>

        <section>
          <div className="mb-7 flex items-start justify-between gap-7">
            <div>
              <h1 className="text-[28px] font-bold leading-tight">
                交接收件箱
              </h1>
              <p className="mt-3 max-w-[820px] text-base font-medium leading-7 text-[#746b5c]">
                上游负责人确认后的结构化任务交接包会进入这里。下游成员可以查看
                来源引用，并基于交接包开启自己的新会话。
              </p>
            </div>
            <button
              type="button"
              onClick={onStartSession}
              disabled={!selectedHandoff || !canStartSession}
              className="mt-2 rounded-md bg-[#5b4c39] px-4 py-2.5 text-sm font-bold text-[#fffaf1] hover:bg-[#4b3f30] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canStartSession
                ? "从交接新建会话"
                : selectedHandoff?.status === "pending"
                  ? "接收人可新建会话"
                  : "已处理"}
            </button>
          </div>

          <div className="grid grid-cols-[minmax(0,1.08fr)_minmax(420px,0.66fr)] gap-5">
            <div className="min-h-[560px] rounded-md border border-[#ded7c9] bg-[#fffdf8] p-5">
              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setListMode("inbox");
                    if (inbox[0]) {
                      onSelectHandoff(inbox[0]);
                    } else {
                      onClearSelection();
                    }
                  }}
                  className={`rounded-md px-3 py-2.5 text-sm font-bold ${
                    listMode === "inbox"
                      ? "bg-[#5b4c39] text-[#fffaf1]"
                      : "border border-[#ded7c9] bg-[#fffaf1] text-[#5b4c39]"
                  }`}
                >
                  分配给我 <CountBadge active={listMode === "inbox"}>{pendingInboxCount}</CountBadge>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setListMode("sent");
                    if (sent[0]) {
                      onSelectHandoff(sent[0]);
                    } else {
                      onClearSelection();
                    }
                  }}
                  className={`rounded-md px-3 py-2.5 text-sm font-bold ${
                    listMode === "sent"
                      ? "bg-[#5b4c39] text-[#fffaf1]"
                      : "border border-[#ded7c9] bg-[#fffaf1] text-[#5b4c39]"
                  }`}
                >
                  我发出的 <CountBadge active={listMode === "sent"}>{sent.length}</CountBadge>
                </button>
              </div>
              {list.length > 0 ? (
                <div className="space-y-2">
                  {list.map((handoff) => (
                    <button
                      key={handoff.id}
                      type="button"
                      onClick={() => onSelectHandoff(handoff)}
                      className={`w-full rounded-md border px-4 py-3.5 text-left ${
                        selectedHandoff?.id === handoff.id
                          ? "border-[#5b4c39] bg-[#f8f1e3]"
                          : "border-[#ded7c9] bg-[#fffdf8]"
                      }`}
                    >
                      <h2 className="text-base font-bold">
                        {handoff.title?.trim() || "未命名交接"}
                      </h2>
                      <p className="mt-1.5 text-sm font-medium text-[#746b5c]">
                        {handoff.from_user_name ?? "—"} →{" "}
                        {handoff.to_user_name ?? "—"}
                      </p>
                      {handoff.message ? (
                        <p className="mt-3 text-sm font-medium leading-6 text-[#746b5c]">
                          {handoff.message}
                        </p>
                      ) : null}
                      <div className="mt-3">
                        <StatusPill>{formatHandoffStatus(handoff.status)}</StatusPill>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-[#ded7c9] bg-[#fffdf8] px-4 py-8 text-center text-sm font-medium text-[#746b5c]">
                  {listMode === "inbox"
                    ? "暂无分配给我的交接。"
                    : "暂无我发出的交接。"}
                </div>
              )}
            </div>

            <div className="rounded-md border border-[#ded7c9] bg-[#fffdf8] p-5">
              <div className="border-t border-[#ded7c9] pt-5">
                {selectedHandoff ? (
                  <>
                    <FieldLabel>名称</FieldLabel>
                    <DetailBox>
                      {selectedHandoff.title?.trim() || "未命名交接"}
                    </DetailBox>
                    <FieldLabel>接收人</FieldLabel>
                    <DetailBox>
                      {selectedHandoff.to_user_name ?? "—"}
                    </DetailBox>
                    <FieldLabel>状态</FieldLabel>
                    <DetailBox compact>
                      {formatHandoffStatus(selectedHandoff.status)}
                    </DetailBox>
                    <FieldLabel>关联文件</FieldLabel>
                    <DetailBox compact>
                      {selectedHandoff.related_document_title ? (
                        <>📄 {selectedHandoff.related_document_title}</>
                      ) : (
                        <span className="text-[#837a6c]">无</span>
                      )}
                    </DetailBox>
                    <FieldLabel>消息</FieldLabel>
                    <div className="min-h-[112px] rounded-md border border-[#ded7c9] bg-[#fffdf8] px-4 py-3 text-base font-medium leading-7">
                      {selectedHandoff.message || (
                        <span className="text-[#837a6c]">无</span>
                      )}
                    </div>
                    <div className="mt-6 flex gap-2">
                      <DarkButton
                        onClick={onStartSession}
                        disabled={!canStartSession}
                      >
                        {canStartSession
                          ? "启动会话"
                          : selectedHandoff.status === "pending"
                            ? "接收人可启动"
                            : "已处理"}
                      </DarkButton>
                      <LightButton onClick={onAttach}>附加</LightButton>
                      <LightButton onClick={onOpenSourceSession}>
                        来源会话
                      </LightButton>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center text-sm font-medium text-[#746b5c]">
                    暂无选中交接。请在左侧选择一条记录。
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function DreamPage({
  onBack,
  items,
  onApproveAll,
  onApproveItem,
  onEditItem,
  onRejectItem,
}: {
  onBack: () => void;
  items: DreamReviewItem[];
  onApproveAll: () => void;
  onApproveItem: (item?: DreamReviewItem | null) => void;
  onEditItem: (item?: DreamReviewItem | null) => void;
  onRejectItem: (item?: DreamReviewItem | null) => void;
}) {
  const approvedCount = items.filter(
    (item) => item.status === "approved",
  ).length;
  const sourceSessionCount = new Set(
    items.map((item) => item.source_id).filter(Boolean),
  ).size;

  const approvedItems = useMemo(() => {
    return items
      .filter((item) => item.status === "approved")
      .sort((a, b) => {
        const ta = a.reviewed_at ? new Date(a.reviewed_at).getTime() : 0;
        const tb = b.reviewed_at ? new Date(b.reviewed_at).getTime() : 0;
        return tb - ta;
      });
  }, [items]);

  const queueItems = useMemo(() => {
    return items.filter(
      (item) => item.status === "pending" || item.status === "edited",
    );
  }, [items]);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#fffaf1] px-7 py-7 text-[#5b4c39]">
      <div className="mx-auto grid max-w-[1580px] grid-cols-[104px_minmax(0,1fr)] gap-6">
        <button
          type="button"
          onClick={onBack}
          className="grid h-11 w-11 place-items-center rounded-md border border-[#ded7c9] bg-[#fffdf8] text-xl text-[#746b5c] hover:border-[#cfc5b3]"
          aria-label="返回工作台"
        >
          ←
        </button>

        <section>
          <div className="mb-7 flex items-start justify-between gap-7">
            <div>
              <h1 className="text-[28px] font-bold leading-tight">
                梦境评审队列
              </h1>
              <p className="mt-3 max-w-[840px] text-base font-medium leading-7 text-[#746b5c]">
                梦境会扫描当天已确认会话、已批准上下文更新、产物、交接包、任务状态与实验报告，
                但不会自动写入公司上下文；所有建议均需人工批准、编辑或拒绝。
              </p>
            </div>
            <button
              type="button"
              onClick={onApproveAll}
              disabled={items.length === 0}
              className="mt-2 rounded-md bg-[#5b4c39] px-4 py-2.5 text-sm font-bold text-[#fffaf1] hover:bg-[#4b3f30] disabled:cursor-not-allowed disabled:opacity-50"
            >
              批准全部并归档
            </button>
          </div>

          <div className="grid grid-cols-[minmax(0,1.08fr)_minmax(420px,0.66fr)] gap-5">
            <section className="min-h-[640px] rounded-md border border-[#ded7c9] bg-[#fffdf8] p-5">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-bold">已写入资料库</h2>
                <span className="rounded-md border border-[#ded7c9] px-3 py-1 text-sm font-bold">
                  {approvedCount} 条
                </span>
              </div>
              {approvedItems.length > 0 ? (
                <ul className="mb-5 max-h-[480px] space-y-3 overflow-y-auto pr-1">
                  {approvedItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-[#ded7c9] bg-[#fffdf8] px-4 py-3 text-sm"
                    >
                      <div className="font-bold leading-snug text-[#5b4c39]">
                        {item.title}
                      </div>
                      {item.summary ? (
                        <p className="mt-2 line-clamp-4 font-medium leading-6 text-[#746b5c]">
                          {item.summary}
                        </p>
                      ) : null}
                      <div className="mt-2 text-xs font-medium text-[#837a6c]">
                        {item.source_type}
                        {item.reviewed_at
                          ? ` · ${new Date(item.reviewed_at).toLocaleString("zh-CN")}`
                          : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mb-5 rounded-md border border-dashed border-[#ded7c9] bg-[#fffdf8] px-4 py-8 text-center text-sm font-medium leading-6 text-[#746b5c]">
                  暂无已批准并写入资料库的条目。在右侧点击「批准并归档」后会显示在这里。
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusPill>{approvedCount} 已批准</StatusPill>
                {sourceSessionCount > 0 ? (
                  <StatusPill>{sourceSessionCount} 个来源会话</StatusPill>
                ) : null}
              </div>
            </section>

            <section className="rounded-md border border-[#ded7c9] bg-[#fffdf8] p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold">待处理建议</h2>
                <span className="shrink-0 rounded-md border border-[#ded7c9] px-2.5 py-1 text-xs font-bold text-[#746b5c]">
                  {queueItems.length} 条待办
                </span>
              </div>
              {queueItems.length > 0 ? (
                queueItems.map((item) => (
                  <DreamSuggestion
                    key={item.id}
                    title={item.title}
                    type={item.source_type}
                    confidence={formatConfidence(item.confidence)}
                    source={formatDreamItemSource(item)}
                    status={item.status}
                    onApprove={() => onApproveItem(item)}
                    onEdit={() => onEditItem(item)}
                    onReject={() => onRejectItem(item)}
                  >
                    {item.summary ?? (
                      <span className="text-[#837a6c]">（无摘要）</span>
                    )}
                  </DreamSuggestion>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-[#ded7c9] px-4 py-10 text-center text-sm font-medium text-[#746b5c]">
                  暂无待处理建议。
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function CountBadge({
  active = false,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`ml-2 rounded border px-2 py-0.5 ${
        active ? "border-[#bfb39f]" : "border-[#ded7c9]"
      }`}
    >
      {children}
    </span>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-4 text-sm font-bold text-[#746b5c] first:mt-0">
      {children}
    </div>
  );
}

function DetailBox({
  compact = false,
  children,
}: {
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-md border border-[#ded7c9] bg-[#fffdf8] px-4 font-medium ${
        compact
          ? "inline-flex min-h-10 items-center text-sm"
          : "flex min-h-12 items-center text-base"
      }`}
    >
      {children}
    </div>
  );
}

function DarkButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-[#5b4c39] px-3 py-2.5 text-sm font-bold text-[#fffaf1] hover:bg-[#4b3f30] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function LightButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-bold text-[#5b4c39] hover:border-[#cfc5b3]"
    >
      {children}
    </button>
  );
}

function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-[#ded7c9] bg-[#fffdf8] px-2.5 py-1 text-sm font-bold text-[#746b5c]">
      {children}
    </span>
  );
}

function DreamSuggestion({
  title,
  type,
  confidence,
  source,
  status = "待审核",
  onApprove,
  onEdit,
  onReject,
  children,
}: {
  title: string;
  type: string;
  confidence: string;
  source: string;
  status?: string;
  onApprove?: () => void;
  onEdit?: () => void;
  onReject?: () => void;
  children: ReactNode;
}) {
  return (
    <article className="mb-3 rounded-md border border-[#ded7c9] bg-[#fffdf8] px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-base font-bold leading-6">{title}</h3>
        <span className="whitespace-nowrap rounded-md border border-[#ded7c9] px-2.5 py-1 text-xs font-bold text-[#746b5c]">
          {formatReviewStatus(status)}
        </span>
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-sm font-medium text-[#746b5c]">
        <span className="rounded-md border border-[#ded7c9] px-2.5 py-1 font-bold">
          {type}
        </span>
        <span>
          置信度 {confidence} · {source}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium leading-6 text-[#746b5c]">
        {children}
      </p>
      <div className="mt-4 flex gap-2">
        <LightButton onClick={onApprove}>批准并归档</LightButton>
        <LightButton onClick={onEdit}>编辑</LightButton>
        <LightButton onClick={onReject}>拒绝</LightButton>
      </div>
    </article>
  );
}

function formatConfidence(value: number | null | undefined): string {
  return typeof value === "number" && !Number.isNaN(value)
    ? `${Math.round(value * 100)}%`
    : "—";
}

function formatDreamItemSource(item: DreamReviewItem): string {
  return `${item.source_type} · ${formatReviewStatus(item.status)}`;
}

function formatReviewStatus(status: string): string {
  const map: Record<string, string> = {
    pending: "待处理",
    approved: "已批准",
    rejected: "已拒绝",
    edited: "已编辑",
    "pending review": "待审核",
  };
  return map[status] ?? status;
}

function formatHandoffStatus(status: string): string {
  const map: Record<string, string> = {
    pending: "待启动",
    accepted: "已启动",
    dismissed: "已忽略",
  };
  return map[status] ?? status;
}

function ownsCurrentSession(context: InitResult): boolean {
  return !context.session.owner_id || context.session.owner_id === context.user.id;
}

function uniqueProjects<T extends { id: string; name: string; slug?: string }>(
  projects: T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const project of projects) {
    if (!project.id || seen.has(project.id)) {
      continue;
    }
    seen.add(project.id);
    result.push(project);
  }
  return result;
}

function buildProjectLabelMap<
  T extends { id: string; name: string; slug?: string },
>(projects: T[]): Map<string, string> {
  return new Map(
    projects.map((project) => [
      project.id,
      project.slug && project.slug !== project.name
        ? `${project.name} · ${project.slug}`
        : `${project.name} · ${project.id.slice(0, 8)}`,
    ]),
  );
}

function toUserProject(project: {
  id: string;
  name: string;
  slug?: string;
}): UserProject {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug ?? project.id,
  };
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
    return "当前会话";
  }

  const normalized = firstUserMessage.content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "当前会话";
  }

  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function sessionTitleFromRecord(
  session: Pick<SessionRecord, "id"> & { started_at?: string | null },
): string {
  if (session.started_at) {
    const startedAt = new Date(session.started_at);
    if (!Number.isNaN(startedAt.getTime())) {
      return `会话 ${startedAt.toLocaleString("zh-CN")}`;
    }
  }

  return `会话 ${session.id.slice(0, 8)}`;
}

function artifactTitleFromMessage(content?: string): string {
  if (!content) {
    return "对话产物";
  }

  const firstLine = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "对话产物";
  }

  return firstLine.length > 32 ? `${firstLine.slice(0, 32)}...` : firstLine;
}

function buildArtifactRequest(content?: string): string {
  if (!content) {
    return "根据当前对话整理一份结构化文档，列出决策、任务、风险和开放问题。";
  }

  return `请基于这条助手回复和当前会话上下文，整理一份结构化文档。重点保留决策、任务、风险和开放问题。\n\n${content}`;
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
