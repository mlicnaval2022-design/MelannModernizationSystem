import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import FullyPaid from './FullyPaid'
import ReloanModal from '../components/ReloanModal'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })

export default function Loans() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active') // Default to active loans
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterCollector, setFilterCollector] = useState('')
  const [filterType, setFilterType] = useState('')
  
  const [detailModal, setDetailModal] = useState(false)
  const [detailLoan, setDetailLoan] = useState(null)
  const [detailTab, setDetailTab] = useState('payments')

  // Release Modal State
  const [releaseModal, setReleaseModal] = useState(false)
  const [approvedLoans, setApprovedLoans] = useState([])
  const [releaseForm, setReleaseForm] = useState({ id: '', date_released: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [reloanCustomer, setReloanCustomer] = useState(null)
  const [loanActionType, setLoanActionType] = useState('')
  const [reloanModalOpen, setReloanModalOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)

  const triggerRecon = (r) => {
    setReloanCustomer({
      id: r.customer_id,
      customer_code: r.customer_code,
      client_name: r.customer_name,
      collector_name: r.collector_name
    });
    setLoanActionType('Recon');
    setReloanModalOpen(true);
  }

  const load = () => { 
    setLoading(true); 
    API.get('/loans', { params: { search, status } })
       .then(r => setRows(r.data))
       .finally(() => setLoading(false)) 
  }
  useEffect(() => { load() }, [search, status])

  const filteredRows = rows.filter(r => {
    if (filterCollector && (r.collector_name || 'Unassigned') !== filterCollector) return false;
    if (filterType && r.loan_type !== filterType) return false;
    return true;
  }).sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''));

  const uniqueCollectors = [...new Set(rows.map(r => r.collector_name || 'Unassigned'))].sort();
  const uniqueTypes = [...new Set(rows.map(r => r.loan_type))].sort();

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = API.defaults.baseURL.replace('/api', '');
    return `${baseUrl}${path}`;
  };

  const openReleaseModal = async () => {
    setError('')
    setReleaseForm({ id: '', date_released: new Date().toISOString().split('T')[0] })
    setReleaseModal(true)
    try {
      const res = await API.get('/loans', { params: { status: 'approved' } })
      setApprovedLoans(res.data)
    } catch (e) { console.error(e) }
  }

  const handleRelease = async (e) => {
    e.preventDefault()
    if (!releaseForm.id) return setError('Please select an approved application')
    setError('')
    setSaving(true)
    try {
      await API.post(`/loans/${releaseForm.id}/release`, { date_released: releaseForm.date_released })
      setReleaseModal(false)
      load()
    } catch (err) { setError(err.response?.data?.error || 'Error releasing loan') }
    finally { setSaving(false) }
  }

  const handleReverse = (id) => {
    setConfirmModal({
      message: 'Reverse this loan and all its payments?',
      subMessage: 'This action cannot be undone and will mark the loan and all associated payments as reversed.',
      onConfirm: async () => {
        setConfirmModal(null)
        try { 
          await API.post(`/reversals/loan/${id}`); 
          load();
        } catch (err) { 
          alert(err.response?.data?.error || 'Error reversing loan');
        }
      },
      onCancel: () => setConfirmModal(null)
    })
  }

  const handleApproveReloan = async (id) => {
    if (!confirm('Are you sure you want to approve this Reloan Application?')) return;
    try {
      await API.post(`/loans/${id}/approve-reloan`);
      alert('Reloan approved successfully!');
      load();
    } catch (err) { alert(err.response?.data?.error || 'Error approving reloan') }
  }

  const handleRejectReloan = async (id) => {
    const remarks = prompt('Please enter the reason for rejection:');
    if (!remarks) return;
    try {
      await API.post(`/loans/${id}/reject-reloan`, { remarks });
      alert('Reloan rejected successfully!');
      load();
    } catch (err) { alert(err.response?.data?.error || 'Error rejecting reloan') }
  }

  const viewDetail = (id) => {
    setDetailTab('payments')
    setDetailModal(true)
    API.get(`/loans/${id}`).then(r => setDetailLoan(r.data))
  }

  const schColor = (s) => ({ paid: 'badge-active', unpaid: 'badge-inactive', overdue: 'badge-pastdue' }[s] || 'badge-inactive')

  return (
    <div>
      <div className="page-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input id="loan-search" className="form-control" placeholder="Search name, code, loan#..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button id="btn-release-loan" className="btn btn-primary" onClick={openReleaseModal} style={{ marginRight: '8px' }}>🚀 NEW LOAN APPROVED</button>
        <button className="btn btn-dark" onClick={() => { setLoanActionType('Reloan'); setReloanCustomer(null); setReloanModalOpen(true); }}>+ Add Loan</button>
      </div>

      <div className="custom-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        {[
          { value: '', label: 'All Status' },
          { value: 'active', label: 'Active' },
          { value: 'pastdue', label: 'Past Due' },
          { value: 'fullpaid', label: 'Full Paid' },
          { value: 'reloan_pending', label: 'Pending Reloans' },
          { value: 'approved', label: 'Approved (Not Released)' },
          { value: 'reversed', label: 'Reversed' }
        ].map(tab => (
          <div 
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            style={{ 
              padding: '6px 14px', 
              cursor: 'pointer', 
              fontWeight: '600', 
              fontSize: '13px',
              borderRadius: '20px',
              background: status === tab.value ? '#3b82f6' : '#f1f5f9',
              color: status === tab.value ? 'white' : '#475569',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            }}>
            {tab.label}
          </div>
        ))}
      </div>

      {status === 'fullpaid' ? (
        <FullyPaid search={search} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b' }}>Filters:</span>
            <select className="form-control" style={{ width: '200px', padding: '6px 12px' }} value={filterCollector} onChange={e => setFilterCollector(e.target.value)}>
              <option value="">All Collectors</option>
              {uniqueCollectors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="form-control" style={{ width: '200px', padding: '6px 12px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All Loan Types</option>
              {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {(filterCollector || filterType) && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setFilterCollector(''); setFilterType(''); }}>Clear</button>
            )}
          </div>

          <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr><th>Loan #</th><th>Customer</th><th>Type</th><th>Principal</th><th>Balance</th><th>Released</th><th>Maturity</th><th>Collector</th><th>Status</th><th>Actions</th></tr>
              </thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={10}>⏳ Loading...</td></tr>
                : filteredRows.length === 0 ? <tr><td colSpan={10} className="empty-state">No loans found</td></tr>
                : filteredRows.map(r => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.loan_code}</span></td>
                    <td>
                      <div className="fw-600">{r.customer_name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>{r.customer_code}</div>
                    </td>
                    <td><span className="tag">{r.loan_type}</span></td>
                    <td className="text-right">₱ {fmt(r.principal)}</td>
                    <td className="text-right fw-bold">
                      {r.status === 'fullpaid' ? <span className="text-success">PAID</span> : <span>₱ {fmt(r.balance)}</span>}
                    </td>
                    <td>{r.date_released}</td>
                    <td>{r.date_maturity}</td>
                    <td>{r.collector_name || '—'}</td>
                    <td>
                      {r.status === 'approved' ? <span className="badge badge-warning">Approved (Not Released)</span> :
                       <span className={`badge badge-${r.status}`}>{r.status}</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => viewDetail(r.id)}>View</button>
                        {hasRole('admin', 'manager') && r.status === 'active' && (
                          <>
                            <button className="btn btn-sm" style={{ background: '#0369a1', color: '#fff', border: 'none' }} onClick={() => triggerRecon(r)}>Recon</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleReverse(r.id)}>Reverse</button>
                          </>
                        )}
                        {hasRole('admin', 'manager') && r.status === 'reloan_pending' && (
                          <>
                            <button className="btn btn-success btn-sm" onClick={() => handleApproveReloan(r.id)}>Approve</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleRejectReloan(r.id)}>Reject</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== Release Loan Modal ===================== */}
      {releaseModal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setReleaseModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">🚀 NEW LOAN APPROVED</span>
              <button className="modal-close" onClick={() => setReleaseModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              
              <form onSubmit={handleRelease}>
                <div className="form-group mb-3">
                  <label className="form-label">Select Approved Application *</label>
                  <select className="form-control" value={releaseForm.id} onChange={e => setReleaseForm(f => ({ ...f, id: e.target.value }))} required>
                    <option value="">Select...</option>
                    {approvedLoans.map(c => (
                      <option key={c.id} value={c.id}>{c.loan_code} — {c.customer_name} (₱ {fmt(c.principal)})</option>
                    ))}
                  </select>
                  {approvedLoans.length === 0 && <small className="text-danger mt-1 d-block">No approved applications pending release.</small>}
                </div>
                
                <div className="form-group mb-3">
                  <label className="form-label">Official Release Date *</label>
                  <input type="date" className="form-control" value={releaseForm.date_released} onChange={e => setReleaseForm(f => ({ ...f, date_released: e.target.value }))} required />
                  <small className="text-muted mt-1 d-block">The 45-day maturity schedule will be generated starting from this date.</small>
                </div>

                <div className="form-actions mt-4">
                  <button type="button" className="btn btn-secondary" onClick={() => setReleaseModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving || approvedLoans.length === 0}>{saving ? 'Releasing...' : '🚀 Release & Generate Schedule'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ===================== Loan Detail Modal ===================== */}
      {detailModal && detailLoan && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.4)', padding: 20 }} onMouseDown={e => e.target === e.currentTarget && setDetailModal(false)}>
          <div className="modal" style={{ maxWidth: 950, borderRadius: 16, padding: '30px', background: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  📄
                </div>
                <h2 style={{ margin: 0, fontSize: 22, color: '#0f172a', fontWeight: 700 }}>
                  {detailLoan.loan_code} — {detailLoan.customer_name}
                </h2>
              </div>
              <button onClick={() => setDetailModal(false)} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                ✕
              </button>
            </div>

            {/* Grid Details */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 25px', marginBottom: 25 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px 20px', borderBottom: '1px solid #f1f5f9', paddingBottom: 20, marginBottom: 20 }}>
                {/* Customer */}
                <div style={{ display: 'flex', gap: 15 }}>
                  {detailLoan.photo_client || detailLoan.photo_id_front ? (
                    <img src={getImageUrl(detailLoan.photo_client || detailLoan.photo_id_front)} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'contain', background: '#f8fafc', border: '1px solid #e2e8f0', flexShrink: 0 }} alt="Avatar" />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👤</div>
                  )}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>CUSTOMER</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginTop: 4, lineHeight: 1.2 }}>{detailLoan.customer_name}</div>
                  </div>
                </div>
                {/* Type */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✔️</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>TYPE</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>{detailLoan.loan_type}</div>
                  </div>
                </div>
                {/* Principal */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f3e8ff', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👝</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>PRINCIPAL</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>₱ {fmt(detailLoan.principal)}</div>
                  </div>
                </div>
                {/* Balance */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👝</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>BALANCE</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>₱ {fmt(detailLoan.balance)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px 20px' }}>
                {/* Released */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📅</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>RELEASED</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>{detailLoan.date_released}</div>
                  </div>
                </div>
                {/* Maturity */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f3e8ff', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📅</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>MATURITY</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>{detailLoan.date_maturity}</div>
                  </div>
                </div>
                {/* Daily Amort */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🪙</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>DAILY AMORT.</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>₱ {fmt(detailLoan.amortization)}</div>
                  </div>
                </div>
                {/* Status */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✔️</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>STATUS</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ display: 'inline-block', padding: '4px 10px', background: '#dcfce7', color: '#16a34a', borderRadius: 4, fontSize: 12, fontWeight: 800 }}>
                        {detailLoan.status.charAt(0).toUpperCase() + detailLoan.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setDetailTab('payments')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 8, border: detailTab === 'payments' ? 'none' : '1px solid #e2e8f0', background: detailTab === 'payments' ? '#0f172a' : '#fff', color: detailTab === 'payments' ? '#fff' : '#3b82f6', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                <span style={{ fontSize: 16 }}>💳</span> Payments
              </button>
              <button onClick={() => setDetailTab('schedule')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 8, border: detailTab === 'schedule' ? 'none' : '1px solid #e2e8f0', background: detailTab === 'schedule' ? '#0f172a' : '#fff', color: detailTab === 'schedule' ? '#fff' : '#3b82f6', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                <span style={{ fontSize: 16 }}>📅</span> Amortization Schedule
              </button>
            </div>

            {/* Tables Container */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              {/* Payments Tab */}
              {detailTab === 'payments' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>PAYMENT CODE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>DATE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>AMOUNT</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>RUNNING BALANCE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailLoan.payments || []).length === 0
                      ? <tr><td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No payments yet</td></tr>
                      : detailLoan.payments.map(p => (
                        <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 20px', color: '#3b82f6', fontWeight: 700, fontFamily: 'monospace' }}>{p.or_number || p.payment_code || '---'}</td>
                          <td style={{ padding: '16px 20px', color: '#334155' }}>{p.date_paid}</td>
                          <td style={{ padding: '16px 20px', color: '#0f172a', fontWeight: 800 }}>₱ {fmt(p.amount_paid)}</td>
                          <td style={{ padding: '16px 20px', color: '#475569' }}>₱ {fmt(p.balance_after)}</td>
                          <td style={{ padding: '16px 20px' }}>
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: 12, 
                              fontSize: 12, 
                              fontWeight: 700, 
                              background: p.status === 'active' ? '#dcfce7' : '#fee2e2', 
                              color: p.status === 'active' ? '#16a34a' : '#ef4444' 
                            }}>
                              {p.status === 'active' ? 'Good' : 'Reversed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {(detailLoan.payments || []).length > 0 && (
                    <tfoot style={{ background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                      <tr>
                        <td colSpan={2} style={{ padding: '20px', color: '#1d4ed8', fontSize: 14, fontWeight: 800, textAlign: 'right' }}>TOTAL PAID</td>
                        <td style={{ padding: '20px', color: '#1d4ed8', fontSize: 15, fontWeight: 800 }}>₱ {fmt(detailLoan.payments.filter(p => p.status === 'active').reduce((s, p) => s + p.amount_paid, 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Amortization Schedule Tab */}
              {detailTab === 'schedule' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800, textAlign: 'center' }}>#</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>DUE DATE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800, textAlign: 'right' }}>AMOUNT DUE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800, textAlign: 'right' }}>AMOUNT PAID</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>DATE PAID</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailLoan.schedule || []).length === 0
                      ? <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No schedule generated</td></tr>
                      : detailLoan.schedule.map(s => (
                        <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 800, color: '#64748b' }}>{s.period_number}</td>
                          <td style={{ padding: '16px 20px', color: '#334155' }}>{s.due_date}</td>
                          <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>₱ {fmt(s.amount_due)}</td>
                          <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{s.amount_paid > 0 ? '₱ ' + fmt(s.amount_paid) : '—'}</td>
                          <td style={{ padding: '16px 20px', color: '#475569' }}>{s.date_paid || '—'}</td>
                          <td style={{ padding: '16px 20px' }}><span className={`badge ${schColor(s.status)}`}>{s.status}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      </>
    )}
      {/* ===================== Reloan / Recon Modal ===================== */}
      <ReloanModal
        isOpen={reloanModalOpen}
        onClose={() => setReloanModalOpen(false)}
        customerId={reloanCustomer?.id}
        customer={reloanCustomer}
        loanType={loanActionType}
        onReloanSubmitted={() => {
          setReloanModalOpen(false);
          load();
        }}
      />
      {/* Custom Confirm Modal */}
      {confirmModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onMouseDown={e => e.target === e.currentTarget && confirmModal.onCancel && confirmModal.onCancel()}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '36px 32px 28px',
            maxWidth: '460px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
            animation: 'paymentConfirmIn 0.2s ease-out'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#fffbeb',
              color: '#f59e0b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', margin: '0 auto 18px auto',
              border: '2px solid #fde68a'
            }}>
              ⚠
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              Confirm Reversal
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, margin: '0 0 6px 0' }}>
              {confirmModal.message}
            </p>
            {confirmModal.subMessage && (
              <p style={{ color: '#475569', fontSize: '14px', fontWeight: 600, margin: '0 0 28px 0' }}>
                {confirmModal.subMessage}
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
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
              <button
                onClick={confirmModal.onConfirm}
                style={{
                  padding: '10px 28px', borderRadius: '8px', border: 'none',
                  background: '#f59e0b',
                  color: '#fff', fontWeight: 600, fontSize: '14px',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: '0 2px 8px rgba(245,158,11,0.3)'
                }}
                onMouseEnter={e => { e.target.style.background = '#d97706' }}
                onMouseLeave={e => { e.target.style.background = '#f59e0b' }}
              >
                Confirm Reverse
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
