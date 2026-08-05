"Tammy & Nang" is a bilingual English/Vietnamese wedding website and RSVP app Andy built for Tammy and Nang. Personal, small and low-stakes. It is deployed at tamnangrsvp.digivisions.net. Status: PAUSED, awaiting completion and launch verification.
§
The event is Sunday 10 January 2027 at Doris Coffee, Bao Loc. This supersedes every older date and venue draft — if an earlier one surfaces anywhere, it is wrong.
§
Stack: a single-page React + TypeScript + Vite + Tailwind site, deployed as static assets plus ONE Netlify serverless function. The RSVP flow is React form -> /.netlify/functions/rsvp -> a Resend email. There is deliberately NO DATABASE. Both client and server enforce a honeypot that silently returns success for bots. No router; English and Vietnamese content sit side by side with no locale switch.
§
src/config/wedding.ts is the single source of truth for dates, venue, timeline, story, travel and activities. Change wedding facts THERE, never by hard-coding copy into a component. Keep the bilingual content pairs and the semantic Tailwind tokens intact when editing UI.
§
Open items: the real photos are not installed yet — placeholder image files remain, and their filenames are referenced by wedding.ts, so preserve the names when swapping them. The guest-coordinator phone number is still missing. The Netlify mail environment-variable name needs reconciling with the function, which accepts one primary name plus a fallback — a mismatched setting means silent delivery failure. No git repository has been initialised.
§
Standing rules: "npm run dev" does NOT serve the RSVP function — use "netlify dev" for the complete flow. There is no automated test suite; the supplied payload file is a manual fixture only. Keep API keys and mail credentials in local or Netlify environment settings, never in a note.
