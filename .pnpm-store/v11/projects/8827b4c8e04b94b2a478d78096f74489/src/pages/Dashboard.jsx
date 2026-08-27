import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import '../dashboard.css'

function fmt(n) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 }) }

const formatChartDate = value => {
  const text = String(value || '').slice(0, 10)
  const parts = text.split('-').map(Number)
  const date = parts.length === 3 && parts.every(Boolean)
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date(value)
  if (Number.isNaN(date.getTime())) return text || '-'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatTrendDate = value => {
  const text = String(value || '').slice(0, 10)
  const parts = text.split('-').map(Number)
  const date = parts.length === 3 && parts.every(Boolean)
    ? new Date(parts[0], parts[1] - 1, parts[2])
    : new Date(value)
  if (Number.isNaN(date.getTime())) return text || '-'
  return date.toLocaleDateString('en-US', { day: 'numeric', weekday: 'short' })
}

const formatTrendDateRange = trendResult => {
  const trend = trendResult?.rows || []
  if (trend.length === 0) return 'No date range'
  const parse = value => {
    const text = String(value || '').slice(0, 10)
    const parts = text.split('-').map(Number)
    const date = parts.length === 3 && parts.every(Boolean)
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const start = parse(trendResult.date_from || trend[0]?.start_date || trend[0]?.date)
  const end = parse(trendResult.date_to || trend[trend.length - 1]?.end_date || trend[trend.length - 1]?.date)
  if (!start || !end) return 'Collection period'
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(start.getFullYear() !== end.getFullYear() ? { year: 'numeric' } : {}),
  })
  const endLabel = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} - ${endLabel}`
}

const formatTrendPoint = (row, mode) => {
  if (!row) return '-'
  if (mode === 'daily') return formatTrendDate(row.date)
  const startYear = String(row.start_date || '').slice(0, 4)
  const endYear = String(row.end_date || '').slice(0, 4)
  if (startYear && endYear && startYear !== endYear) {
    return `${formatChartDate(row.start_date)} ${startYear}–${formatChartDate(row.end_date)} ${endYear}`
  }
  return `${formatChartDate(row.start_date)}–${formatChartDate(row.end_date)}`
}

const trendModeCopy = {
  daily: { average: 'Average Per Day', highest: 'Highest Day', lowest: 'Lowest Day', total: 'Days', comparison: 'vs. first day', windowDays: 8 },
  weekly: { average: 'Average Per Week', highest: 'Highest Week', lowest: 'Lowest Week', total: 'Weeks', comparison: 'vs. first week', windowDays: 56 },
  '45-days': { average: 'Average Per Period', highest: 'Highest 45-Day Period', lowest: 'Lowest 45-Day Period', total: 'Periods', comparison: 'vs. first period', windowDays: 270 },
}

const getCollectionTrendStats = (trend, { excludeCurrentDayFromLowest = false } = {}) => {
  const rows = (trend || []).map(row => ({
    ...row,
    total: Number(row.total || 0)
  }))
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const average = rows.length ? total / rows.length : 0
  const highest = rows.reduce((best, row) => row.total > best.total ? row : best, { total: 0, date: '' })
  const rowsEligibleForLowest = excludeCurrentDayFromLowest && rows.length > 1
    ? rows.slice(0, -1)
    : rows
  const lowest = rowsEligibleForLowest.reduce((best, row) => row.total < best.total ? row : best, rowsEligibleForLowest[0] || { total: 0, date: '' })
  const first = rows[0]?.total || 0
  const last = rows[rows.length - 1]?.total || 0
  const trendPct = first > 0 ? ((last - first) / first) * 100 : 0

  return {
    rows,
    total,
    average,
    highest,
    lowest,
    trendPct
  }
}

const toDateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const shiftDateInput = (value, days) => {
  const [year, month, day] = String(value || '').split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return toDateKey(new Date())
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

const getYesterdayKey = () => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (yesterday.getDay() === 0) {
    yesterday.setDate(yesterday.getDate() - 1)
  }
  return toDateKey(yesterday)
}

export default function Dashboard() {
  useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [trendMode, setTrendMode] = useState('daily')
  const [trendEndDate, setTrendEndDate] = useState(() => toDateKey(new Date()))
  const [trendData, setTrendData] = useState(null)
  const [trendLoading, setTrendLoading] = useState(true)
  const [trendError, setTrendError] = useState('')
  const [trendDateOpen, setTrendDateOpen] = useState(false)

  const fetchDashboardData = () => {
    const yesterday = getYesterdayKey()

    Promise.all([
      API.get('/reports/dashboard', { params: { date: yesterday } }),
      API.get('/reports/daily-collection', { params: { date_from: yesterday, date_to: yesterday } })
    ])
      .then(([dashboardRes, yesterdayCollectionRes]) => {
        setData({
          ...dashboardRes.data,
          collections_yesterday: yesterdayCollectionRes.data?.total || 0,
          yesterday_str: yesterday
        })
        setLoading(false)
        setErrorMsg('')
      })
      .catch((err) => {
        console.error("Dashboard error:", err);
        setErrorMsg(err.response?.data?.error || err.message || "Unknown error")
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchDashboardData()
    // Poll every 30 seconds for real-time updates to avoid overloading DB
    const interval = setInterval(fetchDashboardData, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let active = true
    const loadCollectionTrend = () => {
      setTrendLoading(true)
      API.get('/reports/dashboard/collection-trend', { params: { mode: trendMode, end_date: trendEndDate } })
        .then(response => {
          if (!active) return
          setTrendData(response.data)
          setTrendError('')
        })
        .catch(err => {
          if (!active) return
          setTrendError(err.response?.data?.error || 'Could not load the collection trend.')
        })
        .finally(() => active && setTrendLoading(false))
    }
    loadCollectionTrend()
    const interval = setInterval(loadCollectionTrend, 30000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [trendMode, trendEndDate])

  if (loading) return <div className="empty-state"><p>Loading dashboard...</p></div>
  if (errorMsg) return <div className="empty-state"><p>Could not load dashboard: {errorMsg}</p></div>
  if (!data) return <div className="empty-state"><p>Could not load dashboard data.</p></div>

  const resolvedTrendData = trendData || {
    mode: 'daily',
    rows: data.weekly_collection_trend || [],
    date_from: data.weekly_collection_trend?.[0]?.date,
    date_to: data.weekly_collection_trend?.[data.weekly_collection_trend?.length - 1]?.date,
  }
  const collectionTrend = getCollectionTrendStats(resolvedTrendData.rows, {
    excludeCurrentDayFromLowest: trendMode === 'daily' && resolvedTrendData.current_day_in_progress === true
  })
  const activeTrendCopy = trendModeCopy[trendMode]
  const todayKey = toDateKey(new Date())
  const changeTrendEndDate = value => {
    setTrendEndDate(value)
    setTrendDateOpen(false)
  }

  return (
    <div className="dashboard-v2">
      
      {/* Top Metrics Row */}
      <div className="metrics-top-row">
        <div className="metric-card-v2">
          <div className="header">
            <span>Total Portfolio</span>
            <h3>PHP {fmt(data.total_portfolio)}</h3>
            <span style={{ color: 'var(--accent-success)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              +12% this month
            </span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#10b981', color: 'white', fontSize: 13 }}>PHP</div>
          {/* Mock Sparkline */}
          <div style={{ marginTop: 10 }}>
            <svg viewBox="0 0 100 30" width="100%" height="40" preserveAspectRatio="none">
              <path d="M0,25 L20,15 L40,20 L60,5 L80,10 L100,0 L100,30 L0,30 Z" fill="rgba(16,185,129,0.1)" />
              <path d="M0,25 L20,15 L40,20 L60,5 L80,10 L100,0" fill="none" stroke="#10b981" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="metric-card-v2">
          <div className="header">
            <span>Collection as of {data.yesterday_str}</span>
            <h3>PHP {fmt(data.collections_yesterday)}</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Target: PHP 100,000</span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#3b82f6', color: 'white', fontSize: 13 }}>COL</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 15 }}>
            <div className="progress-container" style={{ margin: 0, flex: 1 }}>
              <div className="progress-fill" style={{ width: '85%', background: '#3b82f6' }}></div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 'bold' }}>85%</span>
          </div>
        </div>

        <div className="metric-card-v2">
          <div className="header">
            <span>Releases Today</span>
            <h3>PHP {fmt(data.releases_today)}</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{data.loans_released_today} Clients</span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#8b5cf6', color: 'white', fontSize: 13 }}>REL</div>
          <div style={{ marginTop: 10 }}>
            <svg viewBox="0 0 100 30" width="100%" height="40" preserveAspectRatio="none">
              <path d="M0,20 L20,25 L40,15 L60,10 L80,20 L100,5 L100,30 L0,30 Z" fill="rgba(139,92,246,0.1)" />
              <path d="M0,20 L20,25 L40,15 L60,10 L80,20 L100,5" fill="none" stroke="#8b5cf6" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="metric-card-v2">
          <div className="header">
            <span>Past Due Loans</span>
            <h3 style={{ color: '#ef4444' }}>{data.total_pastdue} <span style={{fontSize: 14, color: 'var(--text-primary)'}}>Accounts</span></h3>
            <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 'bold' }}>PHP {fmt(data.total_pastdue_amount)}</span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#ef4444', color: 'white', fontSize: 13 }}>PD</div>
          <div style={{ marginTop: 10 }}>
            <svg viewBox="0 0 100 30" width="100%" height="40" preserveAspectRatio="none">

              <path d="M0,25 L20,25 L40,20 L60,15 L80,10 L100,5 L100,30 L0,30 Z" fill="rgba(239,68,68,0.1)" />
              <path d="M0,25 L20,25 L40,20 L60,15 L80,10 L100,5" fill="none" stroke="#ef4444" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </div>

      <div style={{ background: '#f8fafc', padding: '12px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: 25, display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'bold', color: '#334155', fontSize: 14 }}>Fully Paid & Evaluated:</span>
        <div style={{ display: 'flex', gap: 20, fontSize: 14 }}>
          <div style={{ cursor: 'pointer', color: '#047857', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => navigate('/loans')}>
            <div style={{ background: '#dcfce7', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{data.fully_paid_today || 0}</div> 
            <span>Fully Paid</span>
          </div>
          <div style={{ cursor: 'pointer', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => navigate('/loans')}>
            <div style={{ background: '#dbeafe', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{data.eligible_for_reloan || 0}</div> 
            <span>Eligible for Reloan</span>
          </div>
          <div style={{ cursor: 'pointer', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => navigate('/customers')}>
            <div style={{ background: '#ede9fe', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{data.recon_count || 0}</div> 
            <span>Recon</span>
          </div>
          <div style={{ cursor: 'pointer', color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => navigate('/customers')}>
            <div style={{ background: '#fef3c7', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{data.relax_count || 0}</div> 
            <span>Relax</span>
          </div>
          <div style={{ cursor: 'pointer', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => navigate('/customers')}>
            <div style={{ background: '#fee2e2', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{data.hold_count || 0}</div> 
            <span>Hold</span>
          </div>
        </div>
      </div>

      <div className="dashboard-operations-grid">
        <div className="dashboard-table-stack">
          <div className="card-v2 dashboard-status-table-card">
            <div className="card-v2-title" style={{ justifyContent: 'space-between' }}>
              <span>Monitoring Cards</span>
              <button className="dashboard-table-link" onClick={() => navigate('/monitoring')}>Open</button>
            </div>
            <table className="data-table dashboard-status-table">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th className="text-right">Count</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr onClick={() => navigate('/monitoring')}>
                  <td>
                    <strong>3-Day No-Payment</strong>
                    <span>
                      {(data.monitoring_alerts_escalated || 0) > 0
                        ? `${data.monitoring_alerts_escalated} escalated (Day 4+) · ${data.monitoring_alerts_resolved_today || 0} resolved`
                        : 'Unresolved eligible records'}
                    </span>
                  </td>
                  <td className="text-right fw-bold" style={{ color: '#dc2626' }}>{data.monitoring_alerts_active || 0}</td>
                  <td>
                    <span className={`dashboard-status-pill ${(data.monitoring_alerts_escalated || 0) > 0 ? 'critical' : 'danger'}`}>
                      {(data.monitoring_alerts_escalated || 0) > 0 ? 'Escalated' : 'Active'}
                    </span>
                  </td>
                </tr>
                <tr onClick={() => navigate('/ptp-monitoring')}>
                  <td>
                    <strong>Promise to Pay</strong>
                    <span>
                      {(data.ptp_due_count || 0) > 0
                        ? `${data.ptp_overdue || 0} overdue · ${data.ptp_due_today || 0} due today`
                        : 'Active client payment commitments'}
                    </span>
                  </td>
                  <td className="text-right fw-bold" style={{ color: '#0284c7' }}>{data.ptp_due_count || 0}</td>
                  <td>
                    <span className={`dashboard-status-pill ${(data.ptp_overdue || 0) > 0 ? 'danger' : (data.ptp_due_today || 0) > 0 ? 'info' : 'info'}`}>
                      {(data.ptp_overdue || 0) > 0 ? 'Overdue' : (data.ptp_due_today || 0) > 0 ? 'Due Today' : 'PTP Due'}
                    </span>
                  </td>
                </tr>
                <tr onClick={() => navigate('/demand-letter')}>
                  <td>
                    <strong>Demand Letter Alert</strong>
                    <span>
                      {(data.demand_letters_active || 0) > 0
                        ? `${data.demand_letters_due_count || 0} follow-up due · ${data.demand_letters_awaiting_count || 0} awaiting receipt`
                        : 'Sent & follow-up demand letters'}
                    </span>
                  </td>
                  <td className="text-right fw-bold" style={{ color: '#d97706' }}>{data.demand_letters_active || 0}</td>
                  <td>
                    <span className={`dashboard-status-pill ${(data.demand_letters_due_count || 0) > 0 ? 'warning' : 'warning'}`}>
                      {(data.demand_letters_due_count || 0) > 0 ? 'Follow-up' : 'Action Req'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card-v2 dashboard-status-table-card">
            <div className="card-v2-title" style={{ justifyContent: 'space-between' }}>
              <span>Loan Processing Queue</span>
              <button className="dashboard-table-link" onClick={() => navigate('/credit-scoring')}>Open</button>
            </div>
            <table className="data-table dashboard-status-table">
              <thead>
                <tr>
                  <th>Queue</th>
                  <th className="text-right">Applications</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr onClick={() => navigate('/credit-scoring')}>
                  <td><strong>For CI</strong><span>Waiting for credit investigation</span></td>
                  <td className="text-right fw-bold" style={{ color: '#d97706' }}>{data.pending_ci_count || 0}</td>
                  <td><span className="dashboard-status-pill warning">CI</span></td>
                </tr>
                <tr onClick={() => navigate('/credit-scoring')}>
                  <td><strong>For Approval</strong><span>Ready for approval decision</span></td>
                  <td className="text-right fw-bold" style={{ color: '#2563eb' }}>{data.for_approval_count || 0}</td>
                  <td><span className="dashboard-status-pill info">Approval</span></td>
                </tr>
                <tr>
                  <td><strong>Approved Today</strong><span>Applications approved today</span></td>
                  <td className="text-right fw-bold" style={{ color: '#059669' }}>{data.approved_today || 0}</td>
                  <td><span className="dashboard-status-pill success">Approved</span></td>
                </tr>
                <tr>
                  <td><strong>Rejected Today</strong><span>Applications rejected today</span></td>
                  <td className="text-right fw-bold" style={{ color: '#dc2626' }}>{data.rejected_today || 0}</td>
                  <td><span className="dashboard-status-pill danger">Rejected</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-v2 dashboard-trend-card dashboard-collection-trend-card">
          <div className="dashboard-collection-trend-header">
            <div className="dashboard-collection-trend-title">
              <h3>Collection Trend <span>(Overall)</span></h3>
              <p>Overall collection performance across all periods</p>
            </div>
            <div className="dashboard-trend-controls">
              <div className="dashboard-trend-tabs" aria-label="Collection trend range">
                <button type="button" className={trendMode === 'weekly' ? 'active' : ''} onClick={() => setTrendMode('weekly')}>Weekly</button>
                <button type="button" className={trendMode === 'daily' ? 'active' : ''} onClick={() => setTrendMode('daily')}>Daily</button>
                <button type="button" className={trendMode === '45-days' ? 'active' : ''} onClick={() => setTrendMode('45-days')}>Every 45 Days</button>
              </div>
              <div className="dashboard-trend-date-wrap">
                <button type="button" className="dashboard-trend-date-filter" aria-expanded={trendDateOpen} onClick={() => setTrendDateOpen(open => !open)}>
                  <CalendarDays size={13} />
                  <span>{formatTrendDateRange(resolvedTrendData)}</span>
                  <ChevronDown size={13} />
                </button>
                {trendDateOpen && (
                  <div className="dashboard-trend-date-menu">
                    <label htmlFor="collection-trend-end-date">Show collections as of</label>
                    <input id="collection-trend-end-date" type="date" value={trendEndDate} max={todayKey} onChange={event => changeTrendEndDate(event.target.value)} />
                    <div className="dashboard-trend-date-actions">
                      <button type="button" onClick={() => changeTrendEndDate(shiftDateInput(trendEndDate, -activeTrendCopy.windowDays))}>← Previous</button>
                      <button type="button" onClick={() => changeTrendEndDate(todayKey)} disabled={trendEndDate === todayKey}>Today</button>
                      <button type="button" onClick={() => changeTrendEndDate(shiftDateInput(trendEndDate, activeTrendCopy.windowDays))} disabled={trendEndDate >= todayKey}>Next →</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="dashboard-trend-chart">
            {trendError ? (
              <div className="dashboard-trend-feedback error">{trendError}</div>
            ) : collectionTrend.rows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={collectionTrend.rows} margin={{ top: 14, right: 18, left: 0, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e9eef6" strokeDasharray="3 4" />
                  <Tooltip
                    formatter={(value) => [`₱${fmt(value)}`, 'Collection']}
                    labelFormatter={(_, payload) => formatTrendPoint(payload?.[0]?.payload, trendMode)}
                    cursor={{ stroke: '#d7e0ee', strokeWidth: 1 }}
                    contentStyle={{
                      fontSize: 12,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #dbe4f0',
                      boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
                    }}
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }}
                    tickFormatter={(_, index) => formatTrendPoint(collectionTrend.rows[index], trendMode)}
                    interval={0}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }}
                    tickFormatter={(value) => `₱${Number(value || 0) >= 1000 ? `${Math.round(Number(value) / 1000)}K` : Number(value || 0)}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 4, stroke: '#ffffff', strokeWidth: 2, fill: '#3b82f6' }}
                    activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2, fill: '#2563eb' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="dashboard-trend-feedback">No collection trend data</div>
            )}
            {trendLoading && <div className="dashboard-trend-loading">Updating trend…</div>}
          </div>
          <div className="dashboard-trend-summary">
            <div>
              <span>{activeTrendCopy.average}</span>
              <strong>₱{fmt(collectionTrend.average)}</strong>
            </div>
            <div>
              <span>{activeTrendCopy.highest}</span>
              <strong className="blue">₱{fmt(collectionTrend.highest.total)}</strong>
              <small>{formatTrendPoint(collectionTrend.highest, trendMode)}</small>
            </div>
            <div>
              <span>{activeTrendCopy.lowest}</span>
              <strong className="red">₱{fmt(collectionTrend.lowest.total)}</strong>
              <small>{formatTrendPoint(collectionTrend.lowest, trendMode)}</small>
            </div>
            <div>
              <span>Total ({collectionTrend.rows.length} {activeTrendCopy.total})</span>
              <strong>₱{fmt(collectionTrend.total)}</strong>
            </div>
            <div>
              <span>Trend</span>
              <strong className={collectionTrend.trendPct >= 0 ? 'green' : 'red'}>
                {collectionTrend.trendPct >= 0 ? '↗' : '↘'} {Math.abs(collectionTrend.trendPct).toFixed(1)}%
              </strong>
              <small>{activeTrendCopy.comparison}</small>
            </div>
          </div>
        </div>
      </div>



      <div className="dashboard-main-grid">
        {/* LEFT COLUMN */}
        <div className="dashboard-left-col">
          
          {/* Middle Row */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div className="card-v2" style={{ flex: 2 }}>
              <div className="card-v2-title">
                Collector Performance 
                {data.yesterday_str && <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: 8 }}>(Yesterday: {new Date(data.yesterday_str + 'T00:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})})</span>}
              </div>
              <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <table className="data-table" style={{ fontSize: 12, margin: 0, border: 'none' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ background: '#f8fafc', borderTop: 'none' }}>Collector</th>
                      <th style={{ background: '#f8fafc', borderTop: 'none' }}>Yesterday's Target</th>
                      <th style={{ background: '#f8fafc', borderTop: 'none' }}>Yesterday's Collection</th>
                      <th style={{ background: '#f8fafc', textAlign: 'right', borderTop: 'none' }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.collector_performance && data.collector_performance.length > 0 ? data.collector_performance.map(c => {
                      const pct = c.target > 0 ? Math.round((c.collected / c.target) * 100) : 0;
                      let color = '#ef4444';
                      if (pct >= 100) color = '#10b981';
                      else if (pct >= 80) color = '#f59e0b';
                      
                      return (
                        <tr key={c.id}>
                          <td className="fw-bold">{c.name}</td>
                          <td>PHP {fmt(c.target)}</td>
                          <td>PHP {fmt(c.collected)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: 600 }}>{pct}%</span>
                            <div className="progress-container">
                              <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }}></div>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '10px 0' }}>No active collectors</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 15, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></div> 100%+</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }}></div> 80%-99%</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }}></div> Below 80%</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
              <div className="card-v2">
                <div className="card-v2-title">Yesterday's Collection Status</div>
                <div className="collection-blocks">
                  <div className="c-block" style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}>
                    <span style={{ color: '#0369a1' }}>Yesterday's Target Collection</span>
                    <h4 style={{ color: '#0284c7' }}>PHP {fmt(data.collector_performance?.reduce((s,c)=>s+c.target,0))}</h4>
                  </div>
                  <div className="c-block" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <span style={{ color: '#15803d' }}>Yesterday's Collection</span>
                    <h4 style={{ color: '#16a34a' }}>PHP {fmt(data.collections_yesterday)}</h4>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 25 }}>
                  <div className="progress-container" style={{ height: 12, margin: 0, flex: 1 }}>
                    {(() => {
                       const t = data.collector_performance?.reduce((s,c)=>s+c.target,0) || 0;
                       const pct = t > 0 ? Math.round((data.collections_yesterday/t)*100) : 0;
                       return <div className="progress-fill" style={{ width: `${pct}%`, background: '#10b981' }}></div>
                    })()}
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>
                    {data.collector_performance?.reduce((s,c)=>s+c.target,0) > 0 ? Math.round((data.collections_yesterday/data.collector_performance?.reduce((s,c)=>s+c.target,0))*100) : 0}%
                  </span>
                </div>
              </div>

              <div className="card-v2">
                <div className="card-v2-title">Pending CI Applications</div>
                {data.pending_ci && data.pending_ci.length > 0 ? (
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Client</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {data.pending_ci.map(p => (
                        <tr key={p.id}>
                          <td>{p.full_name}</td>
                          <td className="fw-600">PHP {fmt(p.principal)}</td>
                          <td><span className="badge badge-warning">Pending</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No pending applications.</div>}
              </div>
            </div>
          </div>

          {/* Bottom Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card-v2">
              <div className="card-v2-title">Account Status Distribution</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                {(() => {
                  const distribution = data.account_status_distribution || [];
                  const total = distribution.reduce((sum, d) => sum + d.count, 0) || 1;
                  const getStatusCount = (status) => distribution.find(d => d.status === status)?.count || 0;
                  
                  const activeCount = getStatusCount('active');
                  const pastDueCount = getStatusCount('pastdue');
                  const fullpaidCount = getStatusCount('fullpaid');
                  const pendingCount = getStatusCount('pending') + getStatusCount('approved');
                  
                  return (
                    <>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginRight: 4 }}></span> Active Loans ({activeCount})</span>
                          <strong>{Math.round((activeCount / total) * 100)}%</strong>
                        </div>
                        <div className="progress-container"><div className="progress-fill" style={{ width: `${Math.round((activeCount / total) * 100)}%`, background: '#10b981' }}></div></div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginRight: 4 }}></span> Past Due ({pastDueCount})</span>
                          <strong>{Math.round((pastDueCount / total) * 100)}%</strong>
                        </div>
                        <div className="progress-container"><div className="progress-fill" style={{ width: `${Math.round((pastDueCount / total) * 100)}%`, background: '#ef4444' }}></div></div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', marginRight: 4 }}></span> Fully Paid ({fullpaidCount})</span>
                          <strong>{Math.round((fullpaidCount / total) * 100)}%</strong>
                        </div>
                        <div className="progress-container"><div className="progress-fill" style={{ width: `${Math.round((fullpaidCount / total) * 100)}%`, background: '#3b82f6' }}></div></div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', marginRight: 4 }}></span> Pending CI ({pendingCount})</span>
                          <strong>{Math.round((pendingCount / total) * 100)}%</strong>
                        </div>
                        <div className="progress-container"><div className="progress-fill" style={{ width: `${Math.round((pendingCount / total) * 100)}%`, background: '#f59e0b' }}></div></div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="card-v2">
              <div className="card-v2-title" style={{ justifyContent: 'space-between' }}>
                <span>Aging Report</span>
                <button className="dashboard-table-link" onClick={() => navigate('/reports?tab=aging-report')}>Open</button>
              </div>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Accounts</th>
                    <th style={{ textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aging_report ? (
                    <>
                      <tr style={{ cursor: 'pointer' }} onClick={() => navigate('/reports?tab=aging-report')}>
                        <td>1-30 Days</td>
                        <td className="fw-600">{data.aging_report.tier1 || 0}</td>
                        <td style={{ textAlign: 'right' }}><span className="badge badge-warning" style={{ background: '#fef3c7', color: '#d97706' }}>Low Risk</span></td>
                      </tr>
                      <tr style={{ cursor: 'pointer' }} onClick={() => navigate('/reports?tab=aging-report')}>
                        <td>31-60 Days</td>
                        <td className="fw-600">{data.aging_report.tier2 || 0}</td>
                        <td style={{ textAlign: 'right' }}><span className="badge" style={{ background: '#ffedd5', color: '#ea580c' }}>Medium</span></td>
                      </tr>
                      <tr style={{ cursor: 'pointer' }} onClick={() => navigate('/reports?tab=aging-report')}>
                        <td>61-90 Days</td>
                        <td className="fw-600">{data.aging_report.tier3 || 0}</td>
                        <td style={{ textAlign: 'right' }}><span className="badge badge-danger">High Risk</span></td>
                      </tr>
                      <tr style={{ cursor: 'pointer' }} onClick={() => navigate('/reports?tab=aging-report')}>
                        <td>90+ Days</td>
                        <td className="fw-600">{data.aging_report.tier4 || 0}</td>
                        <td style={{ textAlign: 'right' }}><span className="badge" style={{ background: '#991b1b', color: 'white' }}>Critical</span></td>
                      </tr>
                    </>
                  ) : <tr><td colSpan={3}>Loading...</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Bottom Summary Bar */}
          <div className="card-v2" style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '15px 20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>TOP</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Top Collector Today</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {data.collector_performance && data.collector_performance.length > 0 ? data.collector_performance[0].name : 'N/A'}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#10b981' }}>
                {data.collector_performance && data.collector_performance.length > 0 && data.collector_performance[0].target > 0 ? `${Math.round((data.collector_performance[0].collected / data.collector_performance[0].target) * 100)}%` : '0%'}
              </div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#3b82f6' }}>EXP</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Today's Expected Collections</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>PHP {fmt(data.expected_collections_today)}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>CLI</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Active Clients</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{data.total_customers}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>+{data.new_customers_this_month} this month</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#8b5cf6' }}>TRD</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Monthly Collection Trend</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: data.collections_this_month >= data.collections_last_month ? '#10b981' : '#ef4444' }}>
                {data.collections_last_month > 0 ? `${data.collections_this_month >= data.collections_last_month ? '+' : ''}${Math.round(((data.collections_this_month - data.collections_last_month) / data.collections_last_month) * 100)}%` : '+100%'}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>vs last month</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>LTR</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Demand Letters Sent</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{data.demand_letters_sent}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>This Month</div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className="dashboard-right-col">
          
          <div className="card-v2" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-v2-title" style={{ justifyContent: 'space-between' }}>
              <span>Recent Activities</span>
              <span style={{ fontSize: 11, color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}>View All</span>
            </div>
            <div className="activity-feed">
              {data.recent_activities && data.recent_activities.length > 0 ? data.recent_activities.map(log => {
                let color = '#3b82f6';
                if (log.action.includes('PAYMENT')) color = '#10b981';
                else if (log.action.includes('DUE') || log.action.includes('DELETE')) color = '#ef4444';
                else if (log.action.includes('CREATE')) color = '#8b5cf6';

                return (
                  <div className="activity-item" key={log.id} style={{ display: 'flex', gap: 15, marginBottom: 15 }}>
                    <div className="activity-time" style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 60 }}>
                      {new Date(log.created_at).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}
                    </div>
                    <div className="activity-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: color, marginTop: 4, flexShrink: 0 }}></div>
                    <div className="activity-content">
                      <div className="activity-title" style={{ color: color, fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{log.action}</div>
                      <div className="activity-desc" style={{ fontSize: 12, color: '#475569' }}>{log.details}</div>
                    </div>
                  </div>
                );
              }) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No recent activities.</div>}
            </div>
          </div>

          <div className="card-v2">
            <div className="card-v2-title">Quick Actions</div>
            <button className="quick-action-btn" style={{ background: '#10b981' }} onClick={() => navigate('/customers')}>+ New Client</button>
            <button className="quick-action-btn" style={{ background: '#3b82f6' }} onClick={() => navigate('/loans')}>+ Release Loan</button>
            <button className="quick-action-btn" style={{ background: '#8b5cf6' }} onClick={() => navigate('/payments')}>+ Post Payment</button>
            <button className="quick-action-btn" style={{ background: '#f59e0b' }} onClick={() => navigate('/collectors')}>Print Collection Sheet</button>
            <button className="quick-action-btn" style={{ background: '#ef4444' }} onClick={() => navigate('/reports')}>Generate Demand Letter</button>
          </div>

          <div className="card-v2" style={{ flex: 1 }}>
            <div className="card-v2-title" style={{ justifyContent: 'space-between' }}>
              <span>Notifications</span>
              <span style={{ fontSize: 11, color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}>View All</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.total_pastdue > 0 ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>!</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <h5 style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{data.total_pastdue} Past Due Accounts</h5>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Now</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Please review aging accounts.</p>
                  </div>
                </div>
              ) : null}

              {data.pending_ci && data.pending_ci.length > 0 ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>!</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <h5 style={{ margin: 0, fontSize: 12, color: '#d97706' }}>{data.pending_ci_count} Loan Applications</h5>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Today</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Awaiting Credit Investigation (CI).</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
