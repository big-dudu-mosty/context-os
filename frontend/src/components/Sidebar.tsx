import { useState, type ReactNode } from "react";
import type { ArchivedDocument, InitResult } from "../services/api";

export interface WorkbenchSession {
  id: string;
  title: string;
  session: InitResult["session"];
}

/** 项目下子资料夹及其归档条目（不含项目根；根目录条目单独平铺） */
export interface ProjectContextGroup {
  folderId: string;
  folderLabel: string;
  documents: ArchivedDocument[];
}

interface SidebarProps {
  sessions: WorkbenchSession[];
  companyContexts: ArchivedDocument[];
  companyGroupTitle: string;
  projectName: string;
  /** 项目根资料夹内的归档（展示在标题下，不再单独占「根 ·」折叠块） */
  projectRootDocuments: ArchivedDocument[];
  projectContextGroups: ProjectContextGroup[];
  githubStatusLabel: string;
  currentSessionId: string;
  selectedContextId?: string;
  onNewSession: () => void;
  onSelectSession: (session: WorkbenchSession) => void;
  onSelectContext: (context: ArchivedDocument) => void;
  onManageProjectMembers: () => void;
  onCreateProjectSubfolder: () => void;
  onGitHubSync: () => void;
  onAccountClick: () => void;
  userName: string;
  loading?: boolean;
}

export function Sidebar({
  sessions,
  companyContexts,
  companyGroupTitle,
  projectName,
  projectRootDocuments,
  projectContextGroups,
  githubStatusLabel,
  currentSessionId,
  selectedContextId,
  onNewSession,
  onSelectSession,
  onSelectContext,
  onManageProjectMembers,
  onCreateProjectSubfolder,
  onGitHubSync,
  onAccountClick,
  userName,
  loading,
}: SidebarProps) {
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-r border-[#ded7c9] bg-[#fffaf1] text-[#5b4c39]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#ded7c9] px-4">
        <div className="text-[15px] font-bold">协作专业版</div>
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-md text-sm font-bold text-[#706654] hover:bg-[#f2efe8]"
          aria-label="收起侧栏"
        >
          ≡
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <button
          type="button"
          onClick={onNewSession}
          disabled={loading}
          className="mb-5 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-bold text-[#6c5f4b] hover:bg-[#f7f0e3] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-lg leading-none">+</span>
          <span>新建会话</span>
        </button>

        <SidebarSection title="最近会话">
          <div className="space-y-2">
            {sessions.length === 0 ? (
              <EmptyLine>暂无会话</EmptyLine>
            ) : null}
            {sessions.slice(0, 8).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
                  session.id === currentSessionId
                    ? "bg-[#f8f1e3] text-[#5b4c39]"
                    : "text-[#5b4c39] hover:bg-[#f8f1e3]"
                }`}
              >
                <span className="block truncate">
                  {decorateSessionTitle(session.title)}
                </span>
              </button>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="公司上下文">
          <ContextGroup title={companyGroupTitle}>
            <ContextRows
              contexts={companyContexts}
              selectedContextId={selectedContextId}
              emptyLabel="暂无公司上下文"
              onSelectContext={onSelectContext}
            />
          </ContextGroup>
        </SidebarSection>

        <SidebarSection title="项目上下文">
          <ProjectContextSection
            projectName={projectName}
            rootDocuments={projectRootDocuments}
            groups={projectContextGroups}
            selectedContextId={selectedContextId}
            onSelectContext={onSelectContext}
            onManageProjectMembers={onManageProjectMembers}
            onCreateProjectSubfolder={onCreateProjectSubfolder}
          />
        </SidebarSection>

        <SidebarSection title="GitHub 同步">
          <button
            type="button"
            onClick={onGitHubSync}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-[#5b4c39] hover:bg-[#f8f1e3]"
          >
            {githubStatusLabel}
          </button>
        </SidebarSection>
      </div>

      <button
        type="button"
        onClick={onAccountClick}
        className="flex h-14 shrink-0 items-center gap-3 border-t border-[#ded7c9] px-5 text-left hover:bg-[#f8f1e3]"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[#fff8ea] text-sm font-bold text-[#3287a8]">
          {userName.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-bold">
          {displayName(userName)}
        </span>
        <span className="text-sm font-bold">...</span>
      </button>
    </aside>
  );
}

function ProjectContextSection({
  projectName,
  rootDocuments,
  groups,
  selectedContextId,
  onSelectContext,
  onManageProjectMembers,
  onCreateProjectSubfolder,
}: {
  projectName: string;
  rootDocuments: ArchivedDocument[];
  groups: ProjectContextGroup[];
  selectedContextId?: string;
  onSelectContext: (context: ArchivedDocument) => void;
  onManageProjectMembers: () => void;
  onCreateProjectSubfolder: () => void;
}) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  function isOpen(folderId: string): boolean {
    return openMap[folderId] !== false;
  }

  function toggle(folderId: string) {
    setOpenMap((prev) => {
      const expanded = prev[folderId] !== false;
      return { ...prev, [folderId]: !expanded };
    });
  }

  if (!projectName.trim()) {
    return (
      <div className="px-3">
        <EmptyLine>未加载项目资料库</EmptyLine>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-2">
      <div className="flex items-center justify-between gap-2 rounded-md border border-[#eee8dc] bg-[#fffdf8] px-2 py-2">
        <span className="min-w-0 truncate text-sm font-bold text-[#5b4c39]">
          {projectName}
        </span>
        <button
          type="button"
          onClick={onManageProjectMembers}
          className="shrink-0 rounded-md border border-[#ded7c9] bg-[#fffaf1] px-2 py-1 text-xs font-bold text-[#5b4c39] hover:bg-[#f8f1e3]"
        >
          成员
        </button>
      </div>
      <button
        type="button"
        onClick={onCreateProjectSubfolder}
        className="w-full rounded-md border border-dashed border-[#cfc5b3] px-3 py-2 text-left text-xs font-bold text-[#746b5c] hover:bg-[#f8f1e3]"
      >
        + 新建项目资料夹
      </button>

      {rootDocuments.length > 0 ? (
        <div className="space-y-1 pl-1">
          <ContextRows
            contexts={rootDocuments}
            selectedContextId={selectedContextId}
            emptyLabel="暂无条目"
            onSelectContext={onSelectContext}
          />
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group.folderId} className="rounded-md border border-[#eee8dc] bg-[#fffdf8]/60">
          <button
            type="button"
            onClick={() => toggle(group.folderId)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-[#776d5c]"
          >
            <span className="min-w-0 truncate">{group.folderLabel}</span>
            <span className="shrink-0 text-[#b0a896]">
              {isOpen(group.folderId) ? "▼" : "▶"}
            </span>
          </button>
          {isOpen(group.folderId) ? (
            <div className="border-t border-[#eee8dc] px-1 pb-2 pt-1">
              <ContextRows
                contexts={group.documents}
                selectedContextId={selectedContextId}
                emptyLabel="暂无条目"
                onSelectContext={onSelectContext}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 px-3 text-xs font-bold text-[#776d5c]">{title}</h3>
      {children}
    </section>
  );
}

function ContextGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 px-5 text-sm font-bold text-[#5b4c39]">{title}</div>
      <div className="space-y-1 pl-3">{children}</div>
    </div>
  );
}

function ContextRows({
  contexts,
  selectedContextId,
  emptyLabel,
  onSelectContext,
}: {
  contexts: ArchivedDocument[];
  selectedContextId?: string;
  emptyLabel: string;
  onSelectContext: (context: ArchivedDocument) => void;
}) {
  if (contexts.length > 0) {
    return (
      <>
        {contexts.map((context) => (
          <button
            key={context.id}
            type="button"
            onClick={() => onSelectContext(context)}
            className={`w-full rounded-md px-3 py-2 text-left text-sm font-semibold transition ${
              selectedContextId === context.id
                ? "bg-[#f8f1e3] text-[#5b4c39]"
                : "text-[#5b4c39] hover:bg-[#f8f1e3]"
            }`}
          >
            <span className="block truncate">{context.title}</span>
          </button>
        ))}
      </>
    );
  }

  return <EmptyLine>{emptyLabel}</EmptyLine>;
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md px-3 py-2 text-sm font-semibold text-[#8a806f]">
      <span className="block truncate">{children}</span>
    </div>
  );
}

function decorateSessionTitle(title: string): string {
  if (!title || title === "当前会话" || title === "新建会话") {
    return "未命名会话";
  }

  return title;
}

function displayName(name: string): string {
  if (!name) {
    return "账号";
  }

  return name.slice(0, 1).toUpperCase() + name.slice(1);
}
