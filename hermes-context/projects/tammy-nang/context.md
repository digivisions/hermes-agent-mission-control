## Tammy & Nang — wedding site + RSVP

Bilingual English/Vietnamese wedding website and RSVP application built for
Tammy and Nang. Personal, small, low-stakes. Deployed at
`tamnangrsvp.digivisions.net`.

**Status: PAUSED** — awaiting completion and launch verification. Deployment
state was not verified at the last check (2026-07-28).

> Per Spec I §11, this project deliberately has **no `SKILL.md`** — there isn't
> enough operational substance to justify one. `MEMORY.md` carries everything
> the agent needs.

### The event

**Sunday, 10 January 2027 at Doris Coffee, Bảo Lộc.** This supersedes every
older date and venue draft.

### Stack

Single-page React + TypeScript + Vite + Tailwind, deployed as static assets plus
**one** Netlify serverless function. RSVP flow:

```
React form → /.netlify/functions/rsvp → Resend email
```

No database, deliberately. No router. English and Vietnamese content sit side by
side — there is no locale switch. Client and server both enforce a honeypot that
silently returns success for bots.

### Decisions

- All guest-facing content stays bilingual and visible side-by-side.
- **`src/config/wedding.ts` is the single source of truth** for dates, venue,
  timeline, story, travel and activities. Change wedding facts there, never by
  hard-coding component copy.
- The RSVP system stays database-free: Netlify function plus email delivery.

### Open items

1. Real photos are not installed — placeholders remain. **Preserve the
   filenames** `wedding.ts` references when swapping them in.
2. The guest-coordinator phone number is still a placeholder.
3. Reconcile the Netlify mail environment-variable name with the function (it
   accepts one primary name plus a fallback — a mismatch means silent delivery
   failure).
4. No git repository is initialised. Do that before further significant work if
   versioned history is wanted.
5. Confirm whether the project should resume, and verify the Netlify deployment
   state.

### Gotchas

- **`npm run dev` does not serve the RSVP function.** Use `netlify dev` for the
  complete end-to-end flow.
- There is no automated test suite; the supplied payload file is a manual
  fixture only.
- Real code lives in `tamnang-wedding-rsvp/`; the parent folder also contains
  throwaway archives — change into the subfolder before every command.
- Keep API keys and mail-service credentials in local/Netlify environment
  settings only.

## Nguồn context

- Repo: `/Users/annguyen/Documents/1-Development/Tammy&Nang/tamnang-wedding-rsvp` (chưa init git)
- Project instructions: `/Users/annguyen/Documents/1-Development/Tammy&Nang/CLAUDE.md`
- Nội dung: `tamnang-wedding-rsvp/src/config/wedding.ts` · Function: `tamnang-wedding-rsvp/netlify/functions/rsvp.ts`
- Obsidian: `Projects/Tammy & Nang.md` — **nguồn duy nhất** cho project này, không có Claude Code project memory
