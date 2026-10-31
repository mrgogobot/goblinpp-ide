//! Environment detection and `goblin++` binary resolution.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_else(|_| "/".into()))
}

/// Directory that holds the main executable (sidecars live next to it).
pub fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

/// GUI apps on macOS start with a minimal PATH; add the usual developer locations
/// plus the app's own sidecar directory so `goblin++`, `rustc`, `git`, `brew` resolve.
pub fn augmented_path(extra: &[String]) -> String {
    let mut parts: Vec<String> = Vec::new();
    for e in extra {
        if !e.is_empty() {
            parts.push(e.clone());
        }
    }
    if let Some(d) = exe_dir() {
        parts.push(d.to_string_lossy().into_owned());
    }
    let h = home();
    for p in [h.join(".local/bin"), h.join(".cargo/bin")] {
        parts.push(p.to_string_lossy().into_owned());
    }
    for p in ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
        parts.push(p.to_string());
    }
    if let Ok(existing) = std::env::var("PATH") {
        for p in existing.split(':') {
            parts.push(p.to_string());
        }
    }
    let mut seen = std::collections::HashSet::new();
    parts.retain(|p| seen.insert(p.clone()));
    parts.join(":")
}

fn version_of(program: &str, flag: &str) -> Option<String> {
    let out = Command::new(program).arg(flag).env("PATH", augmented_path(&[])).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text.lines().next().unwrap_or("").to_string())
    }
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    for dir in augmented_path(&[]).split(':') {
        let candidate = Path::new(dir).join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[derive(Serialize, Clone)]
pub struct ResolvedBinary {
    pub path: String,
    pub source: String,
    pub version: Option<String>,
}

pub fn resolve_goblin(configured: Option<String>) -> ResolvedBinary {
    let bin_name = if cfg!(windows) { "goblin++.exe" } else { "goblin++" };
    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    if let Some(c) = configured.filter(|c| !c.trim().is_empty()) {
        candidates.push(("configured".into(), PathBuf::from(c.trim())));
    }
    if let Some(d) = exe_dir() {
        candidates.push(("bundled".into(), d.join(bin_name)));
    }
    candidates.push(("~/.local/bin".into(), home().join(".local/bin").join(bin_name)));
    if let Some(p) = find_on_path(bin_name) {
        candidates.push(("PATH".into(), p));
    }
    for (source, path) in candidates {
        if path.is_file() {
            let p = path.to_string_lossy().into_owned();
            let version = version_of(&p, "--version");
            return ResolvedBinary { path: p, source, version };
        }
    }
    ResolvedBinary { path: String::new(), source: "missing".into(), version: None }
}

#[tauri::command]
pub fn resolve_goblin_binary(configured: Option<String>) -> ResolvedBinary {
    resolve_goblin(configured)
}

#[derive(Serialize, Clone)]
pub struct EnvCheck {
    pub id: String,
    pub name: String,
    pub detail: String,
    pub status: String, // ok | warn | fail
}

fn check(id: &str, name: &str, detail: String, status: &str) -> EnvCheck {
    EnvCheck { id: id.into(), name: name.into(), detail, status: status.into() }
}

#[tauri::command]
pub async fn env_detect(configured_goblin: Option<String>, project_root: Option<String>) -> Vec<EnvCheck> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut checks = Vec::new();
        checks.push(check("os", "OS & arch", format!("{} {}", std::env::consts::OS, std::env::consts::ARCH), "ok"));
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "(unset)".into());
        checks.push(check("shell", "Shell", shell, "ok"));

        let goblin = resolve_goblin(configured_goblin.clone());
        if goblin.path.is_empty() {
            checks.push(check("goblin", "goblin++ binary", "not found (bundled sidecar missing, ~/.local/bin and PATH checked)".into(), "fail"));
        } else {
            checks.push(check("goblin", "goblin++ binary", format!("{} — {} ({})", goblin.version.clone().unwrap_or_else(|| "version unknown".into()), goblin.path, goblin.source), "ok"));
            let doctor = Command::new(&goblin.path)
                .arg("doctor")
                .current_dir(project_root.clone().filter(|p| Path::new(p).is_dir()).unwrap_or_else(|| home().to_string_lossy().into_owned()))
                .env("PATH", augmented_path(&[]))
                .output();
            match doctor {
                Ok(o) => {
                    let text = String::from_utf8_lossy(&o.stdout);
                    let status_line = text.lines().find(|l| l.starts_with("DOCTOR_STATUS=")).unwrap_or("DOCTOR_STATUS=?").to_string();
                    let fails: Vec<String> = text.lines().filter(|l| l.ends_with("FAIL")).map(|l| l.split_whitespace().next().unwrap_or("").to_string()).collect();
                    let ok = status_line.ends_with("PASS");
                    checks.push(check("doctor", "goblin++ doctor", if ok { status_line } else { format!("{} ({})", status_line, fails.join(", ")) }, if ok { "ok" } else { "warn" }));
                }
                Err(e) => checks.push(check("doctor", "goblin++ doctor", format!("could not run: {}", e), "warn")),
            }
        }
        let orbit = find_on_path("goblin-orbit").or_else(|| exe_dir().map(|d| d.join("goblin-orbit")).filter(|p| p.is_file()));
        checks.push(match orbit {
            Some(p) => check("orbit", "goblin-orbit", p.to_string_lossy().into_owned(), "ok"),
            None => check("orbit", "goblin-orbit", "not found (optional)".into(), "warn"),
        });

        match version_of("rustc", "--version") {
            Some(v) => {
                let pinned = v.contains("1.92.");
                checks.push(check("rust", "Rust toolchain", if pinned { v } else { format!("{} (engine pins 1.92.0; only needed for --compile)", v) }, "ok"));
            }
            None => checks.push(check("rust", "Rust toolchain", "rustc not found — `goblin++ run --compile` and `compile` need a Rust toolchain".into(), "warn")),
        }
        match version_of("cargo", "--version") {
            Some(v) => checks.push(check("cargo", "Cargo", v, "ok")),
            None => checks.push(check("cargo", "Cargo", "not found (optional)".into(), "warn")),
        }
        match version_of("git", "--version") {
            Some(v) => {
                let mut detail = v;
                if let Some(root) = project_root.as_ref().filter(|p| Path::new(p).is_dir()) {
                    if let Ok(o) = Command::new("git").args(["rev-parse", "--abbrev-ref", "HEAD"]).current_dir(root).env("PATH", augmented_path(&[])).output() {
                        if o.status.success() {
                            detail = format!("{} · branch {}", detail, String::from_utf8_lossy(&o.stdout).trim());
                        } else {
                            detail = format!("{} · project is not a git repository", detail);
                        }
                    }
                }
                checks.push(check("git", "git", detail, "ok"));
            }
            None => checks.push(check("git", "git", "not found".into(), "warn")),
        }

        if let Some(root) = project_root.as_ref().filter(|p| !p.is_empty()) {
            let p = Path::new(root);
            if !p.is_dir() {
                checks.push(check("project", "Project root", format!("{} does not exist", root), "fail"));
            } else {
                let probe = p.join(".goblin-ide-write-probe");
                let writable = std::fs::write(&probe, b"ok").is_ok();
                let _ = std::fs::remove_file(&probe);
                checks.push(check("project", "Project root", format!("{} — {}", root, if writable { "writable" } else { "read-only" }), if writable { "ok" } else { "warn" }));
                let ledger = p.join(".goblin").join("custody-ledger.jsonl");
                checks.push(check("ledger", "Custody ledger", if ledger.is_file() { ledger.to_string_lossy().into_owned() } else { "no ledger yet (created on first run)".into() }, "ok"));
                let runs = p.join("runs");
                let count = std::fs::read_dir(&runs).map(|rd| rd.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).count()).unwrap_or(0);
                checks.push(check("runs", "RUN_DIRs", format!("{} run director{} under runs/", count, if count == 1 { "y" } else { "ies" }), "ok"));
            }
        }
        checks.push(check("home", "Home", home().to_string_lossy().into_owned(), "ok"));
        checks.push(check("path", "PATH (augmented)", augmented_path(&[]), "ok"));
        checks
    })
    .await
    .unwrap_or_default()
}
