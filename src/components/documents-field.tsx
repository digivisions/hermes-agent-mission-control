"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Eyebrow, TextInput, Button } from "@/components/ui/kit";

export interface DocRef {
  title: string;
  url?: string;
  note?: string;
}

/** Repeatable title+url row list for the `documents` metadata field.
 *  No upload/storage — these are references (Drive links, file paths). */
export function DocumentsField({ value, onChange }: { value: DocRef[]; onChange: (docs: DocRef[]) => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const add = () => {
    const t = title.trim();
    if (!t) return;
    onChange([...value, { title: t, ...(url.trim() ? { url: url.trim() } : {}) }]);
    setTitle("");
    setUrl("");
  };

  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      <Eyebrow className="!text-[9.5px]">Documents</Eyebrow>
      {value.length > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {value.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-[10px] px-3 py-1.5"
              style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-[var(--text)] truncate">{d.title}</div>
                {d.url && <div className="text-[11px] text-[var(--text-3)] truncate">{d.url}</div>}
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${d.title}`}
                className="shrink-0 text-[var(--text-3)] hover:text-[var(--text)] transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="flex-1 min-w-0" />
        <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL / path (optional)" className="flex-1 min-w-0" />
        <Button onClick={add} size="sm" className="shrink-0">
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}
