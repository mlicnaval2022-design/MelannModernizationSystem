import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]

export default function CashPosition() {
  const { hasRole } = useAuth()
  const [tab, setTab] = useState('hand')
  const [handRows, setHandRows] = useState([])
  const [bankRows, setBankRows] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [handForm, setHandForm] = useState({ branch_id: '', entry_date: today(), opening_balance: '', total_collections: '', total_releases: '', total_expenses: '' })
  const [bankForm, setBankForm] = useState({ branch_id: '', bank_name: '', account_number: '', entry_date: today(), amount: '', transaction_type: 'Deposit', reference_no: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      API.get('/cash/hand').then(r => setHandRows(r.data)),
      API.get('/cash/bank').then(r => setBankRows(r.data)),
      API.get('/branches').then(r => setBranches(r.data)),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleHandSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      await API.post('/cash/hand', handForm)
      setModal(false)
      setHandForm({ branch_id: '', entry_date: today(), opening_balance: '', total_collections: '', total_releases: '', total_expenses: '' })
      load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving') }
    finally { setSaving(false) }
  }

  const handleBankSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      await API.post('/cash/bank', bankForm)
      setModal(false)
      setBankForm({ branch_id: '', bank_name: '', account_number: '', entry_date: today(), amount: '', transaction_type: 'Deposit', reference_no: '' })
      load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving') }
    finally { setSaving(false) }
  }

  const totalHand = handRows.reduce((s, r) => s + (r.closing_balance || 0), 0)
  const totalBank = bankRows.reduce((s, r) => s + (r.amount || 0), 0)

  return (
    <div>
      {/* Summary Metrics */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: 460, marginBottom: 20 }}>
        <div className="metric-card teal">
          <div className="metric-label">🏧 Cash on Hand (Closing)</div>
          <div className="metric-value" style={{ fontSize: 18 }}>₱ {fmt(totalHand)}</div>
          <div className="metric-sub">{handRows.length} entries</div>
        </div>
        <div className="metric-card success">
          <div className="metric-label">🏦 Cash on Bank (Total)</div>
          <div className="metric-value" style={{ fontSize: 18 }}>₱ {fmt(totalBank)}</div>
          <div className="metric-sub">{bankRows.length} entries</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['hand', 'bank'].map(t => (
          <button
            key={t}
            className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)}
          >
            {t === 'hand' ? '🏧 Cash on Hand' : '🏦 Cash on Bank'}
          </button>
        ))}
        <button
          id="btn-new-cash"
          className="btn btn-primary"
          style={{ marginLeft: 'auto' }}
          onClick={() => { setError(''); setModal(true) }}
        >
          + New Entry
        </button>
      </div>

      {/* Tables */}
      {tab === 'hand' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Branch</th><th>Opening</th><th>Collections</th>
                  <th>Releases</th><th>Expenses</th><th>Closing Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr className="loading-row"><td colSpan={7}>⏳ Loading...</td></tr>
                  : handRows.length === 0 ? <tr><td colSpan={7} className="empty-state">No cash-on-hand entries yet</td></tr>
                  : handRows.map(r => (
                    <tr key={r.id}>
                      <td>{r.entry_date}</td>
                      <td>{r.branch_name || '—'}</td>
                      <td className="text-right">₱ {fmt(r.opening_balance)}</td>
                      <td className="text-right text-success">₱ {fmt(r.total_collections)}</td>
                      <td className="text-right text-danger">₱ {fmt(r.total_releases)}</td>
                      <td className="text-right text-warning">₱ {fmt(r.total_expenses)}</td>
                      <td className="text-right fw-bold text-accent">₱ {fmt(r.closing_balance)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'bank' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr><th>Date</th><th>Bank</th><th>Account #</th><th>Branch</th><th>Type</th><th>Reference</th><th>Amount</th></tr>
              </thead>
              <tbody>
                {loading ? <tr className="loading-row"><td colSpan={7}>⏳ Loading...</td></tr>
                  : bankRows.length === 0 ? <tr><td colSpan={7} className="empty-state">No bank entries yet</td></tr>
                  : bankRows.map(r => (
                    <tr key={r.id}>
                      <td>{r.entry_date}</td>
                      <td className="fw-600">{r.bank_name}</td>
                      <td className="mono">{r.account_number || '—'}</td>
                      <td>{r.branch_name || '—'}</td>
                      <td><span className={`badge badge-${r.transaction_type === 'Withdrawal' ? 'reversed' : 'active'}`}>{r.transaction_type}</span></td>
                      <td className="mono">{r.reference_no || '—'}</td>
                      <td className={`text-right fw-bold ${r.transaction_type === 'Withdrawal' ? 'text-danger' : 'text-success'}`}>
                        {r.transaction_type === 'Withdrawal' ? '−' : '+'} ₱ {fmt(r.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Entry Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{tab === 'hand' ? '🏧 New Cash on Hand Entry' : '🏦 New Bank Transaction'}</span>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

              {tab === 'hand' ? (
                <form onSubmit={handleHandSave}>
                  <div className="form-grid">
                    <div className="form-group"><label className="form-label">Branch</label>
                      <select className="form-control" value={handForm.branch_id} onChange={e => setHandForm(f => ({ ...f, branch_id: e.target.value }))}>
                        <option value="">Select...</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label className="form-label">Date *</label>
                      <input type="date" className="form-control" value={handForm.entry_date} onChange={e => setHandForm(f => ({ ...f, entry_date: e.target.value }))} required />
                    </div>
                    <div className="form-group"><label className="form-label">Opening Balance</label>
                      <input type="number" className="form-control" placeholder="0.00" value={handForm.opening_balance} onChange={e => setHandForm(f => ({ ...f, opening_balance: e.target.value }))} />
                    </div>
                    <div className="form-group"><label className="form-label">Total Collections</label>
                      <input type="number" className="form-control" placeholder="0.00" value={handForm.total_collections} onChange={e => setHandForm(f => ({ ...f, total_collections: e.target.value }))} />
                    </div>
                    <div className="form-group"><label className="form-label">Total Releases</label>
                      <input type="number" className="form-control" placeholder="0.00" value={handForm.total_releases} onChange={e => setHandForm(f => ({ ...f, total_releases: e.target.value }))} />
                    </div>
                    <div className="form-group"><label className="form-label">Total Expenses</label>
                      <input type="number" className="form-control" placeholder="0.00" value={handForm.total_expenses} onChange={e => setHandForm(f => ({ ...f, total_expenses: e.target.value }))} />
                    </div>
                    <div className="form-group span-2" style={{ background: 'rgba(59,110,246,0.07)', borderRadius: 6, padding: '10px 12px' }}>
                      <div className="form-label">Computed Closing Balance</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', marginTop: 4 }}>
                        ₱ {fmt((parseFloat(handForm.opening_balance) || 0) + (parseFloat(handForm.total_collections) || 0) - (parseFloat(handForm.total_releases) || 0) - (parseFloat(handForm.total_expenses) || 0))}
                      </div>
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '💾 Save Entry'}</button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleBankSave}>
                  <div className="form-grid">
                    <div className="form-group"><label className="form-label">Bank Name *</label>
                      <input className="form-control" value={bankForm.bank_name} onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))} required />
                    </div>
                    <div className="form-group"><label className="form-label">Account Number</label>
                      <input className="form-control" value={bankForm.account_number} onChange={e => setBankForm(f => ({ ...f, account_number: e.target.value }))} />
                    </div>
                    <div className="form-group"><label className="form-label">Branch</label>
                      <select className="form-control" value={bankForm.branch_id} onChange={e => setBankForm(f => ({ ...f, branch_id: e.target.value }))}>
                        <option value="">Select...</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label className="form-label">Date *</label>
                      <input type="date" className="form-control" value={bankForm.entry_date} onChange={e => setBankForm(f => ({ ...f, entry_date: e.target.value }))} required />
                    </div>
                    <div className="form-group"><label className="form-label">Transaction Type</label>
                      <select className="form-control" value={bankForm.transaction_type} onChange={e => setBankForm(f => ({ ...f, transaction_type: e.target.value }))}>
                        <option>Deposit</option><option>Withdrawal</option><option>Transfer</option>
                      </select>
                    </div>
                    <div className="form-group"><label className="form-label">Amount *</label>
                      <input type="number" className="form-control" placeholder="0.00" value={bankForm.amount} onChange={e => setBankForm(f => ({ ...f, amount: e.target.value }))} required />
                    </div>
                    <div className="form-group span-full"><label className="form-label">Reference No.</label>
                      <input className="form-control" value={bankForm.reference_no} onChange={e => setBankForm(f => ({ ...f, reference_no: e.target.value }))} />
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '💾 Save Transaction'}</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
