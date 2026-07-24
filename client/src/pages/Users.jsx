import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

const ROLES = ['admin', 'manager', 'teller', 'accounting']

export default function Users() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'teller', branch_id: '', is_active: 1 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const load = () => { setLoading(true); API.get('/users').then(r => setRows(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load(); API.get('/branches').then(r => setBranches(r.data)) }, [])

  const openNew = () => { setEditing(null); setForm({ username: '', password: '', full_name: '', role: 'teller', branch_id: '', is_active: 1 }); setError(''); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ username: r.username, password: '', full_name: r.full_name, role: r.role, branch_id: r.branch_id || '', is_active: r.is_active }); setError(''); setModal(true) }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editing) await API.put(`/users/${editing.id}`, form)
      else await API.post('/users', form)
      setModal(false); load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving') }
    finally { setSaving(false) }
  }

  if (!hasRole('admin')) return <div className="empty-state"><div className="empty-icon">🔐</div><p>Access restricted to administrators only.</p></div>

  return (
    <div>
      <div className="page-toolbar">
        <button id="btn-new-user" className="btn btn-primary" onClick={openNew}>+ New User</button>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={6}>⏳ Loading...</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.username}</span></td>
                    <td className="fw-600">{r.full_name}</td>
                    <td><span className={`badge badge-${r.role}`}>{r.role}</span></td>
                    <td><span className={`badge badge-${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header"><span className="modal-title">{editing ? 'Edit User' : 'New User'}</span><button className="modal-close" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Full Name *</label><input className="form-control" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Username *</label><input className="form-control" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required disabled={!!editing} /></div>
                  <div className="form-group"><label className="form-label">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label><input type="password" className="form-control" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required={!editing} /></div>
                  <div className="form-group"><label className="form-label">Role</label>
                    <select className="form-control" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                      {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Branch</label>
                    <select className="form-control" value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}><option value="">All Branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}</select>
                  </div>
                  {editing && <div className="form-group"><label className="form-label">Status</label>
                    <select className="form-control" value={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: parseInt(e.target.value) }))}>
                      <option value={1}>Active</option><option value={0}>Inactive</option>
                    </select>
                  </div>}
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create User'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
