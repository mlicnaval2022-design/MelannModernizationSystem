import { useState } from 'react'
import API from '../services/api'
const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

const REPORT_TYPES = [
  { key: 'daily-collection', label: '📅 Daily Collection', desc: 'All collections in a date range' },
  { key: 'monthly-releases', label: '🚀 Monthly Releases', desc: 'Loans released in a month' },
  { key: 'past-due', label: '⚠️ Past Due Report', desc: 'All overdue loans' },
  { key: 'payments-encoded', label: '💳 Payments Encoded', desc: 'Payments encoded by date range' },
  { key: 'payments-reversed', label: '↩️ Payments Reversed', desc: 'Reversed payments by date range' },
  { key: 'maturity-check', label: '📆 Maturity Checker', desc: 'Loans maturing soon' },
  { key: 'full-paid', label: '✅ Full Paid Loans', desc: 'Fully paid loan accounts' },
  { key: 'loan-type', label: '📊 Loan Type Summary', desc: 'Summary by loan type and status' },
  { key: 'collection-sheet', label: '📋 Collection Sheet', desc: 'Per-collector active loan list' },
]

export default function Reports() {
  const [active, setActive] = useState('daily-collection')
  const [params, setParams] = useState({ date_from: yesterday(), date_to: yesterday(), year: new Date().getFullYear(), month: new Date().getMonth() + 1, days_ahead: 30, collector_id: '' })
  const [collectors, setCollectors] = useState([])
  const [collectorsLoaded, setCollectorsLoaded] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadCollectors = () => {
    if (!collectorsLoaded) {
      API.get('/collectors').then(r => { setCollectors(r.data); setCollectorsLoaded(true) })
    }
  }

  const handleSelect = (key) => {
    setActive(key); setData(null)
    if (key === 'collection-sheet') loadCollectors()
  }

  const run = async () => {
    setLoading(true); setData(null)
    try {
      const r = await API.get(`/reports/${active}`, { params })
      setData(r.data)
    } finally { setLoading(false) }
  }

  const renderParams = () => {
    if (['daily-collection', 'payments-encoded', 'payments-reversed', 'full-paid'].includes(active)) return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group"><label className="form-label">Date From</label><input type="date" className="form-control" value={params.date_from} onChange={e => setParams(p => ({ ...p, date_from: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Date To</label><input type="date" className="form-control" value={params.date_to} onChange={e => setParams(p => ({ ...p, date_to: e.target.value }))} /></div>
      </div>
    )
    if (active === 'monthly-releases') return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div className="form-group"><label className="form-label">Year</label><input type="number" className="form-control" style={{ width: 100 }} value={params.year} onChange={e => setParams(p => ({ ...p, year: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Month</label>
          <select className="form-control" value={params.month} onChange={e => setParams(p => ({ ...p, month: e.target.value }))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>)}
          </select>
        </div>
      </div>
    )
    if (active === 'maturity-check') return (
      <div className="form-group"><label className="form-label">Days Ahead</label><input type="number" className="form-control" style={{ width: 120 }} value={params.days_ahead} onChange={e => setParams(p => ({ ...p, days_ahead: e.target.value }))} /></div>
    )
    if (active === 'collection-sheet') return (
      <div className="form-group"><label className="form-label">Collector *</label>
        <select className="form-control" value={params.collector_id} onChange={e => setParams(p => ({ ...p, collector_id: e.target.value }))} style={{ minWidth: 220 }}>
          <option value="">Select collector...</option>
          {collectors.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
        </select>
      </div>
    )
    return null
  }

  const renderResult = () => {
    if (loading) return <div className="empty-state"><p>⏳ Generating report...</p></div>
    if (!data) return <div className="empty-state"><div className="empty-icon">📊</div><p>Set your parameters and click Run Report</p></div>

    if (active === 'daily-collection') {
      const { payments = [], total } = data
      
      const collectorTotals = payments.reduce((acc, p) => {
        const name = p.collector_name || 'Unassigned';
        if (!acc[name]) acc[name] = 0;
        acc[name] += p.amount_paid;
        return acc;
      }, {});
      const chartData = Object.entries(collectorTotals).map(([name, amount]) => ({ name, amount }));

      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ marginBottom: 12 }} className="fw-bold text-success">Total Collections: ₱ {fmt(total)}</div>
            <table className="data-table">
              <thead><tr><th>OR#</th><th>Customer</th><th>Loan#</th><th>Date</th><th>Collector</th><th>Amount</th><th>Bal. After</th></tr></thead>
              <tbody>{payments.length === 0 ? <tr><td colSpan={7} className="empty-state">No records</td></tr> : payments.map(p => <tr key={p.id}><td className="mono">{p.or_number}</td><td>{p.customer_name}</td><td className="mono">{p.loan_code}</td><td>{p.date_paid}</td><td>{p.collector_name || '—'}</td><td className="text-right text-success fw-bold">₱ {fmt(p.amount_paid)}</td><td className="text-right">₱ {fmt(p.balance_after)}</td></tr>)}</tbody>
            </table>
          </div>
          <div>
            <div style={{ marginBottom: 12 }} className="fw-bold">Collection per Collector</div>
            <div style={{ height: 400, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              {chartData.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chartData.map(item => {
                    const max = Math.max(...chartData.map(c => c.amount), 1)
                    const width = Math.max((item.amount / max) * 100, 3)
                    return (
                      <div key={item.name}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 4 }}>
                          <span style={{ fontWeight: 700 }}>{item.name}</span>
                          <span className="text-success fw-bold">PHP {fmt(item.amount)}</span>
                        </div>
                        <div style={{ height: 18, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${width}%`, height: '100%', background: '#3b82f6' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="empty-state">No data for chart</div>
              )}
            </div>
          </div>
        </div>
      )
    }
    if (active === 'monthly-releases') {
      const { loans = [], total_principal } = data
      return <><div style={{ marginBottom: 12 }} className="fw-bold text-accent">Total Released: ₱ {fmt(total_principal)}</div>
        <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th>Type</th><th>Principal</th><th>Net Proceeds</th><th>Collector</th><th>Released</th></tr></thead>
        <tbody>{loans.length === 0 ? <tr><td colSpan={7} className="empty-state">No loans this period</td></tr> : loans.map(l => <tr key={l.id}><td className="mono">{l.loan_code}</td><td className="fw-600">{l.customer_name}</td><td><span className="tag">{l.loan_type}</span></td><td className="text-right">₱ {fmt(l.principal)}</td><td className="text-right">₱ {fmt(l.net_proceeds)}</td><td>{l.collector_name || '—'}</td><td>{l.date_released}</td></tr>)}</tbody></table></>
    }
    if (active === 'past-due') {
      const { loans = [], total_balance } = data
      return <><div style={{ marginBottom: 12 }} className="fw-bold text-danger">Total Past Due Balance: ₱ {fmt(total_balance)}</div>
        <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th>Contact</th><th>Collector</th><th>Maturity</th><th>Days Overdue</th><th>Balance</th></tr></thead>
        <tbody>{loans.length === 0 ? <tr><td colSpan={7} className="empty-state">No past due accounts</td></tr> : loans.map(l => <tr key={l.id}><td className="mono">{l.loan_code}</td><td className="fw-600">{l.customer_name}</td><td>{l.contact || '—'}</td><td>{l.collector_name || '—'}</td><td>{l.date_maturity}</td><td className="text-danger fw-bold">{l.days_overdue} days</td><td className="text-right fw-bold text-danger">₱ {fmt(l.balance)}</td></tr>)}</tbody></table></>
    }
    if (['payments-encoded', 'payments-reversed'].includes(active)) {
      const records = data.data || []
      return <><div style={{ marginBottom: 12 }} className="fw-bold">{records.length} records {data.total != null ? `— Total: ₱ ${fmt(data.total)}` : ''}</div>
        <table className="data-table"><thead><tr><th>OR#</th><th>Customer</th><th>Loan#</th><th>Date</th><th>Amount</th><th>By</th></tr></thead>
        <tbody>{records.length === 0 ? <tr><td colSpan={6} className="empty-state">No records</td></tr> : records.map(p => <tr key={p.id}><td className="mono">{p.or_number}</td><td>{p.customer_name}</td><td className="mono">{p.loan_code}</td><td>{p.date_paid}</td><td className="text-right">₱ {fmt(p.amount_paid)}</td><td>{p.encoded_by_name || p.reversed_by_name || '—'}</td></tr>)}</tbody></table></>
    }
    if (active === 'maturity-check') {
      const { loans = [] } = data
      return <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th>Contact</th><th>Balance</th><th>Maturity</th><th>Days Left</th><th>Collector</th></tr></thead>
        <tbody>{loans.length === 0 ? <tr><td colSpan={7} className="empty-state">No loans maturing soon</td></tr> : loans.map(l => <tr key={l.id}><td className="mono">{l.loan_code}</td><td className="fw-600">{l.customer_name}</td><td>{l.contact || '—'}</td><td className="text-right">₱ {fmt(l.balance)}</td><td>{l.date_maturity}</td><td className={`fw-bold ${l.days_to_maturity <= 7 ? 'text-danger' : 'text-warning'}`}>{l.days_to_maturity} days</td><td>{l.collector_name || '—'}</td></tr>)}</tbody></table>
    }
    if (active === 'full-paid') {
      const loans = data || []
      return <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th>Principal</th><th>Total Paid</th><th>Collector</th><th>Released</th></tr></thead>
        <tbody>{loans.length === 0 ? <tr><td colSpan={6} className="empty-state">No full paid loans</td></tr> : loans.map(l => <tr key={l.id}><td className="mono">{l.loan_code}</td><td className="fw-600">{l.customer_name}</td><td className="text-right">₱ {fmt(l.principal)}</td><td className="text-right text-success">₱ {fmt(l.total_paid)}</td><td>{l.collector_name || '—'}</td><td>{l.date_released}</td></tr>)}</tbody></table>
    }
    if (active === 'loan-type') {
      const rows = data || []
      return <table className="data-table"><thead><tr><th>Type</th><th>Status</th><th>Count</th><th>Total Principal</th><th>Total Balance</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td><span className="tag">{r.loan_type}</span></td><td><span className={`badge badge-${r.status}`}>{r.status}</span></td><td className="fw-bold">{r.count}</td><td className="text-right">₱ {fmt(r.total_principal)}</td><td className="text-right">₱ {fmt(r.total_balance)}</td></tr>)}</tbody></table>
    }
    if (active === 'collection-sheet') {
      const { loans = [] } = data
      const collName = collectors.find(c => c.id == params.collector_id)
      return <>
        {collName && <div style={{ marginBottom: 12 }} className="fw-bold">Collector: {collName.first_name} {collName.last_name} — {loans.length} active loan(s)</div>}
        <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th>Address</th><th>Principal</th><th>Balance</th><th>Amort.</th><th>Maturity</th><th>Status</th></tr></thead>
        <tbody>{loans.length === 0 ? <tr><td colSpan={8} className="empty-state">No active loans for this collector</td></tr>
          : loans.map(l => <tr key={l.id}>
            <td className="mono">{l.loan_code}</td>
            <td className="fw-600">{l.customer_name}</td>
            <td style={{ fontSize: 11 }}>{l.address || '—'}</td>
            <td className="text-right">₱ {fmt(l.principal)}</td>
            <td className="text-right fw-bold">₱ {fmt(l.balance)}</td>
            <td className="text-right">₱ {fmt(l.amortization)}</td>
            <td>{l.date_maturity}</td>
            <td><span className={`badge badge-${l.status}`}>{l.status}</span></td>
          </tr>)}
        </tbody></table>
      </>
    }
    return <pre style={{ fontSize: 12, color: 'var(--text-muted)' }}>{JSON.stringify(data, null, 2)}</pre>
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
        <div className="card" style={{ padding: '12px 8px', height: 'fit-content' }}>
          <div className="nav-section-label">Report Types</div>
          {REPORT_TYPES.map(r => (
            <div key={r.key} className={`report-nav-item${active === r.key ? ' active' : ''}`} onClick={() => handleSelect(r.key)}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                <div className="report-desc" style={{ fontSize: 11, marginTop: 2 }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>{REPORT_TYPES.find(r => r.key === active)?.label}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {renderParams()}
              <button id="btn-run-report" className="btn btn-primary" onClick={run} disabled={loading}>{loading ? '⏳ Running...' : '▶ Run Report'}</button>
              {data && <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Print</button>}
            </div>
          </div>
          <div className="card">
            <div className="table-wrapper">{renderResult()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
