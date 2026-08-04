"use client";

import { useState } from "react";
import { Modal, Field, FieldGroup, TextInput, TextArea, Button } from "@/components/ui/kit";
import { CLIENT_STATUSES, CLIENT_TYPES } from "@/lib/registry";
import { DocumentsField, type DocRef } from "@/components/documents-field";
import { ColorField } from "@/components/ui/color-field";
import { PillPicker } from "@/components/ui/pill-picker";
import { label } from "@/lib/labels";

export interface ClientCardLike {
  slug: string;
  name: string;
  type: string;
  status: string;
  accent: string | null;
  description: string | null;
  contextNotes?: string | null;
  documents?: DocRef[] | null;
  repoPath?: string | null;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ClientEditor({ mode, initial, onClose, onSaved }: {
  mode: "create" | "edit";
  initial?: Partial<ClientCardLike>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [type, setType] = useState(initial?.type ?? "internal");
  const [status, setStatus] = useState(initial?.status ?? "unconfigured");
  const [accent, setAccent] = useState(initial?.accent ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [contextNotes, setContextNotes] = useState(initial?.contextNotes ?? "");
  const [repoPath, setRepoPath] = useState(initial?.repoPath ?? "");
  const [documents, setDocuments] = useState<DocRef[]>(initial?.documents ?? []);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onNameChange = (v: string) => {
    setName(v);
    if (mode === "create" && !slugTouched) setSlug(slugify(v));
  };

  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      const body = { name, slug, type, status, accent: accent || null, description: description || null, contextNotes: contextNotes || null, repoPath: repoPath || null, documents };
      const res = mode === "create"
        ? await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/clients/${initial?.slug}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        const fieldErrors: Record<string, string> = {};
        for (const e of d?.errors ?? []) fieldErrors[e.field] = e.message;
        setErrors(fieldErrors);
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!initial?.slug) return;
    if (!window.confirm(`Archive ${initial.name ?? initial.slug}? It will disappear from the active list.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${initial.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (res.ok) { onSaved(); onClose(); }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "New client" : `Edit ${initial?.name ?? ""}`}
      footer={
        <>
          {mode === "edit" && (
            <Button onClick={archive} disabled={saving} className="mr-auto">Archive</Button>
          )}
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <Field label="Name" error={errors.name}>
        <TextInput value={name} onChange={(e) => onNameChange(e.target.value)} />
      </Field>
      <div className="-mt-2 text-[10.5px] text-[var(--text-3)]">slug: {slug || "—"}</div>
      <FieldGroup label="Status" error={errors.status}>
        <PillPicker options={CLIENT_STATUSES} value={status} onChange={setStatus} labelFor={(v) => label("status", v)} />
      </FieldGroup>
      <FieldGroup label="Type" error={errors.type}>
        <PillPicker options={CLIENT_TYPES} value={type} onChange={setType} labelFor={(v) => label("clientType", v)} />
      </FieldGroup>
      <Field label="Accent" error={errors.accent}>
        <ColorField value={accent} onChange={setAccent} />
      </Field>
      <Field label="Description" error={errors.description}>
        <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <details className="pt-1">
        <summary className="eyebrow !text-[9.5px] cursor-pointer select-none">Nâng cao</summary>
        <div className="mt-3 space-y-3.5">
          <Field
            label="Context notes"
            error={errors.contextNotes}
            hint="Markdown. Briefs, standing instructions, links to folders."
          >
            <TextArea rows={6} value={contextNotes} onChange={(e) => setContextNotes(e.target.value)} />
          </Field>
          <Field
            label="Repo path"
            error={errors.repoPath}
            hint="Đường dẫn tuyệt đối trên máy Mac — bật offload sang Claude Code. Để trống nếu chưa có repo."
          >
            <TextInput value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="/Users/annguyen/… — để trống nếu chưa có repo" />
          </Field>
          <DocumentsField value={documents} onChange={setDocuments} />
        </div>
      </details>
    </Modal>
  );
}
