// Frontend/src/pages/UserManagement.jsx
// Admin-only page: create, edit, activate/deactivate users with RBAC

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Edit2, X, CheckCircle, AlertCircle,
  Shield, Mail, Phone, UserCheck, UserX, Search,
  Key, Eye, EyeOff, RefreshCw, Trash2,
} from 'lucide-react'
import { useRole } from '../context/RoleContext'
import * as api from '../services/api'
import { queryKeys } from '../query/queryKeys'

const ROLE_BADGES = {
  admin:     { label: 'Admin',     bg: '#FDE7DA', color: '#E8521A', border: '#FDCFB0' },
  manager:   { label: 'Manager',   bg: '#E8F5EE', color: '#1B5E35', border: '#B7DFCA' },
  executive: { label: 'Executive', bg: '#DBEAFE', color: '#3B82F6', border: '#BFDBFE' },
}

function userId(user) {
  return user?.id || user?.uid
}

function upsertUser(users, user) {
  const id = userId(user)
  if (!id) return users
  return [user, ...users.filter(existing => userId(existing) !== id)]
}

function RoleBadge({ role }) {
  const cfg = ROLE_BADGES[role] || ROLE_BADGES.executive
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`
    }}>
      <Shield size={11} /> {cfg.label}
    </span>
  )
}

function Toast({ toasts, onRemove }) {
  return (
    <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => {
        const Icon = t.type === 'success' ? CheckCircle : AlertCircle
        return (
          <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 260, maxWidth: 360, padding: '12px 14px', borderRadius: 12, background: t.type === 'error' ? 'var(--danger)' : 'var(--secondary)', color: 'white', boxShadow: 'var(--shadow-lg)', pointerEvents: 'auto' }}>
            <Icon size={16} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{t.message}</div>
              {t.sub && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{t.sub}</div>}
            </div>
            <button type="button" onClick={() => onRemove(t.id)} style={{ border: 0, background: 'transparent', color: 'white', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((message, type = 'success', sub = '') => {
    const id = Date.now() + Math.random()
    setToasts(p => [...p, { id, message, type, sub }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500)
  }, [])
  const remove = useCallback(id => setToasts(p => p.filter(t => t.id !== id)), [])
  return { toasts, show, remove }
}

export default function UserManagement() {
  const { role, user: currentUser } = useRole()
  const queryClient = useQueryClient()
  const { toasts, show: showToast, remove: removeToast } = useToast()

  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [viewMode, setViewMode] = useState('cards') // cards | table
  const [showPassword, setShowPassword] = useState(false)

  // Change password modal
  const [pwModal, setPwModal] = useState(false)
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [showPwFields, setShowPwFields] = useState({ current: false, new: false, confirm: false })

  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', role: 'executive', active: true,
  })

  const loadUsers = useCallback(async (options = {}) => {
    try {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      if (options?.force === true) {
        await queryClient.refetchQueries({ queryKey: queryKeys.users({ limit: 200 }) })
      }
    } catch (err) {
      showToast('Failed to load users', 'error', err.message)
    }
  }, [showToast, queryClient])

  const usersQuery = useQuery({
    queryKey: queryKeys.users({ limit: 200 }),
    queryFn: () => api.fetchUsers({ limit: 200 }),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (Array.isArray(usersQuery.data)) setUsers(usersQuery.data)
  }, [usersQuery.data])

  const upsertUserMutation = useMutation({
    mutationFn: async ({ editingUser, formData }) => {
      if (editingUser) {
        const patch = { name: formData.name, phone: formData.phone, role: formData.role, active: formData.active }
        return api.updateUser(userId(editingUser), patch)
      }
      return api.createUser(formData)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, nextActive }) => api.updateUser(id, { active: nextActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: id => api.deleteUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return users.filter(u => {
      if (q && !u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false
      if (filterRole && u.role !== filterRole) return false
      if (filterStatus === 'active' && u.active === false) return false
      if (filterStatus === 'inactive' && u.active !== false) return false
      return true
    })
  }, [users, search, filterRole, filterStatus])

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    managers: users.filter(u => u.role === 'manager').length,
    executives: users.filter(u => u.role === 'executive').length,
    active: users.filter(u => u.active !== false).length,
    inactive: users.filter(u => u.active === false).length,
  }), [users])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', email: '', password: '', phone: '', role: 'executive', active: true })
    setError('')
    setShowPassword(false)
    setModal(true)
  }

  const openEdit = (u) => {
    setEditing(u)
    setForm({ name: u.name || '', email: u.email || '', password: '', phone: u.phone || '', role: u.role || 'executive', active: u.active !== false })
    setError('')
    setShowPassword(false)
    setModal(true)
  }

  const close = () => { setModal(false); setEditing(null); setError('') }

  const save = async () => {
    if (!form.name?.trim()) { setError('Name is required'); return }
    if (!form.email?.trim()) { setError('Email is required'); return }
    if (!editing && !form.password?.trim()) { setError('Password is required for new users'); return }
    if (!editing && form.password.length < 6) { setError('Password must be at least 6 characters'); return }

    setSaving(true); setError('')
    try {
      const saved = await upsertUserMutation.mutateAsync({ editingUser: editing, formData: form })
      setUsers(prev => upsertUser(prev, saved))
      if (editing) showToast('User updated', 'success', form.name)
      else showToast('User created', 'success', `${form.name} (${form.role})`)
      close()
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (u) => {
    if (u.uid === currentUser?.uid) { showToast("Can't deactivate yourself", 'error'); return }
    try {
      const updated = await toggleStatusMutation.mutateAsync({ id: userId(u), nextActive: u.active === false })
      setUsers(prev => upsertUser(prev, updated))
      showToast(u.active === false ? 'User activated' : 'User deactivated', 'success', u.name)
    } catch (err) {
      showToast('Status change failed', 'error', err.message)
    }
  }

  const deleteUser = async (u) => {
    if (u.uid === currentUser?.uid) { showToast("Can't delete yourself", 'error'); return }
    if (!window.confirm(`Delete user "${u.name}"? This cannot be undone.`)) return
    try {
      await deleteUserMutation.mutateAsync(userId(u))
      setUsers(prev => prev.filter(existing => userId(existing) !== userId(u)))
      showToast('User deleted', 'success', u.name)
    } catch (err) {
      showToast('Delete failed', 'error', err.message)
    }
  }

  const submitChangePassword = async () => {
    setPwError('')
    if (pwForm.newPassword.length < 6) { setPwError('New password must be at least 6 characters'); return }
    if (pwForm.newPassword !== pwForm.confirmPassword) { setPwError('Passwords do not match'); return }
    setPwSaving(true)
    try {
      await api.changePassword(pwForm.currentPassword, pwForm.newPassword)
      showToast('Password changed successfully', 'success')
      setPwModal(false)
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      setPwError(err.message || 'Password change failed')
    } finally {
      setPwSaving(false)
    }
  }

  if (role !== 'admin') {
    return (
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="empty-state">
          <div className="empty-icon" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <Shield size={24} />
          </div>
          <h3>Admin Access Required</h3>
          <p>Only administrators can manage users.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-body" style={{ padding: '20px 18px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>User Management</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Create, manage, and control user access</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--border-light)', borderRadius: 10, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              style={{
                border: 'none',
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: viewMode === 'cards' ? 800 : 600,
                background: viewMode === 'cards' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'cards' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: viewMode === 'cards' ? 'var(--shadow)' : 'none',
              }}
              title="Card view"
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                border: 'none',
                cursor: 'pointer',
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: viewMode === 'table' ? 800 : 600,
                background: viewMode === 'table' ? 'var(--surface)' : 'transparent',
                color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: viewMode === 'table' ? 'var(--shadow)' : 'none',
              }}
              title="Table view"
            >
              Table
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); setPwError(''); setPwModal(true); setShowPwFields({ current: false, new: false, confirm: false }) }}>
            <Key size={14} /> Change My Password
          </button>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={14} /> Create User
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Total Users', value: stats.total, color: 'var(--primary)', bg: 'var(--primary-light)' },
          { label: 'Admins', value: stats.admins, color: '#E8521A', bg: '#FDE7DA' },
          { label: 'Managers', value: stats.managers, color: '#1B5E35', bg: '#E8F5EE' },
          { label: 'Executives', value: stats.executives, color: '#3B82F6', bg: '#DBEAFE' },
          { label: 'Active', value: stats.active, color: 'var(--secondary)', bg: 'var(--secondary-light)' },
          { label: 'Inactive', value: stats.inactive, color: 'var(--danger)', bg: 'var(--danger-bg)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', borderRadius: 12, background: s.bg, border: `1px solid ${s.color}22` }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 96px 96px auto', gap: 6, alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name or email…"
                style={{ paddingLeft: 30, width: '100%', fontSize: 12, height: 32 }}
              />
            </div>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ fontSize: 12, minWidth: 0, width: '100%', height: 32, padding: '4px 6px' }}>
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="executive">Executive</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: 12, minWidth: 0, width: '100%', height: 32, padding: '4px 6px' }}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => loadUsers({ force: true })} title="Refresh" style={{ height: 32, minHeight: 32, padding: '0 8px' }}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Users List */}
      {usersQuery.isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading users…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="empty-icon"><Users size={22} /></div>
          <h3>No users found</h3>
          <p>{search || filterRole || filterStatus ? 'Try adjusting your filters' : 'Create your first user to get started'}</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="table-wrap">
          <table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Phone</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const isSelf = u.uid === currentUser?.uid
                const isActive = u.active !== false
                return (
                  <tr key={u.id || u.uid} style={{ opacity: isActive ? 1 : 0.65 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: ROLE_BADGES[u.role]?.bg || '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: ROLE_BADGES[u.role]?.color || '#666', flexShrink: 0 }}>
                          {(u.name || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13.5 }} className="truncate">
                            {u.name || 'Unnamed'} {isSelf && <span style={{ fontSize: 10, color: 'var(--info)', fontWeight: 700 }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }} className="truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><RoleBadge role={u.role} /></td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 800,
                        background: isActive ? 'var(--secondary-light)' : 'var(--danger-bg)',
                        color: isActive ? 'var(--secondary)' : 'var(--danger)',
                        border: `1px solid ${isActive ? 'rgba(27,94,53,0.2)' : 'rgba(220,38,38,0.2)'}`,
                      }}>
                        {isActive ? <CheckCircle size={9} /> : <X size={9} />}
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{u.phone || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="td-actions" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(u)} title="Edit">
                          <Edit2 size={14} />
                        </button>
                        {!isSelf && (
                          <>
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => toggleStatus(u)} title={isActive ? 'Deactivate' : 'Activate'}>
                              {isActive ? <UserX size={14} color="var(--danger)" /> : <UserCheck size={14} color="var(--secondary)" />}
                            </button>
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => deleteUser(u)} title="Delete">
                              <Trash2 size={14} color="var(--danger)" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {filtered.map(u => {
            const isSelf = u.uid === currentUser?.uid
            const isActive = u.active !== false
            return (
              <div key={u.id || u.uid} className="card" style={{ borderLeft: `3px solid ${ROLE_BADGES[u.role]?.color || 'var(--border)'}`, opacity: isActive ? 1 : 0.65 }}>
                <div className="card-body" style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: ROLE_BADGES[u.role]?.bg || '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: ROLE_BADGES[u.role]?.color || '#666', flexShrink: 0 }}>
                          {(u.name || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.name || 'Unnamed'} {isSelf && <span style={{ fontSize: 10, color: 'var(--info)', fontWeight: 600 }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Mail size={10} /> {u.email}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(u)} title="Edit">
                        <Edit2 size={13} />
                      </button>
                      {!isSelf && (
                        <>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => toggleStatus(u)} title={isActive ? 'Deactivate' : 'Activate'}>
                            {isActive ? <UserX size={13} color="var(--danger)" /> : <UserCheck size={13} color="var(--secondary)" />}
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon" onClick={() => deleteUser(u)} title="Delete">
                            <Trash2 size={13} color="var(--danger)" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <RoleBadge role={u.role} />
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700,
                      background: isActive ? 'var(--secondary-light)' : 'var(--danger-bg)',
                      color: isActive ? 'var(--secondary)' : 'var(--danger)',
                      border: `1px solid ${isActive ? 'rgba(27,94,53,0.2)' : 'rgba(220,38,38,0.2)'}`,
                    }}>
                      {isActive ? <CheckCircle size={9} /> : <X size={9} />}
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                    {u.phone && (
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Phone size={10} /> {u.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && close()}>
          <div className="modal" style={{ maxWidth: 480, width: '94vw' }}>
            <div className="modal-header">
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {editing ? <Edit2 size={16} color="var(--primary)" /> : <Plus size={16} color="var(--primary)" />}
              </div>
              <div style={{ flex: 1 }}>
                <div className="modal-title">{editing ? 'Edit User' : 'Create New User'}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                  {editing ? `Editing ${editing.name || editing.email}` : 'All fields except phone are required'}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={close}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert-strip alert-danger" style={{ marginBottom: 12 }}><AlertCircle size={13} /> {error}</div>}

              <div className="form-group">
                <label>Full Name <span className="required">*</span></label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya Sharma" autoFocus />
              </div>

              <div className="form-group">
                <label>Email <span className="required">*</span></label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@freepathshala.com" disabled={!!editing} style={{ opacity: editing ? 0.6 : 1 }} />
              </div>

              {!editing && (
                <div className="form-group">
                  <label>Password <span className="required">*</span></label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 6 characters" style={{ paddingRight: 36 }} />
                    <button type="button" onClick={() => setShowPassword(s => !s)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Phone <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(optional)</span></label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="10-digit" maxLength={10} inputMode="numeric" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Role <span className="required">*</span></label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="executive">Executive</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {editing && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--secondary)' }} />
                    <span>User is active</span>
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={close}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update User' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {pwModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setPwModal(false)}>
          <div className="modal" style={{ maxWidth: 420, width: '94vw' }}>
            <div className="modal-header">
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Key size={16} color="var(--info)" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="modal-title">Change Password</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                  Update your account password
                </div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPwModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {pwError && <div className="alert-strip alert-danger" style={{ marginBottom: 12 }}><AlertCircle size={13} /> {pwError}</div>}

              {[
                { key: 'currentPassword', label: 'Current Password', field: 'current' },
                { key: 'newPassword', label: 'New Password', field: 'new' },
                { key: 'confirmPassword', label: 'Confirm New Password', field: 'confirm' },
              ].map(({ key, label, field }) => (
                <div className="form-group" key={key}>
                  <label>{label}</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwFields[field] ? 'text' : 'password'}
                      value={pwForm[key]}
                      onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={`Enter ${label.toLowerCase()}`}
                      style={{ paddingRight: 36 }}
                    />
                    <button type="button" onClick={() => setShowPwFields(s => ({ ...s, [field]: !s[field] }))} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                      {showPwFields[field] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPwModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitChangePassword} disabled={pwSaving || !pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword}>
                {pwSaving ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
