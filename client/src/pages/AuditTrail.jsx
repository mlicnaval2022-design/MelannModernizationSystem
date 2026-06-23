import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

const today = () => new Date().toISOString().split('T')[0]

const ACTION_COLORS = {
  CREATE: 'badge-active',
  REVERSE: 'badge-reversed',
  DELETE: 'badge-pastdue',
  UPDATE: 'badge-inactive',
  LOGIN: 'badge-admin',
  LOGOUT: 'badge-teller',
}

export default function AuditTrail() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [modules, setModules] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ module: '', user_id: '', date_from: today(), date_to: today(), limit: 200 })
  const load = () => {
    setLoading(true)
    API.get('/audit', { params: filters }).then(r => setRows(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => {
    API.get('/audit/modules').then(r => setModules(r.data.map(m => m.module)))
    API.get('/users').then(r => setUsers(r.data)).catch(() => {})
    load()
  }, [])

  const handleFilter = (e) => {
    e.preventDefault(); load()
  }

  if (!hasRole('admin', 'manager')) return (
    <div className="empty-state"><div className="empty-icon">🔐</div><p>Access restricted to Admins and Managers.</p></div>
  )

  return (
    <div>
      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <form onSubmit={handleFilter} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label className="form-label">Date From</label>
            <input type="date" className="form-control" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Date To</label>
            <input type="date" className="form-control" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Module</label>
            <select className="form-control" value={filters.module} onChange={e => setFilters(f => ({ ...f, module: e.target.value }))}>
              <option value="">All Modules</option>
              {modules.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          {hasRole('admin') && (
            <div className="form-group">
              <label className="form-label">User</label>
              <select className="form-control" value={filters.user_id} onChange={e => setFilters(f => ({ ...f, user_id: e.target.value }))}>
                <option value="">All Users</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Limit</label>
            <select className="form-control" value={filters.limit} onChange={e => setFilters(f => ({ ...f, limit: e.target.value }))}>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
          <button type="submit" id="btn-filter-audit" className="btn btn-primary" disabled={loading}>
            {loading ? '⏳' : '▶ Filter'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => {
            setFilters({ module: '', user_id: '', date_from: today(), date_to: today(), limit: 200 })
          }}>Reset</button>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">🔍 System Audit Trail</div>
          <div className="card-subtitle">{rows.length} records</div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Timestamp</th><th>User</th><th>Action</th><th>Module</th><th>Ref ID</th><th>Details</th><th>IP</th></tr>
            </thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={7}>⏳ Loading audit trail...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">No audit records found for the selected filters</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontSize: 11 }}>{r.created_at?.replace('T', ' ').slice(0, 19)}</td>
                    <td className="fw-600">{r.user_full_name || r.username}</td>
                    <td><span className={`badge ${ACTION_COLORS[r.action] || 'badge-inactive'}`}>{r.action}</span></td>
                    <td><span className="tag">{r.module}</span></td>
                    <td className="text-center">{r.reference_id || '—'}</td>
                    <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)' }}>{r.details || '—'}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.ip_address || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
