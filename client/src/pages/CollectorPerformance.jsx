import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, FileText, Plus, Printer, RefreshCw, Users } from 'lucide-react'
import API from '../services/api'
import '../dashboard.css'

const fmt = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const countFmt = value => Number(value || 0).toLocaleString('en-PH')
const printAmount = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const toDateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDefaultRange = () => {
  const to = new Date()
  if (to.getDay() === 0) to.setDate(to.getDate() - 1)
  const dateKey = toDateKey(to)
  return { date_to: dateKey, pastdue_cutoff: `${to.getFullYear()}-05-15` }
}

const displayDate = value => {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

const displayWeekday = value => {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long'
  }).toUpperCase()
}

const shortDisplayDate = value => {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const getOperationWeek = dateKey => {
  const selected = new Date(`${dateKey}T00:00:00`)
  const day = selected.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const start = new Date(selected)
  start.setDate(selected.getDate() + mondayOffset)

  return Array.from({ length: 6 }, (_, index) => {
    const next = new Date(start)
    next.setDate(start.getDate() + index)
    return toDateKey(next)
  })
}

const getCollectionRemark = rate => {
  if (rate >= 100) return 'ACHIEVED'
  if (rate >= 85) return 'ON TRACK'
  return 'NEEDS IMPROVEMENT'
}

const getRemarkStyle = remark => {
  if (remark === 'ACHIEVED') return { background: '#dcfce7', color: '#047857', borderColor: '#bbf7d0' }
  if (remark === 'ON TRACK') return { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }
  return { background: '#fff1f2', color: '#e11d48', borderColor: '#fecdd3' }
}

const shortCollectorName = name => {
  const raw = String(name || '').trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return raw.toUpperCase()
  const first = parts[0]
  const last = parts.slice(1).join(' ')
  return `${last}, ${first.charAt(0)}.`.toUpperCase()
}

const targetOrder = [
  'torreta',
  'domingono',
  'caballes',
  'jugar',
  'rosal',
  'laude'
]

const getSortOrder = name => {
  const lowerName = String(name || '').toLowerCase().trim()
  const index = targetOrder.findIndex(target => lowerName.includes(target))
  return index !== -1 ? index : targetOrder.length
}

export default function CollectorPerformance() {
  const defaultRange = useMemo(getDefaultRange, [])
  const [filters, setFilters] = useState(defaultRange)
  const [data, setData] = useState(null)
  const [activeTab, setActiveTab] = useState('targets')
  const [collectionRows, setCollectionRows] = useState([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const buildFallbackSummary = async () => {
    const dashboardRes = await API.get('/reports/dashboard', { params: { date: filters.date_to } })
    let collectionRes = { data: { payments: [] } }

    try {
      collectionRes = await API.get('/reports/daily-collection', {
        params: {
          date_from: filters.date_to,
          date_to: filters.date_to
        }
      })
    } catch (err) {
      if (err.response?.status !== 404) throw err
    }

    const baseCollectors = dashboardRes.data?.collector_performance || []
    const payments = collectionRes.data?.payments || []
    const byCollector = new Map()

    baseCollectors
      .filter(collector => !String(collector.name || '').toLowerCase().includes('melann office'))
      .forEach(collector => {
      byCollector.set(collector.name, {
        id: collector.id,
        name: collector.name,
        target: Number(collector.target || 0),
        collected: 0,
        actual_collection: 0,
        paying_clients_set: new Set(),
        active_loans: 0
      })
    })

    payments.forEach(payment => {
      const name = payment.collector_name || 'Unassigned'
      if (String(name).toLowerCase().includes('melann office')) return
      const row = byCollector.get(name) || {
        id: `fallback-${name}`,
        name,
        target: 0,
        collected: 0,
        actual_collection: 0,
        paying_clients_set: new Set(),
        active_loans: 0
      }
      row.collected += Number(payment.amount_paid || 0)
      row.actual_collection += Number(payment.amount_paid || 0)
      if (payment.customer_id) row.paying_clients_set.add(payment.customer_id)
      byCollector.set(name, row)
    })

    const trendMap = new Map()
    collectionRes.data?.payments?.forEach(payment => {
      const date = payment.date_paid
      trendMap.set(date, (trendMap.get(date) || 0) + Number(payment.amount_paid || 0))
    })

    const rawCollectors = Array.from(byCollector.values())
      .map(row => ({
        ...row,
        paying_clients: row.paying_clients_set.size,
        achievement_rate: row.target > 0 ? Math.round((row.collected / row.target) * 100) : 0
      }))
      .map(({ paying_clients_set, ...row }) => row)

    const top_collector = [...rawCollectors].sort((a, b) => b.collected - a.collected)[0] || null
    const collectors = rawCollectors.sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')))

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
      date_from: filters.date_to,
      date_to: filters.date_to,
      target_date: filters.date_to,
      actual_date: filters.date_to,
      pastdue_cutoff: filters.pastdue_cutoff,
      totals,
      top_collector,
      collectors,
      trend: Array.from(trendMap.entries())
        .map(([date, collected]) => ({ date, collected }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await API.get('/collector-performance/summary', {
        params: {
          date_to: filters.date_to,
          pastdue_cutoff: filters.pastdue_cutoff
        }
      })
      setData(res.data)
      setErrorMsg('')
    } catch (err) {
      if (err.response?.status === 404) {
        try {
          const fallbackData = await buildFallbackSummary()
          setData(fallbackData)
          setErrorMsg('')
        } catch (fallbackErr) {
          setErrorMsg(fallbackErr.response?.data?.error || fallbackErr.message || 'Could not load collector performance')
        }
      } else {
        setErrorMsg(err.response?.data?.error || err.message || 'Could not load collector performance')
      }
    } finally {
      setLoading(false)
    }
  }

  const buildCollectionsSummary = summary => {
    const collectors = (summary?.collectors || [])
      .filter(collector => !String(collector.name || '').toLowerCase().includes('melann office'))
    const target = collectors.reduce((sum, collector) => sum + Number(collector.target || 0), 0)
    const actual = collectors.reduce((sum, collector) => sum + Number(collector.actual_collection ?? collector.collected ?? 0), 0)
    const paymentCount = collectors.reduce((sum, collector) => sum + Number(collector.payment_count || 0), 0)
    const rate = target > 0 ? (actual / target) * 100 : 0
    const remark = getCollectionRemark(rate)

    return {
      date: summary?.target_date || summary?.date_to,
      dailyTarget: target,
      weeklyTarget: target * 6,
      actual,
      paymentCount,
      rate,
      remark
    }
  }

  const loadCollections = async () => {
    setCollectionsLoading(true)
    try {
      const weekDates = getOperationWeek(filters.date_to)
      const responses = await Promise.all(weekDates.map(date => API.get('/collector-performance/summary', {
        params: {
          date_to: date,
          pastdue_cutoff: filters.pastdue_cutoff
        }
      })))
      setCollectionRows(responses.map(response => buildCollectionsSummary(response.data)))
    } catch (err) {
      setErrorMsg(err.response?.data?.error || err.message || 'Could not load collections')
    } finally {
      setCollectionsLoading(false)
    }
  }

  const applyFilters = async () => {
    await loadData()
    if (activeTab === 'collections') await loadCollections()
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (activeTab === 'collections') loadCollections()
  }, [activeTab])

  const collectors = (data?.collectors || [])
    .filter(collector => !String(collector.name || '').toLowerCase().includes('melann office'))
    .sort((a, b) => getSortOrder(a.name) - getSortOrder(b.name) || String(a.name || '').localeCompare(String(b.name || '')))
  const totals = collectors.reduce((acc, collector) => {
    const collectorTotal = Number(collector.active_clients || 0) + Number(collector.recon_clients || 0) + Number(collector.overdue_clients || 0) + Number(collector.pastdue_clients || 0)
    acc.target += Number(collector.target || 0)
    acc.collected += Number(collector.actual_collection ?? collector.collected ?? 0)
    acc.payment_count += Number(collector.payment_count || 0)
    acc.active_clients += Number(collector.active_clients || 0)
    acc.recon_clients += Number(collector.recon_clients || 0)
    acc.overdue_clients += Number(collector.overdue_clients || 0)
    acc.pastdue_clients += Number(collector.pastdue_clients || 0)
    acc.total_clients += collectorTotal
    return acc
  }, {
    target: 0,
    collected: 0,
    payment_count: 0,
    active_clients: 0,
    recon_clients: 0,
    overdue_clients: 0,
    pastdue_clients: 0,
    total_clients: 0
  })
  totals.achievement_rate = totals.target > 0 ? Math.round((totals.collected / totals.target) * 100) : 0
  const totalClients = Number(totals.active_clients || 0) + Number(totals.recon_clients || 0) + Number(totals.overdue_clients || 0) + Number(totals.pastdue_clients || 0)
  const activeTotal = Number(totals.active_clients || 0) + Number(totals.overdue_clients || 0)
  const pastdueTotal = Number(totals.pastdue_clients || 0)
  const reportDate = data?.target_date || filters.date_to
  const pastdueCutoff = data?.pastdue_cutoff || filters.pastdue_cutoff
  const collectionTotals = collectionRows.reduce((acc, row) => {
    acc.dailyTarget += Number(row.dailyTarget || 0)
    acc.actual += Number(row.actual || 0)
    acc.paymentCount += Number(row.paymentCount || 0)
    return acc
  }, { dailyTarget: 0, actual: 0, paymentCount: 0 })
  collectionTotals.rate = collectionTotals.dailyTarget > 0 ? (collectionTotals.actual / collectionTotals.dailyTarget) * 100 : 0
  const collectionFooterRemark = getCollectionRemark(collectionTotals.rate)

  return (
    <div className="dashboard-v2">
      <style>{`
        .collector-print-layout { display: none; }
        .collector-print-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
        }
        .collector-print-table th,
        .collector-print-table td {
          border: 1px solid #000;
          padding: 3px 4px;
          font-size: 8px;
          line-height: 1.05;
          vertical-align: middle;
        }
        .collector-print-table th {
          font-weight: 800;
          text-align: center;
        }
        .collector-print-label {
          width: 22%;
          font-weight: 800;
          text-align: left;
        }
        .collector-print-value {
          font-weight: 800;
          text-align: left;
        }
        .collector-print-name {
          font-weight: 800;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: clip;
        }
        .collector-print-num { text-align: center; font-weight: 700; }
        .collector-print-money { text-align: right; font-weight: 700; }
        .collector-print-total td { font-weight: 900; }
        @media print {
          @page { size: portrait; margin: 0.35in; }
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #printable-area.collector-print-layout,
          #printable-area.collector-print-layout * { visibility: visible !important; }
          #printable-area.collector-print-layout {
            display: grid !important;
            grid-template-columns: 1fr;
            gap: 0.2in;
            position: absolute !important;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            background: #fff;
          }
          .collector-print-panel { break-inside: avoid; page-break-inside: avoid; }
          body.print-target .print-actual-only,
          body.print-target .print-actual-only * { display: none !important; visibility: hidden !important; }
          body.print-actual .print-target-only,
          body.print-actual .print-target-only * { display: none !important; visibility: hidden !important; }
        }
      `}</style>

      <div id="printable-area" className="collector-print-layout">
        <div className="collector-print-panel print-target-only">
          <table className="collector-print-table">
            <thead>
              <tr><td className="collector-print-label">{displayWeekday(reportDate)}</td><td colSpan={6}></td></tr>
              <tr><td className="collector-print-label">TYPE:</td><td colSpan={6} className="collector-print-value">DAILY</td></tr>
              <tr><td className="collector-print-label">DATE:</td><td colSpan={6} className="collector-print-value">{displayDate(reportDate)}</td></tr>
              <tr>
                <th style={{ width: '33%' }}>Collector</th>
                <th>Active</th>
                <th>Recon</th>
                <th>Pastdue</th>
                <th>Total No.<br />of Clients</th>
                <th colSpan={2}>Target</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map(collector => {
                const collectorActive = Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0)
                const collectorTotal = collectorActive + Number(collector.recon_clients || 0) + Number(collector.pastdue_clients || 0)
                return (
                  <tr key={`print-left-${collector.id}`}>
                    <td className="collector-print-name">{String(collector.name || '').toUpperCase()}</td>
                    <td className="collector-print-num">{countFmt(collectorActive)}</td>
                    <td className="collector-print-num">{countFmt(collector.recon_clients)}</td>
                    <td className="collector-print-num">{countFmt(Number(collector.pastdue_clients || 0))}</td>
                    <td className="collector-print-num">{countFmt(collectorTotal)}</td>
                    <td colSpan={2} className="collector-print-money">{printAmount(collector.target)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="collector-print-total">
                <td className="collector-print-money">TOTAL</td>
                <td className="collector-print-num">{countFmt(activeTotal)}</td>
                <td className="collector-print-num">{countFmt(totals.recon_clients)}</td>
                <td className="collector-print-num">{countFmt(pastdueTotal)}</td>
                <td className="collector-print-num">{countFmt(totalClients)}</td>
                <td colSpan={2} className="collector-print-money">{printAmount(totals.target)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="collector-print-panel print-actual-only">
          <table className="collector-print-table">
            <thead>
              <tr><td className="collector-print-label">{displayWeekday(reportDate)}</td><td colSpan={3}></td></tr>
              <tr><td className="collector-print-label">TYPE:</td><td colSpan={3} className="collector-print-value">DAILY</td></tr>
              <tr><td className="collector-print-label">DATE:</td><td colSpan={3} className="collector-print-value">{displayDate(reportDate)}</td></tr>
              <tr>
                <th style={{ width: '44%' }}>Collector</th>
                <th>No of<br />Active Accts</th>
                <th>Target</th>
                <th>Actual</th>
              </tr>
            </thead>
            <tbody>
              {collectors.map(collector => (
                <tr key={`print-right-${collector.id}`}>
                  <td className="collector-print-name">{shortCollectorName(collector.name)}</td>
                  <td className="collector-print-num">{countFmt(Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0))}</td>
                  <td className="collector-print-money">{printAmount(collector.target)}</td>
                  <td className="collector-print-money">{collector.actual_collection || collector.collected ? printAmount(collector.actual_collection ?? collector.collected) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {errorMsg && <div className="empty-state"><p>{errorMsg}</p></div>}

      {!errorMsg && (
        <>
          <div className="card-v2" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 20,
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: '#eef2f7',
                  color: '#475569',
                  display: 'grid',
                  placeItems: 'center'
                }}>
                  <Users size={22} />
                </div>
                <div>
                  <div className="card-v2-title" style={{ marginBottom: 4 }}>Daily Target Breakout</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Target/counts match the Collection Sheet for {data?.target_date || filters.date_to}; actual excludes pastdue maturity on/before {pastdueCutoff || '-'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
                  <label className="form-label">Collection Sheet Date</label>
                  <input className="form-control" type="date" value={filters.date_to} onChange={e => {
                    const nextDate = e.target.value
                    setFilters(current => ({
                      ...current,
                      date_to: nextDate,
                      pastdue_cutoff: current.pastdue_cutoff || `${new Date(`${nextDate}T00:00:00`).getFullYear()}-05-15`
                    }))
                  }} />
                </div>
                <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
                  <label className="form-label">Pastdue Cutoff</label>
                  <input className="form-control" type="date" value={filters.pastdue_cutoff || ''} onChange={e => setFilters(current => ({ ...current, pastdue_cutoff: e.target.value }))} />
                </div>
                <button className="btn btn-primary" type="button" onClick={applyFilters} disabled={loading || collectionsLoading}>
                  {loading || collectionsLoading ? 'Loading...' : 'Apply'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => {
                  document.body.classList.add('print-actual');
                  window.print();
                  document.body.classList.remove('print-actual');
                }} disabled={loading || !data}>
                  <Printer size={16} /> Print Actual Collection
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => {
                  document.body.classList.add('print-target');
                  window.print();
                  document.body.classList.remove('print-target');
                }} disabled={loading || !data}>
                  <Printer size={16} /> Print Daily Target
                </button>
                <button className="btn btn-success" type="button" onClick={() => window.print()} disabled={loading || !data}>
                  <FileText size={16} /> Export PDF Manifest
                </button>
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: 8,
              padding: '14px 24px',
              borderBottom: '1px solid var(--border)',
              background: '#f8fafc'
            }}>
              <button
                className={`btn ${activeTab === 'targets' ? 'btn-primary' : 'btn-secondary'}`}
                type="button"
                onClick={() => setActiveTab('targets')}
              >
                Daily Target
              </button>
              <button
                className={`btn ${activeTab === 'collections' ? 'btn-primary' : 'btn-secondary'}`}
                type="button"
                onClick={() => setActiveTab('collections')}
              >
                <CalendarDays size={16} /> Collections
              </button>
            </div>

            {activeTab === 'targets' && <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ margin: 0, border: 'none', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Collector</th>
                    <th style={{ textAlign: 'center' }}>Total No. of Clients</th>
                    <th style={{ textAlign: 'center', color: '#059669' }}>Active</th>
                    <th style={{ textAlign: 'center', color: '#1d4ed8' }}>Recon</th>
                    <th style={{ textAlign: 'center', color: '#dc2626' }}>Past Due</th>
                    <th style={{ textAlign: 'right', color: '#7c3aed' }}>Target (PHP)</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Loading...</td></tr>
                  ) : collectors.length ? collectors.map(collector => {
                    const collectorActive = Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0)
                    const collectorPastDue = Number(collector.pastdue_clients || 0)
                    const collectorTotal = collectorActive + Number(collector.recon_clients || 0) + collectorPastDue
                    return (
                      <tr key={collector.id}>
                        <td style={{ fontWeight: 900, textTransform: 'uppercase' }}>{collector.name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{countFmt(collectorTotal)}</td>
                        <td style={{ textAlign: 'center', color: '#059669', fontWeight: 900 }}>{countFmt(collectorActive)}</td>
                        <td style={{ textAlign: 'center', color: '#1d4ed8', fontWeight: 900 }}>{countFmt(collector.recon_clients)}</td>
                        <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 900 }}>{countFmt(collectorPastDue)}</td>
                        <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 900 }}>PHP {fmt(collector.target)}</td>
                      </tr>
                    )
                  }) : (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>No active collectors found.</td></tr>
                  )}
                </tbody>
                {!loading && collectors.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#fff8e6' }}>
                      <td style={{ fontWeight: 900, textTransform: 'uppercase', padding: '18px 24px' }}>Total</td>
                      <td style={{ textAlign: 'center', fontWeight: 900 }}>{countFmt(totalClients)}</td>
                      <td style={{ textAlign: 'center', color: '#059669', fontWeight: 900 }}>{countFmt(activeTotal)}</td>
                      <td style={{ textAlign: 'center', color: '#1d4ed8', fontWeight: 900 }}>{countFmt(totals.recon_clients)}</td>
                      <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 900 }}>{countFmt(pastdueTotal)}</td>
                      <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 900 }}>PHP {fmt(totals.target)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>}

            {activeTab === 'collections' && (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '22px 24px',
                  borderBottom: '1px solid var(--border)',
                  flexWrap: 'wrap'
                }}>
                  <div>
                    <div className="card-v2-title" style={{ marginBottom: 4, textTransform: 'uppercase' }}>Collection Performance</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' }}>Daily audit & metric tracking</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" type="button" onClick={loadCollections} disabled={collectionsLoading}>
                      <RefreshCw size={16} /> {collectionsLoading ? 'Syncing...' : 'Sync Dates'}
                    </button>
                    <button className="btn btn-success" type="button" onClick={loadCollections} disabled={collectionsLoading}>
                      <Plus size={16} /> Add Date
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ margin: 0, border: 'none', minWidth: 1060 }}>
                    <thead>
                      <tr>
                        <th rowSpan={2}>Rating Period</th>
                        <th colSpan={2} style={{ textAlign: 'center' }}>Target</th>
                        <th rowSpan={2} style={{ textAlign: 'right' }}>Actual</th>
                        <th rowSpan={2} style={{ textAlign: 'center' }}>Percentage of Accomplishment</th>
                        <th rowSpan={2} style={{ textAlign: 'center' }}>Remarks</th>
                      </tr>
                      <tr>
                        <th style={{ textAlign: 'right' }}>Daily</th>
                        <th style={{ textAlign: 'right' }}>Weekly</th>
                      </tr>
                    </thead>
                    <tbody>
                      {collectionsLoading ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Loading collections...</td></tr>
                      ) : collectionRows.length ? collectionRows.map(row => {
                        const remarkStyle = getRemarkStyle(row.remark)
                        return (
                          <tr key={`collection-${row.date}`}>
                            <td>
                              <div style={{ fontWeight: 900, fontSize: 16 }}>{shortDisplayDate(row.date)}</div>
                              <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 11, fontWeight: 900, letterSpacing: 1.3, textTransform: 'uppercase' }}>Operational Day</div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 900 }}>PHP {fmt(row.dailyTarget)}</td>
                            <td style={{ textAlign: 'right', color: '#334155', fontWeight: 900 }}>PHP {fmt(row.weeklyTarget)}</td>
                            <td style={{ textAlign: 'right', color: row.actual > 0 ? '#0ea5e9' : '#64748b', fontWeight: 900 }}>PHP {fmt(row.actual)}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ color: row.rate >= 85 ? '#059669' : '#e11d48', fontWeight: 900, fontSize: 18 }}>{row.rate.toFixed(2)}%</div>
                              <div style={{ width: 84, height: 5, borderRadius: 999, background: '#e8edf4', margin: '8px auto 0', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(row.rate, 100)}%`, height: '100%', background: row.rate >= 85 ? '#10b981' : '#e11d48' }} />
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 118, padding: '9px 13px', border: `1px solid ${remarkStyle.borderColor}`, borderRadius: 8, fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase', ...remarkStyle }}>
                                {row.remark}
                              </span>
                            </td>
                          </tr>
                        )
                      }) : (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>No collection dates loaded.</td></tr>
                      )}
                    </tbody>
                    {!collectionsLoading && collectionRows.length > 0 && (
                      <tfoot>
                        <tr style={{ background: '#0f172a', color: '#fff' }}>
                          <td style={{ padding: '20px 24px' }}>
                            <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase' }}>Weekly Summary</div>
                            <div style={{ marginTop: 6, fontWeight: 900 }}>CONSOLIDATED</div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 900 }}>PHP {fmt(collectionTotals.dailyTarget)}</td>
                          <td style={{ textAlign: 'right', color: '#94a3b8', fontWeight: 900 }}>-</td>
                          <td style={{ textAlign: 'right', color: '#38bdf8', fontWeight: 900 }}>PHP {fmt(collectionTotals.actual)}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, fontSize: 18 }}>{collectionTotals.rate.toFixed(2)}%</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 118, padding: '9px 13px', borderRadius: 8, background: collectionFooterRemark === 'ACHIEVED' ? '#10b981' : '#f43f5e', color: '#fff', fontSize: 11, fontWeight: 900, letterSpacing: 1.1, textTransform: 'uppercase' }}>
                              {collectionFooterRemark}
                            </span>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>

          {activeTab === 'targets' && <div className="card-v2" style={{ padding: 0, overflow: 'hidden', marginTop: 24 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 8,
                  background: '#eef2f7',
                  color: '#475569',
                  display: 'grid',
                  placeItems: 'center'
                }}>
                  <FileText size={22} />
                </div>
                <div>
                  <div className="card-v2-title" style={{ marginBottom: 4 }}>Actual Collection</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Actual collection summary for {displayDate(reportDate)}
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ margin: 0, border: 'none', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th>Collector</th>
                    <th style={{ textAlign: 'center' }}>No of Active Accts</th>
                    <th style={{ textAlign: 'right', color: '#7c3aed' }}>Target (PHP)</th>
                    <th style={{ textAlign: 'right', color: '#0ea5e9' }}>Actual (PHP)</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>Loading...</td></tr>
                  ) : collectors.length ? collectors.map(collector => {
                    const collectorActive = Number(collector.active_clients || 0) + Number(collector.overdue_clients || 0)
                    return (
                      <tr key={`actual-${collector.id}`}>
                        <td style={{ fontWeight: 900, textTransform: 'uppercase' }}>{collector.name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 900 }}>{countFmt(collectorActive)}</td>
                        <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 900 }}>PHP {fmt(collector.target)}</td>
                        <td style={{ textAlign: 'right', color: '#0ea5e9', fontWeight: 900 }}>
                          {collector.actual_collection || collector.collected ? `PHP ${fmt(collector.actual_collection ?? collector.collected)}` : '-'}
                        </td>
                      </tr>
                    )
                  }) : (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>No active collectors found.</td></tr>
                  )}
                </tbody>
                {!loading && collectors.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#fff8e6' }}>
                      <td style={{ fontWeight: 900, textTransform: 'uppercase', padding: '18px 24px' }}>Total</td>
                      <td style={{ textAlign: 'center', fontWeight: 900 }}>{countFmt(activeTotal)}</td>
                      <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 900 }}>PHP {fmt(totals.target)}</td>
                      <td style={{ textAlign: 'right', color: '#0ea5e9', fontWeight: 900 }}>PHP {fmt(totals.collected)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>}
        </>
      )}
    </div>
  )
}
