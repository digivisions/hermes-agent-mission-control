---
name: soongs-operations
description: Use for anything about SOONGS (soongs.vn) — the Figma design system and page set, the white/black/grey palette and catalogue typography, desktop and mobile flows, client review rounds, product copy and prices from the A GENTLE SEASON catalogue, or the planned Shopify build.
---

# SOONGS / soongs.vn — operations

## The engagement

Freelance website design for a Sai Gon fashion brand, delivered by Digital
Visions. Primary deliverable is a **Figma design system + full page set**;
a Shopify rollout follows. Bilingual EN/VI, prices in VND. Quotation issued
July 2026.

Client contact designs in Canva and reviews by leaving Figma comments — expect
change requests as comment rounds, not written specs.

## Non-negotiable design constraints

These are hard. A complete first concept (a dark editorial direction built on
Bodoni Moda) was **rejected** for straying from them.

- **Palette: white, black and grey only.** An earlier warm palette
  (cream / butter / blush) was explicitly narrowed to monochrome. Do not
  reintroduce warmth "for contrast".
- **Typography follows the "A GENTLE SEASON" catalogue** — a Helvetica-style
  grotesque (Archivo stands in) plus the size-chart serif as an accent
  (Fraunces). Both are *placeholders* matching the catalogue: a client-supplied
  font name is still pending, and swapping it is a global change across the file.
- **Casing:** product names ALWAYS UPPERCASE; every other piece of UI text
  lowercase.

## Agreed UI decisions (client round 1, 2026-07-23)

- Size picker: plain text, selected size **underlined**. No boxes.
- CTA: underlined text plus an arrow — `add to cart →`.
- Home and nav logo: the **monogram symbol**, not the vertical wordmark.

## Structure and references

Page flow, finalised 2026-08-03:
**ENTRY → CATALOGUE → SHOP STATES → PRODUCT DETAILS → ACCOUNT → SUPPORT.**

- `palomawool.com` — the entry model: a country/language modal over a
  full-screen video intro, leading into the shop.
- `st-agni.com` — inner pages: centred logo, airy grid, centred name/price.
- PDP: full-height image carousel with a sticky bottom bar (name/price ·
  sizes · ADD TO CART). On mobile the gallery is a full-screen horizontal
  scroll mixing portrait and landscape photos, mirroring the Shopify effect.
- The ENTRY video carries a play button on both desktop and mobile.

## Figma hygiene — Andy's standing rules

Andy hand-edits these files after they are built, so structure matters as much
as pixels:

- Group frames into named Figma **Sections** by area (SYSTEM / SHOP FLOW /
  CONTENT).
- Every layer and group gets a human-readable role name. Never leave
  "Frame 123".
- Visible 12-column layout grids on every page frame: 60 px margins, 24 px
  gutters.
- Name and group **as you create**, not as a cleanup pass afterwards.
- Mobile set is built by scaling 1440 → 390 px, on its own page.

## Client-facing hygiene

- Only the approved pages are client-facing. **All work in progress lives on
  the separate hidden "not for client yet" page** — keep it that way until
  pages are approved.
- DRAFT copy (About, Shipping & Returns, FAQ) is flagged in the frame names.
  Never present it as final, and never let it leak onto a client page.
- When a direction is superseded, **archive** it — do not delete. Options 2 and
  3 were deleted after Option 1 "GALLERY" was chosen on 2026-07-23; keep the
  remainder recoverable.

## Product content

Product copy, names and prices come from the **A GENTLE SEASON** catalogue —
14 products (for example Butter Me Up at 660k VND, Axis Dress at 1,200k VND).
The size guide uses the catalogue's exact measurements. Do not invent a product,
a price, or a measurement.

## Current state (2026-08-03)

- Option 1 "GALLERY" chosen 2026-07-23; round-1 comments applied.
- Full desktop page set built on the hidden WIP page: search overlay, cart
  drawer, About, Collections, Lookbook, Login, Account, size guide, Shipping &
  Returns, FAQ, 404.
- Round-2 client comments applied 2026-08-02: category blocks reworked to one
  large main photo left plus four smaller boxes right; blog A/B blocks rebuilt
  to show per-category flexibility.
- Full mobile page set built 2026-08-03, plus a device-mockup entry screen.
- **Waiting on:** the client's replacement font name; approved copy for the
  DRAFT sections; confirmation of the round-2 desktop changes and the mobile
  set. Then Shopify implementation.

## Reading more

The Figma file, the catalogue PDF, the client brief and the quotation live on
Andy's Mac and in Figma, not in this container. A reusable
`designing-fashion-ecommerce` skill was extracted from this project on
2026-08-03. If a question needs any of them, ask Andy or route it through the
Claude Code offload.
