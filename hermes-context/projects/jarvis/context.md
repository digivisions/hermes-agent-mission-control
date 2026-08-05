## JARVIS — personal AI voice companion

J.A.R.V.I.S.-style, but warm and cute rather than cold. Desktop-first macOS app:
local STT → streaming LLM → local TTS, plus an animated Electron "face" that
reacts in real time.

**Experience goals:** sub-1.5 s response from end of speech · a consistent
personality (warm, dry wit, direct) · cross-session memory · a face that feels
alive rather than a loading spinner.

**The bet:** fall in love with the desktop experience first. If it earns its
place on the desk, port it to a physical robot — Bambulab A1 enclosure +
ESP32-S3.

### Stack (locked)

| Layer | Choice |
|---|---|
| Runtime | Python 3.11.9 (pyenv) |
| Orchestration | pipecat-ai **0.0.36** |
| STT | faster-whisper `base.en`, local, `device=cpu` |
| LLM | **BytePlus ModelArk** via `OpenAILLMService`, streaming — switched away from Anthropic in June 2026 |
| TTS | kokoro-onnx (24000 Hz); Piper fallback in Phase 4 |
| Memory | SQLite + LanceDB (Phase 3) |
| Frontend | Electron 33, plain HTML/CSS/JS — deliberately no React |
| Comms | WebSocket on `localhost:8765` |

`StateBroadcaster` sits between the assistant aggregator and
`transport.output()`, pairing per-chunk RMS with `BotSpeakingFrame` heartbeats
for mouth sync (960 bytes / 20 ms, matching 1:1). `SentenceAggregator` is the
sentence chunker for low-latency TTS, so `KokoroTTSService` runs with
`aggregate_sentences=False`.

### Current status

- **Phase 1 COMPLETE** — audio pipeline (STT → LLM → TTS)
- **Phase 2 COMPLETE** — Electron face; 18/18 tests passing when last run
- **Immediate next step:** create `.env` with `BYTEPLUS_API_KEY` +
  `BYTEPLUS_MODEL`, then `./scripts/run.sh`
- **Then Phase 3** — memory: SQLite for facts/profile, LanceDB for semantic search
- **Phase 4 (later)** — Piper TTS fallback; wake word (openWakeWord) vs
  push-to-talk still TBD, spacebar PTT for the MVP

Last commit 2026-06-03; **8 tracked working-tree entries** — inspect before
editing or staging. The 18/18 test result has not been re-run since.

### Notes

- Plans live in the project's `plans/` folder, not only `.claude/plans/`
- System deps before `pip install`: `brew install portaudio espeak-ng`
- Secrets stay in a project-root `.env`, never committed, never copied into
  Obsidian or into HQ

## Nguồn context

- Claude Code project memory: `~/.claude/projects/-Users-annguyen-Documents-1-Development-JARVIS/memory/MEMORY.md` (2647 ký tự — vượt hạn mức 2200 của Hermes, đã chưng cất lại; khối "Critical Technical Facts" chuyển sang skill)
- Repo + CLAUDE.md: `/Users/annguyen/Documents/1-Development/JARVIS`
- Obsidian: `Projects/JARVIS.md`
