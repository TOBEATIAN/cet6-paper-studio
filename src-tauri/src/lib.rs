mod error;
mod keychain;
mod openai;
mod storage;
mod tts;
mod web_search;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WindowEvent,
};

#[derive(Default)]
struct WindowBehaviorState {
    close_to_background: AtomicBool,
    generation_running: AtomicBool,
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_window_close_behavior(state: State<'_, WindowBehaviorState>, background: bool) {
    state
        .close_to_background
        .store(background, Ordering::Relaxed);
}

#[tauri::command]
fn set_generation_running(state: State<'_, WindowBehaviorState>, running: bool) {
    state.generation_running.store(running, Ordering::Relaxed);
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WindowBehaviorState::default())
        .setup(|app| {
            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon().cloned(),
            ) {
                window.set_icon(icon)?;
            }

            let open_item = MenuItem::with_id(app, "open", "打开六级智卷", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出六级智卷", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
            let mut tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("六级智卷")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            tray.build(app)?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let state = window.state::<WindowBehaviorState>();
                handle_close_request(window, state.inner());
            }
        })
        .invoke_handler(tauri::generate_handler![
            keychain::store_api_key,
            keychain::get_api_key,
            keychain::delete_api_key,
            keychain::has_api_key,
            storage::get_data_dir,
            storage::set_data_dir,
            storage::relocate_data_dir,
            storage::default_data_dir,
            storage::open_data_dir,
            storage::load_config,
            storage::save_config,
            storage::load_working_paper,
            storage::save_working_paper,
            storage::load_paper_index,
            storage::save_paper_index,
            storage::load_paper,
            storage::save_paper,
            storage::delete_paper,
            storage::load_chat_index,
            storage::save_chat_index,
            storage::load_chat_session,
            storage::save_chat_session,
            storage::delete_chat_session,
            storage::load_practice_session,
            storage::save_practice_session,
            storage::load_cet6_checkpoint,
            storage::save_cet6_checkpoint,
            storage::delete_cet6_checkpoint,
            storage::save_cet6_diagnostic,
            storage::open_cet6_diagnostic_dir,
            storage::read_audio_file,
            storage::read_image_file,
            set_window_close_behavior,
            set_generation_running,
            exit_app,
            storage::load_review_index,
            storage::save_review_index,
            storage::load_review,
            storage::save_review,
            storage::delete_review,
            openai::stream_chat,
            openai::complete_chat,
            openai::extract_images_with_ai,
            openai::abort_chat,
            openai::list_models,
            openai::test_connection,
            tts::test_tts_connection,
            tts::synthesize_tts_segment,
            tts::generate_listening_audio,
            web_search::web_search,
            web_search::test_web_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn handle_close_request(window: &tauri::Window, state: &WindowBehaviorState) {
    if state.close_to_background.load(Ordering::Relaxed) {
        let _ = window.hide();
    } else if state.generation_running.load(Ordering::Relaxed) {
        let _ = window.emit("generation-close-requested", ());
    } else {
        window.app_handle().exit(0);
    }
}
