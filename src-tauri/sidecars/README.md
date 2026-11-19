# Bundled Python sidecars

## Kitten TTS

`kitten_tts_sidecar.py` receives one JSON request containing all missing speech
segments, loads the bundled ONNX model once, and writes 24 kHz mono PCM WAV
files. The Rust backend then trims silence, calibrates the requested words per
minute, inserts answer pauses, and encodes the final MP3.

The generated executable `src-tauri/resources/kitten-tts.exe` is built from this
source with PyInstaller on Windows x64 and intentionally gitignored:

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

## PaddleOCR

`paddle_ocr_sidecar.py` runs the local PP-OCRv5 Mobile detector and recognizer
for scanned real-exam pages. The models live in
`src-tauri/resources/paddleocr/`; the generated executable is
`src-tauri/resources/paddle-ocr.exe` and is intentionally gitignored.

Build it from the shared PaddleOCR environment on Windows x64:

```powershell
$env:PIP_CACHE_DIR='E:\WorkSpace\tools\paddleocr\cache'
$env:TEMP='E:\WorkSpace\tools\paddleocr\tmp'
$env:TMP=$env:TEMP
& 'E:\WorkSpace\tools\paddleocr\.venv-shared\Scripts\python.exe' `
  -m PyInstaller --clean --noconfirm paddle-ocr.spec
Copy-Item dist\paddle-ocr.exe ..\resources\paddle-ocr.exe -Force
```

The spec explicitly copies `paddlex` and OCR dependency metadata because
PaddleX checks installed extras through `importlib.metadata`. The sidecar stages
models into an ASCII temporary directory before constructing PaddleOCR; Paddle's
Windows inference loader cannot reliably read model paths containing Chinese.

Smoke test with a scanned image and verify the output contains the expected
Chinese title:

```powershell
.\..\resources\paddle-ocr.exe `
  --request smoke-request.json `
  --model-dir .\..\resources\paddleocr
```
