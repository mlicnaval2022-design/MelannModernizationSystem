import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function Branches() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ branch_code: '', branch_name: '', address: '', contact: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!hasRole('admin', 'manager')) return (
    <div className="empty-state"><div className="empty-icon">🔐</div><p>Access restricted to Admins and Managers.</p></div>
  )

  const load = () => {
    setLoading(true)
    API.get('/branches').then(r => setRows(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm({ branch_code: '', branch_name: '', address: '', contact: '' }); setError(''); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ branch_code: r.branch_code, branch_name: r.branch_name, address: r.address || '', contact: r.contact || '' }); setError(''); setModal(true) }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editing) await API.put(`/branches/${editing.id}`, { ...form, is_active: 1 })
      else await API.post('/branches', form)
      setModal(false); load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-toolbar">
        {hasRole('admin') && <button id="btn-new-branch" className="btn btn-primary" onClick={openNew}>+ New Branch</button>}
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Code</th><th>Branch Name</th><th>Address</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={6}>⏳ Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={6} className="empty-state">No branches found</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.branch_code}</span></td>
                    <td className="fw-600">{r.branch_name}</td>
                    <td>{r.address || '—'}</td>
                    <td>{r.contact || '—'}</td>
                    <td><span className={`badge badge-${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td>
                      {hasRole('admin') && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Branch' : 'New Branch'}</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Branch Code *</label>
                    <input className="form-control" value={form.branch_code} onChange={e => setForm(f => ({ ...f, branch_code: e.target.value }))} required disabled={!!editing} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Branch Name *</label>
                    <input className="form-control" value={form.branch_name} onChange={e => setForm(f => ({ ...f, branch_name: e.target.value }))} required />
                  </div>
                  <div className="form-group span-2">
                    <label className="form-label">Address</label>
                    <input className="form-control" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact</label>
                    <input className="form-control" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Branch'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
