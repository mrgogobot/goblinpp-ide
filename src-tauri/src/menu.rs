//! Native application menu. Only standard macOS accelerators live here
//! (⌘N/⌘O/⌘S/⌘W/⌘,/⌘Q and the Edit items); every other IDE shortcut is handled in
//! the webview so it stays remappable in Settings → Keymap.

use tauri::menu::{AboutMetadataBuilder, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Wry};

pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let about_meta = AboutMetadataBuilder::new()
        .name(Some("Goblin++ IDE"))
        .version(Some(env!("CARGO_PKG_VERSION")))
        .comments(Some("A Pragmatic Language for Curious Minds; Built on Rust; Ideas Compile Here."))
        .website(Some("https://github.com/mrgogobot/goblinpp"))
        .build();

    let app_menu = SubmenuBuilder::new(app, "Goblin++ IDE")
        .item(&MenuItemBuilder::with_id("about", "About Goblin++ IDE").build(app)?)
        .about(Some(about_meta))
        .separator()
        .item(&MenuItemBuilder::with_id("settings", "Settings…").accelerator("CmdOrCtrl+,").build(app)?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("file.new", "New File").accelerator("CmdOrCtrl+N").build(app)?)
        .item(&MenuItemBuilder::with_id("file.newProject", "New Project…").accelerator("CmdOrCtrl+Shift+N").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("file.open", "Open File…").accelerator("CmdOrCtrl+O").build(app)?)
        .item(&MenuItemBuilder::with_id("file.openFolder", "Open Folder…").accelerator("CmdOrCtrl+Shift+O").build(app)?)
        .item(&MenuItemBuilder::with_id("file.openRecent", "Open Recent…").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("file.save", "Save").accelerator("CmdOrCtrl+S").build(app)?)
        .item(&MenuItemBuilder::with_id("file.saveAs", "Save As…").accelerator("CmdOrCtrl+Shift+S").build(app)?)
        .item(&MenuItemBuilder::with_id("file.saveAll", "Save All").accelerator("CmdOrCtrl+Alt+S").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("file.closeTab", "Close Tab").accelerator("CmdOrCtrl+W").build(app)?)
        .item(&MenuItemBuilder::with_id("file.closeProject", "Close Project").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("file.reveal", "Reveal in Finder").build(app)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&MenuItemBuilder::with_id("edit.find", "Find…").accelerator("CmdOrCtrl+F").build(app)?)
        .item(&MenuItemBuilder::with_id("edit.replace", "Replace…").accelerator("CmdOrCtrl+Alt+F").build(app)?)
        .item(&MenuItemBuilder::with_id("edit.findInFiles", "Find in Files…").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("edit.toggleComment", "Toggle Line Comment").accelerator("CmdOrCtrl+/").build(app)?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("view.project", "Project Tool Window").build(app)?)
        .item(&MenuItemBuilder::with_id("view.bottom", "Bottom Tool Window").build(app)?)
        .item(&MenuItemBuilder::with_id("view.terminal", "Terminal").build(app)?)
        .item(&MenuItemBuilder::with_id("view.ai", "AI Assistant").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("view.background", "Appearance: Background Image…").build(app)?)
        .item(&MenuItemBuilder::with_id("view.theme", "Appearance: Theme…").build(app)?)
        .separator()
        .fullscreen()
        .build()?;

    let run_menu = SubmenuBuilder::new(app, "Run")
        .item(&MenuItemBuilder::with_id("run.run", "Run").build(app)?)
        .item(&MenuItemBuilder::with_id("run.runArgs", "Run with Arguments…").build(app)?)
        .item(&MenuItemBuilder::with_id("run.compile", "Compile and Run (--compile)").build(app)?)
        .item(&MenuItemBuilder::with_id("run.check", "Check (preview, no evidence)").build(app)?)
        .item(&MenuItemBuilder::with_id("run.stop", "Stop").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("run.freeze", "Freeze Current File").build(app)?)
        .item(&MenuItemBuilder::with_id("run.verify", "Verify Last Run").build(app)?)
        .item(&MenuItemBuilder::with_id("run.revise", "Revise…").build(app)?)
        .item(&MenuItemBuilder::with_id("run.status", "Status").build(app)?)
        .item(&MenuItemBuilder::with_id("run.lineage", "Lineage").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("run.audit", "Audit Ledger").build(app)?)
        .item(&MenuItemBuilder::with_id("run.doctor", "Doctor").build(app)?)
        .item(&MenuItemBuilder::with_id("run.capabilities", "Capabilities").build(app)?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window").minimize().maximize().separator().close_window().build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("help.docs", "Goblin++ Documentation").build(app)?)
        .item(&MenuItemBuilder::with_id("help.github", "Goblin++ on GitHub").build(app)?)
        .item(&MenuItemBuilder::with_id("help.environment", "Detect Environment").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("help.logs", "Open Log Folder").build(app)?)
        .build()?;

    let _ = PredefinedMenuItem::separator(app); // keep the import used on all platforms
    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu, &run_menu, &window_menu, &help_menu])
}

pub fn emit(app: &AppHandle, id: &str) {
    let _ = app.emit("menu-action", id.to_string());
}
