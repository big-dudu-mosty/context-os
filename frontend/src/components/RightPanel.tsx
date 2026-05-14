import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ArchivedDocument, Artifact } from "../services/api";

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
}

interface RightPanelProps {
  mode: RightPanelMode;
  selectedContext: ArchivedDocument | null;
  artifact: Artifact | null;
  attachedContextIds: string[];
  onClose: () => void;
  onAttachContext: (context: ArchivedDocument) => void;
  onSaveArtifact: (input: ArtifactSaveInput) => Promise<void>;
  onArchiveArtifact: (input: ArtifactArchiveInput) => Promise<void>;
}

export function RightPanel({
  mode,
  selectedContext,
  artifact,
  attachedContextIds,
  onClose,
  onAttachContext,
  onSaveArtifact,
  onArchiveArtifact,
}: RightPanelProps) {
  if (mode === "context" && selectedContext) {
    return (
      <ContextDetail
        context={selectedContext}
        isAttached={attachedContextIds.includes(selectedContext.id)}
        onAttach={() => onAttachContext(selectedContext)}
        onClose={onClose}
      />
    );
  }

  if (mode === "artifact" && artifact) {
    return (
      <ArtifactEditor
        artifact={artifact}
        onSave={onSaveArtifact}
        onArchive={onArchiveArtifact}
        onClose={onClose}
      />
    );
  }

  if (mode === "handoff") {
    return (
      <PlaceholderPanel
        title="Handoff Panel"
        eyebrow="Inbox"
        description="后续会在这里生成任务交接、邮件草稿和分发建议。"
        onClose={onClose}
      />
    );
  }

  if (mode === "github") {
    return (
      <PlaceholderPanel
        title="GitHub File Detail"
        eyebrow="GitHub Sync"
        description="连接仓库后，这里会展示文件变化、同步状态和可生成的上下文。"
        onClose={onClose}
      />
    );
  }

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffdf8]">
      <PanelHeader title="Detail Panel" subtitle="Ready for context" />
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <div className="text-sm font-semibold text-[#20201d]">
            选择资料查看详情
          </div>
          <p className="mt-2 text-sm leading-6 text-[#88847a]">
            或从 assistant 回复下方生成 Artifact，在这里编辑并归档。
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
}: {
  context: ArchivedDocument;
  isAttached: boolean;
  onAttach: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffdf8]">
      <PanelHeader
        title={context.title}
        subtitle={new Date(context.created_at).toLocaleString("zh-CN")}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onAttach}
            disabled={isAttached}
            className="rounded-full bg-[#7c4dff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b35d5] disabled:cursor-not-allowed disabled:bg-[#ded7c9] disabled:text-[#88847a]"
          >
            {isAttached ? "已引用" : "引用到会话"}
          </button>
          <span className="rounded-full border border-[#ded7c9] bg-[#fffaf1] px-3 py-1.5 text-xs font-semibold text-[#5d5b55]">
            {context.folder_type === "company"
              ? "Company Context"
              : "Project Context"}
          </span>
        </div>

        {context.summary ? (
          <PanelSection title="Summary">
            <p className="whitespace-pre-wrap text-sm leading-6 text-[#5d5b55]">
              {context.summary}
            </p>
          </PanelSection>
        ) : null}

        {context.tags && context.tags.length > 0 ? (
          <PanelSection title="Tags">
            <div className="flex flex-wrap gap-2">
              {context.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[#f2efe8] px-3 py-1 text-xs font-medium text-[#5d5b55]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </PanelSection>
        ) : null}

        <PanelSection title="Content">
          <div className="whitespace-pre-wrap rounded-2xl border border-[#ded7c9] bg-[#fffaf1] px-4 py-4 text-sm leading-7 text-[#20201d]">
            {context.content}
          </div>
        </PanelSection>
      </div>
    </aside>
  );
}

function ArtifactEditor({
  artifact,
  onSave,
  onArchive,
  onClose,
}: {
  artifact: Artifact;
  onSave: (input: ArtifactSaveInput) => Promise<void>;
  onArchive: (input: ArtifactArchiveInput) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(artifact.title);
  const [content, setContent] = useState(artifact.content);
  const [targetScope, setTargetScope] = useState<"company" | "project">(
    "project",
  );
  const [tags, setTags] = useState("project-context");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(artifact.title);
    setContent(artifact.content);
  }, [artifact.id, artifact.content, artifact.title]);

  const wordCount = useMemo(() => {
    return content.trim() ? content.trim().split(/\s+/).length : 0;
  }, [content]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ title: title.trim() || "Untitled Artifact", content });
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setSaving(true);
    try {
      await onArchive({
        title: title.trim() || "Untitled Artifact",
        content,
        targetScope,
        summary: summary.trim() || undefined,
        tags: splitTags(tags),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffdf8]">
      <PanelHeader
        title="Artifact Editor"
        subtitle={`Draft · ${wordCount} words`}
        onClose={onClose}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <label className="mb-4 block">
          <span className="text-xs font-semibold uppercase tracking-normal text-[#88847a]">
            文件名
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#ded7c9] bg-[#fffaf1] px-4 py-3 text-sm text-[#20201d] outline-none focus:border-[#7c4dff]"
          />
        </label>

        <label className="mb-4 block">
          <span className="text-xs font-semibold uppercase tracking-normal text-[#88847a]">
            归档位置
          </span>
          <select
            value={targetScope}
            onChange={(event) =>
              setTargetScope(event.target.value as "company" | "project")
            }
            className="mt-2 w-full rounded-2xl border border-[#ded7c9] bg-[#fffaf1] px-4 py-3 text-sm text-[#20201d] outline-none focus:border-[#7c4dff]"
          >
            <option value="company">Company Context</option>
            <option value="project">Project Context</option>
          </select>
        </label>

        <label className="mb-4 block">
          <span className="text-xs font-semibold uppercase tracking-normal text-[#88847a]">
            标签
          </span>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="逗号分隔"
            className="mt-2 w-full rounded-2xl border border-[#ded7c9] bg-[#fffaf1] px-4 py-3 text-sm text-[#20201d] outline-none focus:border-[#7c4dff]"
          />
        </label>

        <label className="mb-4 block">
          <span className="text-xs font-semibold uppercase tracking-normal text-[#88847a]">
            摘要
          </span>
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-[#ded7c9] bg-[#fffaf1] px-4 py-3 text-sm leading-6 text-[#20201d] outline-none focus:border-[#7c4dff]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-normal text-[#88847a]">
            内容
          </span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="mt-2 h-[42vh] min-h-80 w-full resize-none rounded-2xl border border-[#ded7c9] bg-[#fffaf1] px-4 py-4 font-mono text-sm leading-7 text-[#20201d] outline-none focus:border-[#7c4dff]"
          />
        </label>
      </div>

      <div className="flex shrink-0 gap-2 border-t border-[#ded7c9] bg-[#fffaf1] px-5 py-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex-1 rounded-full border border-[#ded7c9] bg-[#fffdf8] px-4 py-2 text-sm font-semibold text-[#5d5b55] hover:border-[#cfc5b3] hover:text-[#20201d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => void handleArchive()}
          disabled={saving || !content.trim()}
          className="flex-1 rounded-full bg-[#7c4dff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5b35d5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          归档
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
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-[#ded7c9] bg-[#fffdf8]">
      <PanelHeader title={title} subtitle={eyebrow} onClose={onClose} />
      <div className="flex flex-1 items-center justify-center px-8 text-center text-sm leading-6 text-[#88847a]">
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
    <div className="border-b border-[#ded7c9] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#20201d]">
            {title}
          </h2>
          <p className="mt-1 truncate text-xs text-[#88847a]">{subtitle}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-xs font-semibold text-[#88847a] hover:bg-[#f2efe8] hover:text-[#20201d]"
          >
            Close
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
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-normal text-[#88847a]">
        {title}
      </h3>
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
