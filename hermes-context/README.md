# hermes-context/

Source of truth for what each Hermes profile and each HQ client/project workspace
knows about itself. Git-tracked so it is reviewable in a PR, diffable, and
re-appliable with one command after any profile rebuild.

## Layout

```
hermes-context/
├── README.md                       # this file
├── _lib/rewrite-paths.sed          # Mac path → container-safe rewriting rules
├── clients/
│   ├── safe-english/{MEMORY.md,SKILL.md,context.md,documents.json}
│   ├── klaily/…  move-fitness/…  chubb-dev/…  immersive-travel-asia/…  soongs/…
└── projects/
    ├── digivisions-hq/…  echo/…  jarvis/…  andypi/…  vps-dev-center/…
    ├── leanagent/…  tammy-nang/…  realxr/…  andynguyen-work/…
    └── immersive-travel-asia/…
```

## Contract

Every slug directory carries up to four files:

- **`MEMORY.md`** — **≤2200 chars**, `§`-separated paragraphs, no headings, no
  code fences. Answers: what is this, what is the live URL, what stack, where
  does the data live, what is the current phase, what must never be done.
  This is loaded into the Hermes profile's `memories/MEMORY.md` on every run —
  the budget is a hard ceiling (`memory_char_limit: 2200`,
  `~/.hermes/config.yaml:350`), not a target. Over-budget content must be
  distilled by hand, never truncated by a script.
- **`SKILL.md`** — standard skill frontmatter (`name`, `description`), then
  the operational depth. `description` must be a *routing* sentence: it is
  the only thing the agent sees before deciding to open the file. Optional —
  not every slug needs one (see `tammy-nang`).
- **`context.md`** — human-facing markdown for `Client.contextNotes` /
  `Project.contextNotes`. May be longer than `MEMORY.md` and may reference
  real Mac paths (Andy reads this in the HQ UI, not the container).
- **`documents.json`** — `[{ "title": …, "url": …, "note"?: … }]`, matching
  `prisma/schema.prisma` (`Client.documents` / `Project.documents`).

A slug may instead contain a single `SAME_AS` file naming another slug's
directory whose content should be reused verbatim (see
`projects/immersive-travel-asia/SAME_AS`) — used when a project and a client
are the same underlying work. Two copies drift; a pointer cannot.

## Path rewriting

`MEMORY.md` and `SKILL.md` are seeded into a container that cannot open
`/Volumes/DATA2`, `/Users/annguyen/…`, or the Obsidian vault. Every such path
in those two files must read correctly after being rewritten by
`_lib/rewrite-paths.sed` — write prose like *"the canonical repo lives on
Andy's Mac; ask him or use the Claude Code offload to read it"*, not
*"read /Volumes/DATA2/…"*. `context.md` is exempt — it is rendered for Andy,
on the Mac, in a browser.

## Sinks

Two re-runnable scripts apply this directory to the two places that read it:

- `scripts/seed-profile-context.sh` — writes `MEMORY.md` (rewritten) to
  `/opt/data/profiles/<profile>/memories/MEMORY.md` and `SKILL.md`
  (rewritten) to `/opt/data/profiles/<profile>/skills/<slug>-operations/SKILL.md`
  inside the `hermes` container. Sha-stamped and idempotent; never creates a
  profile that doesn't already exist.
- `scripts/seed-hq-context.ts` — writes `context.md` to `Client.contextNotes`
  / `Project.contextNotes` and `documents.json` to `Client.documents` /
  `Project.documents`. Never touches `status`, `hermesProfile`, `model`,
  `sortOrder`, `accent`. Refuses to overwrite a hand-edited note that doesn't
  carry the seeder's marker, unless `--force`.

Both scripts stamp the first line of what they write with a marker:

```
<!-- hermes-context v1 slug=<slug> sha=<12-hex> seeded=<ISO8601> -->
```

Same sha ⇒ the run is a no-op. This is what makes re-seeding after a profile
rebuild (`provision-profile.sh` clones from `admin`, wiping profile-local
edits) a single safe command instead of a manual reconstruction.
