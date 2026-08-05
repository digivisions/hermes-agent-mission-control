---
name: leanagent-operations
description: Use for anything about LeanAgent — the local-first request routing pipeline, request classification tiers, budget and caching agents, tool-output summarisation, SQLite persistence, running its async test suite, or triaging its two unfinished worktrees before deciding whether to resume the project.
---

# LeanAgent — operations

## What it is

A cost-efficient AI assistant that routes most requests to free local models
through request classification, caching, context management and budget controls,
with a cloud fallback for complex work. Persistence is SQLite. The architecture
is a set of specialised agents coordinated by a central orchestrator.

## The routing pipeline

Requests are classified into four tiers:

| Tier | Handled by |
|---|---|
| tool-only | tools directly, no model |
| simple | local model |
| medium | local model |
| complex | paid/cloud fallback, under budget controls |

Local-first routing plus caching **is** the cost-control strategy — that is the
whole point of the project, not an optimisation layered on top.

## Components

Request classification · context management · tool-output summarisation ·
budget management · caching · model management · tools · memory · optional
communication and personality agents.

Agent initialisation follows **dependency order**: model routing depends on the
lower-level agents being up first. This is not incidental — reordering it
breaks routing.

## Persistence and tests

- SQLite only, via `aiosqlite`. No external database is required, and none
  should be introduced without a reason.
- Tests are `pytest` with **`pytest-asyncio`** — they are asynchronous and will
  not run without that plugin.
- `pytest tests/`, then `python -m leanagent --health`.
- Install in editable mode only after the existing environment is understood.

## Current state — read this before touching anything

The project is **paused**, priority low.

- `master` had **31 tracked working-tree entries** at the 2026-07-28
  verification.
- Two open worktrees, each an unfinished experiment:
  `001-tool-output-extraction-summarization` and
  `003-tool-specific-context-instructions`.
- A dirty main worktree plus two feature worktrees means concurrent work was
  abandoned mid-flight, not that the repo is disposable.

**Never** clean, reset or broadly stage this repository. Every one of the 31
entries and both worktrees must be understood first, and each worktree gets its
own merge / archive / discard call.

## Stale-by-default facts

- Model names in the project instructions are likely stale relative to the
  Ollama models actually installed. Check the inventory; do not quote the
  instructions as current.
- Budget-limit values are **configuration, not universal truth**. Reverify
  before relying on any specific number.

## The open question

Whether LeanAgent still has a distinct purpose alongside Hermes and JARVIS. That
is Andy's call — resume, consolidate, or archive. Until he makes it, the correct
answer to "what's next on leanagent" is that it is waiting on that decision, not
a list of features.

If it is retained, the first real work is updating the stale model-tier
assumptions to match the installed local models and the current cost strategy.

## Reading more

`CLAUDE.md` and `AGENTS.md` in the repo are the project instructions and live on
Andy's Mac, along with the two worktrees. The main project slug has no Claude
Code memory notes — the ones that exist belong to the worktrees and are
per-experiment. If a question needs any of it, ask Andy or route it through the
Claude Code offload.
