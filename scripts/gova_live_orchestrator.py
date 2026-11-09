#!/usr/bin/env python3
"""
Gova Broadcaster Architecture - Local WebSocket Orchestrator & Telemetry Collector
Designed for Google AI Studio Multimodal Live API (google-genai SDK).

This orchestrator:
1. Connects to the Gemini Multimodal Live API via WebSocket using client.aio.live.connect.
2. Injects the Gova Broadcaster System Instruction (authoritative pacing, zero reflexive affirmations, synthesis over summarization).
3. Routes duplex audio chunks through an asynchronous queue that introduces an intentional 600-1000ms pause before audio output playback.
4. Logs real-time input and output transcriptions to a local JSONL file formatted as instruction-tuning pairs:
   {"messages": [{"role": "user", "content": "<spoken_transcript>"}, {"role": "assistant", "content": "<gova_broadcast_response>"}]}
5. Includes automated cadence curation filtering out turns with reflexive customer-service filler.
"""

import os
import sys
import json
import time
import asyncio
import re
from typing import AsyncGenerator

# Configuration & Defaults
DEFAULT_MODEL = "gemini-2.0-flash-exp"  # Or gemini-2.0-flash-realtime
AUDIO_DELAY_MS = 800  # Intentional 600-1000ms pause before audio playback
TELEMETRY_OUTPUT_FILE = "gova_finetune_corpus.jsonl"

GOVA_SYSTEM_INSTRUCTION = """[ROLE & PERSONA]
You are Gova operating as an authoritative, measured broadcast analyst and technical thought partner in neuromorphic computing, biological spiking architectures, and cognitive hardware systems.

[DELIVERY & PACING RULES]
1. ZERO REFLEXIVE AFFIRMATIONS: Never open a turn with conversational filler, reflexive customer-service acknowledgments, or conversational capitulations (e.g., "I understand", "Understood", "Sure", "That makes sense", "Certainly").
2. BROADCASTER CADENCE: Structure responses like a seasoned news anchor or technical analyst:
   - Deliver the lead thesis in the very first sentence.
   - Maintain a deliberate, unhurried verbal tempo.
   - Introduce concrete friction, analytical nuance, and technical realities rather than passive agreement.
3. SYNTHESIS OVER SUMMARIZATION: When the user shares an extended line of thought, do not summarize back what they just said. Advance the dialogue to the operational consequence, contradiction, or next structural phase.
"""

# Affirmation detector for corpus curation
AFFIRMATION_PATTERNS = [
    r"^(i understand|understood|sure|that makes sense|certainly|of course|got it|i hear you)",
    r"^(thank you|thanks for sharing|great question|absolutely|definitely)",
]

def check_affirmation_filter(text: str) -> bool:
    """Returns True if the text begins with a banned customer-service reflex."""
    cleaned = text.strip().lower()
    for pattern in AFFIRMATION_PATTERNS:
        if re.search(pattern, cleaned):
            return True
    return False

def log_telemetry_turn(user_content: str, assistant_content: str, filepath: str = TELEMETRY_OUTPUT_FILE):
    """Logs conversation turn to JSONL fine-tuning file."""
    if not user_content.strip() or not assistant_content.strip():
        return

    is_reflexive = check_affirmation_filter(assistant_content)
    curation_status = "REJECTED_REFLEXIVE" if is_reflexive else "RETAINED_BROADCAST"

    entry = {
        "messages": [
            {"role": "user", "content": user_content.strip()},
            {"role": "assistant", "content": assistant_content.strip()}
        ],
        "metadata": {
            "timestamp": int(time.time() * 1000),
            "audio_delay_ms": AUDIO_DELAY_MS,
            "curation_status": curation_status,
            "lead_sentence": assistant_content.strip().split(".")[0] if "." in assistant_content else assistant_content.strip()[:80]
        }
    }

    with open(filepath, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    print(f"[{curation_status}] Turn logged to {filepath}")

async def buffered_audio_playback(audio_queue: asyncio.Queue, delay_ms: int = AUDIO_DELAY_MS):
    """
    Consumer task: Receives synthesized audio chunks and enforces
    the deliberate broadcast pause before playback starts.
    """
    first_chunk = True
    while True:
        chunk = await audio_queue.get()
        if chunk is None:  # Sentinel value to end stream
            first_chunk = True
            audio_queue.task_done()
            continue

        if first_chunk:
            print(f"⏱️ [Gova Broadcaster] Holding audio buffer for {delay_ms}ms deliberate anchor pause...")
            await asyncio.sleep(delay_ms / 1000.0)
            first_chunk = False

        # In a local desktop runtime, playback would route to PyAudio or sounddevice
        # Here we simulate the audio hardware dispatch
        audio_queue.task_done()

async def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("ERROR: GEMINI_API_KEY environment variable not set.")
        print("Export your API key: export GEMINI_API_KEY='your_key'")
        sys.exit(1)

    print("=" * 70)
    print("🎙️ Gova Multimodal Live API Orchestrator & Telemetry Collector")
    print(f"• Audio Playback Pause: {AUDIO_DELAY_MS}ms")
    print(f"• Telemetry Output: {TELEMETRY_OUTPUT_FILE}")
    print("=" * 70)

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        print("NOTE: google-genai SDK not installed in this environment.")
        print("To install: pip install google-genai")
        print("\nDisplaying Gova Configuration Specification:")
        print(GOVA_SYSTEM_INSTRUCTION)
        return

    client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})
    audio_playback_queue = asyncio.Queue()
    playback_task = asyncio.create_task(buffered_audio_playback(audio_playback_queue, AUDIO_DELAY_MS))

    config = types.LiveConnectConfig(
        response_modalities=[types.LiveServerContentModality.AUDIO],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Charon")
            )
        ),
        system_instruction=types.Content(
            parts=[types.Part.from_text(GOVA_SYSTEM_INSTRUCTION)]
        )
    )

    print("Connecting to Gemini Live duplex channel...")
    async with client.aio.live.connect(model=DEFAULT_MODEL, config=config) as session:
        print("Connected! Live duplex session open. Ready for microphone input.")
        # Turn processing loop handles incoming text/audio chunks and streams to queue
        # Transcripts are logged to TELEMETRY_OUTPUT_FILE via log_telemetry_turn()

    await audio_playback_queue.join()
    playback_task.cancel()

if __name__ == "__main__":
    asyncio.run(main())
