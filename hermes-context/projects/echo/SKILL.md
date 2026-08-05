---
name: echo-operations
description: Use for anything about Echo / Micro_Recorder — firmware (ESP32-C6/S3, ESP-IDF, e-ink, SD, BLE, sleep and power), the Expo React Native app, the FastAPI backend on AndyPi, sync paths and proximity relay, transcription and structuring, iOS build problems, or the current phase status.
---

# Echo (Micro_Recorder) — operations

## Components

- **Firmware** (`echo-firmware/`, ESP-IDF v5.5.1) — capture (ES8311 over I2S,
  RMS VAD, ADPCM WAV), an append-only note ledger with ULID + CRC-32 journal,
  e-ink UI with a two-button grammar, NimBLE peripheral (contract C3), Wi-Fi
  sync client (contract C1), a `burst_sync` SoftAP server for proximity sync,
  and power management. **The host simulator is the gate:** `cd sim && make run`.
  Firmware is ~1.74 MB with only ~4% app-partition headroom — watch it.
  `echo-firmware-c6/` is the frozen C6 archive; `echo-firmware/` moves forward
  as the S3-only tree.
- **App** (`echo-app/`, Expo SDK 57 / RN 0.86 / React 19, expo-router, TS
  strict) — reads Supabase directly (anon key + RLS), TanStack Query + realtime,
  email-OTP auth, a `device-link/` seam that swaps mock for real BLE, the
  proximity relay, a local-first audio cache with ADPCM→PCM decode, and two
  native modules: `echo-wifi` (NEHotspotConfiguration) and `echo-secure-backup`
  (CryptoKit + Keychain).
- **Backend** (`echo-backend/`, FastAPI + Redis + RQ worker + Postgres/pgvector
  on hosted Supabase) — `/v1/ingest` (3-call, CRC, resumable), `/v1/pair`
  (Supabase-JWT-authed), `/v1/notes/updates`, `/v1/ask` (RAG). STT is Groq
  Whisper; structuring is Gemini with Groq failover; embeddings are 768-dim.
  Keyless testing via `USE_FAKE_PROVIDERS=1`. Deployed on the AndyPi homelab at
  `/srv/echo-backend`, public at `https://echo.digivisions.net` through a
  Cloudflare Tunnel.
- **Site** (`echo-site/`) — static landing page on Netlify
  (`meet-echo.netlify.app`), waitlist on Netlify Forms.

## How they connect

The phone pairs over BLE (contract C3: read the pair code, write the token and
name, trigger a burst) and binds device→account in Supabase. The device uploads
over contract C1 either directly on home Wi-Fi, or through the phone relay: the
phone joins the Echo's SoftAP at `192.168.4.1`, pulls Range-capable audio with
the device bearer token, leaves the AP, and uploads. The worker processes; the
app sees notes through Supabase RLS + realtime.

## Key decisions — do not relitigate

- **Backend first**, before BLE pairing and the app. Nothing to sync into otherwise.
- **React Native / Expo, not Flutter.** Older docs saying Flutter are wrong.
  iOS-first, Vietnamese-first strings with EN default in dev.
- **Two sync paths on purpose.** Proximity means the Echo never touches the
  internet and stores only one SSID; it has no cellular.
- **Local-first audio.** The phone's cache is the primary copy; the cloud is a
  transient processor that discards audio after STT. Eviction never deletes an
  un-backed-up primary recording, and device ack stays cloud-CRC-gated.
- **Supabase-direct pairing** (client mints the token, stores a sha256 hash
  under RLS), with `/v1/pair` as fallback taking identity **only** from the
  verified Supabase JWT. Never reintroduce the old `user_email` body field —
  it was an auth-bypass hole.
- **Language is detected, never forced.** Forcing `language="vi"` made Whisper
  hallucinate fluent Vietnamese out of English speech. Same rule in the
  structurer prompt.
- Deliberate UI deviations from the design doc: 22 px body text (not 16), full
  e-ink refresh on screen change, 250 ms double-tap gap (not 350), no ticking
  counters. **Do not "restore" the spec values.**

## Firmware gotchas

- E-paper and SD share SPI2 and concurrent transactions panic. Everything must
  take `echo_board_spi2_lock/unlock`. Hold the lock only around card I/O —
  never across network or TLS, and use one TLS session, not a handshake per
  32 KB chunk.
- **ONE radio, ONE owner.** Proximity SoftAP plus cloud sync simultaneously
  hard-freezes Wi-Fi mid channel-switch and needs a reflash. Interlocked
  2026-07-13 — keep it that way.
- A failed SD write once silently deleted the whole take behind a normal-looking
  UI. That, not battery lockout, was the real "recording dropped" cause.
  "SD FULL" usually means the 64-note ledger window, not the card — and it was
  the screen shown for four unrelated faults, none of them named, until 2026-08-02.
- Light sleep kills the C6 USB console; recover with BOOT+RST. FatFs needs LFN
  enabled or long note filenames can never be created. `esp_codec_dev` wants the
  ES8311's 8-bit address (0x30) — and an I2C ACK is never identification.
- Never do real work inside a NimBLE GATT callback (~4 KB stack): set a flag and
  act on the main loop. Doing it inline fails silently — no AP, no error.
- A "success" log from a function that cannot fail is worthless. Log credential
  fingerprints (length + prefix) on both sides instead.
- Buttons need a **firm ~1 s press** to wake. A light tap does nothing — this
  retroactively explains every "the buttons don't work" report since 2026-07-30.

## Debugging sync — the trap

**A proximity sync cannot be observed over USB. Attaching the cable is what
breaks it.** Hours were lost reading captures of the healthy path and drawing
wrong conclusions. Debug on battery and read the device's own counters and logs.

The slow-sync symptom resolved on 2026-08-02/03 was a socket leak (a failed send
left the socket open and hung the phone ~20 s per attempt) compounded by the app
spending five stall timeouts on a transfer that never started. A 58-note backlog
then drained to `notes: 58 (0 unsynced)` on battery.

## Phase 5 — sleep, PARKED 2026-08-03

Deep sleep behaves like **power loss**: the wake ring read `1 of 1 COLD` right
after a successful revive with no reflash, where a real wake would say `PWR`.
This blocks REC-wake-to-record (impossible by construction without a latch) and
makes the ≤40 µA target meaningless.

- The evidence and next step are recorded in the firmware planning notes.
- The ext1 config was verified correct against IDF 5.5 source — **do not
  re-audit it.**
- Cheapest next step needs no code: a multimeter on the pack during "sleep".
  Microamps ⇒ it is sleeping and the ring misleads. Zero ⇒ it is actually off.

## BLE and iOS build gotchas

- Scan with **no** service filter and match by name/UUID in JS — iOS Core
  Bluetooth can miss 128-bit UUID scan filters.
- Deep sleep drops advertising; pairing needs the firmware pairing mode that
  holds the device awake. USB attachment does not prevent sleep.
- Pairing ECHO in iOS **Settings > Bluetooth** hides it from the app — the
  system holds the link and advertising stops. Users must Forget it there.
- `BleManager` must be a singleton; one per render cancels in-flight operations.
- **A space in the project path breaks Expo's generated build scripts** — one
  fails silently and ships an app that crashes on launch. Hence the underscore
  in `Micro_Recorder` and the space-free build copy.
- `expo prebuild` wipes the signing team, and two Apple teams share the same
  name — pin `ios.appleTeamId` in `app.json` (the one carrying the Hotspot
  entitlement). Don't run prebuild or wipe DerivedData without a native change.
- The iOS Wi-Fi join prompt is unavoidable via NEHotspotConfiguration.
  AccessorySetupKit is the only silent path, and its plist key is
  `NSAccessorySetupKitSupports` — a wrong name is a `fatalError` on the Device
  tab. `removeConfiguration()` is a silent no-op without the entitlement: always
  *prove* backend reachability after leaving the Echo's AP, and give every fetch
  a timeout.

## Backend / ops gotchas

- `tools/ingest_stub.py` also listens on :8000 and happily fakes success — the
  device says "all synced" while nothing reaches Postgres. Always check what
  holds the port. Likewise never run two RQ workers: a leftover one steals jobs
  while the Pi idles.
- Local sync needs four things up: API on 0.0.0.0, Redis, the RQ worker, and the
  provider extras installed. Missing any one looks like a device bug.
- The Supabase direct DB host is IPv6-only — both the Mac worker and the Pi need
  the IPv4 session-pooler `DATABASE_URL`. The deploy script backs up the Pi's
  `.env` for exactly this reason.
- Gemini's free tier is 20 requests/day and **will** exhaust during testing.
  Structuring fails over to Groq and parks notes as `quota_deferred`, not `failed`.
- Behind the Cloudflare tunnel, `request.client.host` is always cloudflared —
  use the rate-limiter's client-IP helper with proxy headers trusted in prod.
- Delete-after-STT nearly destroyed a legacy note's only copy (an 85-minute
  meeting). The worker now nulls `audio_path` only when it actually removed a
  file it owns. **Never loosen this.** The plaintext legacy audio bucket stays
  until phone backfill plus encrypted backup fully cover it.

## Verified milestones (on real hardware unless noted)

Bring-up (panel, SD, RTC, battery ADC) and capture→ledger→playback, 2026-07-10 ·
sync of 26 notes with CRC match and resume, 2026-07-11 (bench) · backend Phase A
on real Supabase + Groq + Gemini, 2026-07-11 · deployed backend on AndyPi,
2026-07-11/12 · BLE pairing on a physical iPhone with token handoff persisted to
NVS, 2026-07-12 · full speak→sync→transcript→structured note loop, 2026-07-12 ·
proximity sync end-to-end with the Echo never touching the internet, 2026-07-12 ·
landing page live, 2026-07-18 · local-first audio Phases 1–2 with opt-in
AES-256-GCM encrypted cloud backup, 2026-07-19.

## Open / not done

Backend P3 (JWT pairing + PoP + token revoke — required before pilot users), P6
(Opus/retention), P7 (Sentry, cost alerts) · deep-sleep current measurement ·
iOS silent Wi-Fi auto-join, blocked on Apple paid-membership signing ·
ADPCM playback confirmation on a real device · restore-to-new-phone and iCloud
Keychain sync, needing a second Apple device · landing-page waitlist webhook ·
the pairing spike's token RNG is still `Math.random` and needs a CSPRNG.

## Reading more

Specs live in `Project Echo Plan/` — a strict cleanroom source; nothing outside
it is opened. Secrets are never in the repo or in this file. The deep per-session
notes live in Claude Code project memory on Andy's Mac. If a question needs them,
ask Andy or route it through the Claude Code offload.
