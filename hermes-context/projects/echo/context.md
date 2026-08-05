## Micro-Recorder (Echo)

Digital Visions' own hardware product: a pocket voice recorder. An ESP32 board
with a 1.54" e-ink screen, two-button UI, ES8311 codec, microSD and BLE/Wi-Fi.
Press, speak, carry on — the device stores the recording **first**, then syncs
it; the cloud transcribes and structures it into a titled, tagged note that
appears in the app.

Private monorepo: `github.com/digivisions/echo` (single `.git` at the project
root). Strict cleanroom build against the specs in `Project Echo Plan/`.

### Components

| Part | What it is |
|---|---|
| `echo-firmware/` | ESP-IDF 5.5.1. Capture (ES8311/I2S, RMS VAD, ADPCM WAV), append-only ULID+CRC-32 note ledger, e-ink two-button UI, NimBLE peripheral (C3), Wi-Fi sync client (C1), `burst_sync` SoftAP, power management. Gate = host simulator (`cd sim && make run`). |
| `echo-app/` | Expo SDK 57 / RN 0.86 / React 19. Reads Supabase directly (anon key + RLS), TanStack Query + realtime, email-OTP auth, `device-link/` mock↔real BLE seam, proximity relay, local-first audio cache, native `echo-wifi` + `echo-secure-backup` modules. |
| `echo-backend/` | FastAPI + Redis + RQ worker + Postgres/pgvector on Supabase. `/v1/ingest`, `/v1/pair`, `/v1/notes/updates`, `/v1/ask` (RAG). STT = Groq Whisper; structuring = Gemini with Groq failover; 768-dim embeddings. Runs on AndyPi, public at echo.digivisions.net via Cloudflare Tunnel. |
| `echo-site/` | Static landing page on Netlify — meet-echo.netlify.app, waitlist on Netlify Forms. |

### Two sync paths, by design

Direct over home Wi-Fi, **or** proximity relay: the phone joins the Echo's
SoftAP at `192.168.4.1`, pulls the audio with the device bearer token, leaves
the AP and uploads. Proximity means the Echo never needs the user's Wi-Fi
password or the internet — it stores one SSID and has no cellular.

Audio is **local-first**: the phone's cache is the primary copy; the cloud is a
transient processor that discards audio after transcription.

### Standing rules

- **A proximity sync cannot be observed over USB** — attaching the cable is what
  breaks it. Debug on battery, read the device's own counters.
- **ONE radio, ONE owner** — SoftAP plus cloud sync at once hard-freezes Wi-Fi
  and needs a reflash.
- Buttons need a **firm ~1 s press**, not a tap.
- Never claim a milestone is hardware-verified unless the record says so.

### Current phase (2026-08)

Engineering direction is the **ESP32-S3 firmware port**; `echo-firmware-c6/` is
the frozen C6 archive and `echo-firmware/` moves forward as the S3-only tree.
Phase 3 board port and Phase 4 audio bring-up are recorded complete.

- **Proximity sync: resolved** (2026-08-02/03). A 58-note backlog drained to
  `0 unsynced` on battery. Root cause was an Aug-1 socket leak compounded by the
  app spending five stall timeouts on a transfer that never started.
- **Phase 5 (sleep): PARKED.** Deep sleep behaves like power loss — the wake ring
  reads `COLD` after a revive with no reflash, where a real wake would say `PWR`.
  This blocks REC-wake-to-record and makes the ≤40 µA target meaningless. The
  ext1 config is verified correct against IDF 5.5 source — do not re-audit it.
  Cheapest next step needs no code: a multimeter on the pack during "sleep".
- **Phase 6** bench measurement is next and needs real instruments (PPK2).

### Open / not done

Backend P3 (JWT pairing + PoP + revoke — required before pilot users), P6, P7 ·
deep-sleep current measurement · iOS silent Wi-Fi auto-join (blocked on Apple
paid-membership signing; AccessorySetupKit is the long-term path) · ADPCM
playback confirmation on a real device · restore-to-new-phone verification
(needs a second Apple device) · landing-page waitlist webhook · pairing-spike
token RNG still `Math.random`.

## Nguồn context

- Claude Code project memory (nhiều nhất): `~/.claude/projects/-Users-annguyen-Documents-1-Development-Micro-Recorder/memory/` (46 notes) và `…-Users-annguyen-1-Development-Micro-Recorder/memory/` (10 notes, mới hơn)
- Repo canonical: `/Users/annguyen/1-Development/Micro_Recorder` — **không phải** bản `Documents/1-Development/Micro_Recorder` (đã đóng băng, chỉ đọc)
- Obsidian: `Projects/Micro-Recorder (Echo).md`
- Specs: `Project Echo Plan/` trong repo (01 firmware, 04 device UX, 06 backend, 08 app, 09 C3 BLE contract)
- Secrets: `echo-backend/.env` (Mac), `/srv/echo-backend/.env` (Pi) — chỉ tham chiếu, không sao chép
