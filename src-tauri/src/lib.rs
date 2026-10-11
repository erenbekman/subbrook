mod files;

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Rect, WindowEvent};
use tauri_plugin_sql::{Migration, MigrationKind};

const AUTOSTART_FLAG: &str = "--autostart";

#[derive(Default)]
struct TrayState {
    hidden_at: Mutex<Option<Instant>>,
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn toggle_tray(app: &AppHandle, rect: Rect) {
    let Some(window) = app.get_webview_window("tray") else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let just_hidden = app
        .state::<TrayState>()
        .hidden_at
        .lock()
        .unwrap()
        .is_some_and(|at| at.elapsed() < Duration::from_millis(250));
    if just_hidden {
        return;
    }

    let scale = window.scale_factor().unwrap_or(1.0);
    let icon = rect.position.to_physical::<f64>(scale);
    let icon_size = rect.size.to_physical::<f64>(scale);
    let width = window.outer_size().map(|s| s.width as f64).unwrap_or(380.0 * scale);
    let mut x = icon.x + icon_size.width / 2.0 - width / 2.0;
    if let Ok(Some(monitor)) = app.monitor_from_point(icon.x, icon.y) {
        let left = monitor.position().x as f64 + 8.0 * scale;
        let right = monitor.position().x as f64 + monitor.size().width as f64 - width - 8.0 * scale;
        x = x.clamp(left, right.max(left));
    }
    let _ = window.set_position(PhysicalPosition::new(x, icon.y + icon_size.height + 6.0 * scale));
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn open_main(app: AppHandle, subscription_id: Option<i64>) {
    if let Some(tray) = app.get_webview_window("tray") {
        let _ = tray.hide();
    }
    show_main(&app);
    if let Some(id) = subscription_id {
        let _ = app.emit_to("main", "open-subscription", id);
    }
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

/// The whole app state lives in one SQLite file in the OS app-data folder
/// (macOS: ~/Library/Application Support/app.subbrook.desktop/subbrook.db).
/// Schema changes are plain SQL files, applied in order on startup.
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "initial schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "one payment per subscription and due date",
            sql: include_str!("../migrations/0002_payments_unique.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "cached exchange rates",
            sql: include_str!("../migrations/0003_fx_rates.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "sent reminder notifications",
            sql: include_str!("../migrations/0004_notifications_sent.sql"),
            kind: MigrationKind::Up,
        },
    ];

    let app = tauri::Builder::default()
        .manage(TrayState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_FLAG]),
        ))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:subbrook.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![open_main, quit, files::read_spreadsheet, files::save_file, files::save_binary])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open Subbrook", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Subbrook", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("subbrook")
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .tooltip("Subbrook")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        rect,
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_tray(tray.app_handle(), rect);
                    }
                })
                .build(app)?;

            if !std::env::args().any(|arg| arg == AUTOSTART_FLAG) {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if window.label() == "tray" => {
                let _ = window.hide();
                *window.app_handle().state::<TrayState>().hidden_at.lock().unwrap() = Some(Instant::now());
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("error while building Subbrook");

    app.run(|_app, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            show_main(_app);
        }
    });
}
