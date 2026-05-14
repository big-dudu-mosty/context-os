import { useEffect, useRef, useState } from "react";
import type { ArchivedDocument, Message } from "../services/api";

interface SessionAreaProps {
  sessionTitle: string;
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
}

export function SessionArea({
  sessionTitle,
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

    await onSendMessage(content);
    setInput("");
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-[#fffdf8]">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-[#ded7c9] px-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-[#20201d]">
            {sessionTitle}
          </h2>
          <p className="mt-0.5 text-xs text-[#88847a]">
            Conversation workspace
          </p>
        </div>

        <label className="sr-only" htmlFor="agent-select">
          Agent
        </label>
        <select
          id="agent-select"
          value={selectedAgent}
          onChange={(event) => onAgentChange(event.target.value)}
          className="rounded-full border border-[#ded7c9] bg-[#fffaf1] px-3 py-2 text-sm font-medium text-[#20201d] outline-none hover:border-[#cfc5b3]"
        >
          <option value="context-copilot">Context Copilot</option>
          <option value="product-agent">Product Agent</option>
          <option value="engineering-agent">Engineering Agent</option>
          <option value="research-agent">Research Agent</option>
        </select>

        <label className="sr-only" htmlFor="model-select">
          Model
        </label>
        <select
          id="model-select"
          value={selectedModel}
          onChange={(event) => onModelChange(event.target.value)}
          className="rounded-full border border-[#ded7c9] bg-[#fffaf1] px-3 py-2 text-sm font-medium text-[#20201d] outline-none hover:border-[#cfc5b3]"
        >
          <option value="gpt-4">GPT-4</option>
          <option value="claude-sonnet-4">Claude Sonnet 4</option>
          <option value="deepseek-chat">DeepSeek Chat</option>
        </select>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md rounded-[22px] border border-[#ded7c9] bg-[#fffaf1] px-8 py-7 text-center shadow-[0_20px_50px_rgba(48,39,22,0.08)]">
              <div className="text-base font-semibold text-[#20201d]">
                Start a focused session
              </div>
              <p className="mt-3 text-sm leading-6 text-[#5d5b55]">
                Ask the assistant to reason through a topic. When an answer is
                useful, generate an Artifact from that assistant message.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-5">
            {messages.map((message) => (
              <div key={message.id}>
                <MessageBubble message={message} />
                {message.role === "assistant" ? (
                  <div className="mt-2 flex justify-start pl-12">
                    <button
                      type="button"
                      onClick={() => onGenerateArtifact(message.id)}
                      disabled={generatingMessageId === message.id}
                      className="rounded-full border border-[#ded7c9] bg-[#fffaf1] px-3 py-1.5 text-xs font-semibold text-[#5b35d5] hover:border-[#cfc5b3] hover:bg-[#fffdf8] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generatingMessageId === message.id
                        ? "Generating"
                        : "Generate Artifact"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {attachedContexts.length > 0 ? (
        <div className="border-t border-[#ded7c9] bg-[#f2efe8]/70 px-5 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-[#88847a]">
            Attached Context
          </div>
          <div className="flex flex-wrap gap-2">
            {attachedContexts.map((context) => (
              <span
                key={context.id}
                className="inline-flex max-w-xs items-center gap-2 rounded-full border border-[#ded7c9] bg-[#fffdf8] px-3 py-1.5 text-sm text-[#5d5b55]"
              >
                <span className="truncate">{context.title}</span>
                <button
                  type="button"
                  onClick={() => onRemoveContext(context.id)}
                  className="text-[#88847a] hover:text-[#20201d]"
                  aria-label={`Remove ${context.title}`}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-[#ded7c9] bg-[#fffaf1] px-5 py-4">
        <div className="mx-auto max-w-4xl rounded-[22px] border border-[#ded7c9] bg-[#fffdf8] p-3 shadow-[0_12px_28px_rgba(48,39,22,0.08)]">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Message the workbench..."
            disabled={sending}
            rows={3}
            className="min-h-24 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 text-[#20201d] outline-none placeholder:text-[#88847a]"
          />
          <div className="flex items-center justify-between border-t border-[#ded7c9] px-2 pt-3">
            <button
              type="button"
              onClick={onAttachSelectedContext}
              disabled={!canAttachSelectedContext}
              className="rounded-full px-3 py-2 text-sm font-medium text-[#5d5b55] hover:bg-[#f2efe8] disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Attach Context
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={sending || !input.trim()}
              className="rounded-full bg-[#7c4dff] px-5 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,77,255,0.22)] hover:bg-[#5b35d5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#7c4dff] to-[#ffb86b] text-xs font-bold text-white">
          AI
        </div>
      ) : null}
      <div
        className={`max-w-[78%] rounded-[20px] border px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "border-[#20201d] bg-[#20201d] text-white"
            : "border-[#ded7c9] bg-[#fffaf1] text-[#20201d]"
        }`}
      >
        <div
          className={`mb-1 text-xs font-semibold ${
            isUser ? "text-white/70" : "text-[#88847a]"
          }`}
        >
          {isUser ? "You" : "Assistant"}
        </div>
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
      {isUser ? (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-[#f2efe8] text-xs font-bold text-[#5d5b55]">
          You
        </div>
      ) : null}
    </div>
  );
}
