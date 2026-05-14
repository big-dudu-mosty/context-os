import { useEffect, useState } from "react";
import { ChatArea } from "./components/ChatArea";
import { RightPanel } from "./components/RightPanel";
import { api } from "./services/api";
import type { ArchiveResult, Artifact, InitResult } from "./services/api";

const STORAGE_KEY = "context-os-context";

const DEMO_USERS = [
  {
    name: "alex",
    label: "Alex",
    role: "产品负责人",
    note: "适合梳理需求、决策和项目简报",
  },
  {
    name: "bella",
    label: "Bella",
    role: "工程负责人",
    note: "适合沉淀技术方案、任务和风险",
  },
  {
    name: "chen",
    label: "Chen",
    role: "运营负责人",
    note: "适合整理会议纪要、交付说明和跟进事项",
  },
];

function App() {
  const [initialized, setInitialized] = useState(false);
  const [context, setContext] = useState<InitResult | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [notice, setNotice] = useState("");
  const [loadingUser, setLoadingUser] = useState("");
  const [archivedDocuments, setArchivedDocuments] = useState<ArchiveResult[]>(
    [],
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
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  async function handleInitialize(userName: string) {
    setLoadingUser(userName);
    setNotice("");

    try {
      const result = await api.initialize(userName);
      setContext(result);
      setInitialized(true);
      setArtifact(null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      setNotice(`${result.user.name} 已准备好`);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setNotice("新会话已创建");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建会话失败");
    } finally {
      setLoadingUser("");
    }
  }

  function handleReset() {
    if (!window.confirm("确认重置本地状态？后端已创建的数据不会删除。")) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    setContext(null);
    setInitialized(false);
    setArtifact(null);
    setArchivedDocuments([]);
    setNotice("");
  }

  function handleArchived(result: ArchiveResult) {
    setArchivedDocuments((current) => [result, ...current]);
    setArtifact(null);
    setNotice("归档成功");
  }

  if (!initialized || !context) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100 px-6">
        <div className="w-full max-w-4xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold text-gray-950">
              AI Context Workbench
            </h1>
            <p className="mt-3 text-sm text-gray-600">
              选择一个预置账号开始使用，系统会自动准备用户、智能体、项目、文件夹和会话。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {DEMO_USERS.map((user) => (
              <button
                key={user.name}
                type="button"
                onClick={() => void handleInitialize(user.name)}
                disabled={Boolean(loadingUser)}
                className="rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-950 text-sm font-semibold text-white">
                  {user.label.slice(0, 1)}
                </div>
                <div className="mt-4 text-lg font-semibold text-gray-950">
                  {user.label}
                </div>
                <div className="mt-1 text-sm text-gray-500">{user.role}</div>
                <p className="mt-4 min-h-10 text-sm leading-5 text-gray-600">
                  {user.note}
                </p>
                <div className="mt-5 text-sm font-medium text-gray-950">
                  {loadingUser === user.name ? "准备中..." : "进入工作台"}
                </div>
              </button>
            ))}
          </div>

          {notice ? (
            <div className="mt-5 rounded border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
              {notice}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-[1040px] flex-col bg-gray-100 text-gray-900">
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
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600">{context.user.name}</span>
          <button
            type="button"
            onClick={handleReset}
            className="text-gray-500 hover:text-gray-950"
          >
            重置
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-4">
            <button
              type="button"
              onClick={() => void handleNewSession()}
              disabled={Boolean(loadingUser)}
              className="w-full rounded bg-gray-950 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              新建会话
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <SectionTitle label="账号" />
            <InfoRow label="用户" value={context.user.name} />
            <InfoRow label="智能体" value={context.agent.name} />

            <SectionTitle label="工作空间" />
            <InfoRow label="项目" value={context.project.name} />
            <InfoRow label="文件夹" value={context.folder.name} />
            <InfoRow label="当前会话" value={shortId(context.session.id)} />

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
                      决策 {item.extraction.decisionsCreated} / 任务{" "}
                      {item.extraction.tasksCreated}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <ChatArea
          sessionId={context.session.id}
          userId={context.user.id}
          agentId={context.agent.id}
          onArtifactGenerated={(generated) => {
            setArtifact(generated);
            setNotice("Artifact 已生成");
          }}
          onError={setNotice}
        />

        <RightPanel
          artifact={artifact}
          userId={context.user.id}
          folderId={context.folder.id}
          onArtifactUpdated={(updated) => {
            setArtifact(updated);
            setNotice("Artifact 已保存");
          }}
          onArchived={handleArchived}
          onError={setNotice}
        />
      </div>

      {notice ? (
        <div className="fixed bottom-4 right-4 max-w-xl rounded bg-gray-950 px-4 py-2 text-sm text-white shadow-lg">
          {notice}
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 rounded border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-gray-800">
        {value}
      </div>
    </div>
  );
}

function shortId(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}

export default App;
