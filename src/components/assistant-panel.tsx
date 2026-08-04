"use client";

/* ───────────────────────────────────────────────────────────
   DigivisionsHQ · Krisna 🪔 — the proactive assistant panel
   Spec F, F-7. Fills the dashboard slot the old DecisionItems()
   stub reserved: decisions computed by the bridge (never by the
   model), the last digest's timestamp, and six settings behind a
   gear. Reads GET /api/assistant every 30s (the dashboard's own
   interval); "Báo cáo ngay" POSTs a digest the bridge picks up
   within ~5s.
   ─────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings, Send } from "lucide-react";
import {
  Panel, SectionHeader, Button, EmptyState, Modal, Field, TextInput,
} from "@/components/ui/kit";
import {
  ASSISTANT_NAME, DEFAULT_CONFIG, type AssistantConfig,
} from "@/lib/assistant";

interface Decision {
  id: string;
  severity: "high" | "medium" | "low";
  icon?: string;
  text: string;
  action?: string;
  href?: string;
}
interface LogEntry {
  ts: string;
  slot: string;
  source?: string;
  costUsd?: number | null;
  decisions?: number;
  sent?: boolean;
}
interface AssistantPayload {
  config: AssistantConfig;
  decisions: { ts?: string; items?: Decision[] };
  log: { entries: LogEntry[] };
  lastDigestAt: string | null;
}

/* Severity → DigivisionsHQ token. Never --hq-accent: the accent is the
   brand's warm gold and reads as "good", which a high-severity dot is not. */
const SEV_COLOR: Record<Decision["severity"], string> = {
  high: "var(--hq-down)",
  medium: "var(--hq-warn)",
  low: "var(--hq-text-ghost)",
};

function timeAgo(d: string | null): string {
  if (!d) return "chưa có";
  const diff = Date.now() - new Date(d).getTime();
  if (!Number.isFinite(diff)) return "chưa có";
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
  if (dy > 0) return `${dy} ngày trước`;
  if (h > 0) return `${h} giờ trước`;
  if (m > 0) return `${m} phút trước`;
  return "vừa xong";
}

const slotWord = (s: string) => (s === "morning" ? "sáng" : s === "evening" ? "tối" : "theo yêu cầu");

const hhmm = (d: string) =>
  new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function AssistantPanel() {
  const [data, setData] = useState<AssistantPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const genAt = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d: AssistantPayload | null = await fetch("/api/assistant").then((r) => (r.ok ? r.json() : null));
      if (d) {
        setData(d);
        // The optimistic "đang tạo…" clears only when a NEW log entry lands —
        // the digest run itself is the completion signal, not the POST's 200.
        if (d.lastDigestAt && d.lastDigestAt !== genAt.current) setGenerating(false);
      }
    } catch { /* a transient fetch failure keeps the last good render */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, generating ? 6000 : 30_000);
    return () => clearInterval(iv);
  }, [load, generating]);

  const generate = async () => {
    genAt.current = data?.lastDigestAt ?? null;
    setGenerating(true);
    setGenErr(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "digest" }),
      });
      if (!res.ok) {
        setGenerating(false);
        setGenErr(res.status === 429 ? "Vừa gửi rồi — thử lại sau 1 phút." : "Không tạo được báo cáo.");
      }
    } catch {
      setGenerating(false);
      setGenErr("Không tạo được báo cáo.");
    }
  };

  const items = data?.decisions?.items ?? [];
  const entries = data?.log?.entries ?? [];

  return (
    <Panel className="p-6 h-full flex flex-col">
      <SectionHeader
        label={ASSISTANT_NAME}
        title="Cần bạn quyết"
        action={
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={generate} disabled={generating}>
              <Send className="w-3.5 h-3.5" />
              {generating ? "đang tạo…" : "Báo cáo ngay"}
            </Button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Cài đặt Krisna"
              className="p-1.5 rounded-[8px] text-[var(--hq-text-faint)] hover:text-[var(--hq-text)] transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0">
        {!loaded ? null : items.length === 0 ? (
          <EmptyState title="Không có gì cần quyết." hint="Krisna sẽ báo khi có." />
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.id} className="flex gap-2.5">
                <span
                  className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: SEV_COLOR[it.severity] ?? SEV_COLOR.low }}
                />
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-[var(--hq-text)]">{it.text}</p>
                  {it.action && it.href && (
                    <Link
                      href={it.href}
                      className="mt-0.5 inline-block text-[11.5px] text-[var(--hq-text-faint)] hover:text-[var(--hq-text)] transition-colors"
                    >
                      {it.action} →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {genErr && (
        <p className="mt-3 text-[11.5px]" style={{ color: "var(--hq-warn)" }}>{genErr}</p>
      )}

      <div className="mt-5 pt-3" style={{ borderTop: "1px solid var(--hq-hairline)" }}>
        <p className="num text-[11px] text-[var(--hq-text-ghost)]">
          Bản tóm tắt gần nhất {timeAgo(data?.lastDigestAt ?? null)}
        </p>
        {entries.length > 0 && (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-[var(--hq-text-faint)] hover:text-[var(--hq-text)] transition-colors">
              Nhật ký ({entries.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {entries.slice(0, 5).map((e, i) => (
                <li key={`${e.ts}-${i}`} className="num text-[11px] text-[var(--hq-text-ghost)] flex gap-2">
                  <span>{slotWord(e.slot)}</span>
                  <span>{hhmm(e.ts)}</span>
                  {e.source === "fallback" && <span style={{ color: "var(--hq-warn)" }}>rút gọn</span>}
                  <span className="ml-auto">
                    {typeof e.costUsd === "number" ? `$${e.costUsd.toFixed(4)}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={data?.config ?? DEFAULT_CONFIG}
        onSaved={(cfg) => setData((d) => (d ? { ...d, config: cfg } : d))}
      />
    </Panel>
  );
}

/* ── Settings: the six numbers Andy sets once, behind the gear (F-D9) ── */
function SettingsModal({
  open, onClose, config, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  config: AssistantConfig;
  onSaved: (c: AssistantConfig) => void;
}) {
  const [draft, setDraft] = useState<AssistantConfig>(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the server whenever the modal opens, so a poll that landed
  // while it was closed is not silently overwritten on save.
  useEffect(() => { if (open) { setDraft(config); setError(null); } }, [open, config]);

  const setDigest = (patch: Partial<AssistantConfig["digest"]>) =>
    setDraft((d) => ({ ...d, digest: { ...d.digest, ...patch } }));
  const setNudges = (patch: Partial<AssistantConfig["nudges"]>) =>
    setDraft((d) => ({ ...d, nudges: { ...d.nudges, ...patch } }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { config: stored } = await res.json();
      onSaved(stored);         // render exactly what was stored, clamps included
      onClose();
    } catch {
      setError("Không lưu được. Thử lại?");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cài đặt ${ASSISTANT_NAME}`}
      footer={
        <>
          <Button size="sm" onClick={onClose}>Huỷ</Button>
          <Button size="sm" variant="primary" onClick={save} disabled={saving}>
            {saving ? "Đang lưu…" : "Lưu"}
          </Button>
        </>
      }
    >
      <label className="flex items-center gap-2.5 text-[13px] text-[var(--hq-text)]">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
        />
        Bật Krisna (tóm tắt theo giờ)
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tóm tắt sáng (ICT)" hint="Để trống = tắt">
          <TextInput
            type="time"
            value={draft.digest.morning ?? ""}
            onChange={(e) => setDigest({ morning: e.target.value || null })}
          />
        </Field>
        <Field label="Tóm tắt tối (ICT)" hint="Để trống = tắt">
          <TextInput
            type="time"
            value={draft.digest.evening ?? ""}
            onChange={(e) => setDigest({ evening: e.target.value || null })}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-[13px] text-[var(--hq-text)]">
        <input
          type="checkbox"
          checked={draft.nudges.enabled}
          onChange={(e) => setNudges({ enabled: e.target.checked })}
        />
        Bật nhắc (duyệt chờ lâu, hạ tầng down)
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Nhắc duyệt sau (giờ)" hint="1–23">
          <TextInput
            type="number" min={1} max={23}
            value={draft.nudges.approvalStaleH}
            onChange={(e) => setNudges({ approvalStaleH: Number(e.target.value) })}
          />
        </Field>
        <Field label="Nhắc hạ tầng sau (phút)" hint="5–720">
          <TextInput
            type="number" min={5} max={720}
            value={draft.nudges.infraDownMin}
            onChange={(e) => setNudges({ infraDownMin: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Giờ yên từ (ICT)" hint="Chỉ chặn nhắc, không chặn tóm tắt">
          <TextInput
            type="time"
            value={draft.nudges.quietFromICT}
            onChange={(e) => setNudges({ quietFromICT: e.target.value })}
          />
        </Field>
        <Field label="Giờ yên đến (ICT)">
          <TextInput
            type="time"
            value={draft.nudges.quietToICT}
            onChange={(e) => setNudges({ quietToICT: e.target.value })}
          />
        </Field>
      </div>

      {error && <p className="text-[12px]" style={{ color: "var(--hq-down)" }}>{error}</p>}
    </Modal>
  );
}
