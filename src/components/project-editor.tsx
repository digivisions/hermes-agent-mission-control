"use client";

import { useState } from "react";
import { Modal, Field, TextInput, TextArea, Select, Button } from "@/components/ui/kit";
import { PROJECT_STATUSES, PROJECT_TYPES, PRIORITIES } from "@/lib/registry";
import { Markdown } from "@/components/markdown";

export interface ProjectCardLike {
  slug: string;
  name: string;
  type: string;
  status: string;
  priority: string;
  tags: string[];
  overview: string | null;
  nextActions: string[];
  waitingOn: string[];
  location: string | null;
  accent: string | null;
  description: string | null;
  contextNotes: string | null;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ProjectEditor({ mode, initial, onClose, onSaved }: {
  mode: "create" | "edit";
  initial?: Partial<ProjectCardLike>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [status, setStatus] = useState(initial?.status ?? "planned");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [type, setType] = useState(initial?.type ?? "internal");
  const [accent, setAccent] = useState(initial?.accent ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [location, setLocation] = useState(initial?.location ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [overview, setOverview] = useState(initial?.overview ?? "");
  const [nextActions, setNextActions] = useState((initial?.nextActions ?? []).join("\n"));
  const [waitingOn, setWaitingOn] = useState((initial?.waitingOn ?? []).join("\n"));
  const [contextNotes, setContextNotes] = useState(initial?.contextNotes ?? "");
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
      const body = {
        name, slug, status, priority, type,
        accent: accent || null,
        tags, location: location || null, description: description || null,
        overview: overview || null, nextActions, waitingOn,
        contextNotes: contextNotes || null,
      };
      const res = mode === "create"
        ? await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/projects/${initial?.slug}`, {
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
    if (!window.confirm(`Archive ${initial.name ?? initial.slug}? It will disappear from the board.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${initial.slug}`, {
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
      wide
      onClose={onClose}
      title={mode === "create" ? "New project" : `Edit ${initial?.name ?? ""}`}
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
      <Field
        label="Slug"
        error={errors.slug}
        hint={mode === "edit" ? "Immutable — it's the drag-order key" : undefined}
      >
        <TextInput
          value={slug}
          disabled={mode === "edit"}
          onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Status" error={errors.status}>
          <Select options={PROJECT_STATUSES} value={status} onChange={(e) => setStatus(e.target.value)} />
        </Field>
        <Field label="Priority" error={errors.priority}>
          <Select options={PRIORITIES} value={priority} onChange={(e) => setPriority(e.target.value)} />
        </Field>
        <Field label="Type" error={errors.type}>
          <Select options={PROJECT_TYPES} value={type} onChange={(e) => setType(e.target.value)} />
        </Field>
      </div>
      <Field label="Accent" error={errors.accent} hint="Hex colour, e.g. #60a5fa">
        <TextInput value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#60a5fa" />
      </Field>
      <Field label="Tags" hint="Comma-separated">
        <TextInput value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <Field label="Location">
        <TextInput value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="Description">
        <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Overview">
        <TextArea rows={4} value={overview} onChange={(e) => setOverview(e.target.value)} />
      </Field>
      <Field label="Next actions" hint="One per line">
        <TextArea rows={4} value={nextActions} onChange={(e) => setNextActions(e.target.value)} />
      </Field>
      <Field label="Waiting on" hint="One per line">
        <TextArea rows={3} value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} />
      </Field>
      <Field label="Context notes" hint="Markdown">
        <TextArea rows={10} value={contextNotes} onChange={(e) => setContextNotes(e.target.value)} />
      </Field>
      {contextNotes && (
        <div className="rounded-[10px] p-3" style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}>
          <Markdown>{contextNotes}</Markdown>
        </div>
      )}
    </Modal>
  );
}
