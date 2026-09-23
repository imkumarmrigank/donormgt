import { LogOut, Menu } from 'lucide-react'

const PAGE_META = {
  dashboard:       { title: 'Dashboard',              sub: 'Overview & quick stats' },
  donors:          { title: 'Donors',                 sub: 'Manage donor profiles' },
  supporters:      { title: 'Supporters',             sub: 'All donors, RST/SKS contributors & supporters' },
  pickups:         { title: 'Pickups',                sub: 'RST & SKS pickup recording' },
  pickuppartners:  { title: 'Pickup Partners',        sub: 'Scrap dealer directory & financials' },
  payments:        { title: 'Payment Tracking',       sub: 'Track & update pickup partner payments' },
  pickupscheduler: { title: 'Pickup Scheduler',       sub: 'Schedule pickups for donors' },
  todaypickups:    { title: "Today's Pickups",        sub: 'Your pickup assignments for today' },
  pickupoverview:  { title: 'Pickup Overview',        sub: 'Individual & drive analytics - admin view' },
  raddimaster:     { title: 'Raddi Master',           sub: 'Complete pickup data - all orders in one view' },
  sksoverview:     { title: 'SKS Stock',              sub: 'Warehouse tracking for donated goods' },
}

export default function Header({ page, onMenuClick, user, role, onLogout }) {
  const meta = PAGE_META[page] || {}

  return (
    <header className="header">
      <button className="hamburger btn-icon" onClick={onMenuClick}>
        <Menu size={20} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="header-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.title}
        </div>
        <div className="header-subtitle" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.sub}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            {user?.name || user?.email || 'User'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{role}</div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" title="Logout" onClick={onLogout}>
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
