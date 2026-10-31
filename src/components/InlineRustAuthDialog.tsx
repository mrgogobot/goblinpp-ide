import { useEffect, useState } from 'react'
import { isSha256Hex } from '../run/sha256'
import { useEditorStore } from '../stores/editorStore'
import { useRunStore } from '../stores/runStore'
import { useSettingsStore } from '../stores/settingsStore'
import { basename } from '../util/path'

export function InlineRustAuthDialog() {
  const open = useRunStore((s) => s.inlineRustAuthOpen)
  const setOpen = useRunStore((s) => s.setInlineRustAuthOpen)
  const found = useRunStore((s) => s.inlineRustHashes)
  const authoriseRust = useRunStore((s) => s.authoriseRust)
  const activePath = useEditorStore((s) => s.activePath)
  const existing = useSettingsStore((s) => (activePath ? s.settings.inlineRustHashes[activePath] : undefined))
  const [hash, setHash] = useState('')
  useEffect(() => { if (open) setHash(found[0] ?? existing ?? '') }, [open, found, existing])
  if (!open) return null
  const trimmed = hash.trim().toLowerCase()
  const valid = isSha256Hex(trimmed)
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="settings-dialog" style={{ width: 560, height: 'auto' }} role="dialog" aria-label="Authorise inline Rust">
        <div className="settings-title">Authorise inline Rust block — {activePath ? basename(activePath) : ''}</div>
        <div style={{ padding: 16, fontSize: 13 }}>
          <p style={{ marginTop: 0 }}>
            Inline Rust is arbitrary native code. goblin++ executes it <strong>only</strong> under <code>run --compile</code> and only when the exact SHA-256 of the block is passed with <code>--allow-inline-rust</code>. The interpreter always refuses it. Review the block, then authorise precisely that digest; changing one byte returns the policy to refusal.
          </p>
          {found.length > 0 ? (
            <div className="settings-field">
              <label>Block digests reported by <code>goblin++ check</code></label>
              {found.map((h) => <div key={h} className="mono" style={{ fontSize: 12, cursor: 'pointer', padding: '2px 0', color: h === trimmed ? 'var(--accent-secondary)' : undefined }} onClick={() => setHash(h)}>{h}</div>)}
            </div>
          ) : (
            <div className="hint" style={{ marginBottom: 10 }}>No inline Rust digest was reported for this file (save it first, or it has no RUST_INLINE block).</div>
          )}
          <div className="settings-field">
            <label>Authorised SHA-256 (64 hex characters)</label>
            <input style={{ width: '100%', fontFamily: 'var(--font-mono)' }} value={hash} onChange={(e) => setHash(e.target.value)} autoFocus />
            {hash && !valid && <div className="hint" style={{ color: 'var(--error)' }}>Not a valid 64-hex SHA-256 digest.</div>}
            {existing && <div className="hint">Currently authorised for this file: {existing}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="toolbar-btn" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="run-btn" disabled={!valid} onClick={() => authoriseRust(trimmed)}>Authorise for run --compile</button>
          </div>
        </div>
      </div>
    </div>
  )
}
