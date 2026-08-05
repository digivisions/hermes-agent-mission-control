## SOONGS — soongs.vn

Freelance website design for **SOONGS**, a fashion brand based in Sài Gòn, with
a Shopify rollout planned. Client contact is Hạ Vi Phan (designs in Canva);
assets are shared via the Google Drive folder "A Gentle season 2025"
(soongs.vn@gmail.com). Bilingual EN/VI, prices in VND. Quotation issued
July 2026 by Digital Visions.

> **Note:** `hermesProfile` for `soongs` is currently **null** in the registry,
> so the profile seeder will skip this slug until a profile is provisioned
> (`scripts/provision-profile.sh soongs`). The HQ context below still applies.

### Deliverable

A Figma design system plus the full page set, then the Shopify build.
Figma file: "SOONGS — Website Design System · 3 Options", key
`YH8ugqdChddaU8KeUzk9Sm` (DIGIVISION pro team).

### Hard design constraints

- **Palette: white, black and grey ONLY.** An earlier warm palette
  (cream / butter / blush) was explicitly narrowed to monochrome — do not
  reintroduce it.
- **Typography follows the "A GENTLE SEASON" catalogue** — a Helvetica-style
  grotesque (Archivo in Figma) plus the size-chart serif as accent (Fraunces).
  Both are placeholders; a client-supplied font is still pending.
- **Casing:** product names ALWAYS UPPERCASE, all other UI text lowercase.

A whole first concept (Bodoni Moda, dark editorial) was **rejected** for
straying from these.

### Agreed UI decisions (client round 1, 2026-07-23)

Size picker = plain text with the selected size underlined, no boxes.
CTA = underlined text + arrow (`add to cart →`). Home and nav logo = the
monogram symbol, not the vertical wordmark.

### References

`palomawool.com` (entry: country/language modal over a full-screen video intro
→ shop) and `st-agni.com` (inner pages: centred logo, airy grid, centred
name/price). PDP = full-height image carousel + sticky bottom bar.

### Page flow (finalised 2026-08-03)

ENTRY → CATALOGUE → SHOP STATES → PRODUCT DETAILS → ACCOUNT → SUPPORT.

### Standing rules

- Client-facing Figma pages are only the approved ones; **all WIP stays on the
  separate hidden "not for client yet" page**.
- DRAFT copy (About, Shipping & Returns, FAQ) is flagged in frame names — never
  present it as final.
- Archive superseded options rather than deleting them.
- Figma hygiene (Andy's standing rule): named Sections by area, human-readable
  layer names — never "Frame 123" — and visible 12-col grids (60px margins,
  24px gutters) on every page frame.

### Current phase (2026-08)

Option 1 **"GALLERY"** chosen 2026-07-23. Round-2 desktop comments applied
2026-08-02 (category blocks per Canva slide 8; blog A/B blocks rebuilt). Full
mobile page set (390 px) built 2026-08-03, plus an iPhone 17 Pro entry-screen
mockup.

**Waiting on:** the client's replacement font name; approved copy for the DRAFT
sections; confirmation of the round-2 desktop changes and the new mobile set.
Then Shopify implementation.

## Nguồn context

- Claude Code project memory: `~/.claude/projects/-Volumes-DATA2-1-Development-SOONGS/memory/` (4 notes — index rất mỏng, 242 ký tự)
- Working files: `/Users/annguyen/Documents/Work & Business/Freelance/SOONGS` — brief, `A GENTLE SEASON CATALOGUE.pdf` (14 sản phẩm, giá VND), `logo_soongs.ai`
- Dev folder (ổ ngoài): `/Volumes/DATA2/1-Development/SOONGS` — chỉ chứa PDF báo giá + `.claude/`; cần mount DATA2
- Obsidian: `Projects/SOONGS.md` (nguồn phong phú nhất, cập nhật 2026-08-03)
- Skill tái sử dụng: `~/.claude/skills/designing-fashion-ecommerce/SKILL.md`
