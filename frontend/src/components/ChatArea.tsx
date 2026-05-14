import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { Message } from "../services/api";

interface ChatAreaProps {
  sessionId: string;
  agentId: string;
  model: string;
  artifactTitle: string;
  artifactRequest: string;
  onGenerateArtifact: () => void;
  onError: (message: string) => void;
}

export function ChatArea({
  sessionId,
  agentId,
  model,
  artifactTitle,
  artifactRequest,
  onGenerateArtifact,
  onError,
}: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    if (!sessionId.trim() || !isUuid(sessionId)) {
      setMessages([]);
      return;
    }

    try {
      const loaded = await api.getMessages(sessionId);
      setMessages(loaded);
    } catch (error) {
      setMessages([]);
      onError(error instanceof Error ? error.message : "加载消息失败");
    }
  }, [onError, sessionId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSend() {
    const content = input.trim();
    if (!content || loading) {
      return;
    }

    if (!isUuid(sessionId)) {
      onError("请先在左侧填写真实的 session_id");
      return;
    }

    setLoading(true);
    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        session_id: sessionId,
        role: "user",
        content,
        model: null,
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      await api.chat(sessionId, content, model, agentId || undefined);
      setInput("");
      await loadMessages();
    } catch (error) {
      onError(error instanceof Error ? error.message : "发送失败");
      await loadMessages();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-white">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-950">Session</h2>
          <p className="mt-0.5 max-w-[44rem] truncate text-xs text-gray-500">
            {sessionId || "未设置 session_id"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
            {model}
          </span>
          <button
            type="button"
            onClick={onGenerateArtifact}
            disabled={loading || !artifactTitle.trim()}
            className="rounded bg-gray-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            生成文档
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-5"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="text-sm font-medium text-gray-700">
                当前没有消息
              </div>
              <p className="mt-2 text-sm text-gray-500">
                输入一条消息开始对话，随后可以把上下文整理成 Artifact 草稿。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
          <span>Artifact: {artifactTitle || "未命名"}</span>
          <span className="truncate pl-4">{artifactRequest}</span>
        </div>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="输入消息..."
            className="min-h-11 flex-1 resize-none rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-950"
            disabled={loading}
            rows={2}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="w-20 rounded bg-gray-950 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "发送中" : "发送"}
          </button>
        </div>
      </div>
    </main>
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[72%] rounded-lg border px-3 py-2 text-sm leading-6 ${
          isUser
            ? "border-gray-950 bg-gray-950 text-white"
            : "border-gray-200 bg-gray-50 text-gray-800"
        }`}
      >
        <div
          className={`mb-1 text-[11px] uppercase ${
            isUser ? "text-gray-300" : "text-gray-500"
          }`}
        >
          {message.role}
        </div>
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
      </div>
    </div>
  );
}
