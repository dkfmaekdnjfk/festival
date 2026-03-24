import { NavLink } from 'react-router-dom'
import { Home, Mic, BookOpen, Calendar, Settings2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/session', icon: Mic, label: 'Session' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/history', icon: BookOpen, label: 'History' },
  { to: '/settings', icon: Settings2, label: 'Settings' },
]

function WsStatusDot() {
  const wsStatus = useAppStore((s) => s.wsStatus)
  const color =
    wsStatus === 'connected'
      ? 'bg-success'
      : wsStatus === 'connecting'
      ? 'bg-warning'
      : wsStatus === 'error'
      ? 'bg-error'
      : 'bg-text-subtle'

  return (
    <div
      className={cn('w-2 h-2 rounded-full', color)}
      title={wsStatus}
    />
  )
}

export function Sidebar() {
  return (
    <aside className="flex flex-col items-center w-14 h-screen bg-surface border-r border-border py-4 shrink-0">
      {/* Logo */}
      <div className="mb-6">
        <span className="text-primary font-mono text-xs font-bold tracking-widest select-none">
          f
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col items-center gap-1 flex-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={label}
            className={({ isActive }) =>
              cn(
                'flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
                isActive
                  ? 'bg-primary/20 text-primary'
                  : 'text-text-muted hover:text-text hover:bg-surface-elevated'
              )
            }
          >
            <Icon size={18} strokeWidth={1.75} />
          </NavLink>
        ))}
      </nav>

      {/* Bottom: WS status */}
      <div className="flex items-center justify-center w-9 h-9">
        <WsStatusDot />
      </div>
    </aside>
  )
}
