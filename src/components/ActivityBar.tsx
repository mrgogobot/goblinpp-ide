import { useAppStore } from '../stores/appStore'
import type { ActivityId } from '../stores/appStore'
import { AIIcon, EvidenceIcon, GearIcon, ProjectIcon, RunIcon, SearchIcon, SourceControlIcon } from './icons'

interface Item { id: ActivityId | 'logo'; label: string; icon: (p: { size?: number }) => JSX.Element; onClick: () => void }

export function ActivityBar() {
  const activeActivity = useAppStore((s) => s.activeActivity)
  const leftSidebarOpen = useAppStore((s) => s.leftSidebarOpen)
  const setActiveActivity = useAppStore((s) => s.setActiveActivity)
  const setLeftSidebarOpen = useAppStore((s) => s.setLeftSidebarOpen)
  const toggleAiPane = useAppStore((s) => s.toggleAiPane)
  const aiPaneOpen = useAppStore((s) => s.aiPaneOpen)
  const openSettings = useAppStore((s) => s.openSettings)

  const pick = (id: ActivityId) => () => {
    if (activeActivity === id && leftSidebarOpen) setLeftSidebarOpen(false)
    else setActiveActivity(id)
  }
  const items: Item[] = [
    { id: 'project', label: 'Project (⌘1)', icon: ProjectIcon, onClick: pick('project') },
    { id: 'search', label: 'Find in Files (⇧⌘F)', icon: SearchIcon, onClick: pick('search') },
    { id: 'scm', label: 'Source Control', icon: SourceControlIcon, onClick: pick('scm') },
    { id: 'run', label: 'Run & Debug', icon: RunIcon, onClick: pick('run') },
    { id: 'evidence', label: 'Evidence & Audit', icon: EvidenceIcon, onClick: pick('evidence') },
    { id: 'ai', label: 'AI Assistant (⌥⌘I)', icon: AIIcon, onClick: () => toggleAiPane() },
    { id: 'settings', label: 'Settings (⌘,)', icon: GearIcon, onClick: () => openSettings('general') },
  ]
  return (
    <nav className="activity-bar" aria-label="Tool windows">
      {items.map((item) => {
        const isActive = item.id === 'ai' ? aiPaneOpen : item.id === activeActivity && leftSidebarOpen
        return (
          <span key={item.id} style={{ display: 'contents' }}>
            {item.id === 'settings' && <span className="activity-spacer" />}
            <button type="button" className={`activity-item${isActive ? ' active' : ''}`} title={item.label} aria-label={item.label} aria-pressed={isActive} onClick={item.onClick}>
              <item.icon size={20} />
            </button>
          </span>
        )
      })}
      <button type="button" className="activity-item logo" title="About Goblin++ IDE" onClick={() => openSettings('about')}>
        <img src="/goblinpp-logo.png" alt="" width={26} height={26} />
      </button>
    </nav>
  )
}
