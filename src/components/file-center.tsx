"use client";

import { useCallback, useEffect, useState } from "react";
import { Folder, FileText, ArrowLeft, ChevronRight } from "lucide-react";
import { Panel, Modal, EmptyState, Skeleton, SectionHeader } from "@/components/ui/kit";
import { timeAgo } from "@/components/approval-card";

type Entry = { name: string; path: string; type: "dir" | "file"; size: number; mtime: string };
type RecentFile = { name: string; path: string; size: number; mtime: string };
type PreviewData =
  | { kind: "loading" }
  | { kind: "text"; name: string; content: string; truncated: boolean }
  | { kind: "image"; name: string; src: string }
  | { kind: "binary"; name: string }
  | { kind: "error"; message: string };

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
function isImageExt(name: string): boolean {
  const i = name.lastIndexOf(".");
  return i >= 0 && IMAGE_EXT.has(name.slice(i).toLowerCase());
}
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FileCenter({ basePath }: { basePath: string }) {
  const [recent, setRecent] = useState<RecentFile[] | null>(null);
  const [noRepo, setNoRepo] = useState(false);

  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);

  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewFromBrowse, setPreviewFromBrowse] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      const r = await fetch(`${basePath}?recent=1`);
      if (!r.ok) return;
      const j = await r.json();
      setNoRepo(!!j.noRepo);
      setRecent(j.files ?? []);
    } catch { /* next poll retries */ }
  }, [basePath]);

  useEffect(() => {
    loadRecent();
    const iv = setInterval(loadRecent, 30_000);
    return () => clearInterval(iv);
  }, [loadRecent]);

  const loadEntries = useCallback(async (path: string) => {
    setEntries(null);
    try {
      const r = await fetch(`${basePath}?path=${encodeURIComponent(path)}`);
      const j = await r.json();
      if (j.noRepo) { setNoRepo(true); setEntries([]); return; }
      setEntries(Array.isArray(j.entries) ? j.entries : []);
    } catch {
      setEntries([]);
    }
  }, [basePath]);

  const openBrowse = () => {
    setBrowseOpen(true);
    setBrowsePath("");
    loadEntries("");
  };

  const goTo = (path: string) => {
    setBrowsePath(path);
    loadEntries(path);
  };

  const loadPreview = useCallback(async (path: string, fromBrowse: boolean) => {
    setPreviewPath(path);
    setPreviewFromBrowse(fromBrowse);
    setPreview({ kind: "loading" });
    if (isImageExt(path)) {
      setPreview({ kind: "image", name: path.split("/").pop() || path, src: `${basePath}?img=${encodeURIComponent(path)}` });
      return;
    }
    try {
      const r = await fetch(`${basePath}?file=${encodeURIComponent(path)}`);
      const j = await r.json();
      if (!r.ok) { setPreview({ kind: "error", message: j.error || "Không tải được file" }); return; }
      if (j.binary) { setPreview({ kind: "binary", name: j.name }); return; }
      setPreview({ kind: "text", name: j.name, content: j.content ?? "", truncated: !!j.truncated });
    } catch {
      setPreview({ kind: "error", message: "Không tải được file" });
    }
  }, [basePath]);

  const closePreview = () => { setPreviewPath(null); setPreview(null); };
  const backFromPreview = () => {
    if (previewFromBrowse) { closePreview(); return; }
    closePreview();
    setBrowseOpen(false);
  };

  const crumbs = browsePath ? browsePath.split("/") : [];

  return (
    <>
      <div>
        <SectionHeader
          label="📁 Tài liệu"
          action={
            <button onClick={openBrowse} className="text-[11.5px] text-[var(--text-3)] hover:text-[var(--text)] transition-colors">
              Browse
            </button>
          }
        />
        <Panel className="p-4">
          {noRepo ? (
            <div className="text-[12.5px] text-[var(--text-3)] py-4 text-center">
              Chưa có repo path
            </div>
          ) : recent === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" />
            </div>
          ) : recent.length === 0 ? (
            <div className="text-[12.5px] text-[var(--text-3)] py-4 text-center">Chưa có file nào</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recent.slice(0, 6).map((f) => (
                <button
                  key={f.path}
                  onClick={() => loadPreview(f.path, false)}
                  className="flex items-center gap-2 text-left text-[12.5px] text-[var(--text-2)] hover:text-[var(--text)] transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 shrink-0 text-[var(--text-3)]" />
                  <span className="truncate flex-1" title={f.path}>{f.name}</span>
                  <span className="text-[10px] text-[var(--text-3)] shrink-0">{timeAgo(f.mtime)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Modal open={browseOpen} onClose={() => setBrowseOpen(false)} title="Tài liệu" wide>
        <div className="flex items-center gap-1 text-[11.5px] text-[var(--text-3)] mb-1 flex-wrap">
          <button onClick={() => goTo("")} className="hover:text-[var(--text)] transition-colors">root</button>
          {crumbs.map((c, i) => {
            const path = crumbs.slice(0, i + 1).join("/");
            return (
              <span key={path} className="flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                <button onClick={() => goTo(path)} className="hover:text-[var(--text)] transition-colors">{c}</button>
              </span>
            );
          })}
        </div>
        {entries === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6" /><Skeleton className="h-6" /><Skeleton className="h-6" />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState title="Thư mục trống" />
        ) : (
          <div className="flex flex-col gap-0.5">
            {entries.map((e) => (
              <button
                key={e.path}
                onClick={() => (e.type === "dir" ? goTo(e.path) : loadPreview(e.path, true))}
                className="flex items-center gap-2.5 text-left px-2 py-1.5 rounded-[8px] text-[12.5px] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-1)] transition-colors"
              >
                {e.type === "dir"
                  ? <Folder className="w-3.5 h-3.5 shrink-0 text-[var(--text-3)]" />
                  : <FileText className="w-3.5 h-3.5 shrink-0 text-[var(--text-3)]" />}
                <span className="truncate flex-1">{e.name}</span>
                {e.type === "file" && <span className="num text-[10.5px] text-[var(--text-3)] shrink-0">{fmtSize(e.size)}</span>}
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={previewPath !== null}
        onClose={closePreview}
        title={
          preview && preview.kind !== "loading" && preview.kind !== "error"
            ? preview.name
            : (previewPath?.split("/").pop() ?? "")
        }
        wide
      >
        {previewFromBrowse && (
          <button onClick={backFromPreview} className="inline-flex items-center gap-1 text-[11.5px] text-[var(--text-3)] hover:text-[var(--text)] mb-1 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Browse
          </button>
        )}
        {!preview || preview.kind === "loading" ? (
          <Skeleton className="h-40" />
        ) : preview.kind === "error" ? (
          <div className="text-[12.5px] text-[var(--down)] py-4 text-center">{preview.message}</div>
        ) : preview.kind === "binary" ? (
          <div className="text-[12.5px] text-[var(--text-3)] py-8 text-center">
            File nhị phân — không preview được
          </div>
        ) : preview.kind === "image" ? (
          <img src={preview.src} alt={preview.name} className="max-w-full max-h-[65vh] mx-auto rounded-[8px]" />
        ) : (
          <>
            {preview.truncated && (
              <div className="text-[11px] text-[var(--warn)] mb-2">
                File lớn hơn 256 KB — chỉ hiển thị phần đầu.
              </div>
            )}
            <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words text-[var(--text-2)] max-h-[65vh] overflow-y-auto">
              {preview.content}
            </pre>
          </>
        )}
      </Modal>
    </>
  );
}
