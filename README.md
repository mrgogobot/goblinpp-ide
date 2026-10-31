# Goblin++ IDE

A **JetBrains-style desktop IDE** purpose-built for the [Goblin++](https://github.com/mrgogobot/goblinpp)
scientific programming language: `.gbl` files, the `goblin++` CLI, and the
`freeze → run → verify → revise` evidence workflow.

> *"A Pragmatic Language for Curious Minds; Built on Rust; Ideas Compile Here."*

The IDE **never modifies goblin++**. It ships the released `goblin++` 0.1.0-alpha.41
binary (and `goblin-orbit`) inside the app bundle and talks to it only through its
command line (`run`, `check`, `freeze`, `verify`, `revise`, `status`, `lineage`,
`audit-ledger`, `doctor`, `capabilities`). The language folder (grammar, snippets,
docs, examples, function/unit registries) is generated from the goblin++ repository.

## What's inside

| Area | What works |
|---|---|
| Shell | Tauri 2 (Rust) + React + Monaco + xterm.js. Charcoal "Goblin Merch" theme (deep purple + electric green) plus Darcula / New UI / High Contrast / Light. |
| Files | Open Folder / Open File / New File / New Project / Save / Save As / Save All / rename / duplicate / trash / reveal in Finder, lazy project tree with context menu, drag-and-drop onto the window, recent projects, tabs restored on launch. |
| Editor | Real Goblin++ grammar (`#` comments, compound units `1.13e-10 m/s^2`, registered constants, 226 built-ins), completions with snippets, hover docs, signature help, go-to-definition, folding, structure, formatter, seal/directive gutter glyphs, frozen-file banner. |
| Diagnostics | Local preview checks plus the engine's own `goblin++ check --json` on save and while typing (scratch copy). Problems panel, quick-fixes for G302, AI "ask about this". |
| Run | Streams the real engine's stdout/stderr, parses the `RUN_STATUS=… RUN_DIR=…` summary, reads `receipt.json`, shows sealed values and outputs, supports `input()` via a stdin line, `--compile`, program arguments, Stop. |
| Evidence | RUN_DIR browser with receipts, sealed artifacts, verify, diff, freeze/revise/status/lineage, custody-ledger audit. |
| Terminal | Real login-shell PTY sessions (multiple tabs, persistent across panel switches) with `goblin++` on PATH and a quick-run line. |
| Appearance | Settings → Background Image: pick any image, fit (fill / fit / stretch / centre / tile), opacity, blur and panel tint; it covers the whole window. |
| Extras | Find in Files, Go to File (⌘P), Find Action (⇧⌘A), remappable keymap, git status/commit, environment detection, function & unit reference, AI assistant pane (OpenAI-compatible providers or offline simulation). |

## Build

```bash
pnpm install
pnpm tauri dev      # native window with hot reload
pnpm tauri build    # .app + .dmg in src-tauri/target/release/bundle/
```

Prerequisites: Node 20+, pnpm, Rust stable, Xcode command line tools.
`src-tauri/binaries/` holds the goblin++ sidecars copied from the goblin++ release
(`dist/macos-arm64/`). To ship a newer engine, replace those two files and rebuild.

## Installing the DMG on another Mac

The app is ad-hoc signed (no Apple Developer ID), so Gatekeeper shows
"cannot be opened because the developer cannot be verified" the first time.
Right-click the app → **Open** → **Open**, or run:

```bash
xattr -dr com.apple.quarantine "/Applications/Goblin++ IDE.app"
```

Apple-silicon only (the bundled engine is arm64). `goblin++ run --compile`
needs a Rust toolchain on the machine; everything else works without one.

## Engine invariant

The `goblinpp` crate pins Rust 1.92.0 and `cargo test --locked`. This IDE is a
separate project with its own `Cargo.toml` and never touches the engine's
lockfile or source.

## Layout

```
src/
  actions.ts        central action dispatcher (menus, keymap, palette)
  components/       chrome: toolbar, activity bar, tree, editor, run, terminal, evidence, settings
  language/         Monaco contribution, parser, manifest loader
  platform/         typed bridge to the Rust side (fs, proc, pty, dialogs, settings)
  stores/           Zustand stores (project, editor, run, language, settings, terminal…)
  styles/           theme tokens (five themes) + app CSS
src-tauri/
  src/              fsx.rs, proc.rs, pty.rs, env.rs, settings.rs, menu.rs
  binaries/         goblin++ and goblin-orbit sidecars
public/goblin++/    bundled language folder generated from the goblin++ repository
```
