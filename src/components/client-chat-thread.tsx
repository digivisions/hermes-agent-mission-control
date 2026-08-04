"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, User, Bot, Clock, CircleAlert } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmptyState, Button } from "@/components/ui/kit";

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

export interface ChatMsg {
  id: string;
  role: ChatRole;
  content: string;
  requestId: string | null;
  requestStatus: string | null;
  requestStartedAt: string | null;
  requestError: string | null;
  createdAt: string;
}

// A request in any of these states means work is still in flight: the thread
// keeps polling and the typing indicator stays up.
const PENDING = new Set(["queued", "approved", "running", "awaiting_approval"]);

// NB: var(--hq-accent) does NOT exist in globals.css. Use var(--accent).
const CHIP: Record<string, { label: string; tone: string }> = {
  queued:            { label: "Queued",         tone: "var(--text-3)" },
  awaiting_approval: { label: "Needs approval", tone: "var(--warn)"   },
  approved:          { label: "Approved",       tone: "var(--accent)" },
  running:           { label: "Running",        tone: "var(--accent)" },
  failed:            { label: "Failed",         tone: "var(--down)"   },
  rejected:          { label: "Rejected",       tone: "var(--text-3)" },
};

function timeLabel(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Status chip under a bubble. Rendered on the turn that actually carries the
 * requestId — the USER turn (the API links the request to the user message on
 * POST; the assistant message only exists once the run finishes). Elapsed time
 * appears past 60s because a silent minute reads as breakage.
 */
function StatusChip({ msg, now }: { msg: ChatMsg; now: number }) {
  if (!msg.requestId || !msg.requestStatus) return null;
  if (msg.requestStatus === "done") return null;               // silence on the happy path
  const c = CHIP[msg.requestStatus];
  if (!c) return null;

  const startedMs = msg.requestStartedAt ? new Date(msg.requestStartedAt).getTime() : null;
  const elapsedS  = startedMs && msg.requestStatus === "running"
    ? Math.floor((now - startedMs) / 1000) : 0;
  const showElapsed = elapsedS > 60;

  const Icon = msg.requestStatus === "failed" ? CircleAlert
             : msg.requestStatus === "running" ? Loader2 : Clock;

  return (
    <span className="inline-flex items-center gap-1.5 num text-[10.5px] px-1" style={{ color: c.tone }}>
      <Icon className={`w-3 h-3 ${msg.requestStatus === "running" ? "animate-spin" : ""}`} />
      {c.label}
      {showElapsed && <span>· {Math.floor(elapsedS / 60)}m {elapsedS % 60}s</span>}
      {msg.requestStatus === "failed" && msg.requestError && (
        <span className="max-w-[22ch] truncate" title={msg.requestError}>· {msg.requestError}</span>
      )}
    </span>
  );
}

export function ClientChatThread({
  client,
  disabled = false,
  disabledReason,
}: {
  client: string;
  /** true when the client has no Hermes profile — composer is read-only */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [now, setNow]           = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/clients/${client}/chat`);
      if (r.ok) setMessages((await r.json()).messages ?? []);
    } catch { /* ignore — next poll retries */ }
    setLoaded(true);
  }, [client]);

  useEffect(() => { setLoaded(false); setMessages([]); load(); }, [client, load]);

  const hasPending = messages.some((m) => m.requestStatus && PENDING.has(m.requestStatus));
  const lastIsUnansweredUser = messages.length > 0 && messages[messages.length - 1].role === "user";
  const showTyping = hasPending || lastIsUnansweredUser;

  // 3s poll while work is in flight. Fine at one user; SSE is a Phase-3 call.
  useEffect(() => {
    if (!showTyping) return;
    const iv = setInterval(() => { load(); setNow(Date.now()); }, 3000);
    return () => clearInterval(iv);
  }, [showTyping, load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showTyping]);

  const submit = async () => {
    const text = input.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    setInput("");
    try {
      const r = await fetch(`/api/clients/${client}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sideEffecting: needsApproval }),
      });
      if (r.ok) await load(); else setInput(text);
    } catch { setInput(text); }
    finally { setSending(false); }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
        {!loaded ? (
          <div className="flex items-center justify-center h-full text-[var(--text-3)] text-[13px]">Loading…</div>
        ) : messages.length === 0 ? (
          <EmptyState icon={<Bot className="w-6 h-6" />} title="Chưa có tin nhắn — gửi tin nhắn đầu tiên để bắt đầu" />
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => <ChatBubble key={m.id} message={m} now={now} />)}
            {showTyping && <TypingBubble />}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] p-4">
        {disabled ? (
          <div className="text-[12.5px] text-[var(--warn)] px-1 py-2">
            {disabledReason ?? "No Hermes profile for this client yet."}
          </div>
        ) : (
          <div className="flex items-end gap-2.5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Nhắn tin cho Hermes…"
              rows={1}
              className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-3)] px-3.5 py-2.5 rounded-[10px] border border-[var(--line)] focus:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] outline-none transition-colors resize-none"
            />
            {/* Manual override until agent-side detection lands (Fable §4.1) —
                de-emphasised so the default path stays one tap. */}
            <button
              type="button"
              onClick={() => setNeedsApproval((v) => !v)}
              title="Khi bật, tin nhắn sẽ tạo một hành động cần duyệt trước khi chạy"
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[10px] text-[11.5px] font-medium border transition-colors shrink-0"
              style={needsApproval
                ? { color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" }
                : { color: "var(--text-3)", borderColor: "var(--line)" }}
            >
              <span className="w-3 h-3 rounded-[3px] border shrink-0"
                style={{ borderColor: needsApproval ? "var(--accent)" : "var(--text-3)",
                         background:  needsApproval ? "var(--accent)" : "transparent" }} />
              Cần duyệt
            </button>
            <Button variant="primary" onClick={submit} disabled={sending || !input.trim()}>
              <Send className="w-3.5 h-3.5" /> Send
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message, now }: { message: ChatMsg; now: number }) {
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
        <div className="flex items-center gap-1.5 px-1">
          <span className="num text-[10.5px] text-[var(--text-3)]">
            {timeLabel(message.createdAt)}
          </span>
          <StatusChip msg={message} now={now} />
        </div>
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
