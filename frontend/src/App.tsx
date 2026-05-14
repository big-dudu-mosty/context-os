import { useState } from "react";
import { ChatArea } from "./components/ChatArea";
import { RightPanel } from "./components/RightPanel";
import { api } from "./services/api";
import type { ArchiveResult, Artifact } from "./services/api";

const TEMP_USER_ID = "test-user-id";
const TEMP_SESSION_ID = "test-session-id";
const TEMP_FOLDER_ID = "test-folder-id";
const TEMP_AGENT_ID = "";

function App() {
  const [userId, setUserId] = useState(TEMP_USER_ID);
  const [sessionId, setSessionId] = useState(TEMP_SESSION_ID);
  const [folderId, setFolderId] = useState(TEMP_FOLDER_ID);
  const [agentId, setAgentId] = useState(TEMP_AGENT_ID);
  const [model, setModel] = useState("gpt-4");
  const [artifactTitle, setArtifactTitle] = useState("对话整理文档");
  const [artifactRequest, setArtifactRequest] = useState(
    "根据当前对话整理一份结构化文档，列出决策、任务、风险和开放问题。",
  );
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [notice, setNotice] = useState("");
  const [generating, setGenerating] = useState(false);
  const [archivedDocuments, setArchivedDocuments] = useState<ArchiveResult[]>(
    [],
  );

  async function handleGenerateArtifact() {
    if (!sessionId.trim() || !userId.trim() || !artifactTitle.trim()) {
      setNotice("需要填写 session_id、user_id 和文档标题");
      return;
    }

    setGenerating(true);
    setNotice("");

    try {
      const generated = await api.generateArtifact(
        sessionId,
        userId,
        artifactTitle,
        artifactRequest,
      );
      setArtifact(generated);
      setNotice("Artifact 已生成");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成 Artifact 失败");
    } finally {
      setGenerating(false);
    }
  }

  function handleArchived(result: ArchiveResult) {
    setArchivedDocuments((current) => [result, ...current]);
    setArtifact(null);
    setNotice(
      `归档成功：${result.extraction.decisionsCreated} decisions, ${result.extraction.tasksCreated} tasks`,
    );
  }

  return (
    <div className="flex h-screen min-w-[1120px] flex-col bg-gray-100 text-gray-900">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5">
        <div className="flex items-center gap-6">
          <h1 className="text-base font-semibold tracking-normal">
            AI Context Workbench
          </h1>
          <nav className="flex items-center gap-1 text-sm text-gray-500">
            <span className="rounded px-2 py-1 text-gray-950">工作台</span>
            <span className="rounded px-2 py-1">收件箱</span>
            <span className="rounded px-2 py-1">梦境</span>
          </nav>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          后端: http://localhost:3000/api
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-4">
            <button
              type="button"
              className="w-full rounded bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              新建会话
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <SectionTitle label="最近会话" />
            <button
              type="button"
              className="mb-4 w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-800"
            >
              当前 Session
              <span className="mt-1 block truncate text-xs text-gray-500">
                {sessionId}
              </span>
            </button>

            <SectionTitle label="运行时 ID" />
            <Field label="User ID" value={userId} onChange={setUserId} />
            <Field
              label="Session ID"
              value={sessionId}
              onChange={setSessionId}
            />
            <Field label="Folder ID" value={folderId} onChange={setFolderId} />
            <Field
              label="Agent ID"
              value={agentId}
              onChange={setAgentId}
              placeholder="可选"
            />

            <SectionTitle label="智能体 / 模型" />
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Model
              </span>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950"
              >
                <option value="gpt-4">gpt-4</option>
                <option value="gpt-4o">gpt-4o</option>
                <option value="claude-4.6">claude-4.6</option>
                <option value="codex">codex</option>
                <option value="deepseek-chat">deepseek-chat</option>
              </select>
            </label>

            <SectionTitle label="文档草稿" />
            <Field
              label="Title"
              value={artifactTitle}
              onChange={setArtifactTitle}
            />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500">
                Request
              </span>
              <textarea
                value={artifactRequest}
                onChange={(event) => setArtifactRequest(event.target.value)}
                className="h-28 w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-950"
              />
            </label>

            <SectionTitle label="归档文件" />
            <div className="space-y-2">
              {archivedDocuments.length === 0 ? (
                <div className="rounded border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500">
                  暂无本次页面归档记录
                </div>
              ) : (
                archivedDocuments.map((item) => (
                  <div
                    key={item.archivedDocument.id}
                    className="rounded border border-gray-200 px-3 py-2"
                  >
                    <div className="truncate text-sm font-medium text-gray-800">
                      {item.archivedDocument.title}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      D{item.extraction.decisionsCreated} / T
                      {item.extraction.tasksCreated} / R
                      {item.extraction.risksCreated}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <ChatArea
          sessionId={sessionId}
          agentId={agentId}
          model={model}
          artifactTitle={artifactTitle}
          artifactRequest={artifactRequest}
          onGenerateArtifact={() => void handleGenerateArtifact()}
          onError={setNotice}
        />

        <RightPanel
          artifact={artifact}
          userId={userId}
          folderId={folderId}
          onArtifactUpdated={(updated) => {
            setArtifact(updated);
            setNotice("Artifact 已保存");
          }}
          onArchived={handleArchived}
          onError={setNotice}
        />
      </div>

      {notice ? (
        <div className="fixed bottom-4 left-1/2 max-w-xl -translate-x-1/2 rounded border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-lg">
          {notice}
        </div>
      ) : null}

      {generating ? (
        <div className="fixed inset-0 flex items-center justify-center bg-white/60">
          <div className="rounded border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-lg">
            正在生成 Artifact...
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-normal text-gray-500 first:mt-0">
      {label}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-gray-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-950"
      />
    </label>
  );
}

export default App;
