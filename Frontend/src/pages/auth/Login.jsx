// src/pages/auth/Login.jsx
// Standalone login page for /login route — migrated from inline LoginScreen in App.jsx
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useRole } from '../../context/RoleContext'
import { ROLE_HOME } from '../../components/auth/ProtectedRoute'

export default function Login() {
  const { login, authError, isAuthenticated, role, authLoading } = useRole()
  const navigate = useNavigate()
  const location = useLocation()

  const [email,          setEmail]          = useState('')
  const [password,       setPassword]       = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [showPassword,   setShowPassword]   = useState(false)
  const [isMobile,       setIsMobile]       = useState(window.innerWidth < 640)
  // Guard: never show authError (from RoleContext bootstrap checks) until the
  // user has actually pressed Sign In at least once.  This prevents transient
  // backend startup failures from polluting a clean first-load login screen.
  const [userHasAttempted, setUserHasAttempted] = useState(false)

  // Once authenticated, send to intended destination or role home
  useEffect(() => {
    if (!authLoading && isAuthenticated && role) {
      const intended = location.state?.from
      const home = ROLE_HOME[role] || '/today-pickups'
      navigate(intended || home, { replace: true })
    }
  }, [isAuthenticated, role, authLoading]) // eslint-disable-line

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setUserHasAttempted(true)
    setSaving(true)
    setError('')
    try {
      await login({ email, password })
      // navigation handled by the effect above
    } catch (err) {
      setError(err.message || 'Unable to sign in')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    fontSize: isMobile ? '16px' : '14px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
    background: '#f9fafb',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  }

  if (authLoading && !saving) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: isMobile ? '16px' : '20px',
      fontFamily: "'DM Sans', -apple-system, sans-serif",
      overflow: 'auto',
    }}>
      {/* Blurred orbs */}
      {!isMobile && (
        <>
          <div style={{ position:'fixed', top:'-50%', right:'-10%', width:'500px', height:'500px', background:'rgba(255,255,255,0.1)', borderRadius:'50%', filter:'blur(40px)', pointerEvents:'none' }} />
          <div style={{ position:'fixed', bottom:'-30%', left:'-5%', width:'400px', height:'400px', background:'rgba(255,255,255,0.05)', borderRadius:'50%', filter:'blur(40px)', pointerEvents:'none' }} />
        </>
      )}

      <div style={{
        position: 'relative',
        zIndex: 10,
        width: isMobile ? '100%' : 'min(420px, 100%)',
        background: 'rgba(255,255,255,0.97)',
        borderRadius: isMobile ? '12px' : '18px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        padding: isMobile ? '32px 20px' : '44px 40px',
        border: '1px solid rgba(255,255,255,0.3)',
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{
            width: 62, height: 62,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 8px 24px rgba(102,126,234,0.45)',
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
            </svg>
          </div>
          <h1 style={{
            fontSize: 28, fontWeight: 700, margin: '0 0 6px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text', letterSpacing: '-0.5px',
          }}>FreePathshala</h1>
          <p style={{ color: '#aaa', fontSize: 13, margin: 0, fontWeight: 500 }}>
            Charity Management Platform
          </p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              placeholder="your.email@example.com"
              required
              autoFocus
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#667eea'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px rgba(102,126,234,0.12)' }}
              onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="••••••••"
                required
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={e => { e.target.style.borderColor = '#667eea'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 4px rgba(102,126,234,0.12)' }}
                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.background = '#f9fafb'; e.target.style.boxShadow = 'none' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 4 }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword
                  ? <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>
                  : <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {/* Error — only shown after the user has attempted to sign in */}
          {(error || (userHasAttempted && authError)) && (
            <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 14px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', lineHeight: 1.45 }}>
              <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>⚠</span>
              <span>{error || authError}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={saving}
            style={{
              width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 700,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white', border: 'none', borderRadius: 8,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              boxShadow: '0 4px 15px rgba(102,126,234,0.4)',
              fontFamily: 'inherit', marginTop: 4,
              transition: 'opacity 0.2s, transform 0.1s',
            }}
          >
            {saving ? 'Signing in…' : 'Sign In'}
          </button>

          {/* Forgot password link */}
          <div style={{ textAlign: 'center' }}>
            <Link
              to="/forgot-password"
              style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500, textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#667eea'}
              onMouseLeave={e => e.target.style.color = '#9ca3af'}
            >
              Forgot your password?
            </Link>
          </div>
        </form>

        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #e5e7eb', textAlign: 'center', color: '#bbb', fontSize: 11.5 }}>
          FreePathshala © 2026 · All rights reserved
        </div>
      </div>
    </div>
  )
}