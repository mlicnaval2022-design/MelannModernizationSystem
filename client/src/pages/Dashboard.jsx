import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import '../dashboard.css'

function fmt(n) { return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 }) }

const toDateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

  if (loading) return <div className="empty-state"><p>⏳ Loading dashboard...</p></div>
  if (errorMsg) return <div className="empty-state"><p>Could not load dashboard: {errorMsg}</p></div>
  if (!data) return <div className="empty-state"><p>Could not load dashboard data.</p></div>

  return (
    <div className="dashboard-v2">
      
      {/* Top Metrics Row */}
      <div className="metrics-top-row">
        <div className="metric-card-v2">
          <div className="header">
            <span>Total Portfolio</span>
            <h3>₱ {fmt(data.total_portfolio)}</h3>
            <span style={{ color: 'var(--accent-success)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              📈 +12% this month
            </span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#10b981', color: 'white' }}>💰</div>
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
            <h3>₱ {fmt(data.collections_yesterday)}</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Target: ₱100,000</span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#3b82f6', color: 'white' }}>⬇️</div>
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
            <h3>₱ {fmt(data.releases_today)}</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{data.loans_released_today} Clients</span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#8b5cf6', color: 'white' }}>⬆️</div>
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
            <span style={{ color: '#ef4444', fontSize: 13, fontWeight: 'bold' }}>₱ {fmt(data.total_pastdue_amount)}</span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#ef4444', color: 'white' }}>⚠️</div>
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

      <h4 style={{ margin: '0 0 10px 0', color: '#334155' }}>3-Day No-Payment Alerts</h4>
      <div className="metrics-top-row" style={{ marginBottom: 20 }}>
        <div className="metric-card-v2" onClick={() => navigate('/monitoring?tab=monitoring')} style={{ cursor: 'pointer', borderTop: '4px solid #ef4444' }}>
          <div className="header">
            <span style={{ fontWeight: 'bold', color: '#b91c1c' }}>All Active Alerts</span>
            <h3 style={{ color: '#dc2626' }}>{data.monitoring_alerts_active || 0} <span style={{fontSize: 12, fontWeight: 'normal', color: 'var(--text-muted)'}}>Clients</span></h3>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Unresolved eligible records</span>
          </div>
          <div className="metric-icon-circle" style={{ background: '#fef2f2', color: '#ef4444', fontSize: 24 }}>🚨</div>
        </div>
        <div className="metric-card-v2" onClick={() => navigate('/monitoring?tab=escalated')} style={{ cursor: 'pointer', borderTop: '4px solid #991b1b' }}>
          <div className="header">
            <span style={{ fontWeight: 'bold', color: '#7f1d1d' }}>Escalated (Day 4+)</span>
            <h3 style={{ color: '#991b1b' }}>{data.monitoring_alerts_escalated || 0}</h3>
          </div>
          <div className="metric-icon-circle" style={{ background: '#fee2e2', color: '#b91c1c', fontSize: 24 }}>🔥</div>
        </div>
        <div className="metric-card-v2" onClick={() => navigate('/monitoring?tab=resolved')} style={{ cursor: 'pointer', borderTop: '4px solid #10b981' }}>
          <div className="header">
            <span style={{ fontWeight: 'bold', color: '#047857' }}>Resolved Today</span>
            <h3 style={{ color: '#059669' }}>{data.monitoring_alerts_resolved_today || 0}</h3>
          </div>
          <div className="metric-icon-circle" style={{ background: '#ecfdf5', color: '#10b981', fontSize: 24 }}>✅</div>
        </div>
      </div>

      <h4 style={{ margin: '0 0 10px 0', color: '#334155' }}>Loan Processing Queue</h4>
      <div className="metrics-top-row" style={{ marginBottom: 20 }}>
        <div className="metric-card-v2" onClick={() => navigate('/credit-scoring')} style={{ cursor: 'pointer', borderTop: '4px solid #f59e0b' }}>
          <div className="header">
            <span style={{ fontWeight: 'bold', color: '#b45309' }}>For CI</span>
            <h3 style={{ color: '#d97706' }}>{data.pending_ci_count || 0} <span style={{fontSize: 12, fontWeight: 'normal', color: 'var(--text-muted)'}}>Applications</span></h3>
          </div>
          <div className="metric-icon-circle" style={{ background: '#fffbeb', color: '#f59e0b', fontSize: 24 }}>📋</div>
        </div>
        <div className="metric-card-v2" onClick={() => navigate('/credit-scoring')} style={{ cursor: 'pointer', borderTop: '4px solid #3b82f6' }}>
          <div className="header">
            <span style={{ fontWeight: 'bold', color: '#1d4ed8' }}>For Approval</span>
            <h3 style={{ color: '#2563eb' }}>{data.for_approval_count || 0} <span style={{fontSize: 12, fontWeight: 'normal', color: 'var(--text-muted)'}}>Applications</span></h3>
          </div>
          <div className="metric-icon-circle" style={{ background: '#eff6ff', color: '#3b82f6', fontSize: 24 }}>✅</div>
        </div>
        <div className="metric-card-v2" style={{ borderTop: '4px solid #10b981' }}>
          <div className="header">
            <span style={{ fontWeight: 'bold', color: '#047857' }}>Approved Today</span>
            <h3 style={{ color: '#059669' }}>{data.approved_today || 0}</h3>
          </div>
          <div className="metric-icon-circle" style={{ background: '#ecfdf5', color: '#10b981', fontSize: 24 }}>🎉</div>
        </div>
        <div className="metric-card-v2" style={{ borderTop: '4px solid #ef4444' }}>
          <div className="header">
            <span style={{ fontWeight: 'bold', color: '#b91c1c' }}>Rejected Today</span>
            <h3 style={{ color: '#dc2626' }}>{data.rejected_today || 0}</h3>
          </div>
          <div className="metric-icon-circle" style={{ background: '#fef2f2', color: '#ef4444', fontSize: 24 }}>❌</div>
        </div>
      </div>



      <div className="dashboard-main-grid">
        {/* LEFT COLUMN */}
        <div className="dashboard-left-col">
          
          {/* Middle Row */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div className="card-v2" style={{ flex: 2 }}>
              <div className="card-v2-title">
                👥 Collector Performance 
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
                          <td>₱{fmt(c.target)}</td>
                          <td>₱{fmt(c.collected)}</td>
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
                <div className="card-v2-title">🎯 Yesterday's Collection Status</div>
                <div className="collection-blocks">
                  <div className="c-block" style={{ background: '#f0f9ff', borderColor: '#bae6fd' }}>
                    <span style={{ color: '#0369a1' }}>Yesterday's Target Collection</span>
                    <h4 style={{ color: '#0284c7' }}>₱{fmt(data.collector_performance?.reduce((s,c)=>s+c.target,0))}</h4>
                  </div>
                  <div className="c-block" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                    <span style={{ color: '#15803d' }}>Yesterday's Collection</span>
                    <h4 style={{ color: '#16a34a' }}>₱{fmt(data.collections_yesterday)}</h4>
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
                <div className="card-v2-title">📋 Pending CI Applications</div>
                {data.pending_ci && data.pending_ci.length > 0 ? (
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Client</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {data.pending_ci.map(p => (
                        <tr key={p.id}>
                          <td>{p.full_name}</td>
                          <td className="fw-600">₱{fmt(p.principal)}</td>
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
              <div className="card-v2-title">📊 Account Status Distribution</div>
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
                          <span><span style={{color: '#10b981'}}>●</span> Active Loans ({activeCount})</span>
                          <strong>{Math.round((activeCount / total) * 100)}%</strong>
                        </div>
                        <div className="progress-container"><div className="progress-fill" style={{ width: `${Math.round((activeCount / total) * 100)}%`, background: '#10b981' }}></div></div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span><span style={{color: '#ef4444'}}>●</span> Past Due ({pastDueCount})</span>
                          <strong>{Math.round((pastDueCount / total) * 100)}%</strong>
                        </div>
                        <div className="progress-container"><div className="progress-fill" style={{ width: `${Math.round((pastDueCount / total) * 100)}%`, background: '#ef4444' }}></div></div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span><span style={{color: '#3b82f6'}}>●</span> Fully Paid ({fullpaidCount})</span>
                          <strong>{Math.round((fullpaidCount / total) * 100)}%</strong>
                        </div>
                        <div className="progress-container"><div className="progress-fill" style={{ width: `${Math.round((fullpaidCount / total) * 100)}%`, background: '#3b82f6' }}></div></div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                          <span><span style={{color: '#f59e0b'}}>●</span> Pending CI ({pendingCount})</span>
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
              <div className="card-v2-title">📅 Aging Report</div>
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
                      <tr>
                        <td>1-30 Days</td>
                        <td className="fw-600">{data.aging_report.tier1 || 0}</td>
                        <td style={{ textAlign: 'right' }}><span className="badge badge-warning" style={{ background: '#fef3c7', color: '#d97706' }}>Low Risk</span></td>
                      </tr>
                      <tr>
                        <td>31-60 Days</td>
                        <td className="fw-600">{data.aging_report.tier2 || 0}</td>
                        <td style={{ textAlign: 'right' }}><span className="badge" style={{ background: '#ffedd5', color: '#ea580c' }}>Medium</span></td>
                      </tr>
                      <tr>
                        <td>61-90 Days</td>
                        <td className="fw-600">{data.aging_report.tier3 || 0}</td>
                        <td style={{ textAlign: 'right' }}><span className="badge badge-danger">High Risk</span></td>
                      </tr>
                      <tr>
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
              <div style={{ fontSize: 20 }}>👥</div>
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
              <div style={{ fontSize: 20, color: '#3b82f6' }}>🎯</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Today's Expected Collections</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>₱{fmt(data.expected_collections_today)}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, color: '#f59e0b' }}>👥</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Active Clients</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{data.total_customers}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>⬆ +{data.new_customers_this_month} this month</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, color: '#8b5cf6' }}>📈</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>Monthly Collection Trend</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: data.collections_this_month >= data.collections_last_month ? '#10b981' : '#ef4444' }}>
                {data.collections_last_month > 0 ? `${data.collections_this_month >= data.collections_last_month ? '+' : ''}${Math.round(((data.collections_this_month - data.collections_last_month) / data.collections_last_month) * 100)}%` : '+100%'}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>📈 vs last month</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, color: '#ef4444' }}>📄</div>
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
              <span>🕒 Recent Activities</span>
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
            <div className="card-v2-title">⚡ Quick Actions</div>
            <button className="quick-action-btn" style={{ background: '#10b981' }} onClick={() => navigate('/customers')}>+ New Client</button>
            <button className="quick-action-btn" style={{ background: '#3b82f6' }} onClick={() => navigate('/loans')}>+ Release Loan</button>
            <button className="quick-action-btn" style={{ background: '#8b5cf6' }} onClick={() => navigate('/payments')}>+ Post Payment</button>
            <button className="quick-action-btn" style={{ background: '#f59e0b' }} onClick={() => navigate('/collectors')}>🖨️ Print Collection Sheet</button>
            <button className="quick-action-btn" style={{ background: '#ef4444' }} onClick={() => navigate('/reports')}>✉️ Generate Demand Letter</button>
          </div>

          <div className="card-v2" style={{ flex: 1 }}>
            <div className="card-v2-title" style={{ justifyContent: 'space-between' }}>
              <span>🔔 Notifications</span>
              <span style={{ fontSize: 11, color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}>View All</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.total_pastdue > 0 ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>⚠️</div>
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
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fffbeb', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>📋</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <h5 style={{ margin: 0, fontSize: 12, color: '#d97706' }}>{data.pending_ci.length} Pending CI Applications</h5>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Now</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Awaiting review.</p>
                  </div>
                </div>
              ) : null}

              {data.total_pastdue === 0 && (!data.pending_ci || data.pending_ci.length === 0) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No new notifications.</div>
              )}

            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-header">
          <div>
            <div className="card-title">🚀 System Updates</div>
            <div className="card-subtitle">Recent changes to the platform</div>
          </div>
        </div>
        <div className="card-body" style={{ padding: '20px' }}>
          <ul style={{ listStyleType: 'disc', paddingLeft: '20px', color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
            <li><strong>Encode Payments:</strong> Redesigned workflow with Command Prompt, auto-calculation, and collector validation.</li>
            <li><strong>UI Enhancements:</strong> Upgraded dashboard metrics, color palette, and layout styling.</li>
            <li><strong>Credit Scoring:</strong> Restructured pending loans and applications into a dedicated module.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
