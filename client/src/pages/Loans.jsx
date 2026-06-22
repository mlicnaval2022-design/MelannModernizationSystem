import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const EMPTY = { customer_id: '', collector_id: '', branch_id: '', loan_type: 'regular', principal: '', interest_rate: '5', loan_period: '12', date_released: new Date().toISOString().split('T')[0], service_fee_pct: '2', insurance: '0', notarial_fee: '0', filing_fee: '0', or_number: '', remarks: '' }

export default function Loans() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [customers, setCustomers] = useState([])
  const [collectors, setCollectors] = useState([])
  const [branches, setBranches] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [detailLoan, setDetailLoan] = useState(null)
  const [detailTab, setDetailTab] = useState('payments')
  const [form, setForm] = useState(EMPTY)
  const [computed, setComputed] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => { setLoading(true); API.get('/loans', { params: { search, status } }).then(r => setRows(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [search, status])
  useEffect(() => {
    API.get('/customers', { params: { status: 'active' } }).then(r => setCustomers(r.data))
    API.get('/collectors').then(r => setCollectors(r.data))
    API.get('/branches').then(r => setBranches(r.data))
  }, [])

  const handleCompute = () => {
    const p = parseFloat(form.principal) || 0
    const r = parseFloat(form.interest_rate) || 0
    const n = parseInt(form.loan_period) || 1
    const sf = parseFloat(form.service_fee_pct) || 0
    const ins = parseFloat(form.insurance) || 0
    const not = parseFloat(form.notarial_fee) || 0
    const fil = parseFloat(form.filing_fee) || 0
    const interest = p * (r / 100) * n
    const total = p + interest
    const amort = total / n
    const serviceFee = p * (sf / 100)
    const deductions = serviceFee + ins + not + fil
    const net = p - deductions
    const matDate = new Date(form.date_released)
    matDate.setMonth(matDate.getMonth() + n)
    setComputed({ interest, total, amort, serviceFee, deductions, net, matDate: matDate.toISOString().split('T')[0] })
  }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      await API.post('/loans', form)
      setModal(false); setForm(EMPTY); setComputed(null); load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving loan') }
    finally { setSaving(false) }
  }

  const handleReverse = async (id) => {
    if (!confirm('Reverse this loan and all its payments?')) return
    try { await API.post(`/reversals/loan/${id}`); load() }
    catch (err) { alert(err.response?.data?.error || 'Error reversing loan') }
  }

  const viewDetail = (id) => {
    setDetailTab('payments')
    API.get(`/loans/${id}`).then(r => setDetailLoan(r.data))
  }

  // Schedule status color
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
        </select>
        <button id="btn-new-loan" className="btn btn-primary" onClick={() => { setForm(EMPTY); setComputed(null); setError(''); setModal(true) }}>+ New Loan</button>
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
                    <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
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

      {/* ===================== New Loan Modal ===================== */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <span className="modal-title">💰 New Loan Application</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group span-2">
                    <label className="form-label">Customer *</label>
                    <select className="form-control" value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} required>
                      <option value="">Select Customer...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.customer_code})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Loan Type</label>
                    <select className="form-control" value={form.loan_type} onChange={e => setForm(f => ({ ...f, loan_type: e.target.value }))}>
                      <option value="regular">Regular</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Collector</label>
                    <select className="form-control" value={form.collector_id} onChange={e => setForm(f => ({ ...f, collector_id: e.target.value }))}>
                      <option value="">Select...</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Principal Amount *</label>
                    <input type="number" className="form-control" placeholder="0.00" value={form.principal} onChange={e => setForm(f => ({ ...f, principal: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Interest Rate (%)</label>
                    <input type="number" className="form-control" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Loan Period (months)</label>
                    <input type="number" className="form-control" value={form.loan_period} onChange={e => setForm(f => ({ ...f, loan_period: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date Released *</label>
                    <input type="date" className="form-control" value={form.date_released} onChange={e => setForm(f => ({ ...f, date_released: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Service Fee (%)</label>
                    <input type="number" className="form-control" value={form.service_fee_pct} onChange={e => setForm(f => ({ ...f, service_fee_pct: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Insurance</label>
                    <input type="number" className="form-control" value={form.insurance} onChange={e => setForm(f => ({ ...f, insurance: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notarial Fee</label>
                    <input type="number" className="form-control" value={form.notarial_fee} onChange={e => setForm(f => ({ ...f, notarial_fee: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Filing Fee</label>
                    <input type="number" className="form-control" value={form.filing_fee} onChange={e => setForm(f => ({ ...f, filing_fee: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">OR Number</label>
                    <input className="form-control" value={form.or_number} onChange={e => setForm(f => ({ ...f, or_number: e.target.value }))} />
                  </div>
                  <div className="form-group span-full">
                    <label className="form-label">Remarks</label>
                    <input className="form-control" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
                  </div>
                </div>

                <button type="button" className="btn btn-secondary" style={{ marginTop: 12 }} onClick={handleCompute}>🧮 Compute Amortization</button>

                {computed && (
                  <div className="card" style={{ marginTop: 14, background: 'rgba(59,110,246,0.05)' }}>
                    <div className="card-title" style={{ marginBottom: 10 }}>📊 Loan Computation</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {[['Interest Amount', '₱ ' + fmt(computed.interest)], ['Total Amortization', '₱ ' + fmt(computed.total)], ['Monthly Payment', '₱ ' + fmt(computed.amort)], ['Service Fee', '₱ ' + fmt(computed.serviceFee)], ['Total Deductions', '₱ ' + fmt(computed.deductions)], ['Net Proceeds', '₱ ' + fmt(computed.net)], ['Maturity Date', computed.matDate]].map(([l, v]) => (
                        <div key={l} style={{ padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 6 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{l}</div>
                          <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '💾 Save Loan'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ===================== Loan Detail Modal ===================== */}
      {detailLoan && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailLoan(null)}>
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <span className="modal-title">📄 {detailLoan.loan_code} — {detailLoan.customer_name}</span>
              <button className="modal-close" onClick={() => setDetailLoan(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Summary Info */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                {[['Customer', detailLoan.customer_name], ['Type', detailLoan.loan_type], ['Principal', '₱ ' + fmt(detailLoan.principal)], ['Balance', '₱ ' + fmt(detailLoan.balance)], ['Released', detailLoan.date_released], ['Maturity', detailLoan.date_maturity], ['Monthly Amort.', '₱ ' + fmt(detailLoan.amortization)], ['Status', detailLoan.status]].map(([l, v]) => (
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
