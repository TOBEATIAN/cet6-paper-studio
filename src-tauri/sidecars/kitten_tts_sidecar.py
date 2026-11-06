#!/usr/bin/env python3
"""One-shot Kitten TTS sidecar used by the Tauri backend.

The app writes a request JSON containing all missing sentence segments. This
process loads the ONNX model once, synthesizes each WAV, and writes a small JSON
result to stdout. Keeping model inference out of the main Tauri process also
isolates the GPL-3.0 eSpeak NG runtime.
"""

from __future__ import annotations

import argparse
import contextlib
import ctypes
import json
import os
import shutil
import sys
import time
from pathlib import Path

SAMPLE_RATE = 24_000
SIDECAR_VERSION = 1
ESPEAK_CACHE_VERSION = "espeak-ng-data-2026-10"


def fail(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}), flush=True)
    raise SystemExit(1)


def write_probe(directory: Path) -> bool:
    try:
        directory.mkdir(parents=True, exist_ok=True)
        probe = directory / ".write-test"
        probe.write_text("ok", encoding="ascii")
        probe.unlink()
        return True
    except OSError:
        return False


def short_path(path: Path) -> str | None:
    if os.name != "nt":
        return None
    buffer = ctypes.create_unicode_buffer(32_768)
    result = ctypes.windll.kernel32.GetShortPathNameW(
        str(path), buffer, len(buffer)
    )
    return buffer.value if result else None


def ascii_runtime_root() -> Path:
    candidates: list[Path] = []
    configured = os.environ.get("CET6_TTS_ASCII_ROOT")
    if configured:
        candidates.append(Path(configured))
    public_root = Path(os.environ.get("PUBLIC", r"C:\Users\Public"))
    candidates.append(public_root / "CET6PaperStudio" / "tts-runtime")
    candidates.append(Path(r"C:\Windows\Temp") / "CET6PaperStudio" / "tts-runtime")

    for candidate in candidates:
        if str(candidate).isascii() and write_probe(candidate):
            return candidate

    temp_root = Path(os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp")
    if str(temp_root).isascii() and write_probe(temp_root):
        return temp_root / "CET6PaperStudio" / "tts-runtime"

    shortened = short_path(temp_root)
    if shortened and shortened.isascii():
        candidate = Path(shortened) / "CET6PaperStudio" / "tts-runtime"
        if write_probe(candidate):
            return candidate
    raise RuntimeError("no writable ASCII runtime directory is available")


def prepare_espeak_data(espeakng_loader) -> None:
    destination = ascii_runtime_root() / ESPEAK_CACHE_VERSION
    marker = destination / ".complete"
    if not marker.exists():
        source = Path(espeakng_loader.get_data_path())
        temporary = destination.with_suffix(".tmp")
        shutil.rmtree(temporary, ignore_errors=True)
        temporary.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, temporary)
        (temporary / ".complete").write_text("ok", encoding="ascii")
        shutil.rmtree(destination, ignore_errors=True)
        temporary.rename(destination)
    os.environ["ESPEAK_DATA_PATH"] = str(destination)


def valid_existing_wav(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 128


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--model-dir", required=True)
    args = parser.parse_args()

    request_path = Path(args.request).resolve()
    model_dir = Path(args.model_dir).resolve()
    if not (model_dir / "config.json").is_file():
        fail(f"Kitten model directory is incomplete: {model_dir}")

    payload = json.loads(request_path.read_text(encoding="utf-8"))
    segments = payload.get("segments")
    speed = float(payload.get("speed", 1.0))
    if not isinstance(segments, list) or not segments:
        fail("Kitten request contains no missing segments")

    wanted: list[tuple[dict, Path]] = []
    for segment in segments:
        text = str(segment.get("text", "")).strip()
        voice = str(segment.get("voice", "")).strip()
        output = Path(str(segment.get("outputPath", ""))).resolve()
        if not text or not voice or not output.is_absolute():
            fail("Kitten request contains an invalid segment")
        if len(text) > 500:
            fail(f"Kitten segment exceeds 500 characters: {segment.get('id')}")
        if not valid_existing_wav(output):
            wanted.append((segment, output))

    if not wanted:
        print(
            json.dumps(
                {
                    "ok": True,
                    "version": SIDECAR_VERSION,
                    "generated": 0,
                    "skipped": len(segments),
                    "elapsedSeconds": 0,
                }
            ),
            flush=True,
        )
        return

    import espeakng_loader

    started = time.perf_counter()
    with contextlib.redirect_stdout(sys.stderr):
        # kittenml configures ESPEAK_DATA_PATH during import. Override it after
        # import so a Chinese installation directory cannot break phonemization.
        from kittenml import KittenTTS

        prepare_espeak_data(espeakng_loader)
        model = KittenTTS(str(model_dir), backend="cpu")

        import soundfile as sf

        for segment, output in wanted:
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_suffix(".wav.part")
            audio = model.generate(
                str(segment["text"]),
                voice=str(segment["voice"]),
                speed=speed,
                clean_text=True,
            )
            sf.write(
                temporary,
                audio,
                SAMPLE_RATE,
                subtype="PCM_16",
                format="WAV",
            )
            if temporary.stat().st_size <= 128:
                temporary.unlink(missing_ok=True)
                raise RuntimeError(f"Kitten produced empty audio: {segment.get('id')}")
            temporary.replace(output)

    print(
        json.dumps(
            {
                "ok": True,
                "version": SIDECAR_VERSION,
                "generated": len(wanted),
                "skipped": len(segments) - len(wanted),
                "elapsedSeconds": round(time.perf_counter() - started, 3),
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as error:
        fail(f"{type(error).__name__}: {error}")
