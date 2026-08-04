"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2, User, Bot, Clock, CircleAlert } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmptyState, Button } from "@/components/ui/kit";
import { POLLING, PENDING, KIND_CLAUDE_CODE } from "@/lib/requests";
import { ApprovalCard, type Req } from "@/components/approval-card";

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

// NB: var(--hq-accent) does NOT exist in globals.css. Use var(--accent).
const CHIP: Record<string, { label: string; tone: string }> = {
  queued:            { label: "Queued",         tone: "var(--text-3)" },
  awaiting_approval: { label: "Needs approval", tone: "var(--warn)"   },
  approved:          { label: "Approved",       tone: "var(--accent)" },
  running:           { label: "Running",        tone: "var(--accent)" },
  failed:            { label: "Failed",         tone: "var(--down)"   },
  rejected:          { label: "Rejected",       tone: "var(--text-3)" },
  expired:           { label: "Expired",        tone: "var(--text-3)" },
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
function StatusChip({ msg, now, kind }: { msg: ChatMsg; now: number; kind?: string }) {
  if (!msg.requestId || !msg.requestStatus) return null;
  if (msg.requestStatus === "done") return null;               // silence on the happy path
  const c = CHIP[msg.requestStatus];
  if (!c) return null;

  const startedMs = msg.requestStartedAt ? new Date(msg.requestStartedAt).getTime() : null;
  const elapsedS  = startedMs && msg.requestStatus === "running"
    ? Math.floor((now - startedMs) / 1000) : 0;
  const showElapsed = elapsedS > 60;

  const isCc = kind === KIND_CLAUDE_CODE;
  const label = isCc
    ? (msg.requestStatus === "running" ? "⚡ Claude Code đang chạy…"
       : msg.requestStatus === "queued" || msg.requestStatus === "approved" ? "Claude Code · chờ máy Mac"
       : c.label)
    : c.label;

  const Icon = msg.requestStatus === "failed" ? CircleAlert
             : msg.requestStatus === "running" ? Loader2 : Clock;

  return (
    <span className="inline-flex items-center gap-1.5 num text-[10.5px] px-1" style={{ color: c.tone }}>
      <Icon className={`w-3 h-3 ${msg.requestStatus === "running" ? "animate-spin" : ""}`} />
      {label}
      {showElapsed && <span>· {Math.floor(elapsedS / 60)}m {elapsedS % 60}s</span>}
      {msg.requestStatus === "failed" && msg.requestError && (
        <span className="max-w-[22ch] truncate" title={msg.requestError}>· {msg.requestError}</span>
      )}
    </span>
  );
}

export function ClientChatThread({
  client,
  basePath,
  disabled = false,
  disabledReason,
}: {
  client: string;
  /** overrides the fetch base — defaults to `/api/clients/${client}`. Pass
   *  `/api/projects/${slug}` to reuse this thread for a Project workspace. */
  basePath?: string;
  /** true when the client has no Hermes profile — composer is read-only */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const base = basePath ?? `/api/clients/${client}`;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [requests, setRequests] = useState<Record<string, Req>>({});
  const [estCost, setEstCost]   = useState<number | null>(null);
  const [mode, setMode] = useState<"chat" | "action">("chat");
  const [now, setNow]           = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${base}/chat`);
      if (r.ok) {
        const data = await r.json();
        setMessages(data.messages ?? []);
        setRequests(data.requests ?? {});
        setEstCost(data.estCostUsd ?? null);
      }
    } catch { /* ignore — next poll retries */ }
    setLoaded(true);
  }, [base]);

  useEffect(() => { setLoaded(false); setMessages([]); load(); }, [base, load]);

  const hasLive    = messages.some((m) => m.requestStatus && POLLING.has(m.requestStatus));
  const hasWorking = messages.some((m) => m.requestStatus && PENDING.has(m.requestStatus));
  const hasAwaiting = messages.some((m) => m.requestStatus === "awaiting_approval");
  const lastIsUnansweredUser = messages.length > 0 && messages[messages.length - 1].role === "user";
  const showTyping = hasWorking || (lastIsUnansweredUser && !hasAwaiting);

  // 3s poll while work is in flight. Fine at one user; SSE is a Phase-3 call.
  useEffect(() => {
    if (!hasLive) return;
    const iv = setInterval(() => { load(); setNow(Date.now()); }, 3000);
    return () => clearInterval(iv);
  }, [hasLive, load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, showTyping]);

  const submit = async () => {
    const text = input.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    setInput("");
    try {
      const r = await fetch(`${base}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sideEffecting: mode === "action" }),
      });
      if (r.ok) { await load(); setMode("chat"); } else setInput(text);
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
            {messages.map((m) => {
              const r = m.requestId ? requests[m.requestId] : undefined;
              const showCard = m.role === "user" && r?.sideEffecting;   // ordinary chat gets no card
              return (
                <div key={m.id} className="flex flex-col gap-2">
                  <ChatBubble message={m} now={now} suppressChip={!!showCard} />
                  {showCard && (
                    <div className="self-end w-full max-w-[85%]">
                      <ApprovalCard
                        req={r!} variant="rich" estCostUsd={estCost} modelHint={null}
                        onAction={load}
                        onRerun={async () => {
                          await fetch(`/api/hermes/requests/${r!.id}`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "rerun" }),
                          });
                          await load();
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
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
          <>
            <div className="flex items-center gap-1 mb-2.5">
              {([
                { k: "chat"  as const, label: "💬 Trò chuyện", hint: "Hermes trả lời ngay" },
                { k: "action" as const, label: "⚡ Hành động",  hint: "Tạo yêu cầu cần bạn duyệt trước khi chạy" },
              ]).map((o) => (
                <button key={o.k} type="button" onClick={() => setMode(o.k)} title={o.hint}
                  className="px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors"
                  style={mode === o.k
                    ? { color: "var(--accent)", borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" }
                    : { color: "var(--text-3)", borderColor: "var(--line)" }}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2.5">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder={mode === "action" ? "Mô tả hành động cần Hermes thực hiện…" : "Nhắn tin cho Hermes…"}
                rows={1}
                className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--text-3)] px-3.5 py-2.5 rounded-[10px] border border-[var(--line)] focus:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] outline-none transition-colors resize-none"
              />
              <Button variant="primary" onClick={submit} disabled={sending || !input.trim()}>
                <Send className="w-3.5 h-3.5" /> Send
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message, now, suppressChip }: { message: ChatMsg; now: number; suppressChip?: boolean }) {
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
          {!suppressChip && <StatusChip msg={message} now={now} />}
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
