import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import API from '../services/api'
import logoImg from '../assets/logo.png'

const NAV = [
  { path: '/', label: 'Dashboard', icon: '📊', section: 'Main' },
  { path: '/customers', label: 'Customers', icon: '👥', section: 'Operations' },
  { path: '/credit-scoring', label: 'Credit Scoring', icon: '📋', section: 'Operations' },
  { path: '/loans', label: 'Loans', icon: '💰', section: 'Operations' },
  { path: '/promissory-disclosure', label: 'Disclosure Statement', icon: 'DS', section: 'Operations' },
  { path: '/payments', label: 'Encode Payments', icon: '💳', section: 'Operations' },
  { path: '/monitoring', label: '3-Day Monitoring', icon: '🚨', section: 'Operations' },
  { path: '/collectors', label: 'Collectors', icon: '🚶', section: 'Operations' },
  { path: '/deposits', label: 'Deposits', icon: '🏦', section: 'Finance' },
  { path: '/transactions', label: 'Transactions', icon: '🧾', section: 'Finance' },
  { path: '/dcr', label: 'Daily Cash Report', icon: '📝', section: 'Finance' },
  { path: '/cash', label: 'Cash Position', icon: '🏧', section: 'Finance' },
  { path: '/reports', label: 'Reports', icon: '📈', section: 'Reports' },
  { path: '/government-compliance', label: 'Government Compliance', icon: 'GC', section: 'Reports', roles: ['admin', 'compliance', 'compliance_officer', 'accounting', 'corporate_secretary', 'management', 'manager', 'it'] },
  { path: '/branches', label: 'Branches', icon: '🏢', section: 'Admin', roles: ['admin', 'manager'] },
  { path: '/users', label: 'User Management', icon: '🔐', section: 'Admin', roles: ['admin'] },
  { path: '/audit', label: 'Audit Trail', icon: '🔍', section: 'Admin', roles: ['admin', 'manager'] },
  { path: '/monitoring-settings', label: 'Monitoring Settings', icon: '⚙️', section: 'Admin', roles: ['admin'] },
]

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [changePwModal, setChangePwModal] = useState(false)
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [showNotif, setShowNotif] = useState(false)
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'System Update', message: 'Your weekly collection report is ready to download.', time: '10 mins ago', color: '#3b82f6' },
    { id: 2, title: 'Past Due Alert', message: '3 accounts have moved to past due status today.', time: '1 hour ago', color: '#ef4444' },
    { id: 3, title: 'New Approval', message: 'Loan LN-000008 has been approved by the manager.', time: '2 hours ago', color: '#10b981' }
  ])

  useEffect(() => {
    API.get('/government-compliance/summary')
      .then(r => {
        const complianceNotes = (r.data.notifications || []).map((n, idx) => ({
          id: `gc-${idx}-${n.id}`,
          title: n.title,
          message: n.message,
          time: 'Compliance',
          color: n.severity === 'danger' ? '#ef4444' : n.severity === 'warning' ? '#f59e0b' : '#3b82f6'
        }))
        if (complianceNotes.length) setNotifications(prev => {
          const ids = new Set(prev.map(p => p.id))
          return [...complianceNotes.filter(n => !ids.has(n.id)), ...prev]
        })
      })
      .catch(() => {})

    API.get('/monitoring/notifications')
      .then(r => {
        const monNotes = (r.data || []).map(n => ({
          id: `mon-${n.id}`,
          title: n.title,
          message: n.message,
          time: 'Monitoring',
          color: '#ef4444' // red for alerts
        }))
        if (monNotes.length) setNotifications(prev => {
          const ids = new Set(prev.map(p => p.id))
          return [...monNotes.filter(n => !ids.has(n.id)), ...prev]
        })
      })
      .catch(() => {})
  }, [])

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
        <div className="sidebar-brand" style={{ display: 'flex', justifyContent: 'center', padding: '15px 20px', borderBottom: '1px solid #1e293b' }}>
          <img src={logoImg} alt="Melann Lending" style={{ maxWidth: '80%', height: 'auto' }} />
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
        {location.pathname !== '/' ? (
          <div className="topbar">
            <div className="topbar-title">{pageTitle}</div>
            <div className="topbar-date">{today}</div>
          </div>
        ) : (
          <div className="topbar-v2" style={{ padding: '0 24px', height: '70px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
            <div className="topbar-left">
              <div className="topbar-title-wrapper">
                📈 Dashboard Overview
              </div>
              <select className="topbar-branch-select" defaultValue="">
                <option value="">All Branches</option>
                <option value="1">Main Branch</option>
                <option value="2">North Branch</option>
              </select>
              <div className="topbar-search">
                <span className="icon">🔍</span>
                <input 
                  type="text" 
                  placeholder="Quick Search Client..." 
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      navigate(`/customers?search=${encodeURIComponent(e.target.value.trim())}`);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
            </div>
            <div className="topbar-right">
              <div className="topbar-date" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>📅</span>
                <div style={{ textAlign: 'left' }}>
                  <strong>{today}</strong>
                  <span style={{ fontSize: 10 }}>Current Collection Date</span>
                </div>
              </div>
              <div className="topbar-notif" onClick={() => setShowNotif(!showNotif)} style={{ position: 'relative', cursor: 'pointer' }}>
                🔔
                {notifications.length > 0 && <span className="topbar-notif-badge">{notifications.length}</span>}
                {showNotif && (
                  <div className="notif-dropdown" style={{
                    position: 'absolute', top: '100%', right: -10, marginTop: 15,
                    width: 320, background: '#fff', borderRadius: 8,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', zIndex: 100,
                    color: '#1e293b', textAlign: 'left', cursor: 'default'
                  }} onClick={e => e.stopPropagation()}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Notifications</span>
                      {notifications.length > 0 && (
                        <span style={{ fontSize: 11, color: '#3b82f6', cursor: 'pointer', fontWeight: 'normal' }} onClick={() => setNotifications([])}>Mark all as read</span>
                      )}
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                          No new notifications
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='#f8fafc'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                            <div style={{ fontWeight: 600, color: n.color, marginBottom: 4, fontSize: 13 }}>{n.title}</div>
                            <div style={{ fontSize: 13 }}>{n.message}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{n.time}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <div style={{ padding: '10px', textAlign: 'center', borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#3b82f6', cursor: 'pointer', background: '#f8fafc', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}>
                      View All Notifications
                    </div>
                  </div>
                )}
              </div>
              <div className="sidebar-user" style={{ padding: 0, margin: 0 }}>
                <div className="sidebar-user-avatar" style={{ background: '#cbd5e1', color: '#1e293b' }}>
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
                <div className="sidebar-user-info">
                  <div className="sidebar-user-name" style={{ color: '#1e293b' }}>{user?.full_name}</div>
                  <div className="sidebar-user-role" style={{ color: '#64748b' }}>{user?.role}</div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="page-content">
          <Outlet />
        </div>
      </div>

      {/* Change Password Modal */}
      {changePwModal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setChangePwModal(false)}>
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
