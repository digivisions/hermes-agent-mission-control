JARVIS is Andy's personal AI voice companion — a J.A.R.V.I.S.-style assistant, but warm and cute rather than cold. Desktop-first macOS app: local speech-to-text, a streaming LLM, local text-to-speech, and an animated Electron "face" that reacts in real time. Experience goals: under 1.5 seconds from end of speech, a consistent personality (warm, dry wit, direct), cross-session memory, and a face that feels alive rather than a loading spinner.
§
The bet: fall in love with the desktop experience first. If it earns its place on the desk, port it to a physical robot (a Bambulab A1 enclosure plus an ESP32-S3).
§
The stack is LOCKED — do not propose alternatives without a reason. Backend Python 3.11.9 under pyenv, orchestrated by pipecat-ai 0.0.36. STT is faster-whisper (base.en) running locally on CPU. The LLM is BytePlus ModelArk through an OpenAI-compatible service, streaming — it was switched AWAY FROM ANTHROPIC in June 2026, so never suggest an Anthropic key here. TTS is kokoro-onnx, with Piper as a later fallback. The frontend is Electron 33 with plain HTML/CSS/JS, deliberately no React. They talk over a WebSocket on localhost:8765.
§
Current phase: Phase 1 (audio pipeline) and Phase 2 (Electron face) are COMPLETE, 18/18 tests passing when last run. The immediate blocker is a local .env carrying BYTEPLUS_API_KEY and BYTEPLUS_MODEL; then scripts/run.sh launches backend and face together. Phase 3 is memory — SQLite for facts and profile, LanceDB for semantic retrieval. Phase 4 is a Piper fallback plus a wake-word decision (spacebar push-to-talk for the MVP).
§
Standing rule: the last commit was 2026-06-03 and there are 8 tracked working-tree entries — inspect them before editing or staging anything. Framework and audio detail: the jarvis-operations skill.
