import type { ReactNode } from 'react'

/*
 * Minimal inline SVG icon set (JetBrains-tool-window flavour) so M1 has no
 * icon-font dependency. Each icon inherits `currentColor`.
 */

interface IconProps {
  size?: number
  className?: string
}

function Svg({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const ProjectIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
)

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
  </Svg>
)

export const SourceControlIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="6" cy="18" r="2.4" />
    <circle cx="18" cy="8" r="2.4" />
    <path d="M6 8.4v7.2M8.4 6 15.6 7M8.4 18l7.2-9" />
  </Svg>
)

export const RunIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />
  </Svg>
)

export const EvidenceIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
)

export const AIIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a7 7 0 0 1 7 7c0 2.5-1 4.5-2.5 6H18a3 3 0 0 1 3 3v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1a3 3 0 0 1 3-3h1.5A7 7 0 0 1 5 10a7 7 0 0 1 7-7z" />
    <circle cx="9.5" cy="11" r="0.5" fill="currentColor" />
    <circle cx="14.5" cy="11" r="0.5" fill="currentColor" />
  </Svg>
)

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
  </Svg>
)

export const GoblinLogo = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c-1.5 2.5-1.5 4.5 0 6 1.5-1.5 1.5-3.5 0-6z" fill="currentColor" stroke="none" />
    <circle cx="9.5" cy="9.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="9.5" r="1.3" fill="currentColor" stroke="none" />
    <path d="M6 8c2 1.5 10 1.5 12 0M7 14c2 2 8 2 10 0" />
    <path d="M9 17.5c1.5 1 4.5 1 6 0" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
)

export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3 2.7 5.5 6.3.9-4.5 4.4 1 6.2L12 17.2 6.5 20l1-6.2L3 9.4l6.3-.9z" fill="currentColor" stroke="none" />
  </Svg>
)

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Svg>
)

export const WarnIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17h.01" />
  </Svg>
)

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="currentColor" stroke="none" />
  </Svg>
)
