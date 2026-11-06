# Kitten TTS sidecar

`kitten_tts_sidecar.py` receives one JSON request containing all missing speech
segments, loads the bundled ONNX model once, and writes 24 kHz mono PCM WAV
files. The Rust backend then trims silence, calibrates the requested words per
minute, inserts answer pauses, and encodes the final MP3.

The executable committed to `src-tauri/resources/kitten-tts.exe` was built from
this source with PyInstaller 6.22.3 on Windows x64:

```powershell
python -m PyInstaller --noconfirm --clean `
  --onefile --console --name kitten-tts `
  --distpath dist --workpath build --specpath . `
  --collect-all espeakng_loader `
  --collect-all phonemizer `
  --collect-submodules kittenml.kittentts_legacy `
  --hidden-import onnxruntime `
  --hidden-import soundfile `
  --hidden-import huggingface_hub `
  kitten_tts_sidecar.py
```

After rebuilding, copy `dist/kitten-tts.exe` to
`src-tauri/resources/kitten-tts.exe`. The Tauri bundle copies both that file and
`src-tauri/resources/kitten-model/`.

The Python sidecar copies eSpeak NG data to an ASCII runtime directory before
model construction. This is required because `espeakng-loader` failed to read
`phontab` from an installation path containing Chinese characters.
