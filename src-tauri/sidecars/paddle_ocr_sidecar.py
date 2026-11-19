"""Bundled PP-OCRv5 Mobile worker for CET-6 real-exam imports."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import time
import traceback
from pathlib import Path
from statistics import mean


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--model-dir", required=True)
    return parser.parse_args()


def is_ascii_path(path: Path) -> bool:
    return all(ord(character) < 128 for character in str(path))


def ascii_temp_root(preferred: Path) -> Path:
    candidates = [
        Path(os.environ["CET6_OCR_TEMP_DIR"])
        if os.environ.get("CET6_OCR_TEMP_DIR")
        else None,
        preferred,
        Path(os.environ["PUBLIC"]) / "CET6-OCR-Temp"
        if os.environ.get("PUBLIC")
        else None,
        Path(os.environ["ProgramData"]) / "CET6-OCR-Temp"
        if os.environ.get("ProgramData")
        else None,
    ]
    for candidate in candidates:
        if candidate is None or not is_ascii_path(candidate):
            continue
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=candidate, prefix="probe-", delete=True):
                pass
            return candidate
        except OSError:
            continue
    raise RuntimeError(
        "PaddleOCR needs an ASCII-safe temporary directory. "
        "Set CET6_OCR_TEMP_DIR to a writable ASCII path."
    )


def stage_models(model_dir: Path) -> tuple[Path, tempfile.TemporaryDirectory[str] | None]:
    if is_ascii_path(model_dir):
        return model_dir, None

    staging = tempfile.TemporaryDirectory(
        prefix="cet6-paddleocr-",
        dir=ascii_temp_root(Path(tempfile.gettempdir())),
        ignore_cleanup_errors=True,
    )
    staged = Path(staging.name)
    for name in ("PP-OCRv5_mobile_det", "PP-OCRv5_mobile_rec"):
        source = model_dir / name
        if not source.is_dir():
            staging.cleanup()
            raise RuntimeError(f"PaddleOCR model directory is missing: {source}")
        shutil.copytree(source, staged / name)
    return staged, staging


def main() -> int:
    args = parse_args()
    request_path = Path(args.request)
    model_dir = Path(args.model_dir)
    request = json.loads(request_path.read_text(encoding="utf-8"))
    pages = request.get("pages", [])
    if not pages:
        print(json.dumps({"ok": False, "error": "no pages supplied"}))
        return 2

    from paddleocr import PaddleOCR

    started = time.perf_counter()
    staged_model_dir, staging = stage_models(model_dir)
    try:
        ocr = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_detection_model_dir=str(staged_model_dir / "PP-OCRv5_mobile_det"),
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            text_recognition_model_dir=str(staged_model_dir / "PP-OCRv5_mobile_rec"),
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="cpu",
            enable_mkldnn=False,
        )
        model_load_ms = round((time.perf_counter() - started) * 1000)

        results = []
        for page in pages:
            page_started = time.perf_counter()
            image_path = Path(page["imagePath"])
            raw = list(ocr.predict(input=str(image_path)))[0]
            texts = [str(value) for value in raw.get("rec_texts", [])]
            scores = [float(value) for value in raw.get("rec_scores", [])]
            polygons = raw.get("rec_polys") or raw.get("dt_polys") or []
            blocks = []
            for index, text in enumerate(texts):
                clean = " ".join(text.strip().split())
                if not clean:
                    continue
                polygon = polygons[index] if index < len(polygons) else []
                points = [
                    [float(point[0]), float(point[1])]
                    for point in polygon
                    if len(point) >= 2
                ]
                x = min((point[0] for point in points), default=0.0)
                y = min((point[1] for point in points), default=float(index))
                blocks.append(
                    {
                        "text": clean,
                        "confidence": scores[index] if index < len(scores) else 0.0,
                        "box": points,
                        "sortY": y,
                        "sortX": x,
                    }
                )
            blocks.sort(key=lambda item: (round(item["sortY"], 1), item["sortX"]))
            text = "\n".join(block["text"] for block in blocks)
            results.append(
                {
                    "pageNumber": int(page["pageNumber"]),
                    "text": text,
                    "blocks": [
                        {
                            "text": block["text"],
                            "confidence": block["confidence"],
                            "box": block["box"],
                        }
                        for block in blocks
                    ],
                    "averageConfidence": mean(scores) if scores else 0.0,
                    "durationMs": round((time.perf_counter() - page_started) * 1000),
                }
            )
    finally:
        if staging is not None:
            staging.cleanup()

    print(
        json.dumps(
            {
                "ok": True,
                "modelLoadMs": model_load_ms,
                "pages": results,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    try:
        raise SystemExit(main())
    except Exception as error:
        detail = traceback.format_exc()
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(error),
                    "traceback": detail[-8000:],
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(1)
