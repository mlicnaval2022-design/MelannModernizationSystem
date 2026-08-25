import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import './Collectors.css'

function OptionManager({ title, description, options, draft, onDraftChange, onAdd, onRename, onToggle, saving }) {
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')

  const saveRename = async (option) => {
    const saved = await onRename(option, editingName)
    if (saved) setEditingId(null)
  }

  return (
    <section className="collector-option-card">
      <div className="collector-option-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="collector-option-count">{options.filter(option => option.is_active).length} active</span>
      </div>

      <form className="collector-option-add" onSubmit={onAdd}>
        <input
          className="form-control"
          value={draft}
          onChange={event => onDraftChange(event.target.value)}
          placeholder={`Add ${title.toLowerCase()}`}
          maxLength={100}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={saving}>+ Add</button>
      </form>

      <div className="collector-option-list">
        {options.length === 0 ? <div className="collector-option-empty">No configured options yet.</div> : options.map(option => (
          <div className={`collector-option-row ${option.is_active ? '' : 'is-inactive'}`} key={option.id}>
            <div className="collector-option-name">
              {editingId === option.id ? (
                <input
                  className="form-control"
                  value={editingName}
                  onChange={event => setEditingName(event.target.value)}
                  maxLength={100}
                  autoFocus
                />
              ) : (
                <>
                  <span>{option.option_name}</span>
                  <span className={`badge badge-${option.is_active ? 'active' : 'inactive'}`}>{option.is_active ? 'Active' : 'Inactive'}</span>
                </>
              )}
            </div>
            <div className="collector-option-actions">
              {editingId === option.id ? (
                <>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => saveRename(option)} disabled={saving}>Save</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingId(option.id); setEditingName(option.option_name) }}>Edit</button>
                  <button type="button" className={`btn btn-sm ${option.is_active ? 'collector-deactivate-btn' : 'collector-activate-btn'}`} onClick={() => onToggle(option)} disabled={saving}>
                    {option.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Collectors() {
  const { hasRole, hasPermission } = useAuth()
  const canManage = hasRole('admin', 'manager') || hasPermission('collectors', 'input') || hasPermission('collectors', 'crud')
  const [activeTab, setActiveTab] = useState('collectors')
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [options, setOptions] = useState({ assigned_areas: [], supervisors: [] })
  const [optionDrafts, setOptionDrafts] = useState({ assigned_area: '', supervisor: '' })
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionSaving, setOptionSaving] = useState(false)
  const [optionError, setOptionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', branch_id: '', assigned_to: '', supervisor: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successModal, setSuccessModal] = useState(null)

  const [confirmModal, setConfirmModal] = useState(null)

  const [clientsModal, setClientsModal] = useState(null)
  const [collectorLoans, setCollectorLoans] = useState([])
  const [clientsLoading, setClientsLoading] = useState(false)

  const load = () => {
    setLoading(true)
    return API.get('/collectors').then(r => setRows(r.data)).finally(() => setLoading(false))
  }
  const loadOptions = () => {
    setOptionsLoading(true)
    return API.get('/collectors/options')
      .then(response => setOptions(response.data))
      .catch(err => setOptionError(err.response?.data?.error || 'Unable to load collector options.'))
      .finally(() => setOptionsLoading(false))
  }
  useEffect(() => { load(); loadOptions(); API.get('/branches').then(r => setBranches(r.data)) }, [])

  const addOption = async (event, optionType) => {
    event.preventDefault()
    setOptionError('')
    setOptionSaving(true)
    try {
      await API.post('/collectors/options', { option_type: optionType, option_name: optionDrafts[optionType] })
      setOptionDrafts(drafts => ({ ...drafts, [optionType]: '' }))
      await loadOptions()
    } catch (err) {
      setOptionError(err.response?.data?.error || 'Unable to add the option.')
    } finally {
      setOptionSaving(false)
    }
  }

  const renameOption = async (option, optionName) => {
    setOptionError('')
    setOptionSaving(true)
    try {
      await API.put(`/collectors/options/${option.id}`, { option_name: optionName, is_active: Boolean(option.is_active) })
      await Promise.all([loadOptions(), load()])
      return true
    } catch (err) {
      setOptionError(err.response?.data?.error || 'Unable to rename the option.')
      return false
    } finally {
      setOptionSaving(false)
    }
  }

  const toggleOption = async (option) => {
    setOptionError('')
    setOptionSaving(true)
    try {
      await API.put(`/collectors/options/${option.id}`, { option_name: option.option_name, is_active: !option.is_active })
      await loadOptions()
    } catch (err) {
      setOptionError(err.response?.data?.error || 'Unable to update the option status.')
    } finally {
      setOptionSaving(false)
    }
  }

  const selectableOptions = (configuredOptions, currentValue) => configuredOptions.filter(option => option.is_active || option.option_name === currentValue)

  const openNew = () => { setEditing(null); setForm({ first_name: '', last_name: '', branch_id: '', assigned_to: '', supervisor: '' }); setError(''); setModal(true) }
  const openEdit = (r) => { setEditing(r); setForm({ first_name: r.first_name || '', last_name: r.last_name || '', branch_id: r.branch_id || '', assigned_to: r.assigned_to || '', supervisor: r.supervisor || '' }); setError(''); setModal(true) }

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
    const targetCollector = rows.find(c => String(c.id) === String(newCollectorId))
    const targetName = targetCollector ? `${targetCollector.first_name} ${targetCollector.last_name}` : 'the selected collector'
    setConfirmModal({
      message: `Are you sure you want to assign this client to ${targetName}?`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          setClientsLoading(true)
          await API.post('/collectors/assign-loan', { loan_id: loanId, new_collector_id: newCollectorId })
          setCollectorLoans(prev => prev.filter(l => l.id !== loanId))
          load()
        } catch (err) {
          setConfirmModal({ message: err.response?.data?.error || 'Failed to reassign collector', isAlert: true, onConfirm: () => setConfirmModal(null) })
        } finally {
          setClientsLoading(false)
          setEditingLoanId(null)
        }
      },
      onCancel: () => { setConfirmModal(null); setEditingLoanId(null) }
    })
  }

  const handleDelete = async () => {
    setConfirmModal({
      message: 'Are you sure you want to delete this collector?',
      onConfirm: async () => {
        setConfirmModal(null)
        doDeleteCollector()
      },
      onCancel: () => setConfirmModal(null)
    })
  }

  const doDeleteCollector = async () => {
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
      const collectorName = `${form.first_name} ${form.last_name}`.trim()
      if (editing) await API.put(`/collectors/${editing.id}`, { ...form, is_active: 1 })
      else await API.post('/collectors', form)
      setModal(false); load()
      setSuccessModal({
        title: editing ? 'Collector Updated' : 'Collector Created',
        message: editing
          ? `${collectorName} information has been saved successfully.`
          : `${collectorName} has been created successfully.`
      })
    } catch (err) { setError(err.response?.data?.error || 'Error saving') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="card collector-tabs-card">
        <div className="collector-tabs" role="tablist" aria-label="Collector module sections">
          <button type="button" className={`btn ${activeTab === 'collectors' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('collectors')}>Collectors</button>
          {canManage && <button type="button" className={`btn ${activeTab === 'configuration' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('configuration')}>Assigned Area &amp; Supervisor</button>}
        </div>
      </div>

      {activeTab === 'collectors' && <>
        <div className="page-toolbar">
          {canManage && <button id="btn-new-collector" className="btn btn-primary" onClick={openNew}>+ New Collector</button>}
        </div>
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Name</th><th>Supervisor</th><th>Assigned To</th><th>Active Loans</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr className="loading-row"><td colSpan={6}>⏳ Loading...</td></tr>
                  : [...rows].sort((a,b) => a.id - b.id).map(r => (
                    <tr key={r.id}>
                      <td><span className="mono">{r.collector_code}</span></td>
                      <td className="fw-600">{r.first_name} {r.last_name}</td>
                      <td>{r.supervisor || '—'}</td>
                      <td>{r.assigned_to || '—'}</td>
                      <td>
                        <button className="collector-loan-link" onClick={() => openClients(r)}>{r.active_loans}</button>
                      </td>
                      <td>{(hasRole('admin', 'manager') || hasPermission('collectors', 'edit') || hasPermission('collectors', 'crud')) && <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {activeTab === 'configuration' && canManage && (
        <div>
          <div className="collector-config-intro">
            <div>
              <h2>Collector Dropdown Configuration</h2>
              <p>Manage the choices shown in the Assigned To and Supervisor fields of the New Collector form.</p>
            </div>
          </div>
          {optionError && <div className="login-error collector-option-error">⚠️ {optionError}</div>}
          {optionsLoading ? <div className="card empty-state">Loading configuration...</div> : (
            <div className="collector-config-grid">
              <OptionManager
                title="Assigned Area"
                description="Areas available in the Assigned To dropdown."
                options={options.assigned_areas}
                draft={optionDrafts.assigned_area}
                onDraftChange={value => setOptionDrafts(drafts => ({ ...drafts, assigned_area: value }))}
                onAdd={event => addOption(event, 'assigned_area')}
                onRename={renameOption}
                onToggle={toggleOption}
                saving={optionSaving}
              />
              <OptionManager
                title="Supervisor"
                description="Names available in the Supervisor dropdown."
                options={options.supervisors}
                draft={optionDrafts.supervisor}
                onDraftChange={value => setOptionDrafts(drafts => ({ ...drafts, supervisor: value }))}
                onAdd={event => addOption(event, 'supervisor')}
                onRename={renameOption}
                onToggle={toggleOption}
                saving={optionSaving}
              />
            </div>
          )}
        </div>
      )}
      
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
                  <div className="form-group"><label className="form-label">Branch</label>
                    <select className="form-control" value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
                      <option value="">Select...</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Assigned To</label>
                    <select className="form-control" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                      <option value="">Select...</option>
                      {selectableOptions(options.assigned_areas, form.assigned_to).map(option => <option key={option.id} value={option.option_name}>{option.option_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Supervisor</label>
                    <select className="form-control" value={form.supervisor} onChange={e => setForm(f => ({ ...f, supervisor: e.target.value }))}>
                      <option value="">Select...</option>
                      {selectableOptions(options.supervisors, form.supervisor).map(option => <option key={option.id} value={option.option_name}>{option.option_name}</option>)}
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
                        <th>Client Code</th>
                        <th>Client Name</th>
                        <th>Balance</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collectorLoans.map(l => (
                        <tr key={l.id}>
                          <td><span className="mono">{l.customer_code}</span></td>
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

      {/* Success Modal */}
      {successModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onMouseDown={e => e.target === e.currentTarget && setSuccessModal(null)}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '34px 32px 28px',
            maxWidth: '420px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
            animation: 'fadeInScale 0.2s ease-out'
          }}>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'rgba(16,185,129,0.12)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '30px',
              fontWeight: 800,
              margin: '0 auto 18px auto'
            }}>
              ✓
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              {successModal.title}
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, margin: '0 0 28px 0' }}>
              {successModal.message}
            </p>
            <button
              onClick={() => setSuccessModal(null)}
              className="btn btn-primary"
              style={{ minWidth: 120, justifyContent: 'center' }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onMouseDown={e => e.target === e.currentTarget && (confirmModal.onCancel ? confirmModal.onCancel() : setConfirmModal(null))}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '36px 32px 28px',
            maxWidth: '420px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
            animation: 'fadeInScale 0.2s ease-out'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: confirmModal.isAlert ? '#fef2f2' : '#eff6ff',
              color: confirmModal.isAlert ? '#ef4444' : '#3b82f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', margin: '0 auto 18px auto'
            }}>
              {confirmModal.isAlert ? '⚠' : '?'}
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              {confirmModal.isAlert ? 'Error' : 'Confirm Action'}
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, margin: '0 0 28px 0' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              {!confirmModal.isAlert && confirmModal.onCancel && (
                <button
                  onClick={confirmModal.onCancel}
                  style={{
                    padding: '10px 28px', borderRadius: '8px', border: '1px solid #e2e8f0',
                    background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '14px',
                    cursor: 'pointer', transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { e.target.style.background = '#f8fafc'; e.target.style.borderColor = '#cbd5e1' }}
                  onMouseLeave={e => { e.target.style.background = '#fff'; e.target.style.borderColor = '#e2e8f0' }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={confirmModal.onConfirm}
                style={{
                  padding: '10px 28px', borderRadius: '8px', border: 'none',
                  background: confirmModal.isAlert ? '#ef4444' : '#3b82f6',
                  color: '#fff', fontWeight: 600, fontSize: '14px',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: confirmModal.isAlert ? '0 2px 8px rgba(239,68,68,0.3)' : '0 2px 8px rgba(59,130,246,0.3)'
                }}
                onMouseEnter={e => { e.target.style.opacity = '0.9' }}
                onMouseLeave={e => { e.target.style.opacity = '1' }}
              >
                {confirmModal.isAlert ? 'OK' : 'Yes, Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
