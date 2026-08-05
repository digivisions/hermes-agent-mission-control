---
name: jarvis-operations
description: Use for anything about JARVIS, the personal macOS voice companion — the pipecat audio pipeline, faster-whisper STT, BytePlus LLM wiring, kokoro TTS, the Electron face and its state machine, WebSocket/state broadcasting, running or testing the app, or the Phase 3 memory design.
---

# JARVIS — operations

## Layout

- `backend/` — the Python pipeline: `main.py`, `pipeline.py`, `personality.py`,
  `tts_kokoro.py`, `ws_server.py`, `state_broadcaster.py`, `config.py`
- `frontend/` — the Electron 33 face: `main.js`, `preload.js`, `renderer/`
- `plans/` — phase plans live in the **project** folder, not only in
  `.claude/plans/`. This is Andy's stated preference.
- `scripts/run.sh` — dual-launch (backend + Electron); exports `.env` via `set -a`
- `tests/`, `pytest.ini`, `requirements.txt`, `data/`, `models/`

## Running it

1. Create `.env` in the project root with **`BYTEPLUS_API_KEY`** and
   **`BYTEPLUS_MODEL`**. Not Anthropic — the stack switched in June 2026.
2. `./scripts/run.sh` — launches the backend and the Electron face together.
3. `pytest` — should be 18/18.

System dependencies must be installed **before** `pip install`:
`brew install portaudio espeak-ng`.

## The locked stack, and why each piece is pinned

| Layer | Choice | Constraint |
|---|---|---|
| Runtime | Python 3.11.9 (pyenv) | |
| Orchestration | pipecat-ai **0.0.36** | frame API differs from later versions — see below |
| STT | faster-whisper `base.en`, local | `WHISPER_DEVICE` must be `"cpu"` on Apple Silicon — CTranslate2 does not use mps |
| LLM | BytePlus ModelArk via `OpenAILLMService`, streaming | OpenAI-compatible; switched away from Anthropic June 2026 |
| TTS | kokoro-onnx (Piper fallback in Phase 4) | outputs **24000 Hz** — `audio_out_sample_rate` in `TransportParams` must be 24000 |
| Frontend | Electron 33, plain HTML/CSS/JS | no React, deliberately |
| Comms | WebSocket on `localhost:8765` | `ws_server` replays the last state to new connections |

## pipecat 0.0.36 frame quirks — the biggest time sink

- `TTSAudioRawFrame` and `BotStartedSpeakingFrame` **do not exist** in this
  version. They arrived later. Code or docs referencing them are for a different
  pipecat.
- Face states are driven by `UserStartedSpeakingFrame` /
  `UserStoppedSpeakingFrame` (downstream) plus `BotSpeakingFrame` (upstream
  heartbeat, roughly 50/s during real playback).
- **`TTSStoppedFrame` fires at synthesis end, NOT playback end.** Never use it
  for the speaking→idle transition — the face will drop to idle while the voice
  is still talking.
- `FrameProcessor.__init__` calls `asyncio.get_running_loop()`, so processors
  must be constructed **inside an async context** — including in tests.

## Audio and mouth sync

`StateBroadcaster` sits between the assistant aggregator and
`transport.output()`. It pairs per-chunk RMS with the `BotSpeakingFrame`
heartbeats; chunks match 1:1 at 960 bytes / 20 ms, which is what makes mouth
movement track the actual voice rather than a timer.

`SentenceAggregator` is the sentence chunker that keeps TTS latency low, and it
sits upstream — so `KokoroTTSService` must run with
`aggregate_sentences=False`, or sentences get chunked twice.

`LocalAudioTransport` uses **pyaudio**, not sounddevice.

## Config flow

`.env` → `run.sh` (`set -a; source .env`) → environment variables → Electron
main → renderer via the preload `contextBridge` (`contextIsolation` is on). The
renderer receives `WS_PORT` this way; it never reads `.env` directly.

## Phases

- **Phase 1 — COMPLETE.** Audio pipeline: STT → LLM → TTS.
- **Phase 2 — COMPLETE.** Electron face; 18/18 tests at the time.
- **Phase 3 — next.** Memory: SQLite for structured facts and profile, LanceDB
  for semantic retrieval. Check `plans/` for the phase plan before starting.
- **Phase 4 — later.** Piper TTS fallback; wake word (openWakeWord) versus
  push-to-talk is still undecided, with spacebar PTT as the MVP.

## Working preferences

Andy is technical and prefers direct communication — no hand-holding. Plans go
in the project `plans/` folder. Proceed with auto-accepted edits when he says so.

## Reading more

`CLAUDE.md` in the project root is the single source of truth and lives on
Andy's Mac, not in this container. Secrets are in a project-root `.env`, never
committed and never quoted. If a question needs either, ask Andy or route it
through the Claude Code offload.
