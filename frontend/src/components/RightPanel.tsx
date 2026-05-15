import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  ArchivedDocument,
  Artifact,
  Folder,
  ProjectMember,
  UserProject,
} from "../services/api";

export type RightPanelMode =
  | "empty"
  | "context"
  | "artifact"
  | "handoff"
  | "github";

export interface ArtifactSaveInput {
  title: string;
  content: string;
}

export interface ArtifactArchiveInput extends ArtifactSaveInput {
  targetScope: "company" | "project";
  summary?: string;
  tags: string[];
  /** 归档到项目下的指定资料夹；缺省为项目根资料夹 */
  projectFolderId?: string;
}

/** 从某条助手消息发起的交接草稿 */
export interface HandoffDraftState {
  messageId: string;
  aiReply: string;
}

export interface HandoffSendInput {
  toOwnerId: string;
  title: string;
  note: string;
  aiReply: string;
}

interface RightPanelProps {
  mode: RightPanelMode;
  selectedContext: ArchivedDocument | null;
  artifact: Artifact | null;
  attachedContextIds: string[];
  handoffDraft: HandoffDraftState | null;
  handoffRecipients: ProjectMember[];
  onClose: () => void;
  onAttachContext: (context: ArchivedDocument) => void;
  onSaveArtifact: (input: ArtifactSaveInput) => Promise<void>;
  onArchiveArtifact: (input: ArtifactArchiveInput) => Promise<void>;
  onSendHandoff?: (input: HandoffSendInput) => Promise<void>;
  onDiscardHandoff?: () => void;
  /** 产物归档到「项目」时可选的资料夹（根 + 子资料夹） */
  projectArchiveTargets?: { id: string; label: string }[];
  userProjects?: UserProject[];
  userFolders?: Folder[];
  currentProjectId?: string;
  onMoveArchivedDocument?: (
    documentId: string,
    targetFolderId: string,
  ) => Promise<void>;
}

export function RightPanel({
  mode,
  selectedContext,
  artifact,
  attachedContextIds,
  handoffDraft,
  handoffRecipients,
  onClose,
  onAttachContext,
  onSaveArtifact,
  onArchiveArtifact,
  onSendHandoff,
  onDiscardHandoff,
  projectArchiveTargets = [],
  userProjects = [],
  userFolders = [],
  currentProjectId = "",
  onMoveArchivedDocument,
}: RightPanelProps) {
  if (mode === "context" && selectedContext) {
    return (
      <ContextDetail
        context={selectedContext}
        isAttached={attachedContextIds.includes(selectedContext.id)}
        onAttach={() => onAttachContext(selectedContext)}
        onClose={onClose}
        userProjects={userProjects}
        userFolders={userFolders}
        currentProjectId={currentProjectId}
        onMove={
          onMoveArchivedDocument
            ? (folderId) =>
                onMoveArchivedDocument(selectedContext.id, folderId)
            : undefined
        }
      />
    );
  }

  if (mode === "artifact" && artifact) {
    return (
      <ArtifactEditor
        artifact={artifact}
        projectArchiveTargets={projectArchiveTargets}
        onSave={onSaveArtifact}
        onArchive={onArchiveArtifact}
        onClose={onClose}
      />
    );
  }

  if (mode === "handoff" && handoffDraft && onSendHandoff && onDiscardHandoff) {
    return (
      <HandoffDraftPanel
        draft={handoffDraft}
        recipients={handoffRecipients}
        onSend={onSendHandoff}
        onDiscard={onDiscardHandoff}
        onClose={onClose}
      />
    );
  }

  if (mode === "handoff") {
    return (
      <PlaceholderPanel
        title="交接"
        eyebrow="侧栏"
        description="请从助手消息旁的 ↗ 发起交接。"
        onClose={onClose}
      />
    );
  }

  if (mode === "github") {
    return (
      <PlaceholderPanel
        title="GitHub 文件详情"
        eyebrow="GitHub 同步"
        description="连接仓库后，这里会展示文件变化、同步状态和可生成的上下文。"
        onClose={onClose}
      />
    );
  }

  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffaf1] text-[#5b4c39]">
      <PanelHeader title="详情面板" subtitle="等待选择上下文" />
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <div className="text-base font-bold text-[#5b4c39]">
            选择资料查看详情
          </div>
          <p className="mt-2 text-sm font-medium leading-6 text-[#746b5c]">
            或从助手回复下方生成产物，在这里编辑并归档。
          </p>
        </div>
      </div>
    </aside>
  );
}

function ContextDetail({
  context,
  isAttached,
  onAttach,
  onClose,
  userProjects,
  userFolders,
  currentProjectId,
  onMove,
}: {
  context: ArchivedDocument;
  isAttached: boolean;
  onAttach: () => void;
  onClose: () => void;
  userProjects: UserProject[];
  userFolders: Folder[];
  currentProjectId: string;
  onMove?: (targetFolderId: string) => Promise<void>;
}) {
  const [moveProjectId, setMoveProjectId] = useState(currentProjectId);
  const [moveFolderId, setMoveFolderId] = useState("");
  const [moving, setMoving] = useState(false);

  const folderOptions = useMemo(() => {
    if (!moveProjectId) {
      return [];
    }
    const roots = userFolders.filter(
      (f) =>
        f.type === "project" &&
        f.project_id === moveProjectId &&
        !f.parent_folder_id,
    );
    const options: { id: string; label: string }[] = [];
    for (const root of roots) {
      options.push({ id: root.id, label: `${root.name}（项目根）` });
      const children = userFolders
        .filter(
          (f) =>
            f.type === "project" &&
            f.parent_folder_id === root.id &&
            (f.project_id === moveProjectId || f.project_id == null),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      for (const child of children) {
        options.push({ id: child.id, label: child.name });
      }
    }

    if (
      moveProjectId === currentProjectId &&
      !options.some((option) => option.id === context.folder_id)
    ) {
      options.unshift({
        id: context.folder_id,
        label: context.folder_name ?? "当前资料夹",
      });
    }

    return disambiguateFolderOptions(options);
  }, [
    context.folder_id,
    context.folder_name,
    currentProjectId,
    moveProjectId,
    userFolders,
  ]);
  const currentFolderLabel =
    folderOptions.find((option) => option.id === context.folder_id)?.label ??
    context.folder_name ??
    "未知资料夹";

  useEffect(() => {
    setMoveProjectId(currentProjectId);
  }, [context.id, currentProjectId]);

  useEffect(() => {
    const first =
      folderOptions.find((o) => o.id === context.folder_id)?.id ??
      folderOptions[0]?.id ??
      "";
    setMoveFolderId((prev) =>
      prev && folderOptions.some((o) => o.id === prev) ? prev : first,
    );
  }, [moveProjectId, folderOptions, context.folder_id]);

  async function handleMove() {
    if (!onMove || !moveFolderId || moveFolderId === context.folder_id) {
      return;
    }
    setMoving(true);
    try {
      await onMove(moveFolderId);
    } finally {
      setMoving(false);
    }
  }

  const canMove =
    Boolean(onMove) &&
    context.folder_type === "project" &&
    userProjects.length > 0 &&
    folderOptions.length > 0;

  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffaf1] text-[#5b4c39]">
      <PanelHeader
        title={context.title}
        subtitle={new Date(context.created_at).toLocaleString("zh-CN")}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onAttach}
            disabled={isAttached}
            className="rounded-md bg-[#5b4c39] px-3 py-2 text-sm font-bold text-[#fffaf1] hover:bg-[#4b3f30] disabled:cursor-not-allowed disabled:bg-[#ded7c9] disabled:text-[#88847a]"
          >
            {isAttached ? "已引用" : "引用到会话"}
          </button>
          <span className="rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2 text-xs font-bold text-[#746b5c]">
            {context.folder_type === "company"
              ? "公司上下文"
              : "项目上下文"}
          </span>
        </div>

        {context.summary ? (
          <PanelSection title="摘要">
            <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-[#746b5c]">
              {context.summary}
            </p>
          </PanelSection>
        ) : null}

        {context.tags && context.tags.length > 0 ? (
          <PanelSection title="标签">
            <div className="flex flex-wrap gap-2">
              {context.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-1 text-xs font-bold text-[#746b5c]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </PanelSection>
        ) : null}

        {canMove ? (
          <PanelSection title="转移到其他项目">
            <div className="space-y-3">
              <div className="rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2 text-sm font-medium text-[#746b5c]">
                当前位置：{currentFolderLabel}
              </div>
              <label className="block text-sm font-bold text-[#746b5c]">
                目标项目
                <select
                  value={moveProjectId}
                  onChange={(e) => setMoveProjectId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39]"
                >
                  {userProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatProjectOptionLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold text-[#746b5c]">
                目标资料夹
                <select
                  value={moveFolderId}
                  onChange={(e) => setMoveFolderId(e.target.value)}
                  disabled={folderOptions.length === 0}
                  className="mt-1 w-full rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39] disabled:opacity-50"
                >
                  {folderOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={
                  moving ||
                  !moveFolderId ||
                  moveFolderId === context.folder_id
                }
                onClick={() => void handleMove()}
                className="rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2 text-sm font-bold text-[#5b4c39] hover:bg-[#f8f1e3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {moving ? "转移中…" : "确认转移"}
              </button>
            </div>
          </PanelSection>
        ) : null}

        <PanelSection title="正文">
          <div className="whitespace-pre-wrap rounded-md border border-[#ded7c9] bg-[#fffdf8] px-4 py-4 text-sm font-medium leading-6 text-[#5b4c39]">
            {context.content}
          </div>
        </PanelSection>
      </div>
    </aside>
  );
}

function ArtifactEditor({
  artifact,
  projectArchiveTargets,
  onSave,
  onArchive,
  onClose,
}: {
  artifact: Artifact;
  projectArchiveTargets: { id: string; label: string }[];
  onSave: (input: ArtifactSaveInput) => Promise<void>;
  onArchive: (input: ArtifactArchiveInput) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(artifact.title);
  const [content, setContent] = useState(artifact.content);
  const [targetScope, setTargetScope] = useState<"company" | "project">(
    "project",
  );
  const [projectFolderId, setProjectFolderId] = useState(
    () => projectArchiveTargets[0]?.id ?? "",
  );
  const [tags, setTags] = useState("project-context");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(artifact.title);
    setContent(artifact.content);
  }, [artifact.id, artifact.content, artifact.title]);

  useEffect(() => {
    const first = projectArchiveTargets[0]?.id ?? "";
    setProjectFolderId((prev) => {
      if (prev && projectArchiveTargets.some((t) => t.id === prev)) {
        return prev;
      }
      return first;
    });
  }, [artifact.id, projectArchiveTargets]);

  const wordCount = useMemo(() => {
    return content.trim() ? content.trim().split(/\s+/).length : 0;
  }, [content]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ title: title.trim() || "未命名产物", content });
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setSaving(true);
    try {
      await onArchive({
        title: title.trim() || "未命名产物",
        content,
        targetScope,
        summary: summary.trim() || undefined,
        tags: splitTags(tags),
        projectFolderId:
          targetScope === "project" ? projectFolderId : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffaf1] text-[#5b4c39]">
      <PanelHeader
        title="产物编辑器"
        subtitle={`草稿 · ${wordCount} 词`}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <label className="mb-4 block">
          <span className="text-sm font-bold text-[#746b5c]">文件名</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39]"
          />
        </label>

        <label className="mb-4 block">
          <span className="text-sm font-bold text-[#746b5c]">归档位置</span>
          <select
            value={targetScope}
            onChange={(event) =>
              setTargetScope(event.target.value as "company" | "project")
            }
            className="mt-2 w-full rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39]"
          >
            <option value="company">公司上下文</option>
            <option value="project">项目上下文</option>
          </select>
        </label>

        {targetScope === "project" && projectArchiveTargets.length > 0 ? (
          <label className="mb-4 block">
            <span className="text-sm font-bold text-[#746b5c]">项目资料夹</span>
            <select
              value={projectFolderId}
              onChange={(event) => setProjectFolderId(event.target.value)}
              className="mt-2 w-full rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39]"
            >
              {projectArchiveTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="mb-4 block">
          <span className="text-sm font-bold text-[#746b5c]">标签</span>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="逗号分隔"
            className="mt-2 w-full rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39]"
          />
        </label>

        <label className="mb-4 block">
          <span className="text-sm font-bold text-[#746b5c]">摘要</span>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium leading-6 text-[#5b4c39] outline-none focus:border-[#5b4c39]"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-[#746b5c]">内容</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="mt-2 h-[42vh] min-h-72 w-full resize-none rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-3 text-sm font-medium leading-6 text-[#5b4c39] outline-none focus:border-[#5b4c39]"
          />
        </label>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-[#ded7c9] bg-[#fffaf1] px-4 py-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex-1 rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-bold text-[#5b4c39] hover:border-[#cfc5b3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => void handleArchive()}
          disabled={saving || !content.trim()}
          className="flex-1 rounded-md bg-[#5b4c39] px-3 py-2.5 text-sm font-bold text-[#fffaf1] hover:bg-[#4b3f30] disabled:cursor-not-allowed disabled:opacity-50"
        >
          归档
        </button>
      </div>
    </aside>
  );
}

function HandoffDraftPanel({
  draft,
  recipients,
  onSend,
  onDiscard,
  onClose,
}: {
  draft: HandoffDraftState;
  recipients: ProjectMember[];
  onSend: (input: HandoffSendInput) => Promise<void>;
  onDiscard: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("会话交接");
  const [note, setNote] = useState(
    "这段助手回复可作为下一步输入，请基于它继续推进。",
  );
  const [toOwnerId, setToOwnerId] = useState(recipients[0]?.user_id ?? "");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setTitle("会话交接");
    setNote("这段助手回复可作为下一步输入，请基于它继续推进。");
  }, [draft.messageId]);

  useEffect(() => {
    setToOwnerId((prev) => {
      if (prev && recipients.some((r) => r.user_id === prev)) {
        return prev;
      }
      return recipients[0]?.user_id ?? "";
    });
  }, [recipients]);

  const canSend = Boolean(toOwnerId) && recipients.length > 0;

  async function handleSend() {
    if (!canSend) {
      return;
    }
    setSending(true);
    try {
      await onSend({
        toOwnerId,
        title: title.trim() || "会话交接",
        note: note.trim(),
        aiReply: draft.aiReply,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffaf1] text-[#5b4c39]">
      <PanelHeader
        title="交接"
        subtitle="发送给项目内其他成员"
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {recipients.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm font-medium leading-6 text-amber-950">
            当前项目暂无其他成员，无法选择接收人。交接需要同一项目内至少两名用户（可在数据库中为项目添加成员，或使用不同演示账号加入同一项目后再试）。
          </p>
        ) : null}
        <label className="block">
          <span className="text-sm font-bold text-[#746b5c]">助手回复</span>
          <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium leading-6 text-[#5b4c39]">
            {draft.aiReply}
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-[#746b5c]">名称</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39]"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-[#746b5c]">接收人</span>
          <select
            value={toOwnerId}
            onChange={(event) => setToOwnerId(event.target.value)}
            disabled={recipients.length === 0}
            className="mt-2 w-full rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium text-[#5b4c39] outline-none focus:border-[#5b4c39] disabled:opacity-50"
          >
            {recipients.length === 0 ? (
              <option value="">（无可用成员）</option>
            ) : (
              recipients.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name} · {m.role || m.email}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-[#746b5c]">留言</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="mt-2 w-full resize-none rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-medium leading-6 text-[#5b4c39] outline-none focus:border-[#5b4c39]"
          />
        </label>
      </div>
      <div className="flex shrink-0 gap-2 border-t border-[#ded7c9] bg-[#fffaf1] px-4 py-3">
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !canSend}
          className="flex-1 rounded-md bg-[#5b4c39] px-3 py-2.5 text-sm font-bold text-[#fffaf1] hover:bg-[#4b3f30] disabled:cursor-not-allowed disabled:opacity-50"
        >
          发送
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={sending}
          className="flex-1 rounded-md border border-[#ded7c9] bg-[#fffdf8] px-3 py-2.5 text-sm font-bold text-[#5b4c39] hover:border-[#cfc5b3] disabled:opacity-50"
        >
          放弃
        </button>
      </div>
    </aside>
  );
}

function PlaceholderPanel({
  title,
  eyebrow,
  description,
  onClose,
}: {
  title: string;
  eyebrow: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffaf1] text-[#5b4c39]">
      <PanelHeader title={title} subtitle={eyebrow} onClose={onClose} />
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm font-medium leading-6 text-[#746b5c]">
        {description}
      </div>
    </aside>
  );
}

function PanelHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle: string;
  onClose?: () => void;
}) {
  return (
    <div className="border-b border-[#ded7c9] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-bold text-[#5b4c39]">
            {title}
          </h2>
          <p className="mt-1 truncate text-sm font-medium text-[#746b5c]">
            {subtitle}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#ded7c9] px-2.5 py-1.5 text-xs font-bold text-[#746b5c] hover:bg-[#fffdf8] hover:text-[#5b4c39]"
          >
            关闭
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-sm font-bold text-[#746b5c]">{title}</h3>
      {children}
    </section>
  );
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatProjectOptionLabel(project: UserProject): string {
  if (project.slug && project.slug !== project.name) {
    return `${project.name} · ${project.slug}`;
  }

  return `${project.name} · ${project.id.slice(0, 8)}`;
}

function disambiguateFolderOptions(
  options: { id: string; label: string }[],
): { id: string; label: string }[] {
  const counts = new Map<string, number>();
  for (const option of options) {
    counts.set(option.label, (counts.get(option.label) ?? 0) + 1);
  }

  return options.map((option) => ({
    ...option,
    label:
      (counts.get(option.label) ?? 0) > 1
        ? `${option.label} · ${option.id.slice(0, 8)}`
        : option.label,
  }));
}
