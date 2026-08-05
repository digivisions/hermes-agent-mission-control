---
name: klaily-operations
description: Use for anything about klaily.co (Klaily handmade clay earrings) — Shopify theme changes and deploys, the cart drawer, the Monthly Trio landing page, currency and free-shipping thresholds, discount apps, marketing and content drafts, or the growth plan.
---

# Klaily / klaily.co — operations

## Deploying the theme

Live theme is **#184729796881** (published 2026-08-01). Earlier live IDs, for
history only: #184682250513 (related-products fix, 2026-07-29) and
#184006082833 (original KLAILY 5.0).

Every live push requires **all four** of these, and Andy's explicit
confirmation for that specific push:

1. `--allow-live`
2. an explicit `--path` to the theme directory (the shell's cwd resets)
3. one `--only` flag **per file** — the comma form mis-parses
4. verification of the upload list: `--verbose | grep "Files to be uploaded"`

`shopify theme push` can report success with an empty upload list and silently
skip your changed files. If a file refuses to upload, force it with a throwaway
comment marker, push, then remove the marker.

Other deploy facts:

- Shopify CLI v4 needs **Node 22+** — Node 20 crashes on `enableCompileCache`.
  The local CLI is off-PATH under the Hermes node install on Andy's Mac.
- Stop `shopify theme dev` before any push, or the push turns interactive and fails.
- CI: `theme-check.yml` runs automatically and is green; `deploy.yml` is manual
  and gated, and is **still blocked** on the `SHOPIFY_CLI_THEME_TOKEN` +
  `SHOPIFY_STORE` Actions secrets (steps in the repo's docs/DEPLOYMENT.md; the
  token itself lives in the Shopify admin Theme Access app, never in the repo).

## Previewing

- Preview URLs lie: `myshopify.com/?preview_theme_id=…` 301s to klaily.co and
  drops the parameter for anonymous users. Use local `shopify theme dev` (:9292).
- klaily.co sits behind a Cloudflare bot challenge that blocks headless browsers,
  and headless fires no IntersectionObserver/rAF — animations cannot be verified there.
- The admin Pages template dropdown only lists the **published** theme's
  templates; render a pre-publish template with `?view=<template>`.

## Cart, discounts and currency

- The cart drawer is rendered globally and refreshed through the Section
  Rendering API; it opens optimistically (~5 ms) and morphs content in place,
  keyed by **variant id, not `item.key`**.
- The kept "Tiered Pricing / Volume Discount" app **rotates `item.key`** on every
  quantity change. Never match cart lines by exact key — pair by variant-id and
  rewrite fresh keys.
- "Kaktus In Cart" (slide cart) was uninstalled 2026-06-21: its legacy ScriptTag
  hijacked cart clicks and theme code cannot remove ScriptTags. When a theme
  interaction "does nothing", suspect an app ScriptTag before a theme bug.
- The ladder UI promises % off — a **real** discount must exist natively
  (Settings → Discounts) or via the Tiered Pricing app, and the free-ship meter
  must agree with per-market shipping rates.
- On Shopify Markets, Liquid gives no conversion rate. The cart free-ship meter
  converts client-side via `window.Shopify.currency.rate` (live 2026-06-23).
  Still hard-coded `$`: the PDP "Free shipping over $50" line, the announcement
  bar, and `money()` in assets/trio.js.

## Monthly Trio

Homepage embeds the pick-3 configurator (`home-trio-picker`); the landing page
uses `sections/trio-express.liquid` with reconciler-based auto-add
(`ensureCartMatches()`) — the **cart is the source of truth**, diffed against a
fresh `/cart.js` read. Stale `/cart.js` snapshots arriving after your own
mutation look like external removals; require a confirming fresh read and a
grace window before any destructive UI reset.

Open: the `/pages/monthly-trio` page still needs its theme template flipped to
`trio`, and the bundle copy says "June" while the bundle is newer — refresh it
monthly.

## Content, social and marketing

- **Draft only.** Never schedule or publish a post, email or campaign without
  Andy's explicit approval for that item.
- Voice is Chau's: maker-led, warm, specific about materials and process. Never
  invent a product origin story, a review count, or a claim that can't be
  substantiated — an unsupported "5,000+ Reviews" trust badge was removed for
  exactly this reason and replaced with "Handmade in Small Batches".
- Business context lives in the repo's `docs/marketing-plan.md` and
  `docs/growth-strategy.{md,html,pdf}`: the diagnosis is bot-inflated traffic,
  in-person revenue outrunning online, a leaky cart funnel, and ~0% repeat
  purchase. Phase 1 (cart fix) is done.

## Theme gotchas

- `item.properties.size` renders nil on this storefront even when properties
  exist — capture and iterate instead of gating on `.size`.
- Range settings max out at 101 steps (upload validator only; theme-check will
  not catch it). `templates/gift_card.liquid` is mandatory.
- The theme editor re-injects sections the IntersectionObserver never saw —
  reveal-on-scroll needs `Shopify.designMode` + `shopify:section:load` handling
  plus a failsafe timeout.
- Checkout branding editor changes are preview-only until Save; a reload discards them.
- Cross-document View Transitions froze Chrome navigations and were removed.
  Smooth scroll is a self-built ~1 KB rAF lerp — Lenis and GSAP were rejected.

## Reading more

The detailed build log, incident notes and business docs live in Claude Code
project memory and the repo on Andy's Mac, not in this container. If a question
needs them, ask Andy or route it through the Claude Code offload.
