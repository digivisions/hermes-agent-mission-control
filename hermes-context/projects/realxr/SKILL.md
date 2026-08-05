---
name: realxr-operations
description: Use for anything about RealXR — generating or briefing product visuals and reels, the canonical talent character and her reference sheets, the XR glasses prop design, the 15-second TVC script, the treatment deck, or the storyboard.
---

# RealXR — operations

## What RealXR is

Digital Visions' own premium, character-driven XR experience product. It is
**sold through video**: reels and scripted CGI/VFX scenes, mostly limbo-space
product shots of the XR glasses. There is no application codebase — the project
is, at this stage, a visual and narrative asset library plus scripts.

## The one rule

**Never generate a new face.** RealXR has exactly one canonical talent and every
visual must use her: a sharp-featured Vietnamese woman in the Veronica Ngo
mould, in a gunmetal coat with a mandarin collar.

Anchor every generation or brief to these sheets:

| Asset | Role |
|---|---|
| `CHARACTER_REFERENCE.png` | **the locked reference** — start here |
| `Talent_Turnaround_Sheet.png` | multi-angle consistency |
| `Talent_Expression_Sheet.png` | expression range |
| `Talent_Posing_Sheet.png` | posing range |
| `Talent_FullBody_SteelCoatV2.png` | full body, current coat |
| `Talent_FullBody_FinalV1/V2.png` | full-body finals |
| `_ref_talent.jpg` | raw reference photography |

**Rejected casting directions — do not reintroduce:**
`Talent_Option1_JungHoyeon_Style.png` and `Talent_Option3_EdgyKpop_Style.png`
were explored and not chosen. `Talent_Option2_VeronicaNgo_Style.png` is the
direction that won and became the canonical character.

## The prop

| Asset | Role |
|---|---|
| `Prop_XR_Glasses_DesignV2.png` | **current design — V2 supersedes V1** |
| `Prop_RealXR_Glasses_DetailSheet.png` | detail/close-up reference |
| `Prop_XR_Glasses_Design.png` | V1, superseded |
| `RealXR_Prop_Cyberpunk.png` | prop in the cyberpunk treatment |
| `_ref_glasses.jpg` | raw reference photography |

Always brief against **V2**. If a shot shows V1 geometry, it is wrong.

## Environment and mood

`Scene_Cyberpunk_City.png` carries the cyberpunk city environment direction, and
`RealXR_Prop_Cyberpunk.png` shows the prop within it. The default product
treatment, though, is **limbo space** — a clean, contextless studio void — with
the cyberpunk scene as a scripted contrast, not the everyday look.

## Scripts and decks

- `RealXR_TVC_Script_15s.md` — the 15-second TVC script
- `treatment_deck.html` — the treatment deck
- `storyboard/` — the storyboard
- Product-pitch documents and video scripts sit at the root of the working
  directory
- `_gen/` accumulates generated frames — working output, not approved assets;
  `hf_*.png` files at the root are generation artefacts, not deliverables

## Current phase (2026-08)

Script and promo video production. The 15-second TVC script, the treatment deck
and the storyboard all exist. Nothing has shipped as a finished commercial.

## What does not exist — say so rather than inventing it

RealXR has **no code repository, no `CLAUDE.md`, and no Claude Code project
memory**. This skill and the asset sheets are the entire recorded context. If a
question needs detail that is not here, say it is not recorded and ask Andy —
do not describe a file, a spec or a decision that has never been written down.

The asset files themselves live on Andy's Mac and cannot be opened from this
container. Route anything that needs to read them through Andy or the Claude
Code offload.
