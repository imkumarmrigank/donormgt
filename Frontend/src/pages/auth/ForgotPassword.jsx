// src/pages/auth/ForgotPassword.jsx
// Sends a password reset email via the backend (/auth/forgot-password),
// which internally calls Firebase sendPasswordResetEmail().
// No Firebase client SDK required — works through existing backend.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../../services/api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [status,  setStatus]  = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('')
  const [touched, setTouched] = useState(false)

  const emailError = touched && !EMAIL_RE.test(email.trim())

  const handleSubmit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (!EMAIL_RE.test(email.trim())) return

    setStatus('loading')
    setMessage('')
    try {
      await forgotPassword(email.trim())
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setMessage(err.message || 'Failed to send reset email. Please try again.')
    }
  }

  const inputStyle = (hasError) => ({
    width: '100%',
    padding: '12px 16px',
    fontSize: '14px',
    border: `2px solid ${hasError ? '#fca5a5' : '#e5e7eb'}`,
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
    background: hasError ? '#fff5f5' : '#f9fafb',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
  })

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px',
      fontFamily: "'DM Sans', -apple-system, sans-serif",
      overflow: 'auto',
    }}>
      {/* Background orbs */}
      <div style={{ position:'fixed', top:'-40%', right:'-10%', width:'500px', height:'500px', background:'rgba(255,255,255,0.08)', borderRadius:'50%', filter:'blur(50px)', pointerEvents:'none' }} />
      <div style={{ position:'fixed', bottom:'-30%', left:'-5%', width:'450px', height:'450px', background:'rgba(255,255,255,0.05)', borderRadius:'50%', filter:'blur(50px)', pointerEvents:'none' }} />

      <div style={{
        position: 'relative',
        zIndex: 10,
        width: 'min(420px, 100%)',
        background: 'rgba(255,255,255,0.97)',
        borderRadius: '18px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        padding: '44px 40px',
        border: '1px solid rgba(255,255,255,0.3)',
        animation: 'fadeSlideUp 0.3s ease',
      }}>
        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes spinnerAnim {
            to { transform: rotate(360deg); }
          }
        `}</style>

        {/* Back link */}
        <Link
          to="/login"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 600, color: '#9ca3af',
            textDecoration: 'none', marginBottom: 28,
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#667eea'}
          onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to Sign In
        </Link>

        {/* Icon */}
        <div style={{
          width: 56, height: 56,
          background: 'linear-gradient(135deg, #f0f4ff 0%, #ede9fe 100%)',
          borderRadius: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
          boxShadow: '0 4px 16px rgba(102,126,234,0.18)',
        }}>
          <svg width="26" height="26" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1208', margin: '0 0 8px', letterSpacing: '-0.4px' }}>
          Reset your password
        </h1>
        <p style={{ fontSize: 13.5, color: '#9b8b7a', margin: '0 0 28px', lineHeight: 1.5 }}>
          Enter your email address and we&apos;ll send a link to reset your password.
        </p>

        {/* ── Success state ── */}
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 64, height: 64,
              background: '#ecfdf5',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="30" height="30" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#047857', margin: '0 0 8px' }}>
              Check your inbox
            </h2>
            <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
              A reset link has been sent to <strong style={{ color: '#374151' }}>{email}</strong>.
              Check your spam folder if you don&apos;t see it in a few minutes.
            </p>
            <button
              onClick={() => { setStatus('idle'); setMessage(''); setEmail(''); setTouched(false) }}
              style={{
                fontSize: 13, fontWeight: 600, color: '#667eea',
                background: 'none', border: 'none', cursor: 'pointer',
                textDecoration: 'underline', fontFamily: 'inherit',
              }}
            >
              Send to a different email
            </button>
          </div>
        ) : (
          /* ── Form state ── */
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); if (status === 'error') setStatus('idle') }}
                onBlur={() => setTouched(true)}
                placeholder="your.email@example.com"
                autoFocus
                autoComplete="email"
                style={inputStyle(emailError)}
                onFocus={e => {
                  if (!emailError) {
                    e.target.style.borderColor = '#667eea'
                    e.target.style.background = '#fff'
                    e.target.style.boxShadow = '0 0 0 4px rgba(102,126,234,0.12)'
                  }
                }}
                onBlurCapture={e => {
                  if (!emailError) {
                    e.target.style.borderColor = '#e5e7eb'
                    e.target.style.background = '#f9fafb'
                    e.target.style.boxShadow = 'none'
                  }
                }}
              />
              {emailError && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  Please enter a valid email address.
                </p>
              )}
            </div>

            {/* API error */}
            {status === 'error' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '11px 12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12.5, color: '#dc2626' }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              style={{
                width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 700,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white', border: 'none', borderRadius: 8,
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                opacity: status === 'loading' ? 0.75 : 1,
                boxShadow: '0 4px 15px rgba(102,126,234,0.4)',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'opacity 0.2s',
              }}
            >
              {status === 'loading' && (
                <span style={{
                  display: 'inline-block', width: 16, height: 16,
                  border: '2px solid rgba(255,255,255,0.35)',
                  borderTopColor: 'white', borderRadius: '50%',
                  animation: 'spinnerAnim 0.75s linear infinite',
                }} />
              )}
              {status === 'loading' ? 'Sending reset link…' : 'Send Reset Link'}
            </button>
          </form>
        )}

        {/* Footer */}
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #e5e7eb', textAlign: 'center', color: '#bbb', fontSize: 11.5 }}>
          FreePathshala © 2026 · All rights reserved
        </div>
      </div>
    </div>
  )
}