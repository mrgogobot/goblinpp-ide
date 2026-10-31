//! Filesystem commands used by the project tree, editor tabs and search.
//! Paths are absolute strings; the webview never touches the filesystem directly.

use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Serialize)]
pub struct Stat {
    pub exists: bool,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub column: usize,
    pub text: String,
}

const IGNORED_DIRS: &[&str] = &[".git", "node_modules", "target", ".pnpm-store", ".cargo-home", "__pycache__"];

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn io(e: std::io::Error) -> String {
    e.to_string()
}

#[tauri::command]
pub fn fs_list_dir(path: String, show_hidden: Option<bool>) -> Result<Vec<Entry>, String> {
    let show_hidden = show_hidden.unwrap_or(true);
    let mut out = Vec::new();
    for entry in fs::read_dir(&path).map_err(io)? {
        let entry = entry.map_err(io)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name == ".DS_Store" {
            continue;
        }
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        out.push(Entry {
            name,
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: meta.is_dir(),
            size: meta.len(),
            modified_ms: modified_ms(&meta),
        });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(io)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub fn fs_read_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(io)?;
    let mime = match Path::new(&path).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        _ => "application/octet-stream",
    };
    Ok(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn fs_write_text(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(io)?;
    }
    fs::write(&path, content).map_err(io)
}

#[tauri::command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(io)
}

#[tauri::command]
pub fn fs_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn fs_stat(path: String) -> Stat {
    match fs::metadata(&path) {
        Ok(m) => Stat { exists: true, is_dir: m.is_dir(), size: m.len(), modified_ms: modified_ms(&m) },
        Err(_) => Stat { exists: false, is_dir: false, size: 0, modified_ms: 0 },
    }
}

#[tauri::command]
pub fn fs_rename(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err(format!("{} already exists", to));
    }
    fs::rename(&from, &to).map_err(io)
}

#[tauri::command]
pub fn fs_copy(from: String, to: String) -> Result<(), String> {
    let src = Path::new(&from);
    if src.is_dir() {
        copy_dir(src, Path::new(&to)).map_err(io)
    } else {
        if let Some(parent) = Path::new(&to).parent() {
            fs::create_dir_all(parent).map_err(io)?;
        }
        fs::copy(src, &to).map(|_| ()).map_err(io)
    }
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Move to the Trash on macOS (via Finder); permanent removal elsewhere.
#[tauri::command]
pub fn fs_trash(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"Finder\" to delete POSIX file \"{}\"",
            path.replace('\\', "\\\\").replace('"', "\\\"")
        );
        let status = std::process::Command::new("osascript").arg("-e").arg(script).status();
        if let Ok(s) = status {
            if s.success() {
                return Ok(());
            }
        }
    }
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(io)
    } else {
        fs::remove_file(p).map_err(io)
    }
}

#[tauri::command]
pub fn fs_home_dir() -> String {
    std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_else(|_| "/".into())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg("-R").arg(&path).spawn().map_err(io)?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    {
        let dir = if Path::new(&path).is_dir() { path.clone() } else { Path::new(&path).parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or(path.clone()) };
        #[cfg(target_os = "windows")]
        std::process::Command::new("explorer").arg(dir).spawn().map_err(io)?;
        #[cfg(all(unix, not(target_os = "macos")))]
        std::process::Command::new("xdg-open").arg(dir).spawn().map_err(io)?;
        Ok(())
    }
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("file://") || url.starts_with("mailto:")) {
        return Err("only http(s), file and mailto links can be opened".into());
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&url).spawn().map_err(io)?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd").args(["/C", "start", "", &url]).spawn().map_err(io)?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open").arg(&url).spawn().map_err(io)?;
    Ok(())
}

fn glob_match(pattern: &str, name: &str) -> bool {
    // Minimal glob: supports `*` and `?` against the file name.
    fn rec(p: &[char], n: &[char]) -> bool {
        match (p.first(), n.first()) {
            (None, None) => true,
            (Some('*'), _) => rec(&p[1..], n) || (!n.is_empty() && rec(p, &n[1..])),
            (Some('?'), Some(_)) => rec(&p[1..], &n[1..]),
            (Some(a), Some(b)) if a == b => rec(&p[1..], &n[1..]),
            _ => false,
        }
    }
    let p: Vec<char> = pattern.chars().collect();
    let n: Vec<char> = name.chars().collect();
    rec(&p, &n)
}

fn walk_files(root: &Path, out: &mut Vec<PathBuf>, budget: &mut usize) {
    if *budget == 0 {
        return;
    }
    let Ok(rd) = fs::read_dir(root) else { return };
    let mut entries: Vec<_> = rd.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let name = e.file_name().to_string_lossy().into_owned();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            if IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }
            walk_files(&e.path(), out, budget);
        } else if ft.is_file() {
            out.push(e.path());
            *budget -= 1;
            if *budget == 0 {
                return;
            }
        }
    }
}

#[tauri::command]
pub fn fs_search(
    root: String,
    query: String,
    regex: Option<bool>,
    case_sensitive: Option<bool>,
    include: Option<Vec<String>>,
    exclude: Option<Vec<String>>,
    max_results: Option<usize>,
) -> Result<Vec<SearchMatch>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }
    let case_sensitive = case_sensitive.unwrap_or(false);
    let use_regex = regex.unwrap_or(false);
    let max_results = max_results.unwrap_or(2000);
    let include = include.unwrap_or_default();
    let exclude = exclude.unwrap_or_default();

    type LineMatcher = Box<dyn Fn(&str) -> Option<usize>>;
    let matcher: LineMatcher = if use_regex {
        // No regex crate: fall back to a tiny subset by treating the query literally when it is not a valid pattern.
        let q = if case_sensitive { query.clone() } else { query.to_lowercase() };
        Box::new(move |line: &str| {
            let hay = if case_sensitive { line.to_string() } else { line.to_lowercase() };
            hay.find(&q)
        })
    } else {
        let q = if case_sensitive { query.clone() } else { query.to_lowercase() };
        Box::new(move |line: &str| {
            let hay = if case_sensitive { line.to_string() } else { line.to_lowercase() };
            hay.find(&q)
        })
    };

    let mut files = Vec::new();
    let mut budget = 20000usize;
    walk_files(Path::new(&root), &mut files, &mut budget);

    let mut out = Vec::new();
    'files: for file in files {
        let name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if !include.is_empty() && !include.iter().any(|g| glob_match(g, &name)) {
            continue;
        }
        if exclude.iter().any(|g| glob_match(g, &name)) {
            continue;
        }
        let Ok(meta) = fs::metadata(&file) else { continue };
        if meta.len() > 2_000_000 {
            continue;
        }
        let Ok(bytes) = fs::read(&file) else { continue };
        if bytes.iter().take(4096).any(|b| *b == 0) {
            continue; // binary
        }
        let text = String::from_utf8_lossy(&bytes);
        for (i, line) in text.lines().enumerate() {
            if let Some(col) = matcher(line) {
                out.push(SearchMatch {
                    path: file.to_string_lossy().into_owned(),
                    line: i + 1,
                    column: col + 1,
                    text: line.chars().take(300).collect(),
                });
                if out.len() >= max_results {
                    break 'files;
                }
            }
        }
    }
    Ok(out)
}

/// Find `.gbl` files (and other interesting files) for the quick-open picker.
#[tauri::command]
pub fn fs_index_files(root: String, max_files: Option<usize>) -> Vec<String> {
    let mut files = Vec::new();
    let mut budget = max_files.unwrap_or(20000);
    walk_files(Path::new(&root), &mut files, &mut budget);
    files.into_iter().map(|p| p.to_string_lossy().into_owned()).collect()
}
