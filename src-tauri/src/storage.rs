use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Bootstrap pointer stored in the Tauri app-data dir. Its only job is to record
/// where the user chose to keep their data. Everything else lives in that dir.
const BOOTSTRAP_FILE: &str = "bootstrap.json";
const CONFIG_FILE: &str = "config.json";
const WORKING_PAPER_FILE: &str = "working-paper.json";
const PAPERS_DIR: &str = "papers";
const CHATS_DIR: &str = "chats";
const REVIEWS_DIR: &str = "reviews";
const PRACTICE_DIR: &str = "practice";
const GENERATION_DIR: &str = "generation";
const CET6_DIR: &str = "cet6";
const DIAGNOSTICS_DIR: &str = "diagnostics";
const INDEX_FILE: &str = "index.json";

#[derive(Debug, Serialize, Deserialize)]
pub struct Bootstrap {
    /// Absolute path to the user-chosen data directory.
    pub data_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelocateDataDirResult {
    pub old_dir_deleted: bool,
    pub old_dir_delete_failed: bool,
}

struct RelocateDataDirPlan {
    source_to_delete: Option<PathBuf>,
}

fn app_data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::Io(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn bootstrap_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_dir(app)?.join(BOOTSTRAP_FILE))
}

fn write_bootstrap(app: &AppHandle, data_dir: String) -> AppResult<()> {
    let boot = Bootstrap {
        data_dir: data_dir.clone(),
    };
    let raw = serde_json::to_string_pretty(&boot)?;
    fs::write(bootstrap_path(app)?, raw)?;
    Ok(())
}

/// Read the data directory the user previously chose, if any.
#[tauri::command]
pub fn get_data_dir(app: AppHandle) -> AppResult<Option<String>> {
    let path = bootstrap_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)?;
    let boot: Bootstrap = serde_json::from_str(&raw)?;
    Ok(Some(boot.data_dir))
}

/// Persist the chosen data directory and create it if needed.
#[tauri::command]
pub fn set_data_dir(app: AppHandle, data_dir: String) -> AppResult<()> {
    fs::create_dir_all(&data_dir)?;
    write_bootstrap(&app, data_dir)?;
    Ok(())
}

/// Move the data directory pointer after copying current data into the target.
#[tauri::command]
pub fn relocate_data_dir(
    app: AppHandle,
    target_dir: String,
    delete_old_dir: bool,
) -> AppResult<RelocateDataDirResult> {
    let current = get_data_dir(app.clone())?;
    let plan = relocate_data_dir_inner(current.as_deref(), Path::new(&target_dir))?;
    write_bootstrap(&app, target_dir)?;
    Ok(delete_old_data_dir_after_relocation(plan, delete_old_dir))
}

/// A recommended default data directory (Documents/AI试卷), for first launch.
#[tauri::command]
pub fn default_data_dir(app: AppHandle) -> AppResult<String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| crate::error::AppError::Io(e.to_string()))?;
    Ok(base.join("AI试卷").to_string_lossy().to_string())
}

/// Open the configured data directory in the platform file manager.
#[tauri::command]
pub fn open_data_dir(data_dir: String) -> AppResult<()> {
    let path = Path::new(&data_dir);
    fs::create_dir_all(path)?;

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    command.spawn()?;
    Ok(())
}

fn read_json_file(dir: &Path, file: &str) -> AppResult<Option<String>> {
    let path = dir.join(file);
    let backup = path.with_file_name(format!("{file}.bak"));
    if !path.exists() {
        if !backup.exists() {
            return Ok(None);
        }
        let backup_contents = fs::read_to_string(&backup)?;
        if serde_json::from_str::<serde_json::Value>(&backup_contents).is_ok() {
            fs::copy(&backup, &path)?;
            return Ok(Some(backup_contents));
        }
        return Ok(None);
    }

    let contents = fs::read_to_string(&path)?;
    if serde_json::from_str::<serde_json::Value>(&contents).is_ok() {
        return Ok(Some(contents));
    }

    if backup.exists() {
        let backup_contents = fs::read_to_string(&backup)?;
        if serde_json::from_str::<serde_json::Value>(&backup_contents).is_ok() {
            preserve_corrupt_file(&path, file)?;
            fs::copy(&backup, &path)?;
            return Ok(Some(backup_contents));
        }
    }
    Ok(Some(contents))
}

fn write_json_file(dir: &Path, file: &str, contents: &str) -> AppResult<()> {
    fs::create_dir_all(dir)?;
    let path = dir.join(file);
    if path.exists() {
        let existing = fs::read_to_string(&path)?;
        if serde_json::from_str::<serde_json::Value>(&existing).is_ok() {
            fs::copy(&path, path.with_file_name(format!("{file}.bak")))?;
        }
    }
    let temp = dir.join(format!("{file}.tmp"));
    {
        let mut output = fs::File::create(&temp)?;
        output.write_all(contents.as_bytes())?;
        output.sync_all()?;
    }
    if path.exists() {
        fs::remove_file(&path)?;
    }
    fs::rename(&temp, &path)?;
    Ok(())
}

fn preserve_corrupt_file(path: &Path, file: &str) -> AppResult<()> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let target = path.with_file_name(format!("{file}.corrupt-{stamp}"));
    fs::rename(path, target)?;
    Ok(())
}

fn relocate_data_dir_inner(
    current_dir: Option<&str>,
    target_dir: &Path,
) -> AppResult<RelocateDataDirPlan> {
    fs::create_dir_all(target_dir)?;
    let Some(current_dir) = current_dir else {
        return Ok(RelocateDataDirPlan {
            source_to_delete: None,
        });
    };

    let source = Path::new(current_dir);
    if !source.exists() {
        return Ok(RelocateDataDirPlan {
            source_to_delete: None,
        });
    }

    let source = source.canonicalize()?;
    let target = target_dir.canonicalize()?;
    if source == target {
        return Ok(RelocateDataDirPlan {
            source_to_delete: None,
        });
    }

    if target.starts_with(&source) {
        return Err(crate::error::AppError::Io(
            "target data directory cannot be inside the current data directory".into(),
        ));
    }

    copy_dir_contents(&source, &target)?;
    Ok(RelocateDataDirPlan {
        source_to_delete: Some(source),
    })
}

fn copy_dir_contents(source: &Path, target: &Path) -> AppResult<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            if target_path.exists() && !target_path.is_dir() {
                fs::remove_file(&target_path)?;
            }
            copy_dir_contents(&source_path, &target_path)?;
        } else if file_type.is_file() {
            if target_path.exists() && target_path.is_dir() {
                fs::remove_dir_all(&target_path)?;
            }
            fs::copy(&source_path, &target_path)?;
        }
    }
    Ok(())
}

fn delete_old_data_dir_after_relocation(
    plan: RelocateDataDirPlan,
    delete_old_dir: bool,
) -> RelocateDataDirResult {
    let mut result = RelocateDataDirResult {
        old_dir_deleted: false,
        old_dir_delete_failed: false,
    };

    if delete_old_dir {
        if let Some(source) = plan.source_to_delete {
            match fs::remove_dir_all(source) {
                Ok(()) => result.old_dir_deleted = true,
                Err(_) => result.old_dir_delete_failed = true,
            }
        }
    }

    result
}

fn safe_json_name(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Load config.json from the data dir as a raw JSON string (validated frontend-side).
#[tauri::command]
pub fn load_config(data_dir: String) -> AppResult<Option<String>> {
    read_json_file(Path::new(&data_dir), CONFIG_FILE)
}

/// Save config.json (already-serialized JSON string from the frontend).
#[tauri::command]
pub fn save_config(data_dir: String, contents: String) -> AppResult<()> {
    write_json_file(Path::new(&data_dir), CONFIG_FILE, &contents)
}

/// Load the auto-saved working paper as a raw JSON string.
#[tauri::command]
pub fn load_working_paper(data_dir: String) -> AppResult<Option<String>> {
    read_json_file(Path::new(&data_dir), WORKING_PAPER_FILE)
}

/// Save the working paper (already-serialized JSON string from the frontend).
#[tauri::command]
pub fn save_working_paper(data_dir: String, contents: String) -> AppResult<()> {
    write_json_file(Path::new(&data_dir), WORKING_PAPER_FILE, &contents)
}

// ---- Paper library ----

#[tauri::command]
pub fn load_paper_index(data_dir: String) -> AppResult<Option<String>> {
    read_json_file(&Path::new(&data_dir).join(PAPERS_DIR), INDEX_FILE)
}

#[tauri::command]
pub fn save_paper_index(data_dir: String, contents: String) -> AppResult<()> {
    write_json_file(
        &Path::new(&data_dir).join(PAPERS_DIR),
        INDEX_FILE,
        &contents,
    )
}

#[tauri::command]
pub fn load_paper(data_dir: String, paper_id: String) -> AppResult<Option<String>> {
    let file = format!("{}.json", safe_json_name(&paper_id));
    read_json_file(&Path::new(&data_dir).join(PAPERS_DIR), &file)
}

#[tauri::command]
pub fn save_paper(data_dir: String, paper_id: String, contents: String) -> AppResult<()> {
    let file = format!("{}.json", safe_json_name(&paper_id));
    write_json_file(&Path::new(&data_dir).join(PAPERS_DIR), &file, &contents)?;
    write_json_file(Path::new(&data_dir), WORKING_PAPER_FILE, &contents)
}

#[tauri::command]
pub fn delete_paper(data_dir: String, paper_id: String) -> AppResult<()> {
    let file = format!("{}.json", safe_json_name(&paper_id));
    let path = Path::new(&data_dir).join(PAPERS_DIR).join(file);
    if path.exists() {
        fs::remove_file(path)?;
    }
    let chat_dir = Path::new(&data_dir)
        .join(CHATS_DIR)
        .join(safe_json_name(&paper_id));
    if chat_dir.exists() {
        fs::remove_dir_all(chat_dir)?;
    }
    let checkpoint = cet6_checkpoint_path(Path::new(&data_dir), &paper_id);
    if checkpoint.exists() {
        fs::remove_file(checkpoint)?;
    }
    let reviews_dir = Path::new(&data_dir)
        .join(REVIEWS_DIR)
        .join(safe_json_name(&paper_id));
    if reviews_dir.exists() {
        fs::remove_dir_all(reviews_dir)?;
    }
    Ok(())
}

// ---- Resumable CET-6 generation ----

fn cet6_checkpoint_path(data_dir: &Path, paper_id: &str) -> PathBuf {
    data_dir
        .join(GENERATION_DIR)
        .join(CET6_DIR)
        .join(format!("{}.json", safe_json_name(paper_id)))
}

fn cet6_diagnostic_dir(data_dir: &Path, paper_id: &str) -> PathBuf {
    data_dir
        .join(GENERATION_DIR)
        .join(CET6_DIR)
        .join(DIAGNOSTICS_DIR)
        .join(safe_json_name(paper_id))
}

#[tauri::command]
pub fn load_practice_session(data_dir: String, paper_id: String) -> AppResult<Option<String>> {
    let dir = Path::new(&data_dir).join(PRACTICE_DIR);
    let file = format!("{}.json", safe_json_name(&paper_id));
    read_json_file(&dir, &file)
}

#[tauri::command]
pub fn save_practice_session(
    data_dir: String,
    paper_id: String,
    contents: String,
) -> AppResult<()> {
    let dir = Path::new(&data_dir).join(PRACTICE_DIR);
    let file = format!("{}.json", safe_json_name(&paper_id));
    write_json_file(&dir, &file, &contents)
}

#[tauri::command]
pub fn load_cet6_checkpoint(data_dir: String, paper_id: String) -> AppResult<Option<String>> {
    let path = cet6_checkpoint_path(Path::new(&data_dir), &paper_id);
    let parent = path
        .parent()
        .ok_or_else(|| crate::error::AppError::Io("invalid checkpoint path".into()))?;
    let file = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| crate::error::AppError::Io("invalid checkpoint file name".into()))?;
    read_json_file(parent, file)
}

#[tauri::command]
pub fn save_cet6_checkpoint(data_dir: String, paper_id: String, contents: String) -> AppResult<()> {
    let path = cet6_checkpoint_path(Path::new(&data_dir), &paper_id);
    let parent = path
        .parent()
        .ok_or_else(|| crate::error::AppError::Io("invalid checkpoint path".into()))?;
    let file = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| crate::error::AppError::Io("invalid checkpoint file name".into()))?;
    write_json_file(parent, file, &contents)?;
    Ok(())
}

#[tauri::command]
pub fn delete_cet6_checkpoint(data_dir: String, paper_id: String) -> AppResult<()> {
    let path = cet6_checkpoint_path(Path::new(&data_dir), &paper_id);
    if path.exists() {
        fs::remove_file(&path)?;
    }
    let backup = path.with_extension("json.bak");
    if backup.exists() {
        fs::remove_file(backup)?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_cet6_diagnostic(
    data_dir: String,
    paper_id: String,
    file_stem: String,
    contents: String,
) -> AppResult<()> {
    let file = format!("{}.json", safe_json_name(&file_stem));
    write_json_file(
        &cet6_diagnostic_dir(Path::new(&data_dir), &paper_id),
        &file,
        &contents,
    )
}

#[tauri::command]
pub fn open_cet6_diagnostic_dir(data_dir: String, paper_id: String) -> AppResult<()> {
    let dir = cet6_diagnostic_dir(Path::new(&data_dir), &paper_id);
    fs::create_dir_all(&dir)?;
    open_data_dir(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_audio_file(path: String) -> AppResult<Vec<u8>> {
    let file = Path::new(&path);
    let is_mp3 = file
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("mp3"));
    if !is_mp3 {
        return Err(crate::error::AppError::Io(
            "only MP3 audio files can be played".into(),
        ));
    }
    let size = fs::metadata(file)?.len();
    if size > 64 * 1024 * 1024 {
        return Err(crate::error::AppError::Io(
            "audio file is too large to load".into(),
        ));
    }
    Ok(fs::read(file)?)
}

#[tauri::command]
pub fn read_image_file(path: String) -> AppResult<Vec<u8>> {
    let file = Path::new(&path);
    let is_image = file
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "webp" | "gif"
            )
        });
    if !is_image {
        return Err(crate::error::AppError::Io(
            "only JPG, PNG, WEBP, or GIF images can be loaded".into(),
        ));
    }
    let size = fs::metadata(file)?.len();
    if size > 20 * 1024 * 1024 {
        return Err(crate::error::AppError::Io(
            "image file is too large to load".into(),
        ));
    }
    Ok(fs::read(file)?)
}

#[tauri::command]
pub fn read_default_donation_qr(app: AppHandle, kind: String) -> AppResult<Vec<u8>> {
    let file_name = match kind.as_str() {
        "wechat" => "wechat-donation.jpg",
        "alipay" => "alipay-donation.jpg",
        _ => {
            return Err(crate::error::AppError::Io(
                "unsupported donation QR kind".into(),
            ))
        }
    };
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("donation").join(file_name));
        candidates.push(
            resource_dir
                .join("resources")
                .join("donation")
                .join(file_name),
        );
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("donation")
            .join(file_name),
    );
    let path = candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            crate::error::AppError::Io(format!("default donation QR is missing: {file_name}"))
        })?;
    Ok(fs::read(path)?)
}

// ---- Paper-scoped review records ----

#[tauri::command]
pub fn load_review_index(data_dir: String, paper_id: String) -> AppResult<Option<String>> {
    read_json_file(
        &Path::new(&data_dir)
            .join(REVIEWS_DIR)
            .join(safe_json_name(&paper_id)),
        INDEX_FILE,
    )
}

#[tauri::command]
pub fn save_review_index(data_dir: String, paper_id: String, contents: String) -> AppResult<()> {
    write_json_file(
        &Path::new(&data_dir)
            .join(REVIEWS_DIR)
            .join(safe_json_name(&paper_id)),
        INDEX_FILE,
        &contents,
    )
}

#[tauri::command]
pub fn load_review(
    data_dir: String,
    paper_id: String,
    review_id: String,
) -> AppResult<Option<String>> {
    let file = format!("{}.json", safe_json_name(&review_id));
    read_json_file(
        &Path::new(&data_dir)
            .join(REVIEWS_DIR)
            .join(safe_json_name(&paper_id)),
        &file,
    )
}

#[tauri::command]
pub fn save_review(
    data_dir: String,
    paper_id: String,
    review_id: String,
    contents: String,
) -> AppResult<()> {
    let file = format!("{}.json", safe_json_name(&review_id));
    write_json_file(
        &Path::new(&data_dir)
            .join(REVIEWS_DIR)
            .join(safe_json_name(&paper_id)),
        &file,
        &contents,
    )
}

#[tauri::command]
pub fn delete_review(data_dir: String, paper_id: String, review_id: String) -> AppResult<()> {
    let file = format!("{}.json", safe_json_name(&review_id));
    let path = Path::new(&data_dir)
        .join(REVIEWS_DIR)
        .join(safe_json_name(&paper_id))
        .join(file);
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

// ---- Paper-scoped chat history ----

#[tauri::command]
pub fn load_chat_index(data_dir: String, paper_id: String) -> AppResult<Option<String>> {
    read_json_file(
        &Path::new(&data_dir)
            .join(CHATS_DIR)
            .join(safe_json_name(&paper_id)),
        INDEX_FILE,
    )
}

#[tauri::command]
pub fn save_chat_index(data_dir: String, paper_id: String, contents: String) -> AppResult<()> {
    write_json_file(
        &Path::new(&data_dir)
            .join(CHATS_DIR)
            .join(safe_json_name(&paper_id)),
        INDEX_FILE,
        &contents,
    )
}

#[tauri::command]
pub fn load_chat_session(
    data_dir: String,
    paper_id: String,
    session_id: String,
) -> AppResult<Option<String>> {
    let file = format!("{}.json", safe_json_name(&session_id));
    read_json_file(
        &Path::new(&data_dir)
            .join(CHATS_DIR)
            .join(safe_json_name(&paper_id)),
        &file,
    )
}

#[tauri::command]
pub fn save_chat_session(
    data_dir: String,
    paper_id: String,
    session_id: String,
    contents: String,
) -> AppResult<()> {
    let file = format!("{}.json", safe_json_name(&session_id));
    write_json_file(
        &Path::new(&data_dir)
            .join(CHATS_DIR)
            .join(safe_json_name(&paper_id)),
        &file,
        &contents,
    )
}

#[tauri::command]
pub fn delete_chat_session(
    data_dir: String,
    paper_id: String,
    session_id: String,
) -> AppResult<()> {
    let file = format!("{}.json", safe_json_name(&session_id));
    let path = Path::new(&data_dir)
        .join(CHATS_DIR)
        .join(safe_json_name(&paper_id))
        .join(file);
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("cet6-paper-studio-{name}-{nanos}"))
    }

    fn write(path: &Path, contents: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn json_writes_keep_a_last_good_backup_and_recover_it() {
        let dir = temp_path("json-backup");
        write_json_file(&dir, "paper.json", r#"{"version":1}"#).unwrap();
        write_json_file(&dir, "paper.json", r#"{"version":2}"#).unwrap();

        assert_eq!(
            fs::read_to_string(dir.join("paper.json.bak")).unwrap(),
            r#"{"version":1}"#
        );

        fs::write(dir.join("paper.json"), "{broken").unwrap();
        let recovered = read_json_file(&dir, "paper.json").unwrap().unwrap();
        assert_eq!(recovered, r#"{"version":1}"#);
        assert_eq!(
            fs::read_to_string(dir.join("paper.json")).unwrap(),
            r#"{"version":1}"#
        );
        let corrupt_files = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("paper.json.corrupt-")
            })
            .collect::<Vec<_>>();
        assert_eq!(corrupt_files.len(), 1);
        assert_eq!(
            fs::read_to_string(corrupt_files[0].path()).unwrap(),
            "{broken"
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn json_read_restores_a_missing_main_file_from_backup() {
        let dir = temp_path("json-missing-main");
        write(&dir.join("paper.json.bak"), r#"{"version":4}"#);

        let recovered = read_json_file(&dir, "paper.json").unwrap().unwrap();
        assert_eq!(recovered, r#"{"version":4}"#);
        assert_eq!(
            fs::read_to_string(dir.join("paper.json")).unwrap(),
            r#"{"version":4}"#
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn relocation_copies_all_data_dir_contents() {
        let source = temp_path("source");
        let target = temp_path("target");
        write(&source.join(CONFIG_FILE), r#"{"version":1}"#);
        write(&source.join(WORKING_PAPER_FILE), r#"{"title":"current"}"#);
        write(
            &source.join(PAPERS_DIR).join(INDEX_FILE),
            r#"{"papers":[]}"#,
        );
        write(
            &source.join(PAPERS_DIR).join("paper-1.json"),
            r#"{"title":"A"}"#,
        );
        write(
            &source
                .join(CHATS_DIR)
                .join("paper-1")
                .join("session-1.json"),
            r#"{"messages":[]}"#,
        );

        let plan = relocate_data_dir_inner(Some(source.to_str().unwrap()), &target).unwrap();

        assert_eq!(
            fs::read_to_string(target.join(CONFIG_FILE)).unwrap(),
            r#"{"version":1}"#
        );
        assert_eq!(
            fs::read_to_string(target.join(WORKING_PAPER_FILE)).unwrap(),
            r#"{"title":"current"}"#
        );
        assert_eq!(
            fs::read_to_string(target.join(PAPERS_DIR).join(INDEX_FILE)).unwrap(),
            r#"{"papers":[]}"#
        );
        assert_eq!(
            fs::read_to_string(
                target
                    .join(CHATS_DIR)
                    .join("paper-1")
                    .join("session-1.json")
            )
            .unwrap(),
            r#"{"messages":[]}"#
        );
        let canonical_source = source.canonicalize().unwrap();
        assert_eq!(
            plan.source_to_delete.as_deref(),
            Some(canonical_source.as_path())
        );

        let _ = fs::remove_dir_all(source);
        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn relocation_overwrites_existing_target_files() {
        let source = temp_path("source-overwrite");
        let target = temp_path("target-overwrite");
        write(&source.join(CONFIG_FILE), "new config");
        write(&target.join(CONFIG_FILE), "old config");

        relocate_data_dir_inner(Some(source.to_str().unwrap()), &target).unwrap();

        assert_eq!(
            fs::read_to_string(target.join(CONFIG_FILE)).unwrap(),
            "new config"
        );

        let _ = fs::remove_dir_all(source);
        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn relocation_without_existing_source_behaves_like_first_launch() {
        let missing_source = temp_path("missing-source");
        let target = temp_path("first-launch-target");

        relocate_data_dir_inner(Some(missing_source.to_str().unwrap()), &target).unwrap();

        assert!(target.exists());
        assert!(fs::read_dir(&target).unwrap().next().is_none());

        let _ = fs::remove_dir_all(target);
    }

    #[test]
    fn relocation_to_same_directory_is_noop() {
        let source = temp_path("same-dir");
        write(&source.join(CONFIG_FILE), "config");

        relocate_data_dir_inner(Some(source.to_str().unwrap()), &source).unwrap();

        assert_eq!(
            fs::read_to_string(source.join(CONFIG_FILE)).unwrap(),
            "config"
        );

        let _ = fs::remove_dir_all(source);
    }

    #[test]
    fn relocation_rejects_target_inside_source() {
        let source = temp_path("nested-source");
        write(&source.join(CONFIG_FILE), "config");
        let target = source.join("nested-target");

        let result = relocate_data_dir_inner(Some(source.to_str().unwrap()), &target);

        assert!(result.is_err());
        let _ = fs::remove_dir_all(source);
    }

    #[test]
    fn relocation_cleanup_removes_old_directory_when_requested() {
        let source = temp_path("cleanup-source");
        write(&source.join(CONFIG_FILE), "config");

        let result = delete_old_data_dir_after_relocation(
            RelocateDataDirPlan {
                source_to_delete: Some(source.clone()),
            },
            true,
        );

        assert!(result.old_dir_deleted);
        assert!(!result.old_dir_delete_failed);
        assert!(!source.exists());
    }

    #[test]
    fn relocation_cleanup_keeps_old_directory_by_default() {
        let source = temp_path("cleanup-keep-source");
        write(&source.join(CONFIG_FILE), "config");

        let result = delete_old_data_dir_after_relocation(
            RelocateDataDirPlan {
                source_to_delete: Some(source.clone()),
            },
            false,
        );

        assert!(!result.old_dir_deleted);
        assert!(!result.old_dir_delete_failed);
        assert!(source.exists());

        let _ = fs::remove_dir_all(source);
    }

    #[test]
    fn cet6_checkpoint_uses_safe_paper_file_name() {
        let root = temp_path("checkpoint-root");
        let path = cet6_checkpoint_path(&root, "paper/../1");

        assert_eq!(
            path,
            root.join(GENERATION_DIR)
                .join(CET6_DIR)
                .join("paper____1.json")
        );
        assert!(!path.to_string_lossy().contains(".."));
    }

    #[test]
    fn cet6_diagnostics_use_safe_directory_and_file_names() {
        let root = temp_path("diagnostic-root");
        let dir = cet6_diagnostic_dir(&root, "paper/../1");
        assert_eq!(
            dir,
            root.join(GENERATION_DIR)
                .join(CET6_DIR)
                .join(DIAGNOSTICS_DIR)
                .join("paper____1")
        );
        assert!(!dir.to_string_lossy().contains(".."));
    }

    #[test]
    fn cet6_diagnostic_writes_under_the_paper_directory() {
        let root = temp_path("diagnostic-write-root");
        let contents = r#"{"stage":"listening-c","status":"validation_failed"}"#;

        save_cet6_diagnostic(
            root.to_string_lossy().to_string(),
            "paper/../1".into(),
            "attempt-1".into(),
            contents.into(),
        )
        .expect("write diagnostic");

        let path = cet6_diagnostic_dir(&root, "paper/../1").join("attempt-1.json");
        assert_eq!(fs::read_to_string(&path).unwrap(), contents);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn practice_sessions_round_trip_inside_the_data_directory() {
        let root = temp_path("practice-session");
        let contents = r#"{"answers":{"q1":"A"},"submitted":true}"#;
        save_practice_session(
            root.to_string_lossy().to_string(),
            "paper/unsafe".into(),
            contents.into(),
        )
        .unwrap();

        let loaded =
            load_practice_session(root.to_string_lossy().to_string(), "paper/unsafe".into())
                .unwrap()
                .unwrap();
        assert_eq!(loaded, contents);
        assert!(root.join(PRACTICE_DIR).join("paper_unsafe.json").is_file());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn read_audio_file_rejects_non_mp3_files() {
        let root = temp_path("audio-read-root");
        fs::create_dir_all(&root).unwrap();
        let path = root.join("sample.wav");
        fs::write(&path, b"audio").unwrap();

        assert!(read_audio_file(path.to_string_lossy().to_string()).is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn read_image_file_accepts_supported_images_and_rejects_other_files() {
        let root = temp_path("image-read-root");
        fs::create_dir_all(&root).unwrap();
        let image = root.join("payment.JPG");
        fs::write(&image, b"image-bytes").unwrap();
        let text = root.join("notes.txt");
        fs::write(&text, b"text").unwrap();

        assert_eq!(
            read_image_file(image.to_string_lossy().to_string()).unwrap(),
            b"image-bytes"
        );
        assert!(read_image_file(text.to_string_lossy().to_string()).is_err());
        let _ = fs::remove_dir_all(root);
    }
}
