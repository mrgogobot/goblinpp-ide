import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'

const MOTTO = 'A Pragmatic Language for Curious Minds; Built on Rust; Ideas Compile Here'

export function Splash() {
  const finishSplash = useAppStore((s) => s.finishSplash)
  useEffect(() => {
    const t = setTimeout(finishSplash, 1400)
    return () => clearTimeout(t)
  }, [finishSplash])
  return (
    <div className="splash" role="status" aria-label="Goblin++ IDE is starting">
      <img className="splash-logo" src="/goblinpp-logo.png" alt="Goblin++" width={120} height={120} />
      <div className="splash-title">Goblin++ IDE</div>
      <div className="splash-motto">{MOTTO}</div>
      <div className="splash-bar-track"><div className="splash-bar-fill" /></div>
    </div>
  )
}
