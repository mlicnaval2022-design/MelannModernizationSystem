import { useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import API from '../services/api'

const NAV = [
  { path: '/', label: 'Dashboard', icon: '📊', section: 'Main' },
  { path: '/customers', label: 'Customers', icon: '👥', section: 'Operations' },
  { path: '/loans', label: 'Loans', icon: '💰', section: 'Operations' },
  { path: '/payments', label: 'Payments', icon: '💳', section: 'Operations' },
  { path: '/collectors', label: 'Collectors', icon: '🚶', section: 'Operations' },
  { path: '/deposits', label: 'Deposits', icon: '🏦', section: 'Finance' },
  { path: '/expenses', label: 'Expenses', icon: '📋', section: 'Finance' },
  { path: '/cash', label: 'Cash Position', icon: '🏧', section: 'Finance' },
  { path: '/reports', label: 'Reports', icon: '📈', section: 'Reports' },
  { path: '/branches', label: 'Branches', icon: '🏢', section: 'Admin', roles: ['admin', 'manager'] },
  { path: '/users', label: 'User Management', icon: '🔐', section: 'Admin', roles: ['admin'] },
  { path: '/audit', label: 'Audit Trail', icon: '🔍', section: 'Admin', roles: ['admin', 'manager'] },
]

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const location = useLocation()
  const [changePwModal, setChangePwModal] = useState(false)
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const visibleNav = NAV.filter(n => !n.roles || hasRole(...n.roles))
  const sections = [...new Set(visibleNav.map(n => n.section))]
  const pageTitle = visibleNav.find(n => location.pathname === n.path || (n.path !== '/' && location.pathname.startsWith(n.path)))?.label || 'Dashboard'

  const handleChangePw = async (e) => {
    e.preventDefault()
    setPwError(''); setPwSuccess('')
    if (pwForm.new_password !== pwForm.confirm_password) { setPwError('New passwords do not match.'); return }
    if (pwForm.new_password.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    setPwSaving(true)
    try {
      await API.put('/users/me/password', { current_password: pwForm.current_password, new_password: pwForm.new_password })
      setPwSuccess('Password changed successfully!')
      setPwForm({ current_password: '', new_password: '', confirm_password: '' })
      setTimeout(() => { setChangePwModal(false); setPwSuccess('') }, 1500)
    } catch (err) { setPwError(err.response?.data?.error || 'Error changing password') }
    finally { setPwSaving(false) }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>🏦 Melann Lending</h1>
          <p>System V2 — Modernized</p>
        </div>
        <nav className="sidebar-nav">
          {sections.map(section => (
            <div key={section}>
              <div className="nav-section-label">{section}</div>
              {visibleNav.filter(n => n.section === section).map(nav => (
                <NavLink
                  key={nav.path}
                  to={nav.path}
                  end={nav.path === '/'}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                >
                  <span className="nav-icon">{nav.icon}</span>
                  {nav.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.full_name}</div>
              <div className="sidebar-user-role">{user?.role}</div>
            </div>
          </div>
          <button
            id="btn-change-password"
            className="btn-logout"
            style={{ marginBottom: 4 }}
            onClick={() => { setChangePwModal(true); setPwError(''); setPwSuccess('') }}
          >
            🔑 Change Password
          </button>
          <button id="btn-sign-out" className="btn-logout" onClick={logout}>⎋ Sign Out</button>
        </div>
      </aside>

      <div className="main-content">
        <div className="topbar">
          <span className="topbar-title">{pageTitle}</span>
          <span className="topbar-date">{today}</span>
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </div>

      {/* Change Password Modal */}
      {changePwModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setChangePwModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">🔑 Change Password</span>
              <button className="modal-close" onClick={() => setChangePwModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {pwError && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {pwError}</div>}
              {pwSuccess && (
                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 13, color: 'var(--accent-success)' }}>
                  ✅ {pwSuccess}
                </div>
              )}
              <form onSubmit={handleChangePw}>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Current Password *</label>
                    <input type="password" className="form-control" value={pwForm.current_password}
                      onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))} required autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">New Password *</label>
                    <input type="password" className="form-control" placeholder="At least 6 characters" value={pwForm.new_password}
                      onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirm New Password *</label>
                    <input type="password" className="form-control" value={pwForm.confirm_password}
                      onChange={e => setPwForm(f => ({ ...f, confirm_password: e.target.value }))} required />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setChangePwModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={pwSaving}>{pwSaving ? 'Saving...' : '🔑 Change Password'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
