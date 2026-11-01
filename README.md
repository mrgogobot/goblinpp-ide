# Goblin++ IDE 0.2.3 — two-computer LAN examples

Bundles alpha.45 and adds net_pair_credentials completion/help, split server/client
LAN examples and a step-by-step guide. The setup computer is trusted; only the
correct role folder is transferred to each endpoint. Never share the other role's
private key. The server certificate binds its actual private IPv4 address.

Existing networking, recipient encryption, scientific Run/Verify, private input
and AI-context exclusions remain available. The LAN credential folder is also
excluded from automatic AI context. The About dialog follows package metadata.

The app includes runnable source examples and a short guide under
Examples/lan/QUICKSTART.md. Separate compiled client/server programs are not
required; use the bundled interpreter. Linux runtime/build instructions are
included in the full LAN guide. A real two-machine check still needs the user's
own network; automated tests distinguish local-interface tests from two hosts.

Rust stays 1.92.0. No dependency upgrades or firewall changes. Ad-hoc signed,
not Apple-notarized; no independent security audit is claimed.

Optional merchandise: https://h4k3rl1f3.myspreadshop.co.uk

## Previous stage

# Goblin++ IDE 0.2.2 — alpha.44 networking

Bundles Goblin++/Orbit **0.1.0-alpha.44**, including all previous language features,
TLS 1.3 client/server messaging and age X25519 recipient-message encryption.
The new `net_*` / `e2e_*` functions have completion, signature help, snippets and
reference documentation. The About dialog now follows the actual package version.

1. Copy the networking examples into a writable project folder.
2. Open `network_setup.gbl` and Run once to generate your own local credentials.
3. Run `network_server.gbl` in one IDE terminal and `network_client.gbl` in another
   terminal or window. The main Run panel manages one process at a time.
4. See bundled `NETWORKING.md` for the optional relay, native compilation,
   certificate trust, exact limits and recipient-key distribution.

An older selected engine missing a directly used new builtin is refused before
launch with a clear alpha.44 message. Recognized `.key`/`.pem`/`.age` files,
`network-demo/` credential folders and private-key text are excluded from automatic
AI context, alongside GO_PRIVATE scripts. This is a conservative guard, not a
complete secret detector; explicit user prompts can still disclose secrets.

New integration tests run actual IDE RunStore networking and recipient encryption
against an independent Node/OpenSSL mutual-TLS peer, in interpreted and compiled
modes, including certificate fingerprints and no scientific receipt creation.
The current **19 frontend/integration tests** and **3 native backend tests** pass.
There is no claim of a live installed GUI test or independent security audit.

The CI dependency-cache preparation uses byte-for-byte copies of the bundled
engine's matching manifests in `engine-dependencies/`. It fetches checksummed
public dependencies BEFORE private scripts compile with `--locked --offline`.
It no longer depends on a different repository's old source commit. Rust remains
**1.92.0**, with no compiler or third-party dependency upgrades.

The app is locally ad-hoc signed, not Apple-notarized. Existing scientific
Run/Verify and private masked-password workflows remain tested. TLS protects a
connection; age recipient encryption protects messages through a relay but adds
no sender signatures, application replay prevention or forward-secrecy ratchet.

Optional Goblin++ merchandise: https://h4k3rl1f3.myspreadshop.co.uk

## Previous stage

# Goblin++ IDE 0.2.1 - alpha.43 integration

This update is based on upstream commit
`892007eb416aad17df7105f3c4d6e420af4e7e66`. It bundles the reviewed alpha.43
Goblin++/Orbit executables, refreshed completion/help/examples and native
`GO_PRIVATE`/`input_secret()` Run support. The original sidecars remain preserved
under ignored `release/validation/original-sidecars/`.

- Open `private_encryption.gbl` and use Run or Compile and Run. Password requests
  open a masked dialog; answers go only to stdin, not console/history/settings.
- Private runs skip scientific run-directory overrides, receipt loading,
  automatic verification and custody display. Cancel closes secret input.
- An old configured engine is refused before a private source can be launched.
  Select the bundled alpha.43 engine or an independently trusted matching build.
- Private source buffers are not copied to check scratch files, and private
  file context is excluded from automatic AI context. Anything you explicitly
  type into AI, hardcode, print or save is still your disclosure.
- `GO_PRIVATE` is not a sandbox, secure-erasure guarantee or a scientific audit.
  The full code guide is bundled as `goblin++/docs/PRIVATE_FUNCTIONS.md`.

## Reproduce the integration checks

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm test
pnpm build
cd src-tauri
cargo test --locked --offline
```

The frontend tests execute the actual RunStore and actual bundled alpha.43
engine, adapting only desktop IPC to Node process pipes. They include both
interpreted and compiled private scripts, cancellation, ordinary run/verify,
secret response non-echo, split control frames, and refusal of a stale engine.
Component tests inspect the actual masked input markup. Native backend tests
exercise the actual process-capture/stdin adapter against the same sidecar.
All automated fixtures are public; no AI API calls or real secrets are used.
These do not substitute for a live installed GUI check or a security audit.

Private/file-data native compilation builds the embedded engine support with
`cargo --locked --offline`. A fresh machine must first cache the matching public
engine dependencies: in the alpha.43 engine source checkout, run
`cargo fetch --locked`. Do this setup before running private code. CI fetches
those dependencies from engine commit
`ffe11be7995e9be18fab0f2991b1f51702488a56` before running the compiled integration
test. The interpreter needs no Rust toolchain or dependency-cache setup.

The Rust toolchain stays at 1.92.0 for this local verification; dependency lock
versions were retained. Source/binary sync is explicit and offline:
`python3 scripts/sync-engine.py --engine-root ../goblinpp`.

For a macOS app: `pnpm exec tauri build --bundles app --ci -- --locked --offline`.
The release build profile retains debug information for build-time macros to
avoid the macOS loader issue documented in
[rust-lang/rust#157750](https://github.com/rust-lang/rust/issues/157750).
This leaves the runtime release profile and dependency versions unchanged.

## Licensing and citation

IDE software is MIT-licensed; see [LICENSE](LICENSE). Cite Malin Hess using
[CITATION.cff](CITATION.cff). The bundled engine retains its separate software,
documentation and branding notices under `public/goblin++/`. Dependency licence
texts, declarations and pinned source evidence are indexed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `third-party/inventory.json`.
The macOS app includes these notices in `Contents/Resources/licenses/`.
The IDE CI checks real engine integration and native app packaging on macOS
arm64; this does not establish Windows/Linux support or an independent security
audit.

Optional Goblin++ merchandise: https://h4k3rl1f3.myspreadshop.co.uk

## Original project overview (alpha.41-era description)

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
an unverified-developer warning. Verify the package checksum against its
independently obtained receipt before deciding whether to open this local
build. Ad-hoc signing is not Apple notarization or publisher authentication.
Keep macOS security protections enabled.

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
