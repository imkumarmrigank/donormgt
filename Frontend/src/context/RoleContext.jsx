import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  ensureFreshSession,
  fetchCurrentUser,
  login as apiLogin,
  logout as apiLogout,
} from '../services/api'

// Role display metadata - only for UI rendering, not for authorization
export const ROLES = {
  admin:     { label: 'Admin',     color: '#E8521A', bg: '#FDE7DA' },
  manager:   { label: 'Manager',   color: '#1B5E35', bg: '#E8F5EE' },
  executive: { label: 'Executive', color: '#3B82F6', bg: '#DBEAFE' },
}

// Returns true for connection-level failures that have no HTTP status
// (backend cold-start, server not yet listening, DNS, CORS preflight drops).
// These are distinct from real auth failures (401/403) which always carry err.status.
function isTransientNetworkError(err) {
  if (!err) return false
  if (err.code === 'NETWORK_ERROR') return true   // tagged by fetchWithTimeout
  if (err.name === 'AbortError')    return true   // timeout abort
  if (typeof err.status === 'number') return false // real HTTP error — always show
  // TypeError with no status means fetch() itself threw (no connection)
  return err instanceof TypeError || !err.status
}

const RoleContext = createContext(null)

function normalizeRole(role) {
  return String(role || '').toLowerCase()
}

export const useRole = () => {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be inside <RoleProvider>')
  return ctx
}

export function RoleProvider({ children }) {
  const refreshTimerRef = useRef(null)
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(() => localStorage.getItem('fp_role') || '')
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  const scheduleTokenRefresh = useCallback(() => {
    clearRefreshTimer()
    const expiresAtMs = Number(localStorage.getItem('fp_token_expires_at') || 0)
    if (!expiresAtMs) return
    const leadMs = 5 * 60 * 1000
    const delay = Math.max(15_000, expiresAtMs - Date.now() - leadMs)
    refreshTimerRef.current = setTimeout(async () => {
      try {
        await ensureFreshSession()
        scheduleTokenRefresh()
      } catch {
        setUser(null)
        setRole('')
        setAuthError('Session expired, please login again')
      }
    }, delay)
  }, [clearRefreshTimer])

  // Fetch user profile from backend - this is the single source of truth for role.
  // Pass { isBootstrap: true } when called during app initialisation so that
  // transient network failures (backend cold-start, not-yet-listening) are swallowed
  // silently instead of surfacing "Network request failed" on the login form.
  const loadCurrentUser = useCallback(async (opts = {}) => {
    const { isBootstrap = false } = opts
    const token = localStorage.getItem('fp_id_token')
    if (!token) {
      setUser(null)
      setRole('')
      setAuthLoading(false)
      return null
    }

    setAuthLoading(true)
    setAuthError('')
    try {
      await ensureFreshSession()
      // Backend returns user profile with role from Firestore or custom claims
      const profile = await fetchCurrentUser()
      setUser(profile)
      const nextRole = normalizeRole(profile.role || 'executive')
      setRole(nextRole)
      localStorage.setItem('fp_role', nextRole)
      scheduleTokenRefresh()
      return profile
    } catch (err) {
      setUser(null)
      setRole('')
      // During bootstrap, swallow transient network errors silently.
      // The backend may still be warming up; there is nothing the user did wrong
      // and showing "Network request failed" on a clean login form is misleading.
      // Real auth failures (401, 403, invalid token) always carry err.status and
      // are still surfaced so the user knows their session actually expired.
      if (isBootstrap && isTransientNetworkError(err)) {
        // Silent failure — login page renders clean with no error message
      } else {
        setAuthError(err.message || 'Session expired')
      }
      return null
    } finally {
      setAuthLoading(false)
    }
  }, [scheduleTokenRefresh])

  useEffect(() => {
    loadCurrentUser({ isBootstrap: true })
  }, [loadCurrentUser])

  const login = useCallback(async ({ email, password }) => {
    setAuthError('')
    try {
      const session = await apiLogin(email, password)
      // Backend returns user with role - this is the source of truth
      setUser(session.user)
      setRole(normalizeRole(session.user?.role || 'executive'))
      scheduleTokenRefresh()
      return session.user
    } catch (err) {
      setAuthError(err.message || 'Login failed')
      throw err
    }
  }, [scheduleTokenRefresh])

  const logout = useCallback(async () => {
    clearRefreshTimer()
    await apiLogout()
    setUser(null)
    setRole('')
  }, [clearRefreshTimer])

  useEffect(() => {
    const onStorage = event => {
      if (!['fp_id_token', 'fp_role', 'fp_token_expires_at'].includes(event.key)) return
      if (!localStorage.getItem('fp_id_token')) {
        clearRefreshTimer()
        setUser(null)
        setRole('')
        return
      }
      loadCurrentUser({ isBootstrap: false })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [clearRefreshTimer, loadCurrentUser])

  useEffect(() => () => clearRefreshTimer(), [clearRefreshTimer])

  // Frontend now only stores role from backend - no permission checks
  // All authorization is enforced server-side via requireRoles middleware
  const value = useMemo(() => ({
    user,
    role,
    isAuthenticated: Boolean(user && role),
    authLoading,
    authError,
    login,
    logout,
    reloadUser: loadCurrentUser,
    // Removed: changeRole, can, ROLE_PAGES, DEFAULT_PAGE
    // Role is managed entirely by backend
    ROLES,
  }), [user, role, authLoading, authError, login, logout, loadCurrentUser])

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  )
}