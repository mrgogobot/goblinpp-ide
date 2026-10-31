/*
 * Promise-based in-app modal dialogs (confirm / prompt / choose). The webview's
 * window.confirm/prompt are unreliable inside WKWebView, so the IDE renders its
 * own JetBrains-style dialogs (see components/ModalDialogs.tsx).
 */
import { create } from 'zustand'

export interface DialogButton { id: string; label: string; primary?: boolean; danger?: boolean }

export interface DialogSpec {
  id: number
  kind: 'confirm' | 'prompt' | 'choose'
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  validate?: (v: string) => string | null
  buttons: DialogButton[]
  options?: { id: string; label: string; detail?: string }[]
  resolve: (result: { button: string; value?: string }) => void
}

interface DialogState {
  queue: DialogSpec[]
  push: (spec: Omit<DialogSpec, 'id' | 'resolve'>) => Promise<{ button: string; value?: string }>
  close: (id: number, result: { button: string; value?: string }) => void
}

let nextId = 1

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  push: (spec) =>
    new Promise((resolve) => {
      const id = nextId++
      set((s) => ({ queue: [...s.queue, { ...spec, id, resolve }] }))
    }),
  close: (id, result) => {
    const d = get().queue.find((q) => q.id === id)
    set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }))
    d?.resolve(result)
  },
}))

export async function confirmDialog(title: string, message: string, opts: { ok?: string; cancel?: string; danger?: boolean; third?: string } = {}): Promise<'ok' | 'cancel' | 'third'> {
  const buttons: DialogButton[] = []
  if (opts.third) buttons.push({ id: 'third', label: opts.third })
  buttons.push({ id: 'cancel', label: opts.cancel ?? 'Cancel' })
  buttons.push({ id: 'ok', label: opts.ok ?? 'OK', primary: true, danger: opts.danger })
  const r = await useDialogStore.getState().push({ kind: 'confirm', title, message, buttons })
  return r.button as 'ok' | 'cancel' | 'third'
}

export async function promptDialog(title: string, opts: { message?: string; defaultValue?: string; placeholder?: string; ok?: string; validate?: (v: string) => string | null } = {}): Promise<string | null> {
  const r = await useDialogStore.getState().push({
    kind: 'prompt',
    title,
    message: opts.message,
    defaultValue: opts.defaultValue,
    placeholder: opts.placeholder,
    validate: opts.validate,
    buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: opts.ok ?? 'OK', primary: true }],
  })
  return r.button === 'ok' ? (r.value ?? '') : null
}

export async function chooseDialog(title: string, options: { id: string; label: string; detail?: string }[], message?: string): Promise<string | null> {
  const r = await useDialogStore.getState().push({ kind: 'choose', title, message, options, buttons: [{ id: 'cancel', label: 'Cancel' }] })
  return r.button === 'cancel' ? null : r.button
}

/* ---- toasts ---- */
export interface Toast { id: number; kind: 'info' | 'success' | 'warning' | 'error'; title: string; detail?: string; actions?: { label: string; run: () => void }[]; sticky?: boolean }
interface ToastState { toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => number; dismiss: (id: number) => void }
let toastId = 1
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = toastId++
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }))
    if (!t.sticky) setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === 'error' ? 9000 : 4500)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))
export function toast(kind: Toast['kind'], title: string, detail?: string, actions?: Toast['actions']): number {
  return useToastStore.getState().push({ kind, title, detail, actions })
}
