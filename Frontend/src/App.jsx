/**
 * App.jsx — Central router for FreePathshala
 *
 * Architecture:
 *  BrowserRouter
 *   └─ RoleProvider          (auth state: user, role, login, logout)
 *       └─ AppRoutes         (decides public vs. protected shell)
 *           ├─ /login        (public)
 *           ├─ /forgot-password (public)
 *           └─ AppShell      (authenticated layout: sidebar + header)
 *               ├─ NavContext.Provider   (onNav + addDonor trigger)
 *               └─ AppProvider          (data: donors, pickups, etc.)
 *                   └─ <Outlet />       (page components via routes below)
 *
 * Role → default landing:
 *   admin / manager  →  /dashboard
 *   executive        →  /today-pickups
 *
 * Unauthorized route access → silently redirect to role home (ProtectedRoute).
 * No signup — user creation is managed via the admin User Management page.
 */

import { createContext, useCallback, useContext, useState } from 'react'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'

import { AppProvider } from './context/AppContext'
import { RoleProvider, useRole } from './context/RoleContext'
import ProtectedRoute, { ROLE_HOME } from './components/auth/ProtectedRoute'

import Sidebar from './component/Layout/Sidebar'
import Header  from './component/Layout/Header'

import Login          from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'

import Dashboard       from './pages/Dashboard'
import Donors          from './pages/Donors'
import Supporters      from './pages/Supporters'
import Pickups         from './pages/Pickups'
import PickupPartners  from './pages/Pickuppartners'
import Payments        from './pages/Payments'
import PickupScheduler from './pages/PickupScheduler'
import TodayPickups    from './pages/Todaypickups'
import PickupOverview  from './pages/PickupOverview'
import RaddiMaster     from './pages/RaddiMaster'
import SKSOverview     from './pages/SKSOverview'
import UserManagement  from './pages/UserManagement'

// ─────────────────────────────────────────────────────────────────────────────
// Page-ID ↔ URL path mappings
// Page IDs are the short keys used by onNav() throughout the app.
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_TO_PATH = {
  dashboard:       '/dashboard',
  donors:          '/donors',
  supporters:      '/supporters',
  pickups:         '/pickups',
  pickuppartners:  '/pickup-partners',
  payments:        '/payments',
  pickupscheduler: '/pickup-scheduler',
  todaypickups:    '/today-pickups',
  pickupoverview:  '/pickup-overview',
  raddimaster:     '/raddi-master',
  sksoverview:     '/sks-overview',
  usermanagement:  '/user-management',
}

/** Reverse map: URL path → page ID (used to set the sidebar active item) */
const PATH_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_TO_PATH).map(([id, path]) => [path, id])
)

// ─────────────────────────────────────────────────────────────────────────────
// NavContext — provides onNav() + the "add donor" trigger down to all pages
// without prop-drilling through every route element.
// ─────────────────────────────────────────────────────────────────────────────
const NavContext = createContext(null)
const useNav = () => useContext(NavContext)

// ─────────────────────────────────────────────────────────────────────────────
// Role sets for ProtectedRoute
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN         = ['admin']
const ADMIN_MANAGER = ['admin', 'manager']
const ALL_ROLES     = ['admin', 'manager', 'executive']

// ─────────────────────────────────────────────────────────────────────────────
// AppShell — the authenticated layout wrapper.
// Renders Sidebar + Header and exposes an <Outlet /> for page content.
// All authenticated routes are nested inside this component.
// ─────────────────────────────────────────────────────────────────────────────
function AppShell() {
  const { role, user, logout } = useRole()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [addDonor,    setAddDonor]    = useState(false)

  // Derive current page ID from the URL so Sidebar can highlight it.
  const currentPage = PATH_TO_PAGE[pathname] ?? (role === 'executive' ? 'todaypickups' : 'dashboard')
  const homePath    = ROLE_HOME[role] || '/today-pickups'

  /**
   * onNav(pageId, opts?)
   *
   * Used by all pages to trigger client-side navigation.
   * opts may carry { donorId, pickupId } which are forwarded as
   * React Router location state and consumed by PickupsPage below.
   */
  const onNav = useCallback((target, opts = {}) => {
    const path  = PAGE_TO_PATH[target] || `/${target}`
    const state = Object.keys(opts || {}).length ? opts : undefined
    setSidebarOpen(false)
    navigate(path, { state })
  }, [navigate])

  return (
    <NavContext.Provider value={{ onNav, addDonor, setAddDonor }}>
      {/*
        AppProvider lives inside AppShell so it is only mounted when the user
        is authenticated. It uses useRole() internally, which is always
        available because RoleProvider wraps the entire tree.
      */}
      <AppProvider>
        <div className="app-layout">
          <Sidebar
            active={currentPage}
            onNav={onNav}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onLogoClick={() => navigate(homePath)}
            role={role}
          />

          <div className="main-content">
            <Header
              page={currentPage}
              onMenuClick={() => setSidebarOpen(o => !o)}
              onAddDonor={() => setAddDonor(true)}
              user={user}
              role={role}
              onLogout={logout}
            />

            {/* Page content rendered here by the nested routes */}
            <Outlet />
          </div>
        </div>
      </AppProvider>
    </NavContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Thin page wrapper components
//
// Each wrapper reads what it needs from NavContext (and sometimes from
// React Router location.state) and passes them as named props to the
// actual page component — keeping page components unchanged.
// ─────────────────────────────────────────────────────────────────────────────

function DashboardPage() {
  const { onNav } = useNav()
  return <Dashboard onNav={onNav} />
}

function DonorsPage() {
  const { onNav, addDonor, setAddDonor } = useNav()
  return (
    <Donors
      onNav={onNav}
      triggerAddDonor={addDonor}
      onAddDonorDone={() => setAddDonor(false)}
    />
  )
}

function SupportersPage() {
  const { onNav } = useNav()
  return <Supporters onNav={onNav} />
}

/**
 * PickupsPage handles the special case where TodayPickups navigates here
 * with { donorId, pickupId } in location.state so the Pickups form can
 * pre-select a donor or continue an existing scheduled pickup.
 * After consuming the state the URL is replaced so a browser refresh
 * doesn't re-apply stale state.
 */
function PickupsPage() {
  const { onNav } = useNav()
  const { state } = useLocation()
  const navigate  = useNavigate()

  const clearState = useCallback(
    () => navigate('/pickups', { replace: true, state: null }),
    [navigate]
  )

  return (
    <Pickups
      onNav={onNav}
      initialDonorId={state?.donorId   ?? null}
      initialPickupId={state?.pickupId ?? null}
      onDonorApplied={clearState}
      onPickupApplied={clearState}
    />
  )
}

function PickupPartnersPage() {
  const { onNav } = useNav()
  return <PickupPartners onNav={onNav} />
}

function PaymentsPage() {
  const { onNav } = useNav()
  return <Payments onNav={onNav} />
}

function PickupSchedulerPage() {
  const { onNav } = useNav()
  return <PickupScheduler onNav={onNav} />
}

function TodayPickupsPage() {
  const { onNav } = useNav()
  return <TodayPickups onNav={onNav} />
}

function PickupOverviewPage() {
  const { onNav } = useNav()
  return <PickupOverview onNav={onNav} />
}

function RaddiMasterPage() {
  const { onNav } = useNav()
  return <RaddiMaster onNav={onNav} />
}

function SKSOverviewPage() {
  const { onNav } = useNav()
  return <SKSOverview onNav={onNav} />
}

function UserManagementPage() {
  const { onNav } = useNav()
  return <UserManagement onNav={onNav} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard — slim ProtectedRoute wrapper for readable JSX in the route tree
// ─────────────────────────────────────────────────────────────────────────────
function Guard({ roles, children }) {
  return <ProtectedRoute allowedRoles={roles}>{children}</ProtectedRoute>
}

// ─────────────────────────────────────────────────────────────────────────────
// Global loading spinner (shown while RoleContext resolves the session)
// ─────────────────────────────────────────────────────────────────────────────
function GlobalLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        fontFamily: 'var(--font-body, sans-serif)',
        color: 'var(--text-muted, #9b8b7a)',
        fontSize: 14,
        background: 'var(--bg, #fff9f5)',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 22,
          height: 22,
          border: '2.5px solid var(--border, #edd9ce)',
          borderTopColor: 'var(--primary, #e8521a)',
          borderRadius: '50%',
          animation: 'fp-spin 0.75s linear infinite',
        }}
      />
      <style>{`@keyframes fp-spin { to { transform: rotate(360deg); } }`}</style>
      Loading…
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AppRoutes — reads auth state and renders the correct route tree.
// Must be a child of both BrowserRouter and RoleProvider.
// ─────────────────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { isAuthenticated, authLoading, role } = useRole()
  const homePath = ROLE_HOME[role] || '/today-pickups'

  // Block rendering until the session token is verified so we never flash
  // the login page for an already-authenticated user.
  if (authLoading) return <GlobalLoader />

  return (
    <Routes>
      {/* ── Public routes ─────────────────────────────────────────────────── */}

      {/* Redirect logged-in users away from /login */}
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={homePath} replace /> : <Login />}
      />

      {/* Forgot-password is always accessible (users may be logged out) */}
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* ── Authenticated shell ────────────────────────────────────────────── */}
      {/*
        When not authenticated, every path under here redirects to /login.
        ProtectedRoute inside each route handles role-based access:
        an authenticated user without the required role is silently
        redirected to their own home (ROLE_HOME), never to an error page.
      */}
      <Route
        element={
          isAuthenticated ? <AppShell /> : <Navigate to="/login" replace />
        }
      >
        {/* Root redirect → role-appropriate home */}
        <Route index element={<Navigate to={homePath} replace />} />

        {/* ── Admin + Manager ── */}
        <Route
          path="/dashboard"
          element={<Guard roles={ADMIN_MANAGER}><DashboardPage /></Guard>}
        />
        <Route
          path="/donors"
          element={<Guard roles={ADMIN_MANAGER}><DonorsPage /></Guard>}
        />
        <Route
          path="/supporters"
          element={<Guard roles={ADMIN_MANAGER}><SupportersPage /></Guard>}
        />
        <Route
          path="/payments"
          element={<Guard roles={ADMIN_MANAGER}><PaymentsPage /></Guard>}
        />
        <Route
          path="/pickup-scheduler"
          element={<Guard roles={ADMIN_MANAGER}><PickupSchedulerPage /></Guard>}
        />
        <Route
          path="/pickup-overview"
          element={<Guard roles={ADMIN_MANAGER}><PickupOverviewPage /></Guard>}
        />

        {/* ── Admin only ── */}
        <Route
          path="/raddi-master"
          element={<Guard roles={ADMIN}><RaddiMasterPage /></Guard>}
        />
        <Route
          path="/user-management"
          element={<Guard roles={ADMIN}><UserManagementPage /></Guard>}
        />

        {/* ── All authenticated roles ── */}
        <Route
          path="/pickups"
          element={<Guard roles={ALL_ROLES}><PickupsPage /></Guard>}
        />
        <Route
          path="/pickup-partners"
          element={<Guard roles={ALL_ROLES}><PickupPartnersPage /></Guard>}
        />
        <Route
          path="/sks-overview"
          element={<Guard roles={ALL_ROLES}><SKSOverviewPage /></Guard>}
        />
        <Route
          path="/today-pickups"
          element={<Guard roles={ALL_ROLES}><TodayPickupsPage /></Guard>}
        />
      </Route>

      {/* ── Catch-all: unknown paths go to home or login ─────────────────── */}
      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? homePath : '/login'} replace />}
      />
    </Routes>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// App — root export. BrowserRouter wraps everything so hooks like
// useNavigate() work anywhere in the tree.
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <RoleProvider>
        <AppRoutes />
      </RoleProvider>
    </BrowserRouter>
  )
}