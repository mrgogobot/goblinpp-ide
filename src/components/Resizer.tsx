import { useRef } from 'react'

/** Drag handle for resizable panels. `onResize` receives the delta in px. */
export function Resizer({ direction, onResize, onEnd }: { direction: 'horizontal' | 'vertical'; onResize: (delta: number) => void; onEnd?: () => void }) {
  const last = useRef(0)
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault()
    last.current = direction === 'horizontal' ? e.clientX : e.clientY
    const move = (ev: MouseEvent) => {
      const cur = direction === 'horizontal' ? ev.clientX : ev.clientY
      onResize(cur - last.current)
      last.current = cur
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.classList.remove('resizing')
      onEnd?.()
    }
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.classList.add('resizing')
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return <div className={`resizer resizer-${direction}`} onMouseDown={onDown} />
}
