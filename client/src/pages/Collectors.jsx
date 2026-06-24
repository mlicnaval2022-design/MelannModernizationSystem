import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function Collectors() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', branch_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => { setLoading(true); API.get('/collectors').then(r => setRows(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load(); API.get('/branches').then(r => setBranches(r.data)) }, [])

  const openNew = () => { setEditing(null); setForm({ first_name: '', last_name: '', branch_id: '' }); setError(''); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ first_name: r.first_name, last_name: r.last_name, branch_id: r.branch_id || '' }); setError(''); setModal(true) }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editing) await API.put(`/collectors/${editing.id}`, { ...form, is_active: 1 })
      else await API.post('/collectors', form)
      setModal(false); load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-toolbar">
        {hasRole('admin', 'manager') && <button id="btn-new-collector" className="btn btn-primary" onClick={openNew}>+ New Collector</button>}
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Code</th><th>Name</th><th>Active Loans</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={5}>⏳ Loading...</td></tr>
                : [...rows].sort((a,b) => a.id - b.id).map(r => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.collector_code}</span></td>
                    <td className="fw-600">{r.first_name} {r.last_name}</td>
                    <td>{r.active_loans}</td>
                    <td>{hasRole('admin', 'manager') && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header"><span className="modal-title">{editing ? 'Edit Collector' : 'New Collector'}</span><button className="modal-close" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">First Name *</label><input className="form-control" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Last Name *</label><input className="form-control" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required /></div>
                  <div className="form-group span-2"><label className="form-label">Branch</label>
                    <select className="form-control" value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
                      <option value="">Select...</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
