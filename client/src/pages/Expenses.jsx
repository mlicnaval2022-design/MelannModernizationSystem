import { useEffect, useState } from 'react'
import API from '../services/api'
const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const CATS = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Transportation', 'Miscellaneous']

export default function Expenses() {
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ branch_id: '', expense_date: today(), amount: '', category: '', description: '', payee: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => { setLoading(true); API.get('/expenses').then(r => setRows(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load(); API.get('/branches').then(r => setBranches(r.data)) }, [])

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try { await API.post('/expenses', form); setModal(false); load() }
    catch (err) { setError(err.response?.data?.error || 'Error') }
    finally { setSaving(false) }
  }

  const handleVoid = async (id) => {
    if (!confirm('Void this expense?')) return
    await API.delete(`/expenses/${id}`); load()
  }

  return (
    <div>
      <div className="page-toolbar">
        <button id="btn-new-expense" className="btn btn-primary" onClick={() => { setForm({ branch_id: '', expense_date: today(), amount: '', category: '', description: '', payee: '' }); setError(''); setModal(true) }}>+ New Expense</button>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Payee</th><th>Branch</th><th>Amount</th><th>Actions</th></tr></thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={7}>⏳ Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">No expenses recorded</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.expense_date}</td>
                    <td><span className="badge badge-inactive">{r.category || '—'}</span></td>
                    <td>{r.description || '—'}</td>
                    <td>{r.payee || '—'}</td>
                    <td>{r.branch_name || '—'}</td>
                    <td className="text-right fw-bold text-warning">₱ {fmt(r.amount)}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleVoid(r.id)}>Void</button></td>
                  </tr>
                ))}
            </tbody>
            {rows.length > 0 && <tfoot><tr><td colSpan={5} className="fw-bold text-muted">TOTAL</td><td className="text-right fw-bold text-warning">₱ {fmt(rows.reduce((s, r) => s + r.amount, 0))}</td><td></td></tr></tfoot>}
          </table>
        </div>
      </div>
      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header"><span className="modal-title">📋 New Expense</span><button className="modal-close" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Branch</label>
                    <select className="form-control" value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}><option value="">Select...</option>{branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}</select>
                  </div>
                  <div className="form-group"><label className="form-label">Date *</label><input type="date" className="form-control" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Amount *</label><input type="number" className="form-control" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Category</label>
                    <select className="form-control" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}><option value="">Select...</option>{CATS.map(c => <option key={c}>{c}</option>)}</select>
                  </div>
                  <div className="form-group"><label className="form-label">Payee</label><input className="form-control" value={form.payee} onChange={e => setForm(f => ({ ...f, payee: e.target.value }))} /></div>
                  <div className="form-group span-full"><label className="form-label">Description</label><input className="form-control" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '💾 Save Expense'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
