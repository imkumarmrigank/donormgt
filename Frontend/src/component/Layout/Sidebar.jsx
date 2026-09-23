// Frontend/src/component/Layout/Sidebar.jsx
import {
  LayoutDashboard, Users, Truck, UserCheck, BarChart3,
  IndianRupee, CalendarDays, Table2, Eye, Shirt, ClipboardList,
  Heart, Database, Shield,
} from 'lucide-react'
import { useRole } from '../../context/RoleContext'

// Build navigation items based on role - defined by backend
// Note: This is only for UI rendering. Backend enforces all authorization.
const buildNav = (role) => {
  const isAdmin     = role === 'admin'
  const isManager   = role === 'manager'
  const isExecutive = role === 'executive'

  // Executive sees limited navigation
  if (isExecutive) {
    return [
      { section: 'Today' },
      { id: 'todaypickups',   label: "Today's Pickups",  icon: ClipboardList },
      { section: 'Pickups' },
      { id: 'pickups',        label: 'Record Pickup',    icon: Truck },
      { id: 'pickuppartners', label: 'Pickup Partners',  icon: UserCheck },
      { section: 'Warehouse' },
      { id: 'sksoverview',    label: 'SKS Stock',        icon: Shirt },
    ]
  }

  // Admin and Manager see full navigation
  return [
    { section: 'Main' },
    { id: 'dashboard',       label: 'Dashboard',        icon: LayoutDashboard },

    { section: 'Database' },
    { id: 'donors',          label: 'Donors',    icon: Users },
    { id: 'supporters',      label: 'Supporters',       icon: Heart },
    { id: 'pickuppartners',  label: 'Pickup Partners',  icon: UserCheck },

    { section: 'Finance' },
    { id: 'payments',        label: 'Collection', icon: IndianRupee },

    { section: 'Pickups' },
    { id: 'pickups',         label: 'Record Pickups',   icon: Truck },
    { id: 'pickupscheduler', label: 'Pickup Scheduler', icon: CalendarDays },
    ...(isAdmin || isManager
      ? [{ id: 'pickupoverview', label: 'Pickup Overview', icon: Eye }]
      : []
    ),
    { id: 'todaypickups',    label: "Today's Pickups",  icon: ClipboardList },

    { section: 'Warehouse' },
    ...(isAdmin || isManager
      ? [{ id: 'sksoverview', label: 'SKS Stock', icon: Shirt }]
      : []
    ),
    ...(isAdmin
      ? [{ id: 'raddimaster', label: 'Raddi Master', icon: Table2 }]
      : []
    ),

    ...(isAdmin
      ? [
        { section: 'Admin' },
        { id: 'usermanagement', label: 'User Management', icon: Shield },
      ]
      : []
    ),
  ]
}

export default function Sidebar({ active, onNav, open, onClose, overdueCount, onLogoClick, role: propRole }) {
  // Use role from props if provided, otherwise from context
  // If neither available, default to 'executive' for safety
  const { role: contextRole } = useRole() || {}
  const _role = propRole || contextRole || 'executive'
  
  const NAV = buildNav(_role)

  return (
    <>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'rgba(0,0,0,0.3)' }}
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div
          className="sidebar-brand"
          onClick={onLogoClick}
          style={{ cursor: 'pointer' }}
          title="Go to Home"
        >
          <div className="sidebar-logo">
            <div className="logo-icon">F</div>
            <div>
              <div className="logo-text">FreePathshala</div>
              <div className="logo-sub">Donor &amp; Pickup</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) return (
              <div key={i} className="nav-section-label">{item.section}</div>
            )
            const Icon  = item.icon
            const badge = item.id === 'pickups' && overdueCount > 0 ? overdueCount : null

            return (
              <button
                key={item.id}
                className={`nav-item ${active === item.id ? 'active' : ''}`}
                onClick={() => { onNav(item.id); onClose?.() }}
              >
                <Icon className="nav-icon" />
                {item.label}
                {badge && <span className="nav-badge">{badge}</span>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-info">
            <div style={{ fontWeight: 600, color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>FreePathshala NGO</div>
            <div>12A &amp; 80G Certified</div>
            <div style={{ marginTop: 2 }}>v2.4.0</div>
          </div>
        </div>
      </aside>
    </>
  )
}
