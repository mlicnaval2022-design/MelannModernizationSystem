import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import API from '../services/api'
import '../dashboard.css'

const fmt = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })

const toDateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDefaultRange = () => {
  const to = new Date()
  if (to.getDay() === 0) to.setDate(to.getDate() - 1)
  const from = new Date(to)
  from.setDate(from.getDate() - 6)
  return { date_from: toDateKey(from), date_to: toDateKey(to) }
}

export default function CollectorPerformance() {
  const defaultRange = useMemo(getDefaultRange, [])
  const [filters, setFilters] = useState(defaultRange)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const buildFallbackSummary = async () => {
    const [dashboardRes, collectionRes] = await Promise.all([
      API.get('/reports/dashboard', { params: { date: filters.date_to } }),
      API.get('/reports/daily-collection', { params: filters })
    ])

    const baseCollectors = dashboardRes.data?.collector_performance || []
    const payments = collectionRes.data?.payments || []
    const byCollector = new Map()

    baseCollectors.forEach(collector => {
      byCollector.set(collector.name, {
        id: collector.id,
        name: collector.name,
        target: Number(collector.target || 0),
        collected: 0,
        paying_clients_set: new Set(),
        active_loans: 0
      })
    })

    payments.forEach(payment => {
      const name = payment.collector_name || 'Unassigned'
      const row = byCollector.get(name) || {
        id: `fallback-${name}`,
        name,
        target: 0,
        collected: 0,
        paying_clients_set: new Set(),
        active_loans: 0
      }
      row.collected += Number(payment.amount_paid || 0)
      if (payment.customer_id) row.paying_clients_set.add(payment.customer_id)
      byCollector.set(name, row)
    })

    const trendMap = new Map()
    payments.forEach(payment => {
      const date = payment.date_paid
      trendMap.set(date, (trendMap.get(date) || 0) + Number(payment.amount_paid || 0))
    })

    const collectors = Array.from(byCollector.values())
      .map(row => ({
        ...row,
        paying_clients: row.paying_clients_set.size,
        achievement_rate: row.target > 0 ? Math.round((row.collected / row.target) * 100) : 0
      }))
      .sort((a, b) => b.collected - a.collected || a.name.localeCompare(b.name))
      .map(({ paying_clients_set, ...row }) => row)

    const totals = collectors.reduce((acc, row) => {
      acc.target += Number(row.target || 0)
      acc.collected += Number(row.collected || 0)
      acc.paying_clients += Number(row.paying_clients || 0)
      acc.active_loans += Number(row.active_loans || 0)
      return acc
    }, { target: 0, collected: 0, paying_clients: 0, active_loans: 0 })

    totals.payment_count = payments.length
    totals.achievement_rate = totals.target > 0 ? Math.round((totals.collected / totals.target) * 100) : 0

    return {
      date_from: filters.date_from,
      date_to: filters.date_to,
      totals,
      top_collector: collectors[0] || null,
      collectors,
      trend: Array.from(trendMap.entries())
        .map(([date, collected]) => ({ date, collected }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }
  }

  const loadData = () => {
    setLoading(true)
    API.get('/collector-performance/summary', { params: filters })
      .then(res => {
        setData(res.data)
        setErrorMsg('')
      })
      .catch(err => {
        if (err.response?.status === 404) {
          return buildFallbackSummary()
            .then(fallbackData => {
              setData(fallbackData)
              setErrorMsg('')
            })
            .catch(fallbackErr => {
              setErrorMsg(fallbackErr.response?.data?.error || fallbackErr.message || 'Could not load collector performance')
            })
        }
        setErrorMsg(err.response?.data?.error || err.message || 'Could not load collector performance')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [])

  const collectors = data?.collectors || []
  const totals = data?.totals || {}

  return (
    <div className="dashboard-v2">
      <div className="card-v2" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div className="card-v2-title" style={{ marginBottom: 4 }}>Melann Collector Performance</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Collection target, actual collection, and achievement rate by collector.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ minWidth: 150 }}>
              <label className="form-label">Date From</label>
              <input className="form-control" type="date" value={filters.date_from} onChange={e => setFilters(current => ({ ...current, date_from: e.target.value }))} />
            </div>
            <div className="form-group" style={{ minWidth: 150 }}>
              <label className="form-label">Date To</label>
              <input className="form-control" type="date" value={filters.date_to} onChange={e => setFilters(current => ({ ...current, date_to: e.target.value }))} />
            </div>
            <button className="btn btn-primary" type="button" onClick={loadData} disabled={loading}>
              {loading ? 'Loading...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>

      {errorMsg && <div className="empty-state"><p>{errorMsg}</p></div>}

      {!errorMsg && (
        <>
          <div className="metrics-top-row">
            <div className="metric-card-v2">
              <div className="header">
                <span>Total Target</span>
                <h3>PHP {fmt(totals.target)}</h3>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{data?.date_from} to {data?.date_to}</span>
              </div>
              <div className="metric-icon-circle" style={{ background: '#0284c7', color: 'white' }}>T</div>
            </div>
            <div className="metric-card-v2">
              <div className="header">
                <span>Total Collection</span>
                <h3>PHP {fmt(totals.collected)}</h3>
                <span style={{ color: 'var(--accent-success)', fontSize: 11 }}>{totals.payment_count || 0} payments posted</span>
              </div>
              <div className="metric-icon-circle" style={{ background: '#10b981', color: 'white' }}>C</div>
            </div>
            <div className="metric-card-v2">
              <div className="header">
                <span>Achievement Rate</span>
                <h3>{totals.achievement_rate || 0}%</h3>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Collection vs target</span>
              </div>
              <div className="metric-icon-circle" style={{ background: '#f59e0b', color: 'white' }}>%</div>
            </div>
            <div className="metric-card-v2">
              <div className="header">
                <span>Top Collector</span>
                <h3 style={{ fontSize: 22 }}>{data?.top_collector?.name || 'N/A'}</h3>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>PHP {fmt(data?.top_collector?.collected)} collected</span>
              </div>
              <div className="metric-icon-circle" style={{ background: '#8b5cf6', color: 'white' }}>#1</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(420px, 2fr)', gap: 20, alignItems: 'start' }}>
            <div className="card-v2">
              <div className="card-v2-title">Collection Trend</div>
              <div style={{ height: 280 }}>
                {data?.trend?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.trend} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="collectorTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis hide />
                      <Tooltip formatter={value => [`PHP ${fmt(value)}`, 'Collected']} />
                      <Area type="monotone" dataKey="collected" stroke="#2563eb" fill="url(#collectorTrend)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No collection trend for selected range.</div>
                )}
              </div>
            </div>

            <div className="card-v2">
              <div className="card-v2-title">Collector Ranking</div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table className="data-table" style={{ margin: 0, border: 'none' }}>
                  <thead>
                    <tr>
                      <th>Collector</th>
                      <th style={{ textAlign: 'right' }}>Target</th>
                      <th style={{ textAlign: 'right' }}>Collection</th>
                      <th style={{ textAlign: 'right' }}>Clients Paid</th>
                      <th style={{ textAlign: 'right' }}>Active Loans</th>
                      <th style={{ textAlign: 'right' }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</td></tr>
                    ) : collectors.length ? collectors.map(collector => {
                      const color = collector.achievement_rate >= 100 ? '#10b981' : collector.achievement_rate >= 80 ? '#f59e0b' : '#ef4444'
                      return (
                        <tr key={collector.id}>
                          <td className="fw-bold">{collector.name}</td>
                          <td style={{ textAlign: 'right' }}>PHP {fmt(collector.target)}</td>
                          <td style={{ textAlign: 'right' }}>PHP {fmt(collector.collected)}</td>
                          <td style={{ textAlign: 'right' }}>{collector.paying_clients}</td>
                          <td style={{ textAlign: 'right' }}>{collector.active_loans}</td>
                          <td style={{ textAlign: 'right', minWidth: 120 }}>
                            <span style={{ color, fontWeight: 800 }}>{collector.achievement_rate}%</span>
                            <div className="progress-container">
                              <div className="progress-fill" style={{ width: `${Math.min(collector.achievement_rate, 100)}%`, background: color }} />
                            </div>
                          </td>
                        </tr>
                      )
                    }) : (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No active collectors found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
