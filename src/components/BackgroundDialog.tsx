import { useEffect, useState } from 'react'
import { dialogs, fs, IMAGE_FILTER, isTauri } from '../platform/tauri'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { BackgroundFit, BackgroundSettings } from '../stores/settingsStore'
import { basename } from '../util/path'

export const BUNDLED_BACKGROUNDS: { id: string; label: string; url: string }[] = [
  { id: 'bundled:squirrel', label: 'Goblin lab (bundled)', url: '/background_image.png' },
]

/** Resolve a background setting to a CSS-usable URL (data: for files on disk). */
export async function resolveBackgroundUrl(bg: BackgroundSettings): Promise<string | null> {
  if (!bg.path) return null
  const bundled = BUNDLED_BACKGROUNDS.find((b) => b.id === bg.path)
  if (bundled) return bundled.url
  if (!isTauri()) return null
  try {
    return await fs.readBase64(bg.path)
  } catch {
    return null
  }
}

export function backgroundStyle(bg: BackgroundSettings, url: string | null): React.CSSProperties {
  const fit: Record<BackgroundFit, React.CSSProperties> = {
    cover: { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
    contain: { backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
    stretch: { backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' },
    center: { backgroundSize: 'auto', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
    tile: { backgroundSize: 'auto', backgroundRepeat: 'repeat' },
  }
  return { backgroundImage: url ? `url("${url}")` : undefined, opacity: bg.opacity, filter: bg.blur ? `blur(${bg.blur}px)` : undefined, ...fit[bg.fit] }
}

export function BackgroundEditor({ onClose }: { onClose?: () => void }) {
  const saved = useSettingsStore((s) => s.settings.background)
  const update = useSettingsStore((s) => s.update)
  const setBackgroundDataUrl = useAppStore((s) => s.setBackgroundDataUrl)
  const [draft, setDraft] = useState<BackgroundSettings>(saved)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const same = (a: BackgroundSettings, b: BackgroundSettings) => a.path === b.path && a.opacity === b.opacity && a.fit === b.fit && a.blur === b.blur && a.dim === b.dim
  useEffect(() => { setDraft((d) => (same(d, saved) ? d : saved)) }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { let alive = true; resolveBackgroundUrl(draft).then((u) => { if (alive) setPreviewUrl(u) }); return () => { alive = false } }, [draft.path])

  // Live preview: push the draft to the window while editing (value-compared to avoid update loops).
  useEffect(() => {
    setBackgroundDataUrl(previewUrl)
    if (!same(draft, useSettingsStore.getState().settings.background)) update({ background: draft })
  }, [draft, previewUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async () => {
    const p = await dialogs.pickFile({ title: 'Choose a background image', filters: IMAGE_FILTER })
    if (p) setDraft((d) => ({ ...d, path: p }))
  }
  const clear = () => setDraft((d) => ({ ...d, path: '' }))

  return (
    <div>
      <div className="settings-field">
        <label>Image</label>
        <div className="settings-row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="run-btn" onClick={() => void pick()} disabled={!isTauri()}>Choose image…</button>
          {BUNDLED_BACKGROUNDS.map((b) => <button key={b.id} type="button" className="toolbar-btn framed" onClick={() => setDraft((d) => ({ ...d, path: b.id }))}>{b.label}</button>)}
          {draft.path && <button type="button" className="toolbar-btn framed" onClick={clear}>Remove</button>}
        </div>
        <div className="hint mono">{draft.path ? (draft.path.startsWith('bundled:') ? draft.path : draft.path) : 'no background image'}</div>
      </div>
      <div className="settings-field">
        <label>Opacity — {Math.round(draft.opacity * 100)}%</label>
        <input type="range" min={0} max={100} value={Math.round(draft.opacity * 100)} onChange={(e) => setDraft((d) => ({ ...d, opacity: Number(e.target.value) / 100 }))} style={{ width: '100%' }} />
        <div className="hint">Fades the image only; text and panels keep their contrast.</div>
      </div>
      <div className="settings-row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="settings-field">
          <label>Fit</label>
          <select className="settings-select" value={draft.fit} onChange={(e) => setDraft((d) => ({ ...d, fit: e.target.value as BackgroundFit }))}>
            <option value="cover">Fill the window (crop)</option>
            <option value="contain">Fit inside the window</option>
            <option value="stretch">Stretch to the window</option>
            <option value="center">Centre (original size)</option>
            <option value="tile">Tile</option>
          </select>
        </div>
        <div className="settings-field">
          <label>Blur — {draft.blur}px</label>
          <input type="range" min={0} max={24} value={draft.blur} onChange={(e) => setDraft((d) => ({ ...d, blur: Number(e.target.value) }))} />
        </div>
        <div className="settings-field">
          <label>Panel tint — {Math.round(draft.dim * 100)}%</label>
          <input type="range" min={0} max={100} value={Math.round(draft.dim * 100)} onChange={(e) => setDraft((d) => ({ ...d, dim: Number(e.target.value) / 100 }))} />
          <div className="hint">Darkens tool windows over the image for legibility.</div>
        </div>
      </div>
      <div className="bg-preview">
        <div className="bg-preview-img" style={backgroundStyle(draft, previewUrl)} />
        <div className="bg-preview-label">{draft.path ? basename(draft.path) : 'no background selected'} · preview</div>
      </div>
      {onClose && <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}><button type="button" className="run-btn" onClick={onClose}>Done</button></div>}
    </div>
  )
}

export function BackgroundDialog() {
  const open = useAppStore((s) => s.backgroundDialogOpen)
  const setOpen = useAppStore((s) => s.setBackgroundDialogOpen)
  if (!open) return null
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="settings-dialog" style={{ width: 620, height: 'auto', maxHeight: '90vh' }} role="dialog" aria-label="Background image">
        <div className="settings-title">Appearance → Background Image</div>
        <div style={{ padding: 16, overflow: 'auto' }}><BackgroundEditor onClose={() => setOpen(false)} /></div>
      </div>
    </div>
  )
}
