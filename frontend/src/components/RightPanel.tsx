import { useMemo, useState } from "react";
import { api } from "../services/api";
import type { ArchiveResult, Artifact } from "../services/api";

interface RightPanelProps {
  artifact: Artifact | null;
  userId: string;
  folderId: string;
  onArtifactUpdated: (artifact: Artifact) => void;
  onArchived: (result: ArchiveResult) => void;
  onError: (message: string) => void;
}

export function RightPanel(props: RightPanelProps) {
  if (!props.artifact) {
    return (
      <aside className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-gray-50">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-950">
            Artifact Editor
          </h2>
          <p className="mt-1 text-xs text-gray-500">等待生成草稿</p>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-500">
          生成 Artifact 后，可在这里编辑、保存并归档到右侧资料库。
        </div>
      </aside>
    );
  }

  return <ArtifactEditor key={props.artifact.id} {...props} artifact={props.artifact} />;
}

function ArtifactEditor({
  artifact,
  userId,
  folderId,
  onArtifactUpdated,
  onArchived,
  onError,
}: RightPanelProps & { artifact: Artifact }) {
  const [content, setContent] = useState(artifact.content);
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("project-context");
  const [saving, setSaving] = useState(false);

  const wordCount = useMemo(() => {
    return content.trim() ? content.trim().split(/\s+/).length : 0;
  }, [content]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.updateArtifact(artifact.id, content);
      onArtifactUpdated(updated);
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (saving) {
      return;
    }

    if (!window.confirm("确认归档当前 Artifact？")) {
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateArtifact(artifact.id, content);
      const result = await api.archiveArtifact(
        updated.id,
        folderId,
        userId,
        summary || undefined,
        splitTags(tags),
      );
      onArchived(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : "归档失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-950">
              {artifact.title}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {artifact.status} · {wordCount} words
            </p>
          </div>
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
            Draft
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <label className="block text-xs font-medium text-gray-600">
          Summary
        </label>
        <input
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="归档摘要，可选"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-950"
        />

        <label className="mt-4 block text-xs font-medium text-gray-600">
          Tags
        </label>
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="逗号分隔"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-950"
        />

        <label className="mt-4 block text-xs font-medium text-gray-600">
          Content
        </label>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          className="mt-1 h-[calc(100vh-22rem)] min-h-72 w-full resize-none rounded border border-gray-300 px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-gray-950"
          placeholder="编辑文档内容..."
        />
      </div>

      <div className="flex shrink-0 gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => void handleArchive()}
          disabled={saving || !folderId.trim() || !userId.trim()}
          className="flex-1 rounded bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          归档
        </button>
      </div>
    </aside>
  );
}

function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
