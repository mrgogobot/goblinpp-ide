//! Child-process supervisor for `goblin++` and friends.
//!
//! * `proc_spawn` streams stdout/stderr line chunks to the webview as
//!   `proc-output` events and reports `proc-exit` when the process ends.
//!   stdin stays open so interactive `input()` prompts can be answered.
//! * `proc_run` is a blocking capture for quick subcommands (`status --json`,
//!   `verify --json`, `--version`, ...).

use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize)]
struct ProcOutput {
    id: String,
    stream: &'static str,
    data: String,
}

#[derive(Clone, Serialize)]
struct ProcExit {
    id: String,
    code: Option<i32>,
    signal: Option<i32>,
}

#[derive(Serialize)]
pub struct Captured {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u128,
}

pub struct ProcEntry {
    child: Arc<Mutex<Child>>,
    stdin: Option<ChildStdin>,
}

#[derive(Default)]
pub struct ProcState(pub Mutex<HashMap<String, ProcEntry>>);

fn build_command(program: &str, args: &[String], cwd: Option<&String>, env: Option<&HashMap<String, String>>) -> Command {
    let mut cmd = Command::new(program);
    cmd.args(args);
    if let Some(dir) = cwd.filter(|d| !d.is_empty()) {
        cmd.current_dir(dir);
    }
    cmd.env("PATH", crate::env::augmented_path(&[]));
    cmd.env("GOBLIN_IDE", env!("CARGO_PKG_VERSION"));
    if let Some(env) = env {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }
    cmd
}

#[tauri::command]
pub fn proc_spawn(
    state: State<'_, ProcState>,
    app: AppHandle,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<u32, String> {
    let mut cmd = build_command(&program, &args, cwd.as_ref(), env.as_ref());
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("failed to start {}: {}", program, e))?;
    let pid = child.id();

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));

    let pump = |mut reader: Box<dyn Read + Send>, stream: &'static str, id: String, app: AppHandle| {
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let _ = app.emit("proc-output", ProcOutput { id: id.clone(), stream, data: String::from_utf8_lossy(&buf[..n]).into_owned() });
                    }
                }
            }
        })
    };

    let mut handles = Vec::new();
    if let Some(out) = stdout {
        handles.push(pump(Box::new(out), "stdout", id.clone(), app.clone()));
    }
    if let Some(err) = stderr {
        handles.push(pump(Box::new(err), "stderr", id.clone(), app.clone()));
    }

    state.0.lock().unwrap().insert(id.clone(), ProcEntry { child: child.clone(), stdin });

    let waiter_app = app.clone();
    let waiter_id = id.clone();
    std::thread::spawn(move || {
        for h in handles {
            let _ = h.join();
        }
        let status = loop {
            let mut guard = child.lock().unwrap();
            match guard.try_wait() {
                Ok(Some(s)) => break Some(s),
                Ok(None) => {
                    drop(guard);
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                Err(_) => break None,
            }
        };
        let code = status.and_then(|s| s.code());
        #[cfg(unix)]
        let signal = {
            use std::os::unix::process::ExitStatusExt;
            status.and_then(|s| s.signal())
        };
        #[cfg(not(unix))]
        let signal: Option<i32> = None;
        let _ = waiter_app.emit("proc-exit", ProcExit { id: waiter_id.clone(), code, signal });
        if let Some(st) = waiter_app.try_state::<ProcState>() {
            st.0.lock().unwrap().remove(&waiter_id);
        }
    });

    Ok(pid)
}

#[tauri::command]
pub fn proc_write(state: State<'_, ProcState>, id: String, data: String) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    let entry = guard.get_mut(&id).ok_or("process is not running")?;
    let stdin = entry.stdin.as_mut().ok_or("stdin is closed")?;
    stdin.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn proc_close_stdin(state: State<'_, ProcState>, id: String) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    let entry = guard.get_mut(&id).ok_or("process is not running")?;
    entry.stdin.take();
    Ok(())
}

#[tauri::command]
pub fn proc_kill(state: State<'_, ProcState>, id: String) -> Result<(), String> {
    let child = {
        let guard = state.0.lock().unwrap();
        guard.get(&id).map(|e| e.child.clone())
    };
    if let Some(child) = child {
        let mut c = child.lock().unwrap();
        c.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn proc_run(
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    stdin: Option<String>,
) -> Result<Captured, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let started = std::time::Instant::now();
        let mut cmd = build_command(&program, &args, cwd.as_ref(), env.as_ref());
        cmd.stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("failed to start {}: {}", program, e))?;
        if let (Some(input), Some(mut sin)) = (stdin, child.stdin.take()) {
            let _ = sin.write_all(input.as_bytes());
        }
        let out = child.wait_with_output().map_err(|e| e.to_string())?;
        Ok(Captured {
            code: out.status.code(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
            duration_ms: started.elapsed().as_millis(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
