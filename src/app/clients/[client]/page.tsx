"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Loader2, User, Bot } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Panel, Eyebrow, EmptyState, Button } from "@/components/ui/kit";

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

const PENDING_STATUSES = new Set(["queued", "approved", "running"]);

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

export default function ClientChatPage({
  params,
}: {
  params: Promise<{ client: string }>;
}) {
  const { client } = use(params);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/clients/${client}/chat`);
      if (r.ok) {
        const d = await r.json();
        setMessages(d.messages ?? []);
      }
    } catch {
      /* ignore — retry on next poll tick */
    }
    setLoaded(true);
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const hasPending = messages.some(
    (m) => m.requestId && m.requestStatus && PENDING_STATUSES.has(m.requestStatus)
  );
  const lastIsUnansweredUser =
    messages.length > 0 && messages[messages.length - 1].role === "user";
  const showTyping = hasPending || lastIsUnansweredUser;

  useEffect(() => {
    if (!showTyping) return;
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [showTyping, load]);

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
        body: JSON.stringify({ message: text }),
      });
      if (r.ok) {
        await load();
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
    <div className="relative z-10 w-full mx-auto pb-16 flex flex-col" style={{ height: "calc(100vh - 2rem)" }}>
      <div className="hq-rise pt-4 pb-6">
        <a
          href="/clients"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Clients
        </a>
        <div className="mt-2.5">
          <Eyebrow>Client workspace</Eyebrow>
          <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.02em] leading-none text-[var(--text)]">
            {clientLabel(client)}
          </h1>
        </div>
      </div>

      <Panel className="flex-1 min-h-0 flex flex-col p-0 overflow-hidden">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
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

        <div className="border-t border-[var(--line)] p-4">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Nhắn tin cho Hermes…"
              rows={1}
              className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-3)] px-3.5 py-2.5 rounded-[10px] border border-[var(--line)] focus:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] outline-none transition-colors resize-none"
            />
            <Button variant="primary" onClick={submit} disabled={sending || !input.trim()}>
              <Send className="w-3.5 h-3.5" />
              Send
            </Button>
          </div>
        </div>
      </Panel>
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
