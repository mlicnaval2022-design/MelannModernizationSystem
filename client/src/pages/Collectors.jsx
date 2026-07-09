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

  const [clientsModal, setClientsModal] = useState(null)
  const [collectorLoans, setCollectorLoans] = useState([])
  const [clientsLoading, setClientsLoading] = useState(false)

  const load = () => { setLoading(true); API.get('/collectors').then(r => setRows(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load(); API.get('/branches').then(r => setBranches(r.data)) }, [])

  const openNew = () => { setEditing(null); setForm({ first_name: '', last_name: '', branch_id: '' }); setError(''); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ first_name: r.first_name || '', last_name: r.last_name || '', branch_id: r.branch_id || '' }); setError(''); setModal(true) }

  const [editingLoanId, setEditingLoanId] = useState(null)

  const openClients = async (r) => {
    setClientsModal(r)
    setClientsLoading(true)
    setCollectorLoans([])
    setEditingLoanId(null)
    try {
      const res = await API.get(`/collectors/${r.id}`)
      setCollectorLoans(res.data.loans || [])
    } catch (err) {
      console.error(err)
    } finally {
      setClientsLoading(false)
    }
  }

  const handleAssignCollector = async (loanId, newCollectorId) => {
    if (!newCollectorId) {
      setEditingLoanId(null)
      return
    }
    if (!window.confirm('Are you sure you want to assign this client to the selected collector?')) {
      setEditingLoanId(null)
      return
    }
    try {
      setClientsLoading(true)
      await API.post('/collectors/assign-loan', { loan_id: loanId, new_collector_id: newCollectorId })
      setCollectorLoans(prev => prev.filter(l => l.id !== loanId))
      load() // Refresh main table to update counts
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reassign collector')
    } finally {
      setClientsLoading(false)
      setEditingLoanId(null)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this collector?')) return;
    setError('');
    setSaving(true);
    try {
      await API.delete(`/collectors/${editing.id}`);
      setModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete collector');
    } finally {
      setSaving(false);
    }
  }

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
                    <td>
                      <button 
                        style={{ background: 'none', border: 'none', color: '#3b82f6', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}
                        onClick={() => openClients(r)}
                      >
                        {r.active_loans}
                      </button>
                    </td>
                    <td>{hasRole('admin', 'manager') && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Edit/New Collector Modal */}
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
                <div className="form-actions" style={{ display: 'flex', justifyContent: editing ? 'space-between' : 'flex-end', width: '100%' }}>
                  {editing && (
                    <button type="button" className="btn" style={{ color: '#ef4444', border: '1px solid #ef4444', background: 'transparent' }} onClick={handleDelete} disabled={saving}>
                      Delete
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create'}</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Clients Modal */}
      {clientsModal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setClientsModal(null)}>
          <div className="modal" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <span className="modal-title">Active Clients - {clientsModal.first_name} {clientsModal.last_name}</span>
              <button className="modal-close" onClick={() => setClientsModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {clientsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>⏳ Loading clients...</div>
              ) : collectorLoans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No active clients found for this collector.</div>
              ) : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Loan Code</th>
                        <th>Client Name</th>
                        <th>Balance</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collectorLoans.map(l => (
                        <tr key={l.id}>
                          <td><span className="mono">{l.loan_code}</span></td>
                          <td className="fw-600" style={{ textTransform: 'uppercase' }}>{l.customer_name}</td>
                          <td>PHP {Number(l.balance || 0).toLocaleString()}</td>
                          <td>
                            {editingLoanId === l.id ? (
                              <select 
                                className="form-control" 
                                style={{ padding: '4px 8px', fontSize: '13px', width: '200px' }}
                                autoFocus
                                onBlur={() => setEditingLoanId(null)}
                                onChange={(e) => handleAssignCollector(l.id, e.target.value)}
                              >
                                <option value="">Assign to...</option>
                                {rows.filter(c => c.id !== clientsModal.id).map(c => (
                                  <option key={c.id} value={c.id}>
                                    {c.first_name} {c.last_name} ({c.collector_code})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <button 
                                className="btn btn-secondary btn-sm" 
                                onClick={() => setEditingLoanId(l.id)}
                              >
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
