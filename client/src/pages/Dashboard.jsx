import { useEffect, useState } from 'react'
import API from '../services/api'

function fmt(n) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 }) }

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    API.get('/reports/dashboard').then(r => { setData(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty-state"><p>⏳ Loading dashboard...</p></div>
  if (!data) return <div className="empty-state"><p>Could not load dashboard.</p></div>

  const metrics = [
    { label: 'Active Customers', value: data.total_customers, icon: '👥', type: '' },
    { label: 'Active Loans', value: data.total_active_loans, icon: '💰', type: '' },
    { label: 'Past Due Loans', value: data.total_pastdue, icon: '⚠️', type: 'danger' },
    { label: 'Full Paid Loans', value: data.total_fullpaid, icon: '✅', type: 'success' },
    { label: "Today's Collections", value: '₱ ' + fmt(data.collections_today), icon: '💳', type: 'teal', big: true },
    { label: "Today's Releases", value: '₱ ' + fmt(data.releases_today), icon: '🚀', type: '', big: true },
    { label: 'Loans Released Today', value: data.loans_released_today, icon: '📋', type: '' },
    { label: 'Total Portfolio', value: '₱ ' + fmt(data.total_portfolio), icon: '🏦', type: 'warning', big: true },
  ]

  return (
    <div>
      <div className="metrics-grid">
        {metrics.map(m => (
          <div key={m.label} className={`metric-card ${m.type}`}>
            <div className="metric-label">{m.icon} {m.label}</div>
            <div className="metric-value" style={m.big ? { fontSize: '18px' } : {}}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">📌 Quick Summary</div>
              <div className="card-subtitle">Loan portfolio overview</div>
            </div>
          </div>
          <table className="data-table">
            <tbody>
              <tr><td className="text-muted">Total Active Loans</td><td className="text-right fw-bold">{data.total_active_loans}</td></tr>
              <tr><td className="text-muted">Past Due Count</td><td className="text-right text-danger fw-bold">{data.total_pastdue}</td></tr>
              <tr><td className="text-muted">Full Paid Count</td><td className="text-right text-success fw-bold">{data.total_fullpaid}</td></tr>
              <tr><td className="text-muted">Total Portfolio Balance</td><td className="text-right fw-bold text-accent">₱ {fmt(data.total_portfolio)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">📅 Today's Activity</div>
              <div className="card-subtitle">{new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <table className="data-table">
            <tbody>
              <tr><td className="text-muted">Collections Today</td><td className="text-right fw-bold text-success">₱ {fmt(data.collections_today)}</td></tr>
              <tr><td className="text-muted">Releases Today</td><td className="text-right fw-bold">₱ {fmt(data.releases_today)}</td></tr>
              <tr><td className="text-muted">Loans Released Today</td><td className="text-right fw-bold">{data.loans_released_today}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
