import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

const EMPTY = { first_name: '', last_name: '', middle_name: '', address: '', contact: '', birth_date: '', civil_status: '', occupation: '', branch_id: '', collector_id: '', status: 'active' }

export default function Customers() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [collectors, setCollectors] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    API.get('/customers', { params: { search, status } }).then(r => setRows(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search, status])
  useEffect(() => {
    API.get('/branches').then(r => setBranches(r.data))
    API.get('/collectors').then(r => setCollectors(r.data))
  }, [])

  const openNew = () => { setEditing(null); setForm(EMPTY); setError(''); setModal(true) }
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setError(''); setModal(true) }
  const closeModal = () => { setModal(false); setEditing(null) }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editing) await API.put(`/customers/${editing.id}`, form)
      else await API.post('/customers', form)
      closeModal(); load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving') }
    finally { setSaving(false) }
  }

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this customer?')) return
    await API.delete(`/customers/${id}`); load()
  }

  return (
    <div>
      <div className="page-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input id="customer-search" className="form-control" placeholder="Search name, code, contact..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select id="customer-status-filter" className="form-control" style={{ width: 140 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="reversed">Reversed</option>
        </select>
        <button id="btn-add-customer" className="btn btn-primary" onClick={openNew}>+ New Customer</button>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th><th>Full Name</th><th>Contact</th><th>Address</th><th>Collector</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={7}>⏳ Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">No customers found</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.customer_code}</span></td>
                    <td className="fw-600">{r.full_name}</td>
                    <td>{r.contact || '—'}</td>
                    <td>{r.address || '—'}</td>
                    <td>{r.collector_name || '—'}</td>
                    <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                        {hasRole('admin', 'manager') && r.status === 'active' &&
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(r.id)}>Deactivate</button>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Customer' : 'New Customer'}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Last Name *</label><input className="form-control" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">First Name *</label><input className="form-control" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Middle Name</label><input className="form-control" value={form.middle_name || ''} onChange={e => setForm(f => ({ ...f, middle_name: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Contact</label><input className="form-control" value={form.contact || ''} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
                  <div className="form-group span-2"><label className="form-label">Address</label><input className="form-control" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Birth Date</label><input type="date" className="form-control" value={form.birth_date || ''} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Civil Status</label>
                    <select className="form-control" value={form.civil_status || ''} onChange={e => setForm(f => ({ ...f, civil_status: e.target.value }))}>
                      <option value="">Select...</option>
                      <option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option>
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Occupation</label><input className="form-control" value={form.occupation || ''} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Branch</label>
                    <select className="form-control" value={form.branch_id || ''} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
                      <option value="">Select Branch...</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Collector</label>
                    <select className="form-control" value={form.collector_id || ''} onChange={e => setForm(f => ({ ...f, collector_id: e.target.value }))}>
                      <option value="">Select Collector...</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                  {editing && <div className="form-group"><label className="form-label">Status</label>
                    <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="active">Active</option><option value="inactive">Inactive</option>
                    </select>
                  </div>}
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Customer'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
