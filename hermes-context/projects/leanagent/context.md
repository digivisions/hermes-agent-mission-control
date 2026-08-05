## leanagent

Digital Visions' own cost-efficient AI assistant framework. Routes most requests
to free **local** models through request classification, caching, context
management and budget controls, with a cloud fallback for complex work. SQLite
persistence; specialised agents coordinated by a central orchestrator.

### Routing pipeline

| Tier | Handled by |
|---|---|
| tool-only | tools directly, no model |
| simple | local model |
| medium | local model |
| complex | paid/cloud fallback, under budget controls |

Local-first routing plus caching **is** the cost-control strategy — that is the
project's whole premise.

### Components

Request classification · context management · tool-output summarisation ·
budget management · caching · model management · tools · memory · optional
communication and personality agents. Initialisation follows dependency order —
model routing depends on the lower-level agents being up first.

### Persistence & tests

SQLite only (`aiosqlite`) — no external database required. Tests use `pytest`
with **`pytest-asyncio`**; they are asynchronous and will not run without it.
Health check: `python -m leanagent --health`.

### Status — PAUSED

Priority low unless Andy explicitly resumes it. The open question is strategic:
**does LeanAgent still have a distinct purpose alongside Hermes and JARVIS?**
Resume, consolidate, or archive — that is Andy's call, and nothing else should
start until it is made.

State at the 2026-07-28 verification:

- `master` with **31 tracked working-tree entries**
- Two open worktrees, each an unfinished experiment:
  `001-tool-output-extraction-summarization` and
  `003-tool-specific-context-instructions`

### Standing rules

- **Never** clean, reset or broadly stage this repository until all 31 entries
  and both worktrees are understood. Each worktree gets its own
  merge / archive / discard decision.
- Model names in the project instructions are likely stale relative to the
  installed Ollama inventory — check, don't quote.
- Budget-limit values are configuration, not universal truth; reverify before
  relying on them.

### If retained

First real work is updating the stale model-tier assumptions to match the
currently installed local models and the current cost strategy.

## Nguồn context

- Repo + `CLAUDE.md` + `AGENTS.md`: `/Users/annguyen/Documents/1-Development/leanagent`
- Worktrees: `/Users/annguyen/Documents/1-Development/leanagent/.worktrees/`
- Obsidian: `Projects/leanagent.md`
- Slug chính **không có** Claude Code project memory — chỉ các worktree slug mới có note, và chúng thuộc về từng thí nghiệm riêng, không dùng làm ngữ cảnh chung.
