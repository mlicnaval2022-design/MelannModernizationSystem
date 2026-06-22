import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })

export default function Loans() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active') // Default to active loans
  const [loading, setLoading] = useState(true)
  
  const [detailModal, setDetailModal] = useState(false)
  const [detailLoan, setDetailLoan] = useState(null)
  const [detailTab, setDetailTab] = useState('payments')

  // Release Modal State
  const [releaseModal, setReleaseModal] = useState(false)
  const [approvedLoans, setApprovedLoans] = useState([])
  const [releaseForm, setReleaseForm] = useState({ id: '', date_released: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => { setLoading(true); API.get('/loans', { params: { search, status } }).then(r => setRows(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [search, status])

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

  const handleReverse = async (id) => {
    if (!confirm('Reverse this loan and all its payments?')) return
    try { await API.post(`/reversals/loan/${id}`); load() }
    catch (err) { alert(err.response?.data?.error || 'Error reversing loan') }
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
        <select id="loan-status-filter" className="form-control" style={{ width: 150 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pastdue">Past Due</option>
          <option value="fullpaid">Full Paid</option>
          <option value="reversed">Reversed</option>
          <option value="approved">Approved (Not Released)</option>
        </select>
        <button id="btn-release-loan" className="btn btn-primary" onClick={openReleaseModal}>🚀 Release Approved Loan</button>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Loan #</th><th>Customer</th><th>Type</th><th>Principal</th><th>Balance</th><th>Released</th><th>Maturity</th><th>Collector</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={10}>⏳ Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={10} className="empty-state">No loans found</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.loan_code}</span></td>
                    <td className="fw-600">{r.customer_name}</td>
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
                        {hasRole('admin', 'manager') && r.status === 'active' &&
                          <button className="btn btn-danger btn-sm" onClick={() => handleReverse(r.id)}>Reverse</button>
                        }
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
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReleaseModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">🚀 Release Approved Loan</span>
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
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailModal(false)}>
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <span className="modal-title">📄 {detailLoan.loan_code} — {detailLoan.customer_name}</span>
              <button className="modal-close" onClick={() => setDetailModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Summary Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                {[['Customer', detailLoan.customer_name], ['Type', detailLoan.loan_type], ['Principal', '₱ ' + fmt(detailLoan.principal)], ['Balance', '₱ ' + fmt(detailLoan.balance)], ['Released', detailLoan.date_released], ['Maturity', detailLoan.date_maturity], ['Daily Amort.', '₱ ' + fmt(detailLoan.amortization)], ['Status', detailLoan.status]].map(([l, v]) => (
                  <div key={l} style={{ padding: '8px 10px', background: 'var(--bg-input)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l}</div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                {[['payments', '💳 Payments'], ['schedule', '📅 Amortization Schedule']].map(([t, l]) => (
                  <button key={t} className={`btn btn-sm ${detailTab === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDetailTab(t)}>{l}</button>
                ))}
              </div>

              {/* Payments Tab */}
              {detailTab === 'payments' && (
                <table className="data-table">
                  <thead><tr><th>OR#</th><th>Date</th><th>Amount</th><th>Balance Before</th><th>Balance After</th></tr></thead>
                  <tbody>
                    {(detailLoan.payments || []).length === 0
                      ? <tr><td colSpan={5} className="empty-state">No payments yet</td></tr>
                      : detailLoan.payments.map(p => (
                        <tr key={p.id}>
                          <td className="mono">{p.or_number}</td>
                          <td>{p.date_paid}</td>
                          <td className="text-right text-success fw-bold">₱ {fmt(p.amount_paid)}</td>
                          <td className="text-right">₱ {fmt(p.balance_before)}</td>
                          <td className="text-right">₱ {fmt(p.balance_after)}</td>
                        </tr>
                      ))}
                  </tbody>
                  {(detailLoan.payments || []).length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={2} className="fw-bold text-muted">TOTAL PAID</td>
                        <td className="text-right fw-bold text-success">₱ {fmt(detailLoan.payments.reduce((s, p) => s + p.amount_paid, 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Amortization Schedule Tab */}
              {detailTab === 'schedule' && (
                <table className="data-table">
                  <thead><tr><th>#</th><th>Due Date</th><th>Amount Due</th><th>Amount Paid</th><th>Date Paid</th><th>Status</th></tr></thead>
                  <tbody>
                    {(detailLoan.schedule || []).length === 0
                      ? <tr><td colSpan={6} className="empty-state">No schedule generated</td></tr>
                      : detailLoan.schedule.map(s => (
                        <tr key={s.id}>
                          <td className="text-center fw-bold">{s.period_number}</td>
                          <td>{s.due_date}</td>
                          <td className="text-right">₱ {fmt(s.amount_due)}</td>
                          <td className="text-right text-success">{s.amount_paid > 0 ? '₱ ' + fmt(s.amount_paid) : '—'}</td>
                          <td>{s.date_paid || '—'}</td>
                          <td><span className={`badge ${schColor(s.status)}`}>{s.status}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
