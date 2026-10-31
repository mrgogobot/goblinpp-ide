//! Multi-session pseudo-terminal supervisor. Each terminal tab in the IDE owns
//! one PTY-backed login shell. Output is streamed to the webview as
//! `terminal-data` events tagged with the terminal id.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, serde::Serialize)]
struct TerminalData {
    id: String,
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct TerminalExit {
    id: String,
    code: Option<u32>,
}

pub struct Terminal {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

pub struct TerminalState(pub Mutex<HashMap<String, Terminal>>);

impl Default for TerminalState {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

fn shell_command(cwd: Option<String>, extra_path: Vec<String>) -> CommandBuilder {
    #[cfg(target_os = "windows")]
    let mut cmd = CommandBuilder::new("cmd.exe");
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut c = CommandBuilder::new(&shell);
        // Login shell so the user's PATH (~/.zprofile, Homebrew, cargo, ~/.local/bin) is available.
        c.arg("-l");
        c
    };

    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("GOBLIN_IDE", env!("CARGO_PKG_VERSION"));
    if std::env::var("LANG").map(|v| v.is_empty()).unwrap_or(true) {
        cmd.env("LANG", "en_US.UTF-8");
    }
    cmd.env("PATH", crate::env::augmented_path(&extra_path));

    let dir = cwd
        .filter(|c| !c.is_empty() && std::path::Path::new(c).is_dir())
        .or_else(|| std::env::var("HOME").ok())
        .unwrap_or_else(|| "/".to_string());
    cmd.cwd(dir);
    cmd
}

#[tauri::command]
pub fn spawn_terminal(
    state: State<'_, TerminalState>,
    app: AppHandle,
    id: String,
    cwd: Option<String>,
    extra_path: Option<Vec<String>>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<(), String> {
    // Replace any previous session with this id.
    if let Some(mut old) = state.0.lock().unwrap().remove(&id) {
        let _ = old.child.kill();
        let _ = old.child.wait();
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let cmd = shell_command(cwd, extra_path.unwrap_or_default());
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let master = pair.master;
    let writer = master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;

    let reader_id = id.clone();
    let reader_app = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 16384];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = reader_app.emit("terminal-data", TerminalData { id: reader_id.clone(), data: text });
                }
                Err(_) => break,
            }
        }
        let _ = reader_app.emit("terminal-exit", TerminalExit { id: reader_id.clone(), code: None });
    });

    state.0.lock().unwrap().insert(id, Terminal { master, writer, child });
    Ok(())
}

#[tauri::command]
pub fn write_terminal(state: State<'_, TerminalState>, id: String, data: String) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    let term = guard.get_mut(&id).ok_or("no such terminal")?;
    term.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    term.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(state: State<'_, TerminalState>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let term = guard.get(&id).ok_or("no such terminal")?;
    term.master
        .resize(PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kill_terminal(state: State<'_, TerminalState>, id: String) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if let Some(mut term) = guard.remove(&id) {
        let _ = term.child.kill();
        let _ = term.child.wait();
    }
    Ok(())
}

#[tauri::command]
pub fn list_terminals(state: State<'_, TerminalState>) -> Vec<String> {
    state.0.lock().unwrap().keys().cloned().collect()
}
