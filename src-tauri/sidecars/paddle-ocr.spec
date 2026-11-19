# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all
from PyInstaller.utils.hooks import copy_metadata
from PyInstaller.utils.hooks import collect_submodules

datas = []
binaries = []
hiddenimports = []

for package in ("paddleocr", "paddlex", "paddle"):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden

# PaddleX checks installed extras through importlib.metadata before it creates
# the OCR pipeline. PyInstaller does not include dependency metadata by default.
for package in (
    "paddleocr",
    "paddlex",
    "opencv-contrib-python",
    "pyclipper",
    "imagesize",
    "pypdfium2",
    "python-bidi",
    "shapely",
):
    datas += copy_metadata(package)

hiddenimports += collect_submodules("cv2")
hiddenimports += ["numpy", "yaml", "requests", "PIL"]

a = Analysis(
    ["paddle_ocr_sidecar.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["matplotlib", "IPython", "notebook", "tkinter"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="paddle-ocr",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
