use crate::error::{AppError, AppResult};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hound::WavReader;
use reqwest::Client;
use rusty_mp3::{Mp3Encoder, Mp3EncoderConfig};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::num::{NonZeroU16, NonZeroU32};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncReadExt;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_ALIYUN_CHARS: usize = 600;
const MAX_SPEECH_SEGMENT_CHARS: usize = 500;
const TARGET_SAMPLE_RATE: u32 = 24_000;
const ANSWER_PAUSE_MS: u32 = 13_100;
const EXPECTED_ANSWER_PAUSES: usize = 25;
const EXPECTED_GROUP_ANNOUNCEMENTS: usize = 7;
const TTS_RETRIES: usize = 4;
const KITTEN_SIDECAR_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const KITTEN_BASE_WPM: f32 = 148.7;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsProbeResult {
    pub bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningSpeechPlan {
    pub version: u32,
    pub target_wpm: u32,
    pub segments: Vec<SpeechSegment>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSegment {
    pub id: String,
    pub role: String,
    pub text: String,
    pub pause_after_ms: u32,
    pub section: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechSynthesisConfig {
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub female_voice: String,
    pub male_voice: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct KittenRequestSegment {
    id: String,
    text: String,
    voice: String,
    output_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListeningAudioResult {
    pub output_path: String,
    pub cache_dir: String,
    pub duration_ms: u64,
    pub bytes: usize,
    pub speech_segments: usize,
    pub question_pause_count: usize,
    pub group_announcement_count: usize,
    pub target_wpm: u32,
    pub effective_wpm: f32,
    pub tempo: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TtsProgress {
    phase: String,
    completed: usize,
    total: usize,
    current_id: Option<String>,
}

#[derive(Debug)]
struct AudioClip {
    samples: Vec<f32>,
    sample_rate: u32,
}

#[derive(Debug)]
struct PreparedSegment {
    audio: AudioClip,
    pause_after_ms: u32,
}

#[tauri::command]
pub async fn test_tts_connection(
    app: AppHandle,
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    voice: String,
    speed: f32,
) -> AppResult<TtsProbeResult> {
    let bytes = match provider.as_str() {
        "aliyun" => request_aliyun(&base_url, &api_key, &model, "Connection test.", &voice).await?,
        "mimo" => request_mimo(&base_url, &api_key, &model, "Connection test.", &voice).await?,
        "siliconflow" => {
            request_openai_compatible(
                &base_url,
                Some(&api_key),
                &model,
                "Connection test.",
                &voice,
                speed,
            )
            .await?
        }
        "openai-compatible" => {
            request_openai_compatible(
                &base_url,
                if api_key.trim().is_empty() {
                    None
                } else {
                    Some(&api_key)
                },
                &model,
                "Connection test.",
                &voice,
                speed,
            )
            .await?
        }
        "kitten" => run_kitten_connection_probe(&app, &voice, speed).await?,
        other => {
            return Err(AppError::Io(format!("unsupported TTS provider: {other}")));
        }
    };
    decode_wav(&bytes)?;
    Ok(TtsProbeResult { bytes: bytes.len() })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn synthesize_tts_segment(
    app: AppHandle,
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    text: String,
    voice: String,
    speed: f32,
    output_path: String,
) -> AppResult<usize> {
    if provider == "kitten" {
        let path = PathBuf::from(&output_path);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let request = KittenRequestSegment {
            id: "single-segment".into(),
            text,
            voice,
            output_path: output_path.clone(),
        };
        let (sidecar, model_dir) = resolve_kitten_assets(&app)?;
        run_kitten_sidecar(&sidecar, &model_dir, &[request], speed).await?;
        return Ok(tokio::fs::metadata(path).await?.len() as usize);
    }
    let config = SpeechSynthesisConfig {
        provider,
        base_url,
        api_key,
        model,
        female_voice: voice.clone(),
        male_voice: voice.clone(),
    };
    let raw = request_speech_with_retry(&config, &text, &voice).await?;
    let mut clip = prepare_clip(decode_wav(&raw)?)?;
    let tempo = speed.clamp(0.5, 2.0);
    if (tempo - 1.0).abs() >= 0.002 {
        let sample_rate = NonZeroU32::new(TARGET_SAMPLE_RATE)
            .ok_or_else(|| AppError::Io("invalid target sample rate".into()))?;
        let channels =
            NonZeroU16::new(1).ok_or_else(|| AppError::Io("invalid channel count".into()))?;
        clip.samples = wsola::stretch(&clip.samples, sample_rate, channels, tempo)
            .map_err(|error| AppError::Io(format!("could not adjust speech tempo: {error}")))?;
    }
    let bytes = encode_wav(&clip.samples)?;
    let path = Path::new(&output_path);
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(path, &bytes).await?;
    Ok(bytes.len())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn generate_listening_audio(
    app: AppHandle,
    plan: ListeningSpeechPlan,
    config: SpeechSynthesisConfig,
    output_path: String,
    cache_dir: String,
) -> AppResult<ListeningAudioResult> {
    generate_listening_audio_inner(plan, config, output_path, cache_dir, Some(&app)).await
}

async fn generate_listening_audio_inner(
    plan: ListeningSpeechPlan,
    config: SpeechSynthesisConfig,
    output_path: String,
    cache_dir: String,
    app: Option<&AppHandle>,
) -> AppResult<ListeningAudioResult> {
    validate_listening_plan(&plan)?;
    validate_synthesis_config(&config)?;

    let cache_dir = PathBuf::from(cache_dir);
    tokio::fs::create_dir_all(&cache_dir).await?;
    let source_path = cache_dir.join("audio-source.json");
    tokio::fs::write(
        &source_path,
        serde_json::to_vec_pretty(&json!({
            "version": plan.version,
            "targetWpm": plan.target_wpm,
            "provider": config.provider,
            "model": config.model,
            "femaleVoice": config.female_voice,
            "maleVoice": config.male_voice,
            "segments": plan.segments,
        }))?,
    )
    .await?;

    if config.provider == "kitten" {
        prepare_kitten_cache(app, &plan.segments, &config, &cache_dir, plan.target_wpm).await?;
    }

    let total = plan.segments.len();
    let mut prepared = Vec::with_capacity(total);
    let mut total_words = 0usize;
    let mut question_pause_count = 0usize;
    let mut group_announcement_count = 0usize;

    for (index, segment) in plan.segments.iter().enumerate() {
        if segment.pause_after_ms == ANSWER_PAUSE_MS {
            question_pause_count += 1;
        }
        if segment.id.ends_with("-announcement") {
            group_announcement_count += 1;
        }

        let voice = voice_for_segment(segment, &config)?;
        let cache_path = segment_cache_path(&cache_dir, index, segment, &config, voice);
        let raw = match tokio::fs::read(&cache_path).await {
            Ok(bytes) if bytes.len() > 128 => match decode_wav(&bytes) {
                Ok(_) => bytes,
                Err(_) => {
                    let _ = tokio::fs::remove_file(&cache_path).await;
                    fetch_and_cache_speech(&config, &segment.text, voice, &cache_path).await?
                }
            },
            _ => fetch_and_cache_speech(&config, &segment.text, voice, &cache_path).await?,
        };

        let audio = prepare_clip(decode_wav(&raw)?)?;
        total_words += count_spoken_words(&segment.text);
        prepared.push(PreparedSegment {
            audio,
            pause_after_ms: segment.pause_after_ms,
        });

        emit_tts_progress(
            app,
            TtsProgress {
                phase: "synthesizing".into(),
                completed: index + 1,
                total,
                current_id: Some(segment.id.clone()),
            },
        );
    }

    emit_tts_progress(
        app,
        TtsProgress {
            phase: "assembling".into(),
            completed: total,
            total,
            current_id: None,
        },
    );

    let target_wpm = plan.target_wpm as f32;
    let (tempo, effective_wpm, pcm, duration_ms) =
        normalize_tempo_and_assemble(prepared, total_words, target_wpm)?;
    let output = PathBuf::from(&output_path);
    if let Some(parent) = output.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mp3 = encode_mp3(&pcm)?;
    write_file_atomically(&output, &mp3)?;

    emit_tts_progress(
        app,
        TtsProgress {
            phase: "complete".into(),
            completed: total,
            total,
            current_id: None,
        },
    );

    Ok(ListeningAudioResult {
        output_path: output.to_string_lossy().into_owned(),
        cache_dir: cache_dir.to_string_lossy().into_owned(),
        duration_ms,
        bytes: mp3.len(),
        speech_segments: total,
        question_pause_count,
        group_announcement_count,
        target_wpm: plan.target_wpm,
        effective_wpm,
        tempo,
    })
}

fn emit_tts_progress(app: Option<&AppHandle>, progress: TtsProgress) {
    if let Some(app) = app {
        let _ = app.emit("tts-progress", progress);
    }
}

fn validate_listening_plan(plan: &ListeningSpeechPlan) -> AppResult<()> {
    if plan.version != 1 {
        return Err(AppError::Io(
            "unsupported listening speech plan version".into(),
        ));
    }
    if !(140..=200).contains(&plan.target_wpm) {
        return Err(AppError::Io("targetWpm must be between 140 and 200".into()));
    }
    if plan.segments.is_empty() {
        return Err(AppError::Io("listening speech plan has no segments".into()));
    }

    let answer_pauses = plan
        .segments
        .iter()
        .filter(|segment| segment.pause_after_ms == ANSWER_PAUSE_MS)
        .count();
    if answer_pauses != EXPECTED_ANSWER_PAUSES {
        return Err(AppError::Io(format!(
            "the paper must contain {EXPECTED_ANSWER_PAUSES} listening questions, found {answer_pauses}"
        )));
    }
    let announcements = plan
        .segments
        .iter()
        .filter(|segment| segment.id.ends_with("-announcement"))
        .count();
    if announcements != EXPECTED_GROUP_ANNOUNCEMENTS {
        return Err(AppError::Io(format!(
            "expected {EXPECTED_GROUP_ANNOUNCEMENTS} listening group announcements, found {announcements}"
        )));
    }

    for segment in &plan.segments {
        if segment.id.trim().is_empty() || segment.text.trim().is_empty() {
            return Err(AppError::Io(
                "listening speech plan contains an empty segment".into(),
            ));
        }
        if segment.text.chars().count() > MAX_SPEECH_SEGMENT_CHARS {
            return Err(AppError::Io(format!(
                "speech segment {} exceeds {MAX_SPEECH_SEGMENT_CHARS} characters",
                segment.id
            )));
        }
        if !matches!(segment.role.as_str(), "narrator" | "female" | "male") {
            return Err(AppError::Io(format!(
                "speech segment {} has an unsupported role",
                segment.id
            )));
        }
        if !matches!(
            segment.section.as_str(),
            "opening" | "cet-listening-a" | "cet-listening-b" | "cet-listening-c"
        ) {
            return Err(AppError::Io(format!(
                "speech segment {} has an unsupported section",
                segment.id
            )));
        }
    }
    Ok(())
}

fn validate_synthesis_config(config: &SpeechSynthesisConfig) -> AppResult<()> {
    if !matches!(
        config.provider.as_str(),
        "aliyun" | "mimo" | "siliconflow" | "kitten" | "openai-compatible"
    ) {
        return Err(AppError::Io(format!(
            "unsupported TTS provider: {}",
            config.provider
        )));
    }
    if config.provider != "kitten"
        && (config.base_url.trim().is_empty() || config.model.trim().is_empty())
    {
        return Err(AppError::Io(
            "TTS endpoint and model must not be empty".into(),
        ));
    }
    if config.female_voice.trim().is_empty() || config.male_voice.trim().is_empty() {
        return Err(AppError::Io("both TTS voices must not be empty".into()));
    }
    if matches!(config.provider.as_str(), "aliyun" | "mimo" | "siliconflow")
        && config.api_key.trim().is_empty()
    {
        return Err(AppError::Auth);
    }
    Ok(())
}

fn voice_for_segment<'a>(
    segment: &SpeechSegment,
    config: &'a SpeechSynthesisConfig,
) -> AppResult<&'a str> {
    match segment.role.as_str() {
        "male" => Ok(&config.male_voice),
        "female" | "narrator" => Ok(&config.female_voice),
        _ => Err(AppError::Io(format!(
            "speech segment {} has an unsupported role",
            segment.id
        ))),
    }
}

fn resolve_kitten_assets(app: &AppHandle) -> AppResult<(PathBuf, PathBuf)> {
    let mut sidecar_candidates = Vec::new();
    if let Some(path) = std::env::var_os("CET6_KITTEN_SIDECAR") {
        sidecar_candidates.push(PathBuf::from(path));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        sidecar_candidates.push(resource_dir.join("kitten-tts.exe"));
        sidecar_candidates.push(resource_dir.join("resources").join("kitten-tts.exe"));
    }
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    sidecar_candidates.push(manifest_dir.join("resources").join("kitten-tts.exe"));
    sidecar_candidates.push(
        manifest_dir
            .join("sidecars")
            .join("dist")
            .join("kitten-tts.exe"),
    );
    let sidecar = sidecar_candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| {
            AppError::Io(
                "Kitten sidecar is missing. Reinstall the app or set CET6_KITTEN_SIDECAR.".into(),
            )
        })?;

    let mut model_candidates = Vec::new();
    if let Some(path) = std::env::var_os("CET6_KITTEN_MODEL_DIR") {
        model_candidates.push(PathBuf::from(path));
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        model_candidates.push(resource_dir.join("kitten-model"));
        model_candidates.push(resource_dir.join("resources").join("kitten-model"));
    }
    model_candidates.push(manifest_dir.join("resources").join("kitten-model"));
    let model_dir = model_candidates
        .into_iter()
        .find(|path| path.join("config.json").is_file())
        .ok_or_else(|| {
            AppError::Io(
                "Kitten model files are missing. Reinstall the app or set CET6_KITTEN_MODEL_DIR."
                    .into(),
            )
        })?;
    Ok((sidecar, model_dir))
}

async fn run_kitten_connection_probe(
    app: &AppHandle,
    voice: &str,
    requested_speed: f32,
) -> AppResult<Vec<u8>> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let root = std::env::temp_dir().join(format!("cet6-kitten-probe-{nanos}"));
    tokio::fs::create_dir_all(&root).await?;
    let output = root.join("probe.wav");
    let request = KittenRequestSegment {
        id: "connection-test".into(),
        text: "Connection test.".into(),
        voice: voice.into(),
        output_path: output.to_string_lossy().into_owned(),
    };
    let (sidecar, model_dir) = resolve_kitten_assets(app)?;
    let native_speed = (requested_speed * 170.0 / KITTEN_BASE_WPM).clamp(0.5, 2.0);
    let result = run_kitten_sidecar(&sidecar, &model_dir, &[request], native_speed)
        .await
        .and_then(|_| Ok(()));
    let bytes = match result {
        Ok(()) => tokio::fs::read(&output).await?,
        Err(error) => {
            let _ = tokio::fs::remove_dir_all(&root).await;
            return Err(error);
        }
    };
    decode_wav(&bytes)?;
    let _ = tokio::fs::remove_dir_all(root).await;
    Ok(bytes)
}

async fn prepare_kitten_cache(
    app: Option<&AppHandle>,
    segments: &[SpeechSegment],
    config: &SpeechSynthesisConfig,
    cache_dir: &Path,
    target_wpm: u32,
) -> AppResult<()> {
    let app = app.ok_or_else(|| {
        AppError::Io("Kitten synthesis requires the desktop app resource directory".into())
    })?;
    let mut missing = Vec::new();
    for (index, segment) in segments.iter().enumerate() {
        let voice = voice_for_segment(segment, config)?;
        let output = segment_cache_path(cache_dir, index, segment, config, voice);
        let valid = match tokio::fs::read(&output).await {
            Ok(bytes) if bytes.len() > 128 => decode_wav(&bytes).is_ok(),
            _ => false,
        };
        if !valid {
            if output.exists() {
                let _ = tokio::fs::remove_file(&output).await;
            }
            missing.push(KittenRequestSegment {
                id: segment.id.clone(),
                text: segment.text.clone(),
                voice: voice.into(),
                output_path: output.to_string_lossy().into_owned(),
            });
        }
    }
    if missing.is_empty() {
        return Ok(());
    }

    let (sidecar, model_dir) = resolve_kitten_assets(app)?;
    let native_speed = (target_wpm as f32 / KITTEN_BASE_WPM).clamp(0.5, 2.0);
    run_kitten_sidecar(&sidecar, &model_dir, &missing, native_speed).await?;
    for request in &missing {
        let bytes = tokio::fs::read(&request.output_path).await?;
        decode_wav(&bytes)?;
    }
    Ok(())
}

async fn run_kitten_sidecar(
    sidecar: &Path,
    model_dir: &Path,
    segments: &[KittenRequestSegment],
    speed: f32,
) -> AppResult<()> {
    if segments.is_empty() {
        return Ok(());
    }
    let parent = Path::new(&segments[0].output_path)
        .parent()
        .ok_or_else(|| AppError::Io("invalid Kitten output path".into()))?;
    tokio::fs::create_dir_all(parent).await?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let request_path = parent.join(format!(".kitten-request-{nanos}.json"));
    tokio::fs::write(
        &request_path,
        serde_json::to_vec_pretty(&json!({
            "version": 1,
            "speed": speed.clamp(0.5, 2.0),
            "segments": segments,
        }))?,
    )
    .await?;

    let mut command = tokio::process::Command::new(sidecar);
    command
        .arg("--request")
        .arg(&request_path)
        .arg("--model-dir")
        .arg(model_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(target_os = "windows")]
    command.creation_flags(0x0800_0000);

    let mut child = command
        .spawn()
        .map_err(|error| AppError::Io(format!("could not start the Kitten sidecar: {error}")))?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Io("could not capture Kitten stdout".into()))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Io("could not capture Kitten stderr".into()))?;
    let stdout_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        stdout.read_to_end(&mut bytes).await.map(|_| bytes)
    });
    let stderr_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        stderr.read_to_end(&mut bytes).await.map(|_| bytes)
    });

    let status = match tokio::time::timeout(KITTEN_SIDECAR_TIMEOUT, child.wait()).await {
        Ok(result) => result?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = tokio::fs::remove_file(&request_path).await;
            return Err(AppError::Timeout);
        }
    };
    let stdout = stdout_task
        .await
        .map_err(|error| AppError::Io(error.to_string()))??;
    let stderr = stderr_task
        .await
        .map_err(|error| AppError::Io(error.to_string()))??;
    let _ = tokio::fs::remove_file(&request_path).await;

    if !status.success() {
        let detail = String::from_utf8_lossy(&stderr);
        let detail: String = detail.chars().take(4_000).collect();
        return Err(AppError::Io(format!(
            "Kitten sidecar failed with {status}: {detail}"
        )));
    }
    let response: Value = serde_json::from_slice(&stdout)?;
    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(AppError::Io(format!(
            "Kitten sidecar returned an invalid result: {}",
            response
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("unknown error")
        )));
    }
    Ok(())
}

async fn fetch_and_cache_speech(
    config: &SpeechSynthesisConfig,
    text: &str,
    voice: &str,
    cache_path: &Path,
) -> AppResult<Vec<u8>> {
    let bytes = request_speech_with_retry(config, text, voice).await?;
    decode_wav(&bytes)?;
    let tmp = cache_path.with_extension("wav.part");
    tokio::fs::write(&tmp, &bytes).await?;
    if cache_path.exists() {
        tokio::fs::remove_file(cache_path).await?;
    }
    tokio::fs::rename(&tmp, cache_path).await?;
    Ok(bytes)
}

async fn request_speech_with_retry(
    config: &SpeechSynthesisConfig,
    text: &str,
    voice: &str,
) -> AppResult<Vec<u8>> {
    let mut last_error = None;
    for attempt in 0..TTS_RETRIES {
        let result = match config.provider.as_str() {
            "aliyun" => {
                request_aliyun(
                    &config.base_url,
                    &config.api_key,
                    &config.model,
                    text,
                    voice,
                )
                .await
            }
            "openai-compatible" => {
                request_openai_compatible(
                    &config.base_url,
                    if config.api_key.trim().is_empty() {
                        None
                    } else {
                        Some(&config.api_key)
                    },
                    &config.model,
                    text,
                    voice,
                    1.0,
                )
                .await
            }
            "mimo" => {
                request_mimo(
                    &config.base_url,
                    &config.api_key,
                    &config.model,
                    text,
                    voice,
                )
                .await
            }
            "siliconflow" => {
                request_openai_compatible(
                    &config.base_url,
                    Some(&config.api_key),
                    &config.model,
                    text,
                    voice,
                    1.0,
                )
                .await
            }
            other => {
                return Err(AppError::Io(format!("unsupported TTS provider: {other}")));
            }
        };

        match result {
            Ok(bytes) => return Ok(bytes),
            Err(AppError::Auth) => return Err(AppError::Auth),
            Err(error) => {
                last_error = Some(error);
                if attempt + 1 < TTS_RETRIES {
                    tokio::time::sleep(Duration::from_secs(2_u64 << attempt)).await;
                }
            }
        }
    }
    Err(last_error
        .unwrap_or_else(|| AppError::Http("TTS request failed without a provider error".into())))
}

async fn request_aliyun(
    base_url: &str,
    api_key: &str,
    model: &str,
    text: &str,
    voice: &str,
) -> AppResult<Vec<u8>> {
    if text.chars().count() > MAX_ALIYUN_CHARS {
        return Err(AppError::Io(format!(
            "Aliyun TTS text exceeds {MAX_ALIYUN_CHARS} characters"
        )));
    }
    let client = Client::builder().timeout(DEFAULT_TIMEOUT).build()?;
    let response = client
        .post(base_url)
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "input": {
                "text": text,
                "voice": voice,
                "language_type": "English"
            }
        }))
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(http_status_error(status.as_u16(), body));
    }
    let parsed: Value = serde_json::from_str(&body)?;
    let audio_url = parsed
        .get("output")
        .and_then(|value| value.get("audio"))
        .and_then(|value| value.get("url"))
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Serde("Aliyun response has no output.audio.url".into()))?;
    Ok(client
        .get(audio_url)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?
        .to_vec())
}

async fn request_openai_compatible(
    base_url: &str,
    api_key: Option<&str>,
    model: &str,
    text: &str,
    voice: &str,
    speed: f32,
) -> AppResult<Vec<u8>> {
    let base_url = base_url.trim_end_matches('/');
    let endpoint = if base_url.ends_with("/audio/speech") {
        base_url.to_string()
    } else {
        format!("{base_url}/audio/speech")
    };
    let client = Client::builder().timeout(DEFAULT_TIMEOUT).build()?;
    let mut request = client.post(endpoint).json(&json!({
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": "wav",
        "speed": speed.clamp(0.5, 2.0)
    }));
    if let Some(key) = api_key.filter(|key| !key.trim().is_empty()) {
        request = request.bearer_auth(key);
    }
    let response = request.send().await?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(http_status_error(status.as_u16(), body));
    }
    Ok(response.bytes().await?.to_vec())
}

async fn request_mimo(
    base_url: &str,
    api_key: &str,
    model: &str,
    text: &str,
    voice: &str,
) -> AppResult<Vec<u8>> {
    let base_url = base_url.trim_end_matches('/');
    let endpoint = if base_url.ends_with("/chat/completions") {
        base_url.to_string()
    } else {
        format!("{base_url}/chat/completions")
    };
    let client = Client::builder().timeout(DEFAULT_TIMEOUT).build()?;
    let response = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": "Read in a clear, neutral, natural American English voice suitable for a university listening examination. Keep a steady pace and precise pronunciation."
                },
                {
                    "role": "assistant",
                    "content": text
                }
            ],
            "audio": {
                "format": "wav",
                "voice": voice
            }
        }))
        .send()
        .await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(http_status_error(status.as_u16(), body));
    }
    decode_mimo_audio_response(&body)
}

fn decode_mimo_audio_response(body: &str) -> AppResult<Vec<u8>> {
    let parsed: Value = serde_json::from_str(body)?;
    let encoded = parsed
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("audio"))
        .and_then(|audio| audio.get("data"))
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::Serde("MiMo response has no message.audio.data".into()))?;
    BASE64
        .decode(encoded)
        .map_err(|error| AppError::Serde(format!("invalid MiMo base64 audio: {error}")))
}

fn decode_wav(bytes: &[u8]) -> AppResult<AudioClip> {
    let repaired = repair_unbounded_wav_sizes(bytes);
    let mut reader = WavReader::new(Cursor::new(repaired))
        .map_err(|error| AppError::Io(format!("invalid WAV audio: {error}")))?;
    let spec = reader.spec();
    if spec.channels == 0 || spec.sample_rate == 0 {
        return Err(AppError::Io(
            "TTS provider returned WAV audio without a valid sample rate".into(),
        ));
    }

    let interleaved = match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Float, 32) => reader
            .samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| AppError::Io(format!("could not decode WAV audio: {error}")))?,
        (hound::SampleFormat::Int, 16) => reader
            .samples::<i16>()
            .map(|sample| sample.map(|value| value as f32 / i16::MAX as f32))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| AppError::Io(format!("could not decode WAV audio: {error}")))?,
        (hound::SampleFormat::Int, 24 | 32) => {
            let scale = 2_f64.powi(spec.bits_per_sample as i32 - 1) as f32;
            reader
                .samples::<i32>()
                .map(|sample| sample.map(|value| value as f32 / scale))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| AppError::Io(format!("could not decode WAV audio: {error}")))?
        }
        (format, bits) => {
            return Err(AppError::Io(format!(
                "unsupported WAV format {format:?} with {bits} bits per sample"
            )));
        }
    };

    let channels = spec.channels as usize;
    if !interleaved.len().is_multiple_of(channels) {
        return Err(AppError::Io(
            "WAV sample data is not aligned to its channel count".into(),
        ));
    }
    let samples = interleaved
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect();
    Ok(AudioClip {
        samples,
        sample_rate: spec.sample_rate,
    })
}

/// Alibaba Cloud's non-realtime TTS currently returns a valid PCM WAV stream
/// with placeholder RIFF/data lengths (`0x7fffffxx`) rather than the final file
/// length. Browsers and FFmpeg tolerate this; strict WAV readers do not.
fn repair_unbounded_wav_sizes(bytes: &[u8]) -> Vec<u8> {
    let mut repaired = bytes.to_vec();
    if repaired.len() < 12 || &repaired[0..4] != b"RIFF" || &repaired[8..12] != b"WAVE" {
        return repaired;
    }

    let actual_riff_size = repaired.len().saturating_sub(8) as u64;
    let declared_riff_size = read_u32_le(&repaired, 4).unwrap_or(0) as u64;
    if declared_riff_size > actual_riff_size {
        write_u32_le(&mut repaired, 4, actual_riff_size as u32);
    }

    let block_align = if repaired.len() >= 34 && &repaired[12..16] == b"fmt " {
        u16::from_le_bytes([repaired[32], repaired[33]]).max(1) as u64
    } else {
        1
    };
    let mut offset = 12usize;
    while offset + 8 <= repaired.len() {
        let chunk_size = read_u32_le(&repaired, offset + 4).unwrap_or(0) as u64;
        let data_start = offset + 8;
        if &repaired[offset..offset + 4] == b"data" {
            let available = repaired.len().saturating_sub(data_start) as u64;
            if chunk_size > available {
                let aligned = available / block_align * block_align;
                write_u32_le(&mut repaired, offset + 4, aligned as u32);
                repaired.truncate(data_start + aligned as usize);
            }
            break;
        }
        let next = data_start.saturating_add(chunk_size as usize);
        if chunk_size > u32::MAX as u64 || next <= offset || next + 8 > repaired.len() {
            break;
        }
        offset = next + (chunk_size as usize & 1);
    }
    repaired
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    Some(u32::from_le_bytes(
        bytes.get(offset..offset + 4)?.try_into().ok()?,
    ))
}

fn write_u32_le(bytes: &mut [u8], offset: usize, value: u32) {
    if let Some(target) = bytes.get_mut(offset..offset + 4) {
        target.copy_from_slice(&value.to_le_bytes());
    }
}

fn prepare_clip(mut clip: AudioClip) -> AppResult<AudioClip> {
    clip.samples = resample_mono(&clip.samples, clip.sample_rate, TARGET_SAMPLE_RATE);
    clip.sample_rate = TARGET_SAMPLE_RATE;
    trim_and_normalize(&mut clip.samples)?;
    Ok(clip)
}

fn resample_mono(input: &[f32], source_rate: u32, target_rate: u32) -> Vec<f32> {
    if source_rate == target_rate || input.is_empty() {
        return input.to_vec();
    }
    let output_len =
        ((input.len() as f64 * target_rate as f64 / source_rate as f64).round()) as usize;
    let ratio = source_rate as f64 / target_rate as f64;
    let mut output = Vec::with_capacity(output_len);
    for index in 0..output_len {
        let position = index as f64 * ratio;
        let left = position.floor() as usize;
        if left >= input.len() - 1 {
            output.push(input[input.len() - 1]);
            continue;
        }
        let fraction = (position - left as f64) as f32;
        output.push(input[left] * (1.0 - fraction) + input[left + 1] * fraction);
    }
    output
}

fn trim_and_normalize(samples: &mut Vec<f32>) -> AppResult<()> {
    let peak = samples
        .iter()
        .map(|sample| sample.abs())
        .fold(0.0_f32, f32::max);
    if peak <= f32::EPSILON {
        return Err(AppError::Io("TTS provider returned silent audio".into()));
    }

    let threshold = peak * 10_f32.powf(-42.0 / 20.0);
    let first = samples
        .iter()
        .position(|sample| sample.abs() >= threshold)
        .unwrap_or(0);
    let last = samples
        .iter()
        .rposition(|sample| sample.abs() >= threshold)
        .unwrap_or(samples.len().saturating_sub(1));
    let keep = (TARGET_SAMPLE_RATE as usize * 50) / 1000;
    let start = first.saturating_sub(keep);
    let end = (last + keep + 1).min(samples.len());
    samples.truncate(end);
    samples.drain(..start);

    let trimmed_peak = samples
        .iter()
        .map(|sample| sample.abs())
        .fold(0.0_f32, f32::max);
    if trimmed_peak <= f32::EPSILON {
        return Err(AppError::Io("TTS provider returned silent audio".into()));
    }
    let gain = 10_f32.powf(-1.0 / 20.0) / trimmed_peak;
    for sample in samples {
        *sample = (*sample * gain).clamp(-1.0, 1.0);
    }
    Ok(())
}

fn count_spoken_words(text: &str) -> usize {
    let mut count = 0;
    let mut in_word = false;
    for character in text.chars() {
        if character.is_alphanumeric() {
            if !in_word {
                count += 1;
                in_word = true;
            }
        } else if character != '\'' && character != '’' {
            in_word = false;
        }
    }
    count
}

fn normalize_tempo_and_assemble(
    segments: Vec<PreparedSegment>,
    total_words: usize,
    target_wpm: f32,
) -> AppResult<(f32, f32, Vec<f32>, u64)> {
    if total_words == 0 || segments.is_empty() {
        return Err(AppError::Io(
            "listening speech plan contains no spoken words".into(),
        ));
    }
    let sample_rate = NonZeroU32::new(TARGET_SAMPLE_RATE)
        .ok_or_else(|| AppError::Io("invalid target sample rate".into()))?;
    let channels =
        NonZeroU16::new(1).ok_or_else(|| AppError::Io("invalid channel count".into()))?;

    let raw_speech_seconds = segments
        .iter()
        .map(|segment| segment.audio.samples.len() as f64 / TARGET_SAMPLE_RATE as f64)
        .sum::<f64>();
    let natural_pause_seconds = segments
        .iter()
        .filter(|segment| segment.pause_after_ms < 5_000)
        .map(|segment| segment.pause_after_ms as f64 / 1000.0)
        .sum::<f64>();
    let target_timed_seconds = total_words as f64 * 60.0 / target_wpm as f64;
    let needed_speech_seconds = target_timed_seconds - natural_pause_seconds;
    if needed_speech_seconds <= 0.25 {
        return Err(AppError::Io(
            "the selected speech rate cannot fit this listening plan".into(),
        ));
    }
    let tempo = (raw_speech_seconds / needed_speech_seconds) as f32;
    if !tempo.is_finite() || !(0.5..=2.0).contains(&tempo) {
        return Err(AppError::Io(format!(
            "speech tempo adjustment is outside the safe range: {tempo:.3}"
        )));
    }

    let mut output = Vec::new();
    let mut timed_speech_seconds = 0.0;
    let mut natural_pause_seconds = 0.0;
    for segment in segments {
        let stretched = if (tempo - 1.0).abs() < 0.002 {
            segment.audio.samples
        } else {
            wsola::stretch(&segment.audio.samples, sample_rate, channels, tempo)
                .map_err(|error| AppError::Io(format!("could not adjust speech tempo: {error}")))?
        };
        timed_speech_seconds += stretched.len() as f64 / TARGET_SAMPLE_RATE as f64;
        output.extend_from_slice(&stretched);
        let pause_samples =
            (TARGET_SAMPLE_RATE as u64 * segment.pause_after_ms as u64 / 1000) as usize;
        output.resize(output.len() + pause_samples, 0.0);
        if segment.pause_after_ms < 5_000 {
            natural_pause_seconds += segment.pause_after_ms as f64 / 1000.0;
        }
    }

    let effective_wpm =
        (total_words as f64 * 60.0 / (timed_speech_seconds + natural_pause_seconds)) as f32;
    let duration_ms = (output.len() as u64 * 1000) / TARGET_SAMPLE_RATE as u64;
    Ok((tempo, effective_wpm, output, duration_ms))
}

fn encode_wav(samples: &[f32]) -> AppResult<Vec<u8>> {
    let mut bytes = Cursor::new(Vec::new());
    {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: TARGET_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::new(&mut bytes, spec)
            .map_err(|error| AppError::Io(format!("could not create WAV audio: {error}")))?;
        for sample in samples {
            writer
                .write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                .map_err(|error| AppError::Io(format!("could not write WAV audio: {error}")))?;
        }
        writer
            .finalize()
            .map_err(|error| AppError::Io(format!("could not finish WAV audio: {error}")))?;
    }
    Ok(bytes.into_inner())
}

fn encode_mp3(samples: &[f32]) -> AppResult<Vec<u8>> {
    let mut encoder = Mp3Encoder::new(Mp3EncoderConfig {
        bitrate_kbps: 64,
        vbr_quality: None,
    });
    encoder
        .push_pcm_f32(samples, 1, TARGET_SAMPLE_RATE)
        .map_err(|error| AppError::Io(format!("could not encode MP3 audio: {error}")))?;
    encoder.finish();
    let mut bytes = Vec::new();
    while let Ok(packet) = encoder.next_packet() {
        bytes.extend_from_slice(&packet);
    }
    if bytes.is_empty() {
        return Err(AppError::Io("MP3 encoder produced no audio".into()));
    }
    Ok(bytes)
}

fn write_file_atomically(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let temp = path.with_extension("mp3.part");
    std::fs::write(&temp, bytes)?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    std::fs::rename(temp, path)?;
    Ok(())
}

fn segment_cache_path(
    cache_dir: &Path,
    index: usize,
    segment: &SpeechSegment,
    config: &SpeechSynthesisConfig,
    voice: &str,
) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(config.provider.as_bytes());
    hasher.update([0]);
    hasher.update(config.base_url.as_bytes());
    hasher.update([0]);
    hasher.update(config.model.as_bytes());
    hasher.update([0]);
    hasher.update(voice.as_bytes());
    hasher.update([0]);
    hasher.update(segment.text.as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    let safe_id: String = segment
        .id
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect();
    let preferred = cache_dir.join(format!(
        "{:03}-{}-{}.wav",
        index + 1,
        safe_id,
        &digest[..12]
    ));
    if preferred.is_file() {
        return preferred;
    }
    let suffix = format!("-{safe_id}-{}.wav", &digest[..12]);
    if let Ok(entries) = std::fs::read_dir(cache_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(&suffix) && entry.path().is_file() {
                return entry.path();
            }
        }
    }
    preferred
}

fn http_status_error(status: u16, body: String) -> AppError {
    match status {
        401 | 403 => AppError::Auth,
        429 => AppError::Quota,
        _ => AppError::Http(format!("HTTP {status}: {body}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use hound::{WavSpec, WavWriter};

    fn test_wav(sample_rate: u32, samples: &[f32]) -> Vec<u8> {
        let mut bytes = Cursor::new(Vec::new());
        {
            let spec = WavSpec {
                channels: 1,
                sample_rate,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };
            let mut writer = WavWriter::new(&mut bytes, spec).unwrap();
            for sample in samples {
                writer
                    .write_sample((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                    .unwrap();
            }
            writer.finalize().unwrap();
        }
        bytes.into_inner()
    }

    fn segment(id: &str, text: &str, pause_after_ms: u32, role: &str) -> SpeechSegment {
        SpeechSegment {
            id: id.into(),
            role: role.into(),
            text: text.into(),
            pause_after_ms,
            section: "cet-listening-a".into(),
        }
    }

    fn complete_plan() -> ListeningSpeechPlan {
        let mut segments = Vec::new();
        for number in 1..=25 {
            segments.push(segment(
                &format!("question-{number}"),
                &format!("Question {number}. What does the speaker mean?"),
                ANSWER_PAUSE_MS,
                "narrator",
            ));
        }
        for number in 1..=7 {
            segments.push(segment(
                &format!("group-{number}-announcement"),
                "Questions one to four are based on the conversation you have just heard.",
                400,
                "narrator",
            ));
        }
        ListeningSpeechPlan {
            version: 1,
            target_wpm: 170,
            segments,
        }
    }

    #[test]
    fn decodes_mono_and_downmixes_stereo_wav() {
        let mono = decode_wav(&test_wav(24_000, &[0.0, 0.5, -0.5])).unwrap();
        assert_eq!(mono.samples.len(), 3);
        assert_eq!(mono.sample_rate, 24_000);

        let mut stereo = Cursor::new(Vec::new());
        {
            let spec = WavSpec {
                channels: 2,
                sample_rate: 16_000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };
            let mut writer = WavWriter::new(&mut stereo, spec).unwrap();
            for sample in [0.5_f32, -0.5, 0.25, 0.25] {
                writer
                    .write_sample((sample * i16::MAX as f32) as i16)
                    .unwrap();
            }
            writer.finalize().unwrap();
        }
        let decoded = decode_wav(&stereo.into_inner()).unwrap();
        assert_eq!(decoded.samples.len(), 2);
        assert!(decoded.samples[0].abs() < 0.001);
        assert!((decoded.samples[1] - 0.25).abs() < 0.001);
    }

    #[test]
    fn accepts_aliyun_placeholder_riff_and_data_lengths() {
        let mut wav = test_wav(24_000, &[0.1, -0.1, 0.2, -0.2]);
        let data_offset = wav
            .windows(4)
            .position(|window| window == b"data")
            .expect("WAV data chunk");
        write_u32_le(&mut wav, 4, 0x7fff_ffbf);
        write_u32_le(&mut wav, data_offset + 4, 0x7fff_ff9b);

        let decoded = decode_wav(&wav).unwrap();
        assert_eq!(decoded.samples.len(), 4);
    }

    #[test]
    fn trims_silence_and_normalizes_peak() {
        let mut samples = vec![0.0; 4_800];
        samples[2_000] = 0.5;
        samples[2_001] = -0.4;
        trim_and_normalize(&mut samples).unwrap();
        let peak = samples
            .iter()
            .map(|sample| sample.abs())
            .fold(0.0_f32, f32::max);
        assert!((peak - 0.891).abs() < 0.002);
        assert!(samples.len() < 5_000);
    }

    #[test]
    fn rejects_incomplete_listening_plan() {
        let mut plan = complete_plan();
        plan.segments
            .retain(|segment| segment.pause_after_ms != ANSWER_PAUSE_MS);
        assert!(validate_listening_plan(&plan).is_err());
    }

    #[test]
    fn requires_exactly_seven_group_announcements() {
        let mut plan = complete_plan();
        plan.segments
            .retain(|segment| !segment.id.ends_with("-announcement"));
        assert!(validate_listening_plan(&plan).is_err());
    }

    #[test]
    fn counts_words_without_punctuation_or_apostrophes() {
        assert_eq!(count_spoken_words("Don't stop — Question 12 is next."), 6);
    }

    #[test]
    fn resamples_to_the_shared_track_rate() {
        let resampled = resample_mono(&vec![0.1; 48_000], 48_000, 24_000);
        assert_eq!(resampled.len(), 24_000);
    }

    #[test]
    fn applies_target_speed_without_scaling_answer_pauses() {
        let sample_count = TARGET_SAMPLE_RATE as usize * 10;
        let samples = (0..sample_count)
            .map(|index| {
                0.25 * (2.0 * std::f32::consts::PI * 220.0 * index as f32
                    / TARGET_SAMPLE_RATE as f32)
                    .sin()
            })
            .collect();
        let (tempo, effective_wpm, pcm, duration_ms) = normalize_tempo_and_assemble(
            vec![
                PreparedSegment {
                    audio: AudioClip {
                        samples,
                        sample_rate: TARGET_SAMPLE_RATE,
                    },
                    pause_after_ms: ANSWER_PAUSE_MS,
                },
                PreparedSegment {
                    audio: AudioClip {
                        samples: vec![0.01; TARGET_SAMPLE_RATE as usize],
                        sample_rate: TARGET_SAMPLE_RATE,
                    },
                    pause_after_ms: 400,
                },
            ],
            29,
            170.0,
        )
        .unwrap();

        assert!((tempo - 1.118).abs() < 0.08);
        assert!((effective_wpm - 170.0).abs() < 8.0);
        assert!(duration_ms >= 13_100 + 400);
        assert!(!pcm.is_empty());
    }

    #[test]
    fn encodes_a_decodable_mp3() {
        let samples = vec![0.1_f32; TARGET_SAMPLE_RATE as usize];
        let bytes = encode_mp3(&samples).unwrap();
        assert!(bytes.len() > 1_000);

        let decoded = rusty_mp3::decode_pipelined(&bytes);
        assert!(!decoded.is_empty());
        assert_eq!(decoded[0].sample_rate, TARGET_SAMPLE_RATE);
        assert_eq!(decoded[0].channels, 1);
    }

    #[test]
    fn decodes_mimo_chat_audio_response() {
        let wav = test_wav(24_000, &[0.0, 0.1, -0.1]);
        let body = json!({
            "choices": [{
                "message": {
                    "audio": { "data": BASE64.encode(&wav) }
                }
            }]
        })
        .to_string();
        assert_eq!(decode_mimo_audio_response(&body).unwrap(), wav);
    }

    #[tokio::test]
    #[ignore = "full-plan audio assembly is a slow integration check"]
    async fn assembles_a_complete_plan_from_resumable_segment_cache() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("cet6-tts-full-{nanos}"));
        let cache_dir = root.join("cache");
        let output = root.join("Listening.mp3");
        std::fs::create_dir_all(&cache_dir).unwrap();

        let mut plan = complete_plan();
        for segment in &mut plan.segments {
            segment.text = "Question follows.".into();
        }
        let config = SpeechSynthesisConfig {
            provider: "openai-compatible".into(),
            base_url: "http://127.0.0.1:9/v1".into(),
            api_key: String::new(),
            model: "test".into(),
            female_voice: "female".into(),
            male_voice: "male".into(),
        };
        let samples = (0..(TARGET_SAMPLE_RATE as f32 * 0.7) as usize)
            .map(|index| {
                0.2 * (2.0 * std::f32::consts::PI * 180.0 * index as f32
                    / TARGET_SAMPLE_RATE as f32)
                    .sin()
            })
            .collect::<Vec<_>>();
        let wav = test_wav(TARGET_SAMPLE_RATE, &samples);
        for (index, segment) in plan.segments.iter().enumerate() {
            let voice = voice_for_segment(segment, &config).unwrap();
            let path = segment_cache_path(&cache_dir, index, segment, &config, voice);
            std::fs::write(path, &wav).unwrap();
        }

        let result = generate_listening_audio_inner(
            plan,
            config,
            output.to_string_lossy().into_owned(),
            cache_dir.to_string_lossy().into_owned(),
            None,
        )
        .await
        .unwrap();

        assert_eq!(result.question_pause_count, EXPECTED_ANSWER_PAUSES);
        assert_eq!(
            result.group_announcement_count,
            EXPECTED_GROUP_ANNOUNCEMENTS
        );
        assert!((result.effective_wpm - 170.0).abs() < 3.0);
        assert!(result.bytes > 1_000_000);
        assert!(output.exists());
        let decoded = rusty_mp3::decode_pipelined(&std::fs::read(&output).unwrap());
        assert!(!decoded.is_empty());

        let _ = std::fs::remove_dir_all(root);
    }

    #[tokio::test]
    #[ignore = "calls the live Xiaomi MiMo TTS API for a saved listening plan"]
    async fn live_generate_mimo_audio_from_saved_plan() {
        let plan_path = std::env::var("CET6_TTS_PLAN_PATH")
            .expect("CET6_TTS_PLAN_PATH must point to a listening plan JSON file");
        let output_path =
            std::env::var("CET6_TTS_OUTPUT_PATH").expect("CET6_TTS_OUTPUT_PATH is required");
        let cache_dir =
            std::env::var("CET6_TTS_CACHE_DIR").expect("CET6_TTS_CACHE_DIR is required");
        let base_url = std::env::var("CET6_MIMO_BASE_URL")
            .unwrap_or_else(|_| "https://api.xiaomimimo.com/v1".into());
        let model = std::env::var("CET6_MIMO_MODEL").unwrap_or_else(|_| "mimo-v2.5-tts".into());
        let female_voice =
            std::env::var("CET6_MIMO_FEMALE_VOICE").unwrap_or_else(|_| "Chloe".into());
        let male_voice = std::env::var("CET6_MIMO_MALE_VOICE").unwrap_or_else(|_| "Milo".into());
        let plan: ListeningSpeechPlan =
            serde_json::from_str(&tokio::fs::read_to_string(&plan_path).await.unwrap()).unwrap();
        let api_key = keyring::Entry::new("com.cet6.paperstudio", "tts:mimo")
            .unwrap()
            .get_password()
            .expect("MiMo TTS API key is not available in the Windows keychain");
        let config = SpeechSynthesisConfig {
            provider: "mimo".into(),
            base_url,
            api_key,
            model,
            female_voice,
            male_voice,
        };

        let result = generate_listening_audio_inner(plan, config, output_path, cache_dir, None)
            .await
            .unwrap();

        println!("{}", serde_json::to_string(&result).unwrap());
    }

    #[tokio::test]
    #[ignore = "calls the live Alibaba Cloud TTS API for a saved listening plan"]
    async fn live_generate_aliyun_audio_from_saved_plan() {
        let plan_path = std::env::var("CET6_TTS_PLAN_PATH")
            .expect("CET6_TTS_PLAN_PATH must point to a listening plan JSON file");
        let output_path =
            std::env::var("CET6_TTS_OUTPUT_PATH").expect("CET6_TTS_OUTPUT_PATH is required");
        let cache_dir =
            std::env::var("CET6_TTS_CACHE_DIR").expect("CET6_TTS_CACHE_DIR is required");
        let base_url = std::env::var("CET6_ALIYUN_BASE_URL").unwrap_or_else(|_| {
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
                .into()
        });
        let model = std::env::var("CET6_ALIYUN_MODEL").unwrap_or_else(|_| "qwen3-tts-flash".into());
        let female_voice =
            std::env::var("CET6_ALIYUN_FEMALE_VOICE").unwrap_or_else(|_| "Jennifer".into());
        let male_voice = std::env::var("CET6_ALIYUN_MALE_VOICE").unwrap_or_else(|_| "Neil".into());
        let plan: ListeningSpeechPlan =
            serde_json::from_str(&tokio::fs::read_to_string(&plan_path).await.unwrap()).unwrap();
        let api_key = std::env::var("DASHSCOPE_API_KEY")
            .expect("DASHSCOPE_API_KEY must be set for the live TTS probe");
        let config = SpeechSynthesisConfig {
            provider: "aliyun".into(),
            base_url,
            api_key,
            model,
            female_voice,
            male_voice,
        };

        let result = generate_listening_audio_inner(plan, config, output_path, cache_dir, None)
            .await
            .unwrap();

        println!("{}", serde_json::to_string(&result).unwrap());
    }

    #[tokio::test]
    #[ignore = "calls the live Alibaba Cloud TTS API"]
    async fn live_aliyun_returns_decodable_wav() {
        let api_key = std::env::var("DASHSCOPE_API_KEY")
            .expect("DASHSCOPE_API_KEY must be set for the live TTS probe");
        let bytes = request_aliyun(
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
            &api_key,
            "qwen3-tts-flash",
            "The library opens at nine thirty. Dr. Lee will meet you there.",
            "Jennifer",
        )
        .await
        .unwrap();
        let decoded = decode_wav(&bytes).unwrap();
        assert!(decoded.samples.len() > TARGET_SAMPLE_RATE as usize);
    }

    #[tokio::test]
    #[ignore = "calls the live Alibaba Cloud TTS API and verifies speed calibration"]
    async fn live_aliyun_audio_calibrates_to_the_requested_wpm() {
        let api_key = std::env::var("DASHSCOPE_API_KEY")
            .expect("DASHSCOPE_API_KEY must be set for the live TTS probe");
        let text = "The library opens at nine thirty. Dr. Lee will meet you there. \
                    Please bring the application form and a valid student card. \
                    If you arrive after ten, use the side entrance on King Street.";
        let bytes = request_aliyun(
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
            &api_key,
            "qwen3-tts-flash",
            text,
            "Jennifer",
        )
        .await
        .unwrap();
        let audio = prepare_clip(decode_wav(&bytes).unwrap()).unwrap();
        let words = count_spoken_words(text);
        let (_, effective_wpm, _, _) = normalize_tempo_and_assemble(
            vec![PreparedSegment {
                audio,
                pause_after_ms: 400,
            }],
            words,
            170.0,
        )
        .unwrap();
        assert!((effective_wpm - 170.0).abs() < 2.0);
    }

    #[tokio::test]
    #[ignore = "loads and runs the packaged Kitten ONNX sidecar"]
    async fn bundled_kitten_sidecar_works_from_a_chinese_path() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let sidecar = manifest.join("resources").join("kitten-tts.exe");
        let model_dir = manifest.join("resources").join("kitten-model");
        assert!(sidecar.is_file());
        assert!(model_dir.join("config.json").is_file());

        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("cet6-kitten-integration-{nanos}"));
        let output = root.join("kitten.wav");
        let request = KittenRequestSegment {
            id: "integration".into(),
            text: "Doctor Lee will meet you at nine thirty.".into(),
            voice: "Rosie".into(),
            output_path: output.to_string_lossy().into_owned(),
        };
        run_kitten_sidecar(&sidecar, &model_dir, &[request], 1.14)
            .await
            .unwrap();
        let decoded = decode_wav(&std::fs::read(&output).unwrap()).unwrap();
        assert!(decoded.samples.len() > TARGET_SAMPLE_RATE as usize);
        let _ = std::fs::remove_dir_all(root);
    }
}
