interface TopbarProps {
  userName: string;
  onInboxClick: () => void;
  onDreamClick: () => void;
}

export function Topbar({ userName, onInboxClick, onDreamClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-[68px] shrink-0 items-center justify-between border-b border-[#ded7c9]/80 bg-[#fffdf8]/85 px-6 backdrop-blur-md">
      <div className="flex min-w-[330px] items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-gradient-to-br from-[#8b5cf6] to-[#ffb86b] text-sm font-bold text-white shadow-[0_8px_25px_rgba(124,77,255,0.24)]">
          AI
        </div>
        <div>
          <div className="text-base font-semibold text-[#20201d]">
            AI Context Workbench
          </div>
          <div className="mt-0.5 text-xs text-[#88847a]">
            Context glue for teams
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onInboxClick}
          className="inline-flex items-center gap-2 rounded-full border border-[#ded7c9] bg-[#fffaf1] px-4 py-2 text-sm font-medium text-[#5d5b55] hover:border-[#cfc5b3] hover:bg-[#fffdf8]"
        >
          <span>Inbox</span>
          <span className="rounded-full bg-[#7c4dff]/10 px-2 py-0.5 text-xs font-semibold text-[#5b35d5]">
            2
          </span>
        </button>
        <button
          type="button"
          onClick={onDreamClick}
          className="inline-flex items-center gap-2 rounded-full border border-[#ded7c9] bg-[#fffaf1] px-4 py-2 text-sm font-medium text-[#5d5b55] hover:border-[#cfc5b3] hover:bg-[#fffdf8]"
        >
          <span>Dream</span>
          <span className="rounded-full bg-[#178c57]/10 px-2 py-0.5 text-xs font-semibold text-[#178c57]">
            on
          </span>
        </button>
        <div className="ml-2 grid h-9 w-9 place-items-center rounded-full bg-[#7c4dff] text-sm font-semibold uppercase text-white shadow-[0_8px_22px_rgba(124,77,255,0.22)]">
          {userName.slice(0, 1)}
        </div>
      </div>
    </header>
  );
}
