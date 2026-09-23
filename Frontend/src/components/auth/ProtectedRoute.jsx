// src/components/auth/ProtectedRoute.jsx
// Wraps routes that require authentication and optional role restrictions.
// Unauthenticated users → /login
// Authenticated but wrong role → silently redirected to their default page
import { Navigate, useLocation } from 'react-router-dom'
import { useRole } from '../../context/RoleContext'

// Default landing page for each role
export const ROLE_HOME = {
  admin:     '/dashboard',
  manager:   '/dashboard',
  executive: '/today-pickups',
}

// Which roles may access each protected path
// '*' means any authenticated role
const ROUTE_PERMISSIONS = {
  '/dashboard':        ['admin', 'manager'],
  '/donors':           ['admin', 'manager'],
  '/supporters':       ['admin', 'manager'],
  '/payments':         ['admin', 'manager'],
  '/pickup-scheduler': ['admin', 'manager'],
  '/pickup-overview':  ['admin', 'manager'],
  '/raddi-master':     ['admin'],
  '/user-management':  ['admin'],
  '/pickups':          ['admin', 'manager', 'executive'],
  '/pickup-partners':  ['admin', 'manager', 'executive'],
  '/sks-overview':     ['admin', 'manager', 'executive'],
  '/today-pickups':    ['admin', 'manager', 'executive'],
}

/**
 * ProtectedRoute
 * Props:
 *   allowedRoles  – array of roles that may access this route (defaults to all)
 *   children      – the page component to render
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { isAuthenticated, authLoading, role } = useRole()
  const location = useLocation()

  // Still resolving session — render nothing to avoid flash
  if (authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        gap: 12,
        color: 'var(--text-muted)',
        fontSize: 14,
        fontFamily: 'var(--font-body)',
      }}>
        <span style={{
          display: 'inline-block',
          width: 20,
          height: 20,
          border: '2.5px solid var(--border)',
          borderTopColor: 'var(--primary)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        Loading…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // Not logged in → go to login, preserving intended destination
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // Determine which roles are allowed for this route
  const permitted = allowedRoles ?? ROUTE_PERMISSIONS[location.pathname] ?? ['admin', 'manager', 'executive']

  // Authenticated but not permitted → silently redirect to role home
  if (!permitted.includes(role)) {
    const home = ROLE_HOME[role] || '/today-pickups'
    return <Navigate to={home} replace />
  }

  return children
}

/**
 * RoleGuard — same as ProtectedRoute but accepts a single prop shorthand.
 * Usage: <RoleGuard roles={['admin']}><AdminPage /></RoleGuard>
 */
export function RoleGuard({ roles, children }) {
  return <ProtectedRoute allowedRoles={roles}>{children}</ProtectedRoute>
}