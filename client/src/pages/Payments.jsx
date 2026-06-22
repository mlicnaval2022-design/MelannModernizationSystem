import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const EMPTY = { loan_id: '', or_number: '', date_paid: today(), amount_paid: '', collector_id: '', remarks: '' }

export default function Payments() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [loans, setLoans] = useState([])
  const [collectors, setCollectors] = useState([])
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(today())
  const [dateTo, setDateTo] = useState(today())
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [activeLoan, setActiveLoan] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  const load = () => { setLoading(true); API.get('/payments', { params: { search, date_from: dateFrom, date_to: dateTo } }).then(r => setRows(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [search, dateFrom, dateTo])
  useEffect(() => {
    API.get('/loans', { params: { status: 'active' } }).then(r => setLoans(r.data))
    API.get('/collectors').then(r => setCollectors(r.data))
  }, [])

  const handleLoanSelect = async (id) => {
    setForm(f => ({ ...f, loan_id: id }))
    if (id) { const r = await API.get(`/loans/${id}`); setActiveLoan(r.data) }
    else setActiveLoan(null)
  }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setWarning(''); setSaving(true)
    try {
      const r = await API.post('/payments', form)
      if (r.data.same_day_warning) setWarning('⚠️ There is already a payment for this loan today.')
      setModal(false); setForm(EMPTY); setActiveLoan(null); load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving payment') }
    finally { setSaving(false) }
  }

  const handleReverse = async (id) => {
    if (!confirm('Reverse this payment? This will restore the loan balance.')) return
    try { await API.post(`/reversals/payment/${id}`); load() }
    catch (err) { alert(err.response?.data?.error || 'Error reversing') }
  }

  return (
    <div>
      {warning && <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--accent-warning)' }}>{warning}</div>}
      <div className="page-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input id="payment-search" className="form-control" placeholder="Search name, OR#, loan#..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <input type="date" className="form-control" style={{ width: 140 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" className="form-control" style={{ width: 140 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <button id="btn-new-payment" className="btn btn-primary" onClick={() => { setForm(EMPTY); setActiveLoan(null); setError(''); setModal(true) }}>+ Encode Payment</button>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>OR Number</th><th>Customer</th><th>Loan #</th><th>Date</th><th>Amount</th><th>Balance After</th><th>Collector</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={8}>⏳ Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={8} className="empty-state">No payments found</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.or_number}</span></td>
                    <td className="fw-600">{r.customer_name}</td>
                    <td><span className="mono">{r.loan_code}</span></td>
                    <td>{r.date_paid}</td>
                    <td className="text-right text-success fw-bold">₱ {fmt(r.amount_paid)}</td>
                    <td className="text-right">₱ {fmt(r.balance_after)}</td>
                    <td>{r.collector_name || '—'}</td>
                    <td>
                      {hasRole('admin', 'manager') &&
                        <button className="btn btn-danger btn-sm" onClick={() => handleReverse(r.id)}>Reverse</button>
                      }
                    </td>
                  </tr>
                ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} className="fw-bold text-muted">TOTAL</td>
                  <td className="text-right fw-bold text-success">₱ {fmt(rows.reduce((s, r) => s + r.amount_paid, 0))}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">💳 Encode Payment</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group span-2">
                    <label className="form-label">Select Active Loan *</label>
                    <select className="form-control" value={form.loan_id} onChange={e => handleLoanSelect(e.target.value)} required>
                      <option value="">Search by customer or loan#...</option>
                      {loans.map(l => <option key={l.id} value={l.id}>{l.customer_name} — {l.loan_code} (Bal: ₱{fmt(l.balance)})</option>)}
                    </select>
                  </div>
                  {activeLoan && (
                    <div className="form-group span-2" style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>LOAN DETAILS</div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        <div><span className="text-muted" style={{ fontSize: 11 }}>Balance: </span><span className="fw-bold text-accent">₱ {fmt(activeLoan.balance)}</span></div>
                        <div><span className="text-muted" style={{ fontSize: 11 }}>Monthly: </span><span className="fw-bold">₱ {fmt(activeLoan.amortization)}</span></div>
                        <div><span className="text-muted" style={{ fontSize: 11 }}>Maturity: </span><span className="fw-bold">{activeLoan.date_maturity}</span></div>
                      </div>
                    </div>
                  )}
                  <div className="form-group"><label className="form-label">OR Number *</label><input className="form-control" value={form.or_number} onChange={e => setForm(f => ({ ...f, or_number: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Date Paid *</label><input type="date" className="form-control" value={form.date_paid} onChange={e => setForm(f => ({ ...f, date_paid: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Amount Paid *</label><input type="number" className="form-control" placeholder="0.00" value={form.amount_paid} onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Collector</label>
                    <select className="form-control" value={form.collector_id} onChange={e => setForm(f => ({ ...f, collector_id: e.target.value }))}>
                      <option value="">Default collector</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group span-full"><label className="form-label">Remarks</label><input className="form-control" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '💾 Save Payment'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
