import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ArchivedDocument, Message, UserProject } from "../services/api";

interface SessionAreaProps {
  sessionTitle: string;
  sessionMetaLine: string;
  messages: Message[];
  attachedContexts: ArchivedDocument[];
  selectedAgent: string;
  selectedModel: string;
  sending: boolean;
  generatingMessageId: string | null;
  canAttachSelectedContext: boolean;
  onAgentChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onSendMessage: (content: string) => Promise<void>;
  onGenerateArtifact: (messageId: string) => void;
  onRemoveContext: (contextId: string) => void;
  onAttachSelectedContext: () => void;
  /** 轻量提示（如复制、打开新窗口结果） */
  onShowNotice?: (message: string) => void;
  /** 从助手消息发起交接（侧栏） */
  onStartHandoff: (message: Message) => void;
  userProjects?: UserProject[];
  currentProjectId?: string;
  onSessionProjectChange?: (projectId: string) => void;
  projectSwitchDisabled?: boolean;
  readOnly?: boolean;
}

export function SessionArea({
  sessionTitle,
  sessionMetaLine,
  messages,
  attachedContexts,
  selectedAgent,
  selectedModel,
  sending,
  generatingMessageId,
  canAttachSelectedContext,
  onAgentChange,
  onModelChange,
  onSendMessage,
  onGenerateArtifact,
  onRemoveContext,
  onAttachSelectedContext,
  onShowNotice,
  onStartHandoff,
  userProjects = [],
  currentProjectId = "",
  onSessionProjectChange,
  projectSwitchDisabled = false,
  readOnly = false,
}: SessionAreaProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSubmit() {
    const content = input.trim();
    if (!content || sending) {
      return;
    }
    if (readOnly) {
      onShowNotice?.("来源会话是只读引用，请从交接启动自己的新会话后再继续。");
      return;
    }

    await onSendMessage(content);
    setInput("");
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#fffaf1] text-[#5b4c39]">
      <div className="flex h-[74px] shrink-0 items-center gap-3 border-b border-[#ded7c9] px-8">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#fff8ea] text-base font-bold text-[#3287a8]">
          S
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-bold">
            {displaySessionTitle(sessionTitle)}
          </h2>
          <p className="mt-0.5 truncate text-sm font-medium text-[#746b5c]">
            {sessionMetaLine}
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-16 py-8"
      >
        <div className="mx-auto max-w-[1040px] space-y-6">
          {messages.length === 0 ? (
            <EmptySession />
          ) : (
            messages.map((message) => (
              <MessageBlock
                key={message.id}
                message={message}
                generating={generatingMessageId === message.id}
                onGenerateArtifact={() => onGenerateArtifact(message.id)}
                onShowNotice={onShowNotice}
                onStartHandoff={onStartHandoff}
                readOnly={readOnly}
              />
            ))
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[#ded7c9] bg-[#fffaf1] px-5 pb-4 pt-3">
        <div className="mb-2 flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#ded7c9] px-4 pt-3 text-sm">
          <span className="font-bold">上下文</span>
          {attachedContexts.length > 0 ? (
            attachedContexts.map((context) => (
              <button
                key={context.id}
                type="button"
                onClick={() => onRemoveContext(context.id)}
                className="max-w-[360px] truncate border-b border-[#cfc5b3] text-[#2c8aac]"
                title="点击移除引用"
              >
                {context.title}
              </button>
            ))
          ) : (
            <span className="text-[#837a6c]">
              未引用上下文（在右侧选中资料后点击「+」添加）
            </span>
          )}
        </div>

        <div className="rounded-md border border-[#ded7c9] bg-[#fffdf8]">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="直接提问，或用 @ 引用笔记、调用 App 和技能..."
            disabled={sending || readOnly}
            rows={3}
            className="min-h-[74px] w-full resize-none bg-transparent px-5 py-4 text-sm font-medium leading-6 text-[#5b4c39] outline-none placeholder:text-[#837a6c]"
          />

          <div className="flex items-center gap-3 px-3 pb-3">
            <button
              type="button"
              onClick={onAttachSelectedContext}
              disabled={!canAttachSelectedContext}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#ded7c9] bg-[#fffaf1] text-2xl font-light leading-none text-[#5b4c39] hover:border-[#cfc5b3] disabled:cursor-not-allowed disabled:opacity-50"
              title="引用上下文"
            >
              +
            </button>

            {userProjects.length > 0 && onSessionProjectChange ? (
              <label className="flex h-10 min-w-[200px] items-center gap-2.5 rounded-md border border-[#ded7c9] bg-[#fffaf1] px-3 text-sm font-medium">
                <span>项目</span>
                <select
                  value={currentProjectId}
                  disabled={projectSwitchDisabled}
                  onChange={(event) =>
                    onSessionProjectChange(event.target.value)
                  }
                  className="min-w-0 flex-1 bg-transparent font-bold outline-none disabled:opacity-50"
                >
                  {userProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatProjectOptionLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="flex h-10 min-w-[240px] items-center gap-2.5 rounded-md border border-[#ded7c9] bg-[#fffaf1] px-3 text-sm font-medium">
              <span>智能体</span>
              <select
                value={selectedAgent}
                onChange={(event) => onAgentChange(event.target.value)}
                className="min-w-0 flex-1 bg-transparent font-bold outline-none"
              >
                <option value="context-copilot">上下文助手</option>
                <option value="product-agent">产品助手</option>
                <option value="engineering-agent">工程助手</option>
                <option value="research-agent">研究助手</option>
              </select>
            </label>

            <label className="flex h-10 min-w-[216px] items-center gap-2.5 rounded-md border border-[#ded7c9] bg-[#fffaf1] px-3 text-sm font-medium">
              <span>模型</span>
              <select
                value={selectedModel}
                onChange={(event) => onModelChange(event.target.value)}
                className="min-w-0 flex-1 bg-transparent font-bold outline-none"
              >
                <option value="gpt-4">克劳德 Sonnet</option>
                <option value="gpt-4.1">Codex GPT-5</option>
                <option value="deepseek-chat">DeepSeek 对话</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={sending || readOnly || !input.trim()}
              className="ml-auto grid h-10 w-10 place-items-center rounded-md bg-[#3287a8] text-2xl font-bold leading-none text-white hover:bg-[#2b7693] disabled:cursor-not-allowed disabled:opacity-50"
              title="发送"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function EmptySession() {
  return (
    <div className="rounded-md border border-dashed border-[#ded7c9] bg-[#fffdf8]/80 px-6 py-10 text-center text-sm font-medium leading-6 text-[#746b5c]">
      暂无消息。在下方输入内容并发送，即可开始会话。
    </div>
  );
}

function MessageBlock({
  message,
  generating,
  onGenerateArtifact,
  onShowNotice,
  onStartHandoff,
  readOnly,
}: {
  message: Message;
  generating: boolean;
  onGenerateArtifact: () => void;
  onShowNotice?: (message: string) => void;
  onStartHandoff: (message: Message) => void;
  readOnly: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="ml-auto w-fit max-w-[700px] rounded-md border border-[#ded7c9] bg-[#fffdf8] px-5 py-4 text-[15px] font-medium leading-7 shadow-sm">
        {message.content}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AssistantText>{message.content}</AssistantText>
      <div className="flex items-center gap-4 text-base text-[#b2b4b7]">
        <button
          type="button"
          title="重新生成（即将支持）"
          className="hover:text-[#5b4c39]"
          onClick={() =>
            onShowNotice?.("重新生成尚未接入后端，请手动再次发送上一条问题。")
          }
        >
          ⟳
        </button>
        <button
          type="button"
          onClick={onGenerateArtifact}
          disabled={generating || readOnly}
          title="生成产物"
          className="hover:text-[#5b4c39] disabled:opacity-50"
        >
          ✦
        </button>
        <button
          type="button"
          title="发起交接"
          disabled={readOnly}
          className="hover:text-[#5b4c39] disabled:opacity-50"
          onClick={() => onStartHandoff(message)}
        >
          ↗
        </button>
      </div>
    </div>
  );
}

function AssistantText({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[1040px] whitespace-pre-wrap text-[15px] font-medium leading-7 text-[#5b4c39]">
      {children}
    </div>
  );
}

function displaySessionTitle(title: string): string {
  const t = title?.trim();
  if (!t) {
    return "当前会话";
  }
  return t;
}

function formatProjectOptionLabel(project: UserProject): string {
  if (project.slug && project.slug !== project.name) {
    return `${project.name} · ${project.slug}`;
  }

  return `${project.name} · ${project.id.slice(0, 8)}`;
}
