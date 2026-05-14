import type { ReactNode } from "react";
import type { ArchivedDocument, InitResult } from "../services/api";

export interface WorkbenchSession {
  id: string;
  title: string;
  session: InitResult["session"];
}

interface SidebarProps {
  sessions: WorkbenchSession[];
  companyContexts: ArchivedDocument[];
  projectContexts: ArchivedDocument[];
  currentSessionId: string;
  selectedContextId?: string;
  onNewSession: () => void;
  onSelectSession: (session: WorkbenchSession) => void;
  onSelectContext: (context: ArchivedDocument) => void;
  onGitHubSync: () => void;
  onAccountClick: () => void;
  userName: string;
  loading?: boolean;
}

export function Sidebar({
  sessions,
  companyContexts,
  projectContexts,
  currentSessionId,
  selectedContextId,
  onNewSession,
  onSelectSession,
  onSelectContext,
  onGitHubSync,
  onAccountClick,
  userName,
  loading,
}: SidebarProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-[#ded7c9] bg-[#fffdf8]">
      <div className="flex h-14 items-center justify-between border-b border-[#ded7c9] px-4">
        <div className="font-semibold text-[#20201d]">Collab Pro</div>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-sm text-[#88847a] hover:bg-[#f2efe8] hover:text-[#20201d]"
          aria-label="Collapse sidebar"
        >
          Menu
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <button
          type="button"
          onClick={onNewSession}
          disabled={loading}
          className="mb-4 flex w-full items-center gap-2 rounded-2xl border border-[#ded7c9] bg-[#20201d] px-4 py-3 text-left text-sm font-semibold text-white shadow-[0_10px_24px_rgba(48,39,22,0.12)] hover:bg-[#35342f] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-base leading-none">+</span>
          <span>New session</span>
        </button>

        <SidebarSection title="Recent Sessions">
          {sessions.length === 0 ? (
            <EmptyLine label="No sessions yet" />
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                  session.id === currentSessionId
                    ? "bg-[#f2efe8] font-semibold text-[#20201d]"
                    : "text-[#5d5b55] hover:bg-[#f6f4ef] hover:text-[#20201d]"
                }`}
              >
                <div className="truncate">{session.title}</div>
              </button>
            ))
          )}
        </SidebarSection>

        <SidebarSection title="Company Context">
          <ContextList
            contexts={companyContexts}
            selectedContextId={selectedContextId}
            emptyLabel="No company context"
            onSelectContext={onSelectContext}
          />
        </SidebarSection>

        <SidebarSection title="Project Context">
          <ContextList
            contexts={projectContexts}
            selectedContextId={selectedContextId}
            emptyLabel="No project context"
            onSelectContext={onSelectContext}
          />
        </SidebarSection>

        <SidebarSection title="GitHub Sync">
          <button
            type="button"
            onClick={onGitHubSync}
            className="w-full rounded-xl border border-dashed border-[#ded7c9] bg-[#fffaf1] px-3 py-3 text-left text-sm text-[#88847a] hover:border-[#cfc5b3] hover:text-[#20201d]"
          >
            Not connected
          </button>
        </SidebarSection>
      </div>

      <div className="border-t border-[#ded7c9] p-3">
        <button
          type="button"
          onClick={onAccountClick}
          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 hover:bg-[#f2efe8]"
        >
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[#7c4dff] text-sm font-semibold uppercase text-white">
            {userName.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold text-[#20201d]">
              {userName}
            </div>
            <div className="text-xs text-[#88847a]">Workspace account</div>
          </div>
          <span className="text-[#88847a]">...</span>
        </button>
      </div>
    </aside>
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
      <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-normal text-[#88847a]">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function ContextList({
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
  if (contexts.length === 0) {
    return <EmptyLine label={emptyLabel} />;
  }

  return (
    <>
      {contexts.map((context) => (
        <button
          key={context.id}
          type="button"
          onClick={() => onSelectContext(context)}
          className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
            selectedContextId === context.id
              ? "bg-[#f2efe8] font-semibold text-[#20201d]"
              : "text-[#5d5b55] hover:bg-[#f6f4ef] hover:text-[#20201d]"
          }`}
        >
          <div className="truncate">{context.title}</div>
        </button>
      ))}
    </>
  );
}

function EmptyLine({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#ded7c9] px-3 py-2 text-sm text-[#88847a]">
      {label}
    </div>
  );
}
