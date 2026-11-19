use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Manager};
use tokio::io::AsyncReadExt;

use crate::error::{AppError, AppResult};

const MAX_OCR_PAGES: usize = 80;
const MAX_PAGE_BYTES: usize = 20 * 1024 * 1024;
const OCR_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrPageInput {
    pub page_number: u32,
    pub image_data_url: String,
}

#[tauri::command]
pub async fn ocr_import_pages(
    app: AppHandle,
    data_dir: String,
    source_hash: String,
    pages: Vec<OcrPageInput>,
) -> AppResult<Value> {
    if pages.is_empty() || pages.len() > MAX_OCR_PAGES {
        return Err(AppError::Io(format!(
            "OCR page count must be between 1 and {MAX_OCR_PAGES}"
        )));
    }
    if source_hash.len() < 8
        || source_hash.len() > 64
        || !source_hash.chars().all(|value| value.is_ascii_hexdigit())
    {
        return Err(AppError::Io("invalid OCR source hash".into()));
    }

    let cache_root = Path::new(&data_dir).join("import-cache").join(&source_hash);
    tokio::fs::create_dir_all(&cache_root).await?;

    let mut missing = Vec::new();
    for page in &pages {
        let cache_path = page_cache_path(&cache_root, page.page_number);
        if tokio::fs::try_exists(&cache_path).await? {
            continue;
        }
        let bytes = decode_image_data_url(&page.image_data_url)?;
        let image_path = cache_root.join(format!("page-{:04}.jpg", page.page_number));
        tokio::fs::write(&image_path, bytes).await?;
        missing.push((page.page_number, image_path.to_string_lossy().to_string()));
    }

    if !missing.is_empty() {
        let (sidecar, model_dir) = resolve_paddleocr_assets(&app)?;
        let request_path = cache_root.join(format!(
            ".paddle-request-{}.json",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or_default()
        ));
        tokio::fs::write(
            &request_path,
            serde_json::to_vec_pretty(&json!({
                "version": 1,
                "pages": missing
                    .iter()
                    .map(|(page_number, image_path)| json!({
                        "pageNumber": page_number,
                        "imagePath": image_path,
                    }))
                    .collect::<Vec<_>>()
            }))?,
        )
        .await?;

        let result = run_paddleocr_sidecar(&sidecar, &model_dir, &request_path, &cache_root).await;
        let _ = tokio::fs::remove_file(&request_path).await;
        let result = result?;
        let result_pages = result
            .get("pages")
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::Serde("OCR sidecar returned no pages".into()))?;
        for page in result_pages {
            let page_number = page
                .get("pageNumber")
                .and_then(Value::as_u64)
                .ok_or_else(|| AppError::Serde("OCR page has no pageNumber".into()))?
                as u32;
            tokio::fs::write(
                page_cache_path(&cache_root, page_number),
                serde_json::to_vec_pretty(page)?,
            )
            .await?;
        }
    }

    let mut cached_pages = Vec::new();
    for page in &pages {
        let raw = tokio::fs::read(page_cache_path(&cache_root, page.page_number)).await?;
        let mut value: Value = serde_json::from_slice(&raw)?;
        value["cached"] = json!(true);
        value["sourceHash"] = json!(source_hash);
        cached_pages.push(value);
    }
    cached_pages.sort_by_key(|page| {
        page.get("pageNumber")
            .and_then(Value::as_u64)
            .unwrap_or_default()
    });
    Ok(json!({ "pages": cached_pages }))
}

fn page_cache_path(cache_root: &Path, page_number: u32) -> PathBuf {
    cache_root.join(format!("page-{page_number:04}.json"))
}

fn decode_image_data_url(data_url: &str) -> AppResult<Vec<u8>> {
    let encoded = data_url
        .split_once("base64,")
        .map(|(_, value)| value)
        .ok_or_else(|| AppError::Io("invalid OCR page image data URL".into()))?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| AppError::Io(format!("invalid OCR page base64: {error}")))?;
    if bytes.is_empty() || bytes.len() > MAX_PAGE_BYTES {
        return Err(AppError::Io(
            "OCR page image exceeds the safety limit".into(),
        ));
    }
    Ok(bytes)
}

fn resolve_paddleocr_assets(app: &AppHandle) -> AppResult<(PathBuf, PathBuf)> {
    let mut sidecar_candidates = Vec::new();
    if let Some(path) = std::env::var_os("CET6_PADDLEOCR_SIDECAR") {
        sidecar_candidates.push(PathBuf::from(path));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        sidecar_candidates.push(resource_dir.join("paddle-ocr.exe"));
        sidecar_candidates.push(resource_dir.join("resources").join("paddle-ocr.exe"));
    }
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    sidecar_candidates.push(manifest_dir.join("resources").join("paddle-ocr.exe"));
    sidecar_candidates.push(
        manifest_dir
            .join("sidecars")
            .join("dist")
            .join("paddle-ocr.exe"),
    );
    let sidecar = sidecar_candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            AppError::Io(
                "PaddleOCR sidecar is missing. Reinstall the app or set CET6_PADDLEOCR_SIDECAR."
                    .into(),
            )
        })?;

    let mut model_candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        model_candidates.push(resource_dir.join("paddleocr"));
        model_candidates.push(resource_dir.join("resources").join("paddleocr"));
    }
    model_candidates.push(manifest_dir.join("resources").join("paddleocr"));
    let model_dir = model_candidates
        .into_iter()
        .find(|path| {
            path.join("PP-OCRv5_mobile_det").is_dir() && path.join("PP-OCRv5_mobile_rec").is_dir()
        })
        .ok_or_else(|| AppError::Io("PaddleOCR model assets are missing".into()))?;
    Ok((sidecar, model_dir))
}

async fn run_paddleocr_sidecar(
    sidecar: &Path,
    model_dir: &Path,
    request_path: &Path,
    temp_dir: &Path,
) -> AppResult<Value> {
    let mut command = tokio::process::Command::new(sidecar);
    command
        .arg("--request")
        .arg(request_path)
        .arg("--model-dir")
        .arg(model_dir)
        .env("CET6_OCR_TEMP_DIR", temp_dir)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);

    let mut child = command
        .spawn()
        .map_err(|error| AppError::Io(format!("could not start PaddleOCR: {error}")))?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Io("could not capture PaddleOCR stdout".into()))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Io("could not capture PaddleOCR stderr".into()))?;
    let stdout_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        stdout.read_to_end(&mut bytes).await.map(|_| bytes)
    });
    let stderr_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        stderr.read_to_end(&mut bytes).await.map(|_| bytes)
    });

    let status = match tokio::time::timeout(OCR_TIMEOUT, child.wait()).await {
        Ok(result) => result?,
        Err(_) => {
            let _ = child.kill().await;
            return Err(AppError::Timeout);
        }
    };
    let stdout = stdout_task
        .await
        .map_err(|error| AppError::Io(error.to_string()))??;
    let stderr = stderr_task
        .await
        .map_err(|error| AppError::Io(error.to_string()))??;
    if !status.success() {
        let detail = sidecar_failure_detail(&stdout, &stderr);
        return Err(AppError::Io(format!(
            "PaddleOCR sidecar failed with {status}: {detail}"
        )));
    }
    let result: Value = serde_json::from_slice(&stdout)?;
    if result.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(AppError::Io(format!(
            "PaddleOCR sidecar returned an error: {}",
            result
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("unknown error")
        )));
    }
    Ok(result)
}

fn sidecar_failure_detail(stdout: &[u8], stderr: &[u8]) -> String {
    if let Ok(value) = serde_json::from_slice::<Value>(stdout) {
        let error = value
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("unknown sidecar error");
        let traceback = value.get("traceback").and_then(Value::as_str).unwrap_or("");
        let detail = if traceback.is_empty() {
            error.to_string()
        } else {
            format!("{error}\n{traceback}")
        };
        return detail.chars().take(12_000).collect();
    }
    let stdout = String::from_utf8_lossy(stdout);
    let stderr = String::from_utf8_lossy(stderr);
    format!("{stdout}\n{stderr}").chars().take(12_000).collect()
}

#[cfg(test)]
mod tests {
    use super::sidecar_failure_detail;

    #[test]
    fn sidecar_failure_prefers_structured_error() {
        let stdout = br#"{"ok":false,"error":"model failed","traceback":"trace"}"#;
        assert_eq!(
            sidecar_failure_detail(stdout, b"ignored"),
            "model failed\ntrace"
        );
    }

    #[test]
    fn sidecar_failure_falls_back_to_process_output() {
        assert_eq!(sidecar_failure_detail(b"out", b"err"), "out\nerr");
    }
}
