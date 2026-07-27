import { useEffect, useMemo, useState } from 'react'
import { FileText, Printer, Users } from 'lucide-react'
import API from '../services/api'
import '../dashboard.css'

const fmt = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const countFmt = value => Number(value || 0).toLocaleString('en-PH')

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
    const dashboardRes = await API.get('/reports/dashboard', { params: { date: filters.date_to } })
    let collectionRes = { data: { payments: [] } }

    try {
      collectionRes = await API.get('/reports/daily-collection', { params: filters })
    } catch (err) {
      if (err.response?.status !== 404) throw err
    }

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

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await API.get('/collector-performance/summary', { params: filters })
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

  useEffect(() => {
    loadData()
  }, [])

  const collectors = data?.collectors || []
  const totals = data?.totals || {}
  const totalClients = Number(totals.active_clients || 0) + Number(totals.recon_clients || 0) + Number(totals.pastdue_clients || 0)

  return (
    <div className="dashboard-v2">
      {errorMsg && <div className="empty-state"><p>{errorMsg}</p></div>}

      {!errorMsg && (
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
                  Collector Performance based on Collection Sheet for {data?.date_to || filters.date_to}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
                <label className="form-label">Date From</label>
                <input className="form-control" type="date" value={filters.date_from} onChange={e => setFilters(current => ({ ...current, date_from: e.target.value }))} />
              </div>
              <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
                <label className="form-label">Date To</label>
                <input className="form-control" type="date" value={filters.date_to} onChange={e => setFilters(current => ({ ...current, date_to: e.target.value }))} />
              </div>
              <button className="btn btn-primary" type="button" onClick={loadData} disabled={loading}>
                {loading ? 'Loading...' : 'Apply'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => window.print()} disabled={loading || !data}>
                <Printer size={16} /> Print Report
              </button>
              <button className="btn btn-success" type="button" onClick={() => window.print()} disabled={loading || !data}>
                <FileText size={16} /> Export PDF Manifest
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
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
                  const collectorTotal = Number(collector.active_clients || 0) + Number(collector.recon_clients || 0) + Number(collector.pastdue_clients || 0)
                  return (
                    <tr key={collector.id}>
                      <td style={{ fontWeight: 900, textTransform: 'uppercase' }}>{collector.name}</td>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{countFmt(collectorTotal)}</td>
                      <td style={{ textAlign: 'center', color: '#059669', fontWeight: 900 }}>{countFmt(collector.active_clients)}</td>
                      <td style={{ textAlign: 'center', color: '#1d4ed8', fontWeight: 900 }}>{countFmt(collector.recon_clients)}</td>
                      <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 900 }}>{countFmt(collector.pastdue_clients)}</td>
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
                    <td style={{ textAlign: 'center', color: '#059669', fontWeight: 900 }}>{countFmt(totals.active_clients)}</td>
                    <td style={{ textAlign: 'center', color: '#1d4ed8', fontWeight: 900 }}>{countFmt(totals.recon_clients)}</td>
                    <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 900 }}>{countFmt(totals.pastdue_clients)}</td>
                    <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 900 }}>PHP {fmt(totals.target)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
