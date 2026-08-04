"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, User, Bot } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmptyState } from "@/components/ui/kit";

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 last:mb-0 pl-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 last:mb-0 pl-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code
      className="rounded px-1 py-0.5 text-[12px] num"
      style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre
      className="mb-2 last:mb-0 rounded-[8px] p-2.5 text-[12px] overflow-x-auto"
      style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}
    >
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="mb-2 last:mb-0 pl-3 italic text-[var(--text-2)]"
      style={{ borderLeft: "2px solid var(--line)" }}
    >
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-2 last:mb-0 overflow-x-auto">
      <table className="text-[12.5px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold" style={{ borderBottom: "1px solid var(--line)" }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1" style={{ borderBottom: "1px solid var(--line)" }}>
      {children}
    </td>
  ),
  h1: ({ children }) => <h1 className="mb-1.5 text-[15px] font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1.5 text-[14.5px] font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 text-[14px] font-semibold">{children}</h3>,
};

type ChatRole = "user" | "assistant";

interface ChatMsg {
  id: string;
  role: ChatRole;
  content: string;
  requestId: string | null;
  requestStatus: string | null;
  createdAt: string;
}

const CLIENTS = ["klaily", "move-fitness", "safe-english"];
const PENDING_STATUSES = new Set(["queued", "approved", "running", "awaiting_approval"]);

function timeLabel(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function clientLabel(client: string): string {
  return client
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function ClientChat() {
  const [client, setClient] = useState<string>(CLIENTS[0]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (forClient: string) => {
    try {
      const r = await fetch(`/api/clients/${forClient}/chat`);
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages ?? []);
      }
    } catch {
      /* ignore — retry on next poll tick */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    setLoaded(false);
    setMessages([]);
    load(client);
  }, [client, load]);

  const hasPending = messages.some(
    (m) => m.requestId && m.requestStatus && PENDING_STATUSES.has(m.requestStatus)
  );
  const lastIsUnansweredUser =
    messages.length > 0 && messages[messages.length - 1].role === "user";
  const showTyping = hasPending || lastIsUnansweredUser;

  useEffect(() => {
    if (!showTyping) return;
    const iv = setInterval(() => load(client), 3000);
    return () => clearInterval(iv);
  }, [showTyping, load, client]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showTyping]);

  const submit = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    try {
      const r = await fetch(`/api/clients/${client}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sideEffecting: needsApproval }),
      });
      if (r.ok) {
        await load(client);
      } else {
        setInput(text);
      }
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "560px" }}>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-3 border-b border-[var(--line)]">
        {CLIENTS.map((c) => (
          <button
            key={c}
            onClick={() => setClient(c)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              client === c
                ? "text-[var(--bg)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            }`}
            style={client === c ? { background: "var(--accent)" } : { background: "var(--surface-2)" }}
          >
            {clientLabel(c)}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {!loaded ? (
          <div className="flex items-center justify-center h-full text-[var(--text-3)] text-[13px]">
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<Bot className="w-6 h-6" />}
            title="Chưa có tin nhắn — gửi tin nhắn đầu tiên để bắt đầu"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {showTyping && <TypingBubble />}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] p-3">
        <div className="flex items-end gap-2.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Nhắn tin cho Hermes…"
            className="flex-1 min-w-0 bg-transparent text-[13.5px] text-[var(--text)] placeholder:text-[var(--text-3)] px-3 py-2 rounded-[10px] border border-[var(--line)] focus:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] outline-none transition-colors"
          />
          <button
            type="button"
            onClick={() => setNeedsApproval((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[10px] text-[11.5px] font-medium border transition-colors shrink-0"
            style={
              needsApproval
                ? { color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" }
                : { color: "var(--text-3)", borderColor: "var(--line)" }
            }
            title="Khi bật, tin nhắn sẽ tạo một hành động cần duyệt trước khi chạy"
          >
            <span
              className="w-3 h-3 rounded-[3px] border flex items-center justify-center shrink-0"
              style={{
                borderColor: needsApproval ? "var(--accent)" : "var(--text-3)",
                background: needsApproval ? "var(--accent)" : "transparent",
              }}
            />
            Hành động cần duyệt
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={sending || !input.trim()}
            className={`inline-flex items-center justify-center gap-1.5 font-medium px-4 py-2 text-[13px] btn-primary shrink-0 ${
              sending || !input.trim() ? "opacity-40 pointer-events-none" : ""
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMsg }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: "var(--surface-2)",
          color: "var(--text-3)",
        }}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
            isUser ? "text-[var(--bg)]" : "text-[var(--text)]"
          }`}
          style={
            isUser
              ? { background: "var(--text)" }
              : { background: "var(--surface-2)", border: "1px solid var(--line)" }
          }
        >
          {isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <span className="num text-[10.5px] text-[var(--text-3)] px-1">
          {timeLabel(message.createdAt)}
        </span>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
      >
        <Bot className="w-3.5 h-3.5" />
      </div>
      <div
        className="rounded-[14px] px-3.5 py-2.5 flex items-center gap-2"
        style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--text-3)]" />
        <span className="text-[12.5px] text-[var(--text-3)]">Hermes is typing…</span>
      </div>
    </div>
  );
}
