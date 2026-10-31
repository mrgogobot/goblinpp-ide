# Icons

`icon.png` is the source icon (512×512, goblin orange). Generate the full
platform set with the Tauri CLI:

```bash
pnpm tauri icon src-tauri/icons/icon.png
```

This writes `icons/icon.icns` (macOS), `icons/icon.ico` (Windows), and the PNG
sizes (Linux) and registers them in `tauri.conf.json`.
