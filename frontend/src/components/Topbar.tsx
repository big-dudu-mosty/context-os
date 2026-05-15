export type AppView = "workbench" | "inbox" | "dream";

interface TopbarProps {
  activeView: AppView;
  inboxCount: number;
  dreamPendingCount: number;
  onWorkbenchClick: () => void;
  onInboxClick: () => void;
  onDreamClick: () => void;
}

export function Topbar({
  activeView,
  inboxCount,
  dreamPendingCount,
  onWorkbenchClick,
  onInboxClick,
  onDreamClick,
}: TopbarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#ded7c9] bg-[#fffaf1]/95 px-5 text-[#5b4c39]">
      <button
        type="button"
        onClick={onWorkbenchClick}
        className="flex min-w-0 items-center gap-3 text-left"
      >
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[#3287a8] text-sm font-bold text-white">
          AI
        </span>
        <span className="truncate text-[15px] font-bold">
          AI 原生上下文协作
        </span>
      </button>

      <div className="flex items-center gap-2.5">
        <TopActionButton
          active={activeView === "inbox"}
          icon="📥"
          label="收件箱"
          count={String(inboxCount)}
          onClick={onInboxClick}
        />
        <TopActionButton
          active={activeView === "dream"}
          icon="🌙"
          label="梦境评审"
          count={String(dreamPendingCount)}
          onClick={onDreamClick}
        />
      </div>
    </header>
  );
}

function TopActionButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  count: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] transition ${
        active
          ? "border-[#5b4c39] bg-[#5b4c39] text-[#fffaf1]"
          : "border-[#ded7c9] bg-[#fffdf8] text-[#5b4c39] hover:border-[#cfc5b3]"
      }`}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
      <span
        className={`ml-1 rounded border px-1.5 py-0.5 text-xs font-bold ${
          active ? "border-[#bfb39f] text-[#fffaf1]" : "border-[#ded7c9]"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
