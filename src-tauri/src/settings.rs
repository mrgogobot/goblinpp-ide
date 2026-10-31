//! IDE settings persisted as one JSON document in the per-user config directory
//! (macOS: ~/Library/Application Support/com.goblinpp.ide/settings.json).

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = settings_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        Err(_) => Ok(serde_json::json!({})),
    }
}

#[tauri::command]
pub fn settings_save(app: AppHandle, value: serde_json::Value) -> Result<(), String> {
    let path = settings_path(&app)?;
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct AppPaths {
    pub config_dir: String,
    pub data_dir: String,
    pub log_dir: String,
    pub exe_dir: String,
    pub resource_dir: String,
    pub settings_file: String,
}

#[tauri::command]
pub fn app_paths(app: AppHandle) -> Result<AppPaths, String> {
    let p = app.path();
    let s = |r: Result<PathBuf, tauri::Error>| r.map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(AppPaths {
        config_dir: s(p.app_config_dir()),
        data_dir: s(p.app_data_dir()),
        log_dir: s(p.app_log_dir()),
        exe_dir: crate::env::exe_dir().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default(),
        resource_dir: s(p.resource_dir()),
        settings_file: settings_path(&app)?.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn log_append(app: AppHandle, line: String) -> Result<(), String> {
    use std::io::Write;
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut f = fs::OpenOptions::new().create(true).append(true).open(dir.join("goblin-ide.log")).map_err(|e| e.to_string())?;
    writeln!(f, "{}", line).map_err(|e| e.to_string())
}

/// Paths the app was asked to open at launch: command-line arguments after the
/// executable plus the `GOBLIN_IDE_OPEN` environment variable (colon-separated).
#[tauri::command]
pub fn startup_open() -> Vec<String> {
    let mut out: Vec<String> = std::env::args().skip(1).filter(|a| !a.starts_with('-') && std::path::Path::new(a).exists()).collect();
    if let Ok(v) = std::env::var("GOBLIN_IDE_OPEN") {
        if let Some(rest) = v.strip_prefix("selftest:") {
            out.push(format!("selftest:{}", rest));
        } else {
            for p in v.split(':') {
                if !p.is_empty() && std::path::Path::new(p).exists() {
                    out.push(p.to_string());
                }
            }
        }
    }
    out
}
