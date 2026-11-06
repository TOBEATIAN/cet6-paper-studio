# Kitten TTS third-party notices

The bundled local speech runtime contains these third-party components:

- Kitten TTS Nano 0.8 INT8 model and KittenML Python code
  - Project: https://github.com/KittenML/KittenTTS
  - Model: https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8
  - License: Apache-2.0 (`KITTENML-LICENSE`)
- phonemizer
  - Project: https://github.com/bootphon/phonemizer
  - License: GPL-3.0 (`PHONEMIZER-LICENSE`)
- eSpeak NG library and language data, distributed through `espeakng-loader`
  - Upstream: https://github.com/espeak-ng/espeak-ng
  - Loader: https://github.com/thewh1teagle/espeakng-loader
  - License: GPL-3.0 (`ESPEAK-NG-GPL-3.0.txt`)
- ONNX Runtime and other Python runtime dependencies retain their respective
  upstream licenses. The reproducible PyInstaller specification is stored at
  `src-tauri/sidecars/kitten-tts.spec`.

The local TTS runtime is launched as an isolated process. If this product is
distributed to third parties, the distributor must keep these notices and
license texts with the installer and satisfy the GPL source-code requirements
for phonemizer, eSpeak NG, and any linked GPL-covered components. The complete
corresponding source for the packaged open-source components is available from
the upstream repositories above; the exact build recipe and request protocol
are included in the product source repository.
