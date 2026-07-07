import { useEffect, useRef, useState } from 'react'
import API from '../services/api'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const toDateInputValue = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const yesterday = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toDateInputValue(d)
}
const displayDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '-'
const getMonthRange = (year, month) => {
  const y = Number(year)
  const m = Number(month)
  const firstDay = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = toDateInputValue(new Date(y, m, 0))
  return { date_from: firstDay, date_to: lastDay }
}
const getMonthCycles = year => Array.from({ length: 12 }, (_, i) => {
  const month = i + 1
  const range = getMonthRange(year, month)
  const label = new Date(Number(year), i).toLocaleString('default', { month: 'long', year: 'numeric' })
  return {
    key: String(month),
    label,
    rangeLabel: `${displayDate(range.date_from)} to ${displayDate(range.date_to)}`,
    ...range,
  }
})
const get45DayCycles = year => {
  const y = Number(year)
  const last = month => String(new Date(y, month, 0).getDate()).padStart(2, '0')
  return [
    { key: 'jan-feb', label: 'Jan 01 - Feb 15', date_from: `${y}-01-01`, date_to: `${y}-02-15` },
    { key: 'feb-mar', label: 'Feb 16 - Mar 31', date_from: `${y}-02-16`, date_to: `${y}-03-31` },
    { key: 'apr-may', label: 'Apr 01 - May 15', date_from: `${y}-04-01`, date_to: `${y}-05-15` },
    { key: 'may-jun', label: `May 16 - Jun ${last(6)}`, date_from: `${y}-05-16`, date_to: `${y}-06-${last(6)}` },
    { key: 'jul-aug', label: 'Jul 01 - Aug 15', date_from: `${y}-07-01`, date_to: `${y}-08-15` },
    { key: 'aug-sep', label: `Aug 16 - Sep ${last(9)}`, date_from: `${y}-08-16`, date_to: `${y}-09-${last(9)}` },
    { key: 'oct-nov', label: 'Oct 01 - Nov 15', date_from: `${y}-10-01`, date_to: `${y}-11-15` },
    { key: 'nov-dec', label: 'Nov 16 - Dec 31', date_from: `${y}-11-16`, date_to: `${y}-12-31` },
  ].map(cycle => ({
    ...cycle,
    label: `${cycle.label}, ${y}`,
    rangeLabel: `${displayDate(cycle.date_from)} to ${displayDate(cycle.date_to)}`,
  }))
}
const getMonthlyCollectionPeriods = params => {
  if (params.collection_cycle_type === '45') {
    const cycles = get45DayCycles(params.year)
    if (params.collection_cycle === 'all') return cycles
    return cycles.filter(cycle => cycle.key === params.collection_cycle)
  }
  const months = getMonthCycles(params.year)
  return months
}
const getMonthlyReleasePeriods = params => {
  if (params.release_cycle_type === '45') {
    const cycles = get45DayCycles(params.year)
    if (params.release_cycle === 'all') return cycles
    return cycles.filter(cycle => cycle.key === params.release_cycle)
  }
  return getMonthCycles(params.year)
}
const getMonthlyCollectionRange = params => {
  const periods = getMonthlyCollectionPeriods(params)
  const fallback = getMonthCycles(params.year)[0]
  return {
    date_from: (periods[0] || fallback).date_from,
    date_to: (periods[periods.length - 1] || fallback).date_to,
  }
}
const getMonthlyReleaseRange = params => {
  const periods = getMonthlyReleasePeriods(params)
  const fallback = getMonthCycles(params.year)[0]
  return {
    date_from: (periods[0] || fallback).date_from,
    date_to: (periods[periods.length - 1] || fallback).date_to,
  }
}
const getCollectorRows = payments => Object.entries(payments.reduce((acc, p) => {
  const name = p.collector_name || 'Unassigned'
  if (!acc[name]) acc[name] = { collector: name, payment_count: 0, total_amount: 0, payments: [] }
  acc[name].payment_count += 1
  acc[name].total_amount += Number(p.amount_paid || 0)
  acc[name].payments.push(p)
  return acc
}, {}))
  .map(([, row]) => ({ ...row, payments: row.payments.sort((a, b) => String(a.date_paid || '').localeCompare(String(b.date_paid || '')) || String(a.customer_name || '').localeCompare(String(b.customer_name || ''))) }))
  .sort((a, b) => a.collector.localeCompare(b.collector))

const getReleaseCollectorRows = loans => Object.entries(loans.reduce((acc, l) => {
  const name = l.collector_name || 'Unassigned'
  if (!acc[name]) {
    acc[name] = { 
      collector: name, 
      loan_count: 0, 
      total_principal: 0, 
      new_count: 0,
      new_amount: 0,
      reloan_count: 0,
      reloan_amount: 0,
      recon_count: 0,
      recon_amount: 0,
      loans: [] 
    }
  }
  
  const type = (l.loan_type || '').toLowerCase();
  
  if (type.includes('reloan') || type.includes('re-loan')) {
    acc[name].reloan_count += 1;
    acc[name].reloan_amount += Number(l.principal || 0);
  } else if (type.includes('recon')) {
    acc[name].recon_count += 1;
    acc[name].recon_amount += Number(l.principal || 0);
  } else {
    acc[name].new_count += 1;
    acc[name].new_amount += Number(l.principal || 0);
  }

  acc[name].loan_count += 1
  acc[name].total_principal += Number(l.principal || 0)
  acc[name].loans.push(l)
  return acc
}, {}))
  .map(([, row]) => ({ ...row, loans: row.loans.sort((a, b) => String(a.date_released || '').localeCompare(String(b.date_released || '')) || String(a.customer_name || '').localeCompare(String(b.customer_name || ''))) }))
  .sort((a, b) => a.collector.localeCompare(b.collector))

const getMaturityCollectorRows = loans => Object.entries(loans.reduce((acc, l) => {
  const name = l.collector_name || 'Unassigned'
  if (!acc[name]) {
    acc[name] = {
      collector: name,
      clientIds: new Set(),
      client_count: 0,
      total_principal: 0,
      total_interest: 0,
      total_loan_amount: 0,
      total_balance: 0,
      loans: []
    }
  }

  const clientKey = l.customer_id || l.customer_code || l.customer_name || l.id
  acc[name].clientIds.add(clientKey)
  acc[name].total_principal += Number(l.principal || 0)
  acc[name].total_interest += Number(l.interest_amount || 0)
  acc[name].total_loan_amount += Number(l.principal || 0) + Number(l.interest_amount || 0)
  acc[name].total_balance += Number(l.balance || 0)
  acc[name].loans.push(l)
  return acc
}, {}))
  .map(([, row]) => ({
    ...row,
    client_count: row.clientIds.size,
    loans: row.loans.sort((a, b) => String(a.date_maturity || '').localeCompare(String(b.date_maturity || '')) || String(a.customer_name || '').localeCompare(String(b.customer_name || '')))
  }))
  .sort((a, b) => a.collector.localeCompare(b.collector))

const getMonthlyCollectionMatrix = (payments, params) => {
  const periods = getMonthlyCollectionPeriods(params)
  const rowsByCollector = {}
  const periodTotals = periods.reduce((acc, period) => ({ ...acc, [period.key]: { amount: 0, payment_count: 0, payments: [] } }), {})

  payments.forEach(payment => {
    const period = periods.find(item => String(payment.date_paid || '') >= item.date_from && String(payment.date_paid || '') <= item.date_to)
    if (!period) return

    const collector = payment.collector_name || 'Unassigned'
    if (!rowsByCollector[collector]) {
      rowsByCollector[collector] = {
        collector,
        total_amount: 0,
        payment_count: 0,
        periods: periods.reduce((acc, item) => ({ ...acc, [item.key]: { amount: 0, payment_count: 0, payments: [] } }), {}),
      }
    }

    const amount = Number(payment.amount_paid || 0)
    rowsByCollector[collector].periods[period.key].amount += amount
    rowsByCollector[collector].periods[period.key].payment_count += 1
    rowsByCollector[collector].periods[period.key].payments.push(payment)
    rowsByCollector[collector].total_amount += amount
    rowsByCollector[collector].payment_count += 1
    
    periodTotals[period.key].amount += amount
    periodTotals[period.key].payment_count += 1
    periodTotals[period.key].payments.push(payment)
  })

  return {
    periods,
    rows: Object.values(rowsByCollector).sort((a, b) => a.collector.localeCompare(b.collector)),
    periodTotals,
  }
}
const getMonthlyReleaseMatrix = (loans, params) => {
  const periods = getMonthlyReleasePeriods(params)
  const rowsByCollector = {}
  const periodTotals = periods.reduce((acc, period) => ({ ...acc, [period.key]: { amount: 0, loan_count: 0, loans: [] } }), {})

  loans.forEach(loan => {
    const period = periods.find(item => String(loan.date_released || '') >= item.date_from && String(loan.date_released || '') <= item.date_to)
    if (!period) return

    const collector = loan.collector_name || 'Unassigned'
    if (!rowsByCollector[collector]) {
      rowsByCollector[collector] = {
        collector,
        total_amount: 0,
        loan_count: 0,
        periods: periods.reduce((acc, item) => ({ ...acc, [item.key]: { amount: 0, loan_count: 0, loans: [] } }), {}),
      }
    }

    const amount = Number(loan.principal || 0)
    rowsByCollector[collector].periods[period.key].amount += amount
    rowsByCollector[collector].periods[period.key].loan_count += 1
    rowsByCollector[collector].periods[period.key].loans.push(loan)
    rowsByCollector[collector].total_amount += amount
    rowsByCollector[collector].loan_count += 1

    periodTotals[period.key].amount += amount
    periodTotals[period.key].loan_count += 1
    periodTotals[period.key].loans.push(loan)
  })

  return {
    periods,
    rows: Object.values(rowsByCollector).sort((a, b) => a.collector.localeCompare(b.collector)),
    periodTotals,
  }
}

const REPORT_TYPES = [
  { key: 'collection-report', label: '📅 Collection Report', desc: 'Daily and monthly collections' },
  { key: 'monthly-releases', label: '🚀 Releases Report', desc: 'Daily and monthly releases' },
  { key: 'past-due', label: '⚠️ Loans Maturity Checker', desc: 'Loans by maturity date range' },
  { key: 'payments-encoded', label: '💳 Payments Encoded', desc: 'Payments encoded by date range' },
  { key: 'payments-reversed', label: '↩️ Payments Reversed', desc: 'Reversed payments by date range' },
  { key: 'maturity-check', label: '📆 Maturity Checker', desc: 'Loans maturing soon' },
  { key: 'full-paid', label: '✅ Full Paid Loans', desc: 'Fully paid loan accounts' },
  { key: 'loan-type', label: '📊 Loan Type Summary', desc: 'Summary by loan type and status' },
  { key: 'collection-sheet', label: '📋 Collection Sheet', desc: 'Per-collector active loan list' },
  { key: 'monitoring-summary', label: '🚨 Monitoring Summary', desc: 'Alerts, escalations, PTPs, and resolutions' },
]

export default function Reports() {
  const autoLoaded = useRef(false)
  const [active, setActive] = useState('collection-report')
  const [collectionSubTab, setCollectionSubTab] = useState('daily')
  const [releaseSubTab, setReleaseSubTab] = useState('daily')
  const [monthlySubTab, setMonthlySubTab] = useState('by-collector')
  const [releaseMonthlySubTab, setReleaseMonthlySubTab] = useState('by-collector')
  const [params, setParams] = useState({ date_from: yesterday(), date_to: yesterday(), year: new Date().getFullYear(), month: new Date().getMonth() + 1, collection_month: 'all', collection_cycle_type: '30', collection_cycle: 'all', release_cycle_type: '30', release_cycle: 'all', days_ahead: 30, collector_id: '' })
  const [collectors, setCollectors] = useState([])
  const [collectorsLoaded, setCollectorsLoaded] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedCollector, setSelectedCollector] = useState(null)

  const loadCollectors = () => {
    if (!collectorsLoaded) {
      API.get('/collectors').then(r => { setCollectors(r.data); setCollectorsLoaded(true) })
    }
  }

  const handleSelect = (key) => {
    setActive(key); setData(null); setSelectedCollector(null)
    if (key === 'collection-report') {
      const defaultDate = yesterday()
      const nextParams = { ...params, date_from: defaultDate, date_to: defaultDate }
      setParams(nextParams)
      setCollectionSubTab('daily')
      run(key, nextParams, 'daily')
    }
    if (key === 'monthly-releases') {
      const defaultDate = yesterday()
      const nextParams = { ...params, date_from: defaultDate, date_to: defaultDate }
      setParams(nextParams)
      setReleaseSubTab('daily')
      run(key, nextParams, 'daily')
    }
    if (key === 'collection-sheet') loadCollectors()
  }

  const run = async (reportKey = active, reportParams = params, subTab = collectionSubTab) => {
    setLoading(true); setData(null); setSelectedCollector(null)
    try {
      let endpoint = reportKey
      let finalParams = reportParams
      if (reportKey === 'collection-report') {
        endpoint = 'daily-collection'
        if (subTab === 'monthly') {
          const range = getMonthlyCollectionRange(finalParams)
          finalParams = { ...finalParams, date_from: range.date_from, date_to: range.date_to }
        }
      }
      if (reportKey === 'monthly-releases') {
        endpoint = 'release-report'
        if (subTab === 'monthly') {
          const range = getMonthlyReleaseRange(finalParams)
          finalParams = { ...finalParams, date_from: range.date_from, date_to: range.date_to }
        }
      }
      const r = await API.get(`/reports/${endpoint}`, { params: finalParams })
      setData(r.data)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (autoLoaded.current) return
    autoLoaded.current = true
    run('collection-report', params, 'daily')
  }, [])

  const renderSubTabs = () => {
    if (active === 'collection-report') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn ${collectionSubTab === 'daily' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setCollectionSubTab('daily'); setData(null); }}>Daily Collection</button>
            <button className={`btn ${collectionSubTab === 'monthly' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setCollectionSubTab('monthly'); setData(null); }}>Monthly Collection</button>
          </div>
          {collectionSubTab === 'monthly' && (
            <div style={{ display: 'flex', gap: 8, paddingLeft: 4 }}>
              <button className={`btn ${monthlySubTab === 'by-collector' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setMonthlySubTab('by-collector')} style={{ padding: '4px 12px', fontSize: 13 }}>By Collector</button>
              <button className={`btn ${monthlySubTab === 'overall' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setMonthlySubTab('overall')} style={{ padding: '4px 12px', fontSize: 13 }}>Overall</button>
            </div>
          )}
        </div>
      )
    }
    if (active === 'monthly-releases') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn ${releaseSubTab === 'daily' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setReleaseSubTab('daily'); setData(null); }}>Daily Releases</button>
            <button className={`btn ${releaseSubTab === 'monthly' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setReleaseSubTab('monthly'); setData(null); }}>Monthly Releases</button>
          </div>
          {releaseSubTab === 'monthly' && (
            <div style={{ display: 'flex', gap: 8, paddingLeft: 4 }}>
              <button className={`btn ${releaseMonthlySubTab === 'by-collector' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setReleaseMonthlySubTab('by-collector')} style={{ padding: '4px 12px', fontSize: 13 }}>By Collector</button>
              <button className={`btn ${releaseMonthlySubTab === 'overall' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setReleaseMonthlySubTab('overall')} style={{ padding: '4px 12px', fontSize: 13 }}>Overall</button>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  const renderParams = () => {
    if (active === 'collection-report') {
      if (collectionSubTab === 'daily') {
        return (
          <>
            <div className="form-group"><label className="form-label">Date From</label><input type="date" className="form-control" value={params.date_from} onChange={e => setParams(p => ({ ...p, date_from: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Date To</label><input type="date" className="form-control" value={params.date_to} onChange={e => setParams(p => ({ ...p, date_to: e.target.value }))} /></div>
          </>
        )
      } else {
        const cycle45Options = get45DayCycles(params.year)
        const runMonthlyFilter = nextParams => {
          setParams(nextParams)
          run('collection-report', nextParams, 'monthly')
        }
        return (
          <>
            <div className="form-group"><label className="form-label">Year</label><input type="number" className="form-control" style={{ width: 100 }} value={params.year} onChange={e => setParams(p => ({ ...p, year: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Cycle Type</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={`btn ${params.collection_cycle_type === '30' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => runMonthlyFilter({ ...params, collection_cycle_type: '30', collection_month: 'all' })}>30 days / By Month</button>
                <button type="button" className={`btn ${params.collection_cycle_type === '45' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => runMonthlyFilter({ ...params, collection_cycle_type: '45', collection_cycle: 'all' })}>45 days / 1.5 Month</button>
              </div>
            </div>
            {params.collection_cycle_type === '45' ? (
              <div className="form-group"><label className="form-label">45-Day Cycle</label>
                <select className="form-control" value={params.collection_cycle} onChange={e => runMonthlyFilter({ ...params, collection_cycle: e.target.value })} style={{ minWidth: 230 }}>
                  <option value="all">All 45-Day Cycles</option>
                  {cycle45Options.map(cycle => <option key={cycle.key} value={cycle.key}>{cycle.label}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group"><label className="form-label">30-Day Cycle</label>
                <div className="form-control" style={{ minWidth: 180, display: 'flex', alignItems: 'center' }}>All Months</div>
              </div>
            )}
          </>
        )
      }
    }
    if (['past-due', 'payments-encoded', 'payments-reversed', 'full-paid'].includes(active)) return (
      <>
        <div className="form-group"><label className="form-label">Date From</label><input type="date" className="form-control" value={params.date_from} onChange={e => setParams(p => ({ ...p, date_from: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Date To</label><input type="date" className="form-control" value={params.date_to} onChange={e => setParams(p => ({ ...p, date_to: e.target.value }))} /></div>
      </>
    )
    if (active === 'monthly-releases') return (
      releaseSubTab === 'daily' ? (
        <>
          <div className="form-group"><label className="form-label">Date From</label><input type="date" className="form-control" value={params.date_from} onChange={e => setParams(p => ({ ...p, date_from: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Date To</label><input type="date" className="form-control" value={params.date_to} onChange={e => setParams(p => ({ ...p, date_to: e.target.value }))} /></div>
        </>
      ) : (
        <>
          <div className="form-group"><label className="form-label">Year</label><input type="number" className="form-control" style={{ width: 100 }} value={params.year} onChange={e => setParams(p => ({ ...p, year: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Cycle Type</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={`btn ${params.release_cycle_type === '30' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { const next = { ...params, release_cycle_type: '30' }; setParams(next); run('monthly-releases', next, 'monthly') }}>30 days / By Month</button>
              <button type="button" className={`btn ${params.release_cycle_type === '45' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { const next = { ...params, release_cycle_type: '45', release_cycle: 'all' }; setParams(next); run('monthly-releases', next, 'monthly') }}>45 days / 1.5 Month</button>
            </div>
          </div>
          {params.release_cycle_type === '45' ? (
            <div className="form-group"><label className="form-label">45-Day Cycle</label>
              <select className="form-control" value={params.release_cycle} onChange={e => { const next = { ...params, release_cycle: e.target.value }; setParams(next); run('monthly-releases', next, 'monthly') }} style={{ minWidth: 230 }}>
                <option value="all">All 45-Day Cycles</option>
                {get45DayCycles(params.year).map(cycle => <option key={cycle.key} value={cycle.key}>{cycle.label}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group"><label className="form-label">30-Day Cycle</label>
              <div className="form-control" style={{ minWidth: 180, display: 'flex', alignItems: 'center' }}>All Months</div>
            </div>
          )}
        </>
      )
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

    if (active === 'collection-report') {
      const { payments = [], total } = data
      const reportFrom = data.date_from || params.date_from
      const reportTo = data.date_to || params.date_to
      if (collectionSubTab === 'monthly') {
        const matrix = getMonthlyCollectionMatrix(payments, params)
        return (
          <div>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--blue-dark)', fontWeight: 700 }}>
                  {params.collection_cycle_type === '45' ? 'Monthly Collection - 45 Days / 1.5 Month' : 'Monthly Collection - 30 Days / By Month'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  {displayDate(reportFrom)} to {displayDate(reportTo)}
                </div>
              </div>
              <div className="fw-bold text-success">Grand Total: ₱ {fmt(total)}</div>
            </div>
            {monthlySubTab === 'overall' && (
              <div style={{ marginBottom: 20, height: 350, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 16px 0 0' }}>
                {matrix.periods.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={matrix.periods.map(p => ({ name: p.label, amount: matrix.periodTotals[p.key]?.amount || 0 }))} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barGradientMonthly" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                        formatter={(val) => [`₱ ${fmt(val)}`, 'Total Collected']} 
                        labelStyle={{ color: '#0f172a', fontWeight: 700, marginBottom: 6, fontSize: 13 }} 
                      />
                      <Bar dataKey="amount" fill="url(#barGradientMonthly)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">No data for chart</div>
                )}
              </div>
            )}
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="data-table" style={{ minWidth: Math.max(760, 220 + matrix.periods.length * 150 + 150) }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>{monthlySubTab === 'by-collector' ? 'Collector' : 'Summary'}</th>
                    {matrix.periods.map(period => (
                      <th key={period.key} className="text-right" title={period.rangeLabel} style={{ minWidth: 150 }}>
                        <div>{period.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>{period.rangeLabel}</div>
                      </th>
                    ))}
                    <th className="text-right" style={{ minWidth: 150 }}>Total Collection</th>
                  </tr>
                </thead>
                {monthlySubTab === 'by-collector' ? (
                  <>
                    <tbody>
                      {matrix.rows.length === 0 ? (
                        <tr><td colSpan={matrix.periods.length + 2} className="empty-state">No records</td></tr>
                      ) : matrix.rows.map(row => (
                        <tr key={row.collector}>
                          <td className="fw-600">{row.collector}</td>
                          {matrix.periods.map(period => {
                            const cell = row.periods[period.key]
                            return (
                              <td
                                key={`${row.collector}-${period.key}`}
                                className="text-right"
                                onClick={() => cell.payment_count > 0 && setSelectedCollector({ collector: `${row.collector} - ${period.label}`, payment_count: cell.payment_count, total_amount: cell.amount, payments: cell.payments })}
                                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && cell.payment_count > 0) setSelectedCollector({ collector: `${row.collector} - ${period.label}`, payment_count: cell.payment_count, total_amount: cell.amount, payments: cell.payments }) }}
                                tabIndex={cell.payment_count > 0 ? 0 : undefined}
                                title={cell.payment_count > 0 ? 'View collection details' : ''}
                                style={{ cursor: cell.payment_count > 0 ? 'pointer' : 'default' }}
                              >
                                {cell.amount > 0 ? <span className="text-success fw-bold">₱ {fmt(cell.amount)}</span> : '-'}
                              </td>
                            )
                          })}
                          <td className="text-right text-success fw-bold">₱ {fmt(row.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {matrix.rows.length > 0 && (
                      <tfoot>
                        <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                          <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                          {matrix.periods.map(period => (
                            <td key={`total-${period.key}`} className="text-right text-success fw-bold">₱ {fmt(matrix.periodTotals[period.key].amount)}</td>
                          ))}
                          <td className="text-right text-success fw-bold">₱ {fmt(total)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </>
                ) : (
                  <tbody>
                    {matrix.rows.length === 0 ? (
                      <tr><td colSpan={matrix.periods.length + 2} className="empty-state">No records</td></tr>
                    ) : (
                      <tr>
                        <td className="fw-600">Overall Total</td>
                        {matrix.periods.map(period => {
                          const cell = matrix.periodTotals[period.key]
                          return (
                            <td
                              key={`overall-${period.key}`}
                              className="text-right"
                              onClick={() => cell.payment_count > 0 && setSelectedCollector({ collector: `Overall - ${period.label}`, payment_count: cell.payment_count, total_amount: cell.amount, payments: cell.payments })}
                              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && cell.payment_count > 0) setSelectedCollector({ collector: `Overall - ${period.label}`, payment_count: cell.payment_count, total_amount: cell.amount, payments: cell.payments }) }}
                              tabIndex={cell.payment_count > 0 ? 0 : undefined}
                              title={cell.payment_count > 0 ? 'View collection details' : ''}
                              style={{ cursor: cell.payment_count > 0 ? 'pointer' : 'default' }}
                            >
                              {cell.amount > 0 ? <span className="text-success fw-bold">₱ {fmt(cell.amount)}</span> : '-'}
                            </td>
                          )
                        })}
                        <td className="text-right text-success fw-bold">₱ {fmt(total)}</td>
                      </tr>
                    )}
                  </tbody>
                )}
              </table>
            </div>
          </div>
        )
      }

      let transactionLabel
      transactionLabel = reportFrom === reportTo
        ? `Transaction Date: ${displayDate(reportFrom)}`
        : `Transaction Period: ${displayDate(reportFrom)} to ${displayDate(reportTo)}`
      
      const collectorTotals = payments.reduce((acc, p) => {
        const name = (p.collector_name || '').trim() || 'Unassigned';
        if (!acc[name]) acc[name] = 0;
        acc[name] += p.amount_paid;
        return acc;
      }, {});
      const collectorRows = getCollectorRows(payments)
      const chartData = Object.entries(collectorTotals).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);

      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ marginBottom: 6, color: 'var(--blue-dark)', fontWeight: 700 }}>{transactionLabel}</div>
            <div style={{ marginBottom: 12 }} className="fw-bold text-success">Total Collections: ₱ {fmt(total)}</div>
            <table className="data-table">
              <thead><tr><th>Collector</th><th className="text-right">No. of Payments</th><th className="text-right">Total Collection</th></tr></thead>
              <tbody>{collectorRows.length === 0 ? <tr><td colSpan={3} className="empty-state">No records</td></tr> : collectorRows.map(row => <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View collection details" style={{ cursor: 'pointer' }}><td className="fw-600">{row.collector}</td><td className="text-right">{row.payment_count}</td><td className="text-right text-success fw-bold">₱ {fmt(row.total_amount)}</td></tr>)}</tbody>
              {collectorRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                    <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                    <td className="text-right fw-bold">{collectorRows.reduce((sum, r) => sum + r.payment_count, 0)}</td>
                    <td className="text-right text-success fw-bold" style={{ fontSize: '14px' }}>₱ {fmt(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div>
            <div style={{ marginBottom: 12 }} className="fw-bold">Collection per Collector</div>
            <div style={{ height: 400, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.6}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                      formatter={(val) => [`₱ ${fmt(val)}`, 'Total Collected']} 
                      labelStyle={{ color: '#0f172a', fontWeight: 700, marginBottom: 6, fontSize: 13 }} 
                    />
                    <Bar dataKey="amount" fill="url(#barGradient)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1000} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">No data for chart</div>
              )}
            </div>
          </div>
        </div>
      )
    }

    if (active === 'monitoring-summary') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card-v2" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 15px 0' }}>🚨 3-Day Monitoring Overview</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ color: 'var(--text-muted)' }}>Active Clients Monitored Today</span>
                <strong style={{ fontSize: 16 }}>{data.activeClientsMonitoredToday}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ color: 'var(--text-muted)' }}>Escalated Accounts (Day 4+)</span>
                <strong style={{ fontSize: 16, color: '#ef4444' }}>{data.escalatedAccounts}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ color: 'var(--text-muted)' }}>Resolved Accounts</span>
                <strong style={{ fontSize: 16, color: '#10b981' }}>{data.resolvedAccounts}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ color: 'var(--text-muted)' }}>Clients Approaching Day 3 (Pre-alert)</span>
                <strong style={{ fontSize: 16, color: '#f59e0b' }}>{data.clientsApproachingDay3}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <span style={{ color: 'var(--text-muted)' }}>Chronic Missed Payments (3+ times)</span>
                <strong style={{ fontSize: 16, color: '#b91c1c' }}>{data.chronicMissedPayments}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Unresolved Alerts Over 7 Days</span>
                <strong style={{ fontSize: 16, color: '#7f1d1d' }}>{data.unresolvedOver7Days}</strong>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card-v2" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 15px 0' }}>🤝 PTP & Follow-Ups</h3>
              <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ flex: 1, textAlign: 'center', padding: 15, background: '#f0fdf4', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#15803d' }}>Follow-Up Success Rate</div>
                  <strong style={{ fontSize: 24, color: '#16a34a' }}>{data.collectorPerformance}</strong>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: 15, background: '#f8fafc', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending PTPs</div>
                  <strong style={{ fontSize: 24 }}>{data.summaryPTP?.c || 0}</strong>
                  <div style={{ fontSize: 12, color: '#10b981' }}>₱ {fmt(data.summaryPTP?.total || 0)}</div>
                </div>
              </div>
            </div>
            
            <div className="card-v2" style={{ padding: 20, flex: 1 }}>
              <h3 style={{ margin: '0 0 15px 0' }}>📝 Recent Follow-Up Logs</h3>
              {data.followUpLogs && data.followUpLogs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.followUpLogs.map(log => (
                    <div key={log.id} style={{ fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                      <strong>{new Date(log.created_at).toLocaleDateString()}</strong> - {log.follow_up_method} <br/>
                      <span style={{ color: log.contact_result === 'Promised to Pay' ? '#10b981' : '#64748b' }}>Result: {log.contact_result}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="empty-state">No recent logs</div>}
            </div>
          </div>
        </div>
      )
    }

    if (active === 'monthly-releases') {
      const { loans = [], total_principal } = data
      const reportFrom = data.date_from || params.date_from
      const reportTo = data.date_to || params.date_to

      if (releaseSubTab === 'monthly') {
        const matrix = getMonthlyReleaseMatrix(loans, params)
        return (
          <div>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--blue-dark)', fontWeight: 700 }}>
                  {params.release_cycle_type === '45' ? 'Monthly Releases - 45 Days / 1.5 Month' : 'Monthly Releases - 30 Days / By Month'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  {displayDate(reportFrom)} to {displayDate(reportTo)}
                </div>
              </div>
              <div className="fw-bold text-success">Grand Total: ₱ {fmt(total_principal)}</div>
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="data-table" style={{ minWidth: Math.max(760, 220 + matrix.periods.length * 150 + 150) }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>{releaseMonthlySubTab === 'by-collector' ? 'Collector' : 'Summary'}</th>
                    {matrix.periods.map(period => (
                      <th key={period.key} className="text-right" title={period.rangeLabel} style={{ minWidth: 150 }}>
                        <div>{period.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>{period.rangeLabel}</div>
                      </th>
                    ))}
                    <th className="text-right" style={{ minWidth: 150 }}>Total Release Amount</th>
                  </tr>
                </thead>
                {releaseMonthlySubTab === 'by-collector' ? (
                  <>
                    <tbody>
                      {matrix.rows.length === 0 ? (
                        <tr><td colSpan={matrix.periods.length + 2} className="empty-state">No records</td></tr>
                      ) : matrix.rows.map(row => (
                        <tr key={row.collector}>
                          <td className="fw-600">{row.collector}</td>
                          {matrix.periods.map(period => {
                            const cell = row.periods[period.key]
                            return <td key={`${row.collector}-${period.key}`} className="text-right">{cell.amount > 0 ? <span className="text-success fw-bold">₱ {fmt(cell.amount)}</span> : '-'}</td>
                          })}
                          <td className="text-right text-success fw-bold">₱ {fmt(row.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {matrix.rows.length > 0 && (
                      <tfoot>
                        <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                          <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                          {matrix.periods.map(period => (
                            <td key={`release-total-${period.key}`} className="text-right text-success fw-bold">₱ {fmt(matrix.periodTotals[period.key].amount)}</td>
                          ))}
                          <td className="text-right text-success fw-bold">₱ {fmt(total_principal)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </>
                ) : (
                  <tbody>
                    {matrix.rows.length === 0 ? (
                      <tr><td colSpan={matrix.periods.length + 2} className="empty-state">No records</td></tr>
                    ) : (
                      <tr>
                        <td className="fw-600">Overall Total</td>
                        {matrix.periods.map(period => {
                          const cell = matrix.periodTotals[period.key]
                          return <td key={`release-overall-${period.key}`} className="text-right">{cell.amount > 0 ? <span className="text-success fw-bold">₱ {fmt(cell.amount)}</span> : '-'}</td>
                        })}
                        <td className="text-right text-success fw-bold">₱ {fmt(total_principal)}</td>
                      </tr>
                    )}
                  </tbody>
                )}
              </table>
            </div>
          </div>
        )
      }

      let transactionLabel = reportFrom === reportTo
        ? `Release Date: ${displayDate(reportFrom)}`
        : `Release Period: ${displayDate(reportFrom)} to ${displayDate(reportTo)}`
      
      const collectorTotals = loans.reduce((acc, l) => {
        const name = (l.collector_name || '').trim() || 'Unassigned';
        if (!acc[name]) acc[name] = 0;
        acc[name] += Number(l.principal || 0);
        return acc;
      }, {});
      const collectorRows = getReleaseCollectorRows(loans)
      const chartData = Object.entries(collectorTotals).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);

      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ marginBottom: 6, color: 'var(--blue-dark)', fontWeight: 700 }}>{transactionLabel}</div>
            <div style={{ marginBottom: 12 }} className="fw-bold text-accent">Total Released: ₱ {fmt(total_principal)}</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>Collector</th>
                  <th className="text-right" style={{ borderBottom: '1px solid var(--border)' }}>New</th>
                  <th className="text-right" style={{ borderBottom: '1px solid var(--border)' }}>Reloan</th>
                  <th className="text-right" style={{ borderBottom: '1px solid var(--border)' }}>Recon</th>
                  <th className="text-right" style={{ borderBottom: '1px solid var(--border)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {collectorRows.length === 0 ? <tr><td colSpan={5} className="empty-state">No records</td></tr> : collectorRows.map(row => (
                  <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View release details" style={{ cursor: 'pointer' }}>
                    <td className="fw-600" style={{ verticalAlign: 'middle' }}>{row.collector}</td>
                    <td className="text-right">
                      {row.new_amount > 0 ? (
                        <>
                          <div className="fw-600">₱ {fmt(row.new_amount)}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.new_count} {row.new_count > 1 ? 'Clients' : 'Client'}</div>
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-right">
                      {row.reloan_amount > 0 ? (
                        <>
                          <div className="fw-600">₱ {fmt(row.reloan_amount)}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.reloan_count} {row.reloan_count > 1 ? 'Clients' : 'Client'}</div>
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-right">
                      {row.recon_amount > 0 ? (
                        <>
                          <div className="fw-600">₱ {fmt(row.recon_amount)}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.recon_count} {row.recon_count > 1 ? 'Clients' : 'Client'}</div>
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-right" style={{ background: 'var(--bg-soft, #f8fafc)' }}>
                      {row.total_principal > 0 ? (
                        <>
                          <div className="fw-bold text-accent" style={{ fontSize: '13px' }}>₱ {fmt(row.total_principal)}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.loan_count} {row.loan_count > 1 ? 'Releases' : 'Release'}</div>
                        </>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {collectorRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                    <td className="fw-bold" style={{ color: 'var(--blue-dark)', verticalAlign: 'middle' }}>GRAND TOTAL</td>
                    <td className="text-right">
                      <div className="fw-bold">₱ {fmt(collectorRows.reduce((sum, r) => sum + r.new_amount, 0))}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{collectorRows.reduce((sum, r) => sum + r.new_count, 0)} Clients</div>
                    </td>
                    <td className="text-right">
                      <div className="fw-bold">₱ {fmt(collectorRows.reduce((sum, r) => sum + r.reloan_amount, 0))}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{collectorRows.reduce((sum, r) => sum + r.reloan_count, 0)} Clients</div>
                    </td>
                    <td className="text-right">
                      <div className="fw-bold">₱ {fmt(collectorRows.reduce((sum, r) => sum + r.recon_amount, 0))}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{collectorRows.reduce((sum, r) => sum + r.recon_count, 0)} Clients</div>
                    </td>
                    <td className="text-right text-accent">
                      <div className="fw-bold" style={{ fontSize: '14px' }}>₱ {fmt(total_principal)}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{collectorRows.reduce((sum, r) => sum + r.loan_count, 0)} Releases</div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div>
            <div style={{ marginBottom: 12 }} className="fw-bold">Releases per Collector</div>
            <div style={{ height: 400, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barGradientRelease" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#c4b5fd" stopOpacity={0.6}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(139, 92, 246, 0.08)' }} 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                      formatter={(val) => [`₱ ${fmt(val)}`, 'Total Released']} 
                      labelStyle={{ color: '#0f172a', fontWeight: 700, marginBottom: 6, fontSize: 13 }} 
                    />
                    <Bar dataKey="amount" fill="url(#barGradientRelease)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1000} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">No data for chart</div>
              )}
            </div>
          </div>
        </div>
      )
    }
    if (active === 'past-due') {
      const { loans = [] } = data
      const rows = getMaturityCollectorRows(loans)
      const totalClients = rows.reduce((sum, r) => sum + r.client_count, 0)
      const totalPrincipal = rows.reduce((sum, r) => sum + r.total_principal, 0)
      const totalInterest = rows.reduce((sum, r) => sum + r.total_interest, 0)
      const totalLoanAmount = rows.reduce((sum, r) => sum + r.total_loan_amount, 0)
      const reportFrom = data.date_from || params.date_from
      const reportTo = data.date_to || params.date_to
      const chartData = rows.map(r => ({ name: (r.collector || '').trim() || 'Unassigned', amount: r.total_loan_amount })).sort((a, b) => b.amount - a.amount)
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--blue-dark)', fontWeight: 700 }}>Loans Maturity Checker</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Maturity Date: {displayDate(reportFrom)} to {displayDate(reportTo)}</div>
              </div>
              <div className="fw-bold text-accent">Total Loan Amount: ₱ {fmt(totalLoanAmount)}</div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Collector</th>
                  <th className="text-right">No. of Client</th>
                  <th className="text-right">Principal</th>
                  <th className="text-right">Interest Amount</th>
                  <th className="text-right">Total Loan Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={5} className="empty-state">No loans found for the selected maturity date range</td></tr> : rows.map(row => (
                  <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View collector clients" style={{ cursor: 'pointer' }}>
                    <td className="fw-600">{row.collector}</td>
                    <td className="text-right fw-bold">{row.client_count}</td>
                    <td className="text-right">₱ {fmt(row.total_principal)}</td>
                    <td className="text-right">₱ {fmt(row.total_interest)}</td>
                    <td className="text-right fw-bold text-accent">₱ {fmt(row.total_loan_amount)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                    <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                    <td className="text-right fw-bold">{totalClients}</td>
                    <td className="text-right fw-bold">₱ {fmt(totalPrincipal)}</td>
                    <td className="text-right fw-bold">₱ {fmt(totalInterest)}</td>
                    <td className="text-right fw-bold text-accent">₱ {fmt(totalLoanAmount)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div>
            <div style={{ marginBottom: 12 }} className="fw-bold">Total Loan Amount per Collector</div>
            <div style={{ height: 400, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barGradientMaturity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#fcd34d" stopOpacity={0.6}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(245, 158, 11, 0.08)' }} 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                      formatter={(val) => [`₱ ${fmt(val)}`, 'Total Loan Amount']} 
                      labelStyle={{ color: '#0f172a', fontWeight: 700, marginBottom: 6, fontSize: 13 }} 
                    />
                    <Bar dataKey="amount" fill="url(#barGradientMaturity)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1000} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state">No data for chart</div>
              )}
            </div>
          </div>
        </div>
      )
    }
    if (['payments-encoded', 'payments-reversed'].includes(active)) {
      const records = data.data || []
      return <><div style={{ marginBottom: 12 }} className="fw-bold">{records.length} records {data.total != null ? `— Total: ₱ ${fmt(data.total)}` : ''}</div>
        <table className="data-table"><thead><tr><th>OR#</th><th>Customer</th><th>Loan#</th><th>Date</th><th className="text-right">Amount</th><th>By</th></tr></thead>
        <tbody>{records.length === 0 ? <tr><td colSpan={6} className="empty-state">No records</td></tr> : records.map(p => <tr key={p.id}><td className="mono">{p.or_number}</td><td>{p.customer_name}</td><td className="mono">{p.loan_code}</td><td>{p.date_paid}</td><td className="text-right">₱ {fmt(p.amount_paid)}</td><td>{p.encoded_by_name || p.reversed_by_name || '—'}</td></tr>)}</tbody></table></>
    }
    if (active === 'maturity-check') {
      const { loans = [] } = data
      return <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th>Contact</th><th className="text-right">Balance</th><th>Maturity</th><th>Days Left</th><th>Collector</th></tr></thead>
        <tbody>{loans.length === 0 ? <tr><td colSpan={7} className="empty-state">No loans maturing soon</td></tr> : loans.map(l => <tr key={l.id}><td className="mono">{l.loan_code}</td><td className="fw-600">{l.customer_name}</td><td>{l.contact || '—'}</td><td className="text-right">₱ {fmt(l.balance)}</td><td>{l.date_maturity}</td><td className={`fw-bold ${l.days_to_maturity <= 7 ? 'text-danger' : 'text-warning'}`}>{l.days_to_maturity} days</td><td>{l.collector_name || '—'}</td></tr>)}</tbody></table>
    }
    if (active === 'full-paid') {
      const loans = data || []
      return <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th className="text-right">Principal</th><th className="text-right">Total Paid</th><th>Collector</th><th>Released</th></tr></thead>
        <tbody>{loans.length === 0 ? <tr><td colSpan={6} className="empty-state">No full paid loans</td></tr> : loans.map(l => <tr key={l.id}><td className="mono">{l.loan_code}</td><td className="fw-600">{l.customer_name}</td><td className="text-right">₱ {fmt(l.principal)}</td><td className="text-right text-success">₱ {fmt(l.total_paid)}</td><td>{l.collector_name || '—'}</td><td>{l.date_released}</td></tr>)}</tbody></table>
    }
    if (active === 'loan-type') {
      const rows = data || []
      return <table className="data-table"><thead><tr><th>Type</th><th>Status</th><th>Count</th><th className="text-right">Total Principal</th><th className="text-right">Total Balance</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td><span className="tag">{r.loan_type}</span></td><td><span className={`badge badge-${r.status}`}>{r.status}</span></td><td className="fw-bold">{r.count}</td><td className="text-right">₱ {fmt(r.total_principal)}</td><td className="text-right">₱ {fmt(r.total_balance)}</td></tr>)}</tbody></table>
    }
    if (active === 'collection-sheet') {
      const { loans = [] } = data
      const collName = collectors.find(c => c.id == params.collector_id)
      return <>
        {collName && <div style={{ marginBottom: 12 }} className="fw-bold">Collector: {collName.first_name} {collName.last_name} — {loans.length} active loan(s)</div>}
        <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th>Address</th><th className="text-right">Principal</th><th className="text-right">Balance</th><th className="text-right">Amort.</th><th>Maturity</th><th>Status</th></tr></thead>
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
            {renderSubTabs()}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {renderParams()}
              <button id="btn-run-report" className="btn btn-primary" onClick={() => run(active, params, active === 'monthly-releases' ? releaseSubTab : collectionSubTab)} disabled={loading}>{loading ? '⏳ Running...' : '▶ Run Report'}</button>
              {data && <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Print</button>}
            </div>
          </div>
          <div className="card">
            <div className="table-wrapper">{renderResult()}</div>
          </div>
        </div>
      </div>
      {selectedCollector && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setSelectedCollector(null)}>
          <div className="modal" style={{ maxWidth: 980 }}>
            <div className="modal-header">
              <span className="modal-title">{active === 'monthly-releases' ? 'Release Details' : active === 'past-due' ? 'Maturity Details' : 'Collection Details'} - {selectedCollector.collector}</span>
              <button className="modal-close" onClick={() => setSelectedCollector(null)}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>Collector</div>
                  <div className="fw-bold">{selectedCollector.collector}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>{active === 'monthly-releases' ? 'No. of Releases' : active === 'past-due' ? 'No. of Client' : 'No. of Payments'}</div>
                  <div className="fw-bold">{active === 'monthly-releases' ? (selectedCollector.loan_count || selectedCollector.payment_count) : active === 'past-due' ? selectedCollector.client_count : selectedCollector.payment_count}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>{active === 'monthly-releases' ? 'Total Released' : active === 'past-due' ? 'Total Loan Amount' : 'Total Collection'}</div>
                  <div className="fw-bold text-success">₱ {fmt(active === 'past-due' ? selectedCollector.total_loan_amount : (selectedCollector.total_amount || selectedCollector.total_principal))}</div>
                </div>
              </div>
              <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
                <table className="data-table">
                  {active === 'monthly-releases' ? (
                    <>
                      <thead>
                        <tr><th>Client Code</th><th>Client</th><th>Loan#</th><th>Type</th><th className="text-right">Loan Amount</th><th className="text-right">Net Proceeds</th><th>Date Released</th></tr>
                      </thead>
                      <tbody>
                        {(selectedCollector.loans || selectedCollector.payments)?.length === 0 ? <tr><td colSpan={7} className="empty-state">No release details</td></tr> : (selectedCollector.loans || selectedCollector.payments)?.map(l => (
                          <tr key={l.id}>
                            <td className="mono">{l.customer_code || '-'}</td>
                            <td className="fw-600">{l.customer_name || '-'}</td>
                            <td className="mono">{l.loan_code || '-'}</td>
                            <td><span className="tag">{l.loan_type}</span></td>
                            <td className="text-right fw-bold">₱ {fmt(l.principal)}</td>
                            <td className="text-right">₱ {fmt(l.net_proceeds)}</td>
                            <td>{l.date_released}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : active === 'past-due' ? (
                    <>
                      <thead>
                        <tr><th>Client Code</th><th>Client</th><th>Loan#</th><th className="text-right">Principal</th><th className="text-right">Interest Amount</th><th className="text-right">Total Loan Amount</th><th className="text-right">Balance</th><th>Maturity</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {selectedCollector.loans?.length === 0 ? <tr><td colSpan={9} className="empty-state">No maturity details</td></tr> : selectedCollector.loans?.map(l => (
                          <tr key={l.id}>
                            <td className="mono">{l.customer_code || '-'}</td>
                            <td className="fw-600">{l.customer_name || '-'}</td>
                            <td className="mono">{l.loan_code || '-'}</td>
                            <td className="text-right">₱ {fmt(l.principal)}</td>
                            <td className="text-right">₱ {fmt(l.interest_amount)}</td>
                            <td className="text-right fw-bold text-accent">₱ {fmt(Number(l.principal || 0) + Number(l.interest_amount || 0))}</td>
                            <td className="text-right fw-bold">₱ {fmt(l.balance)}</td>
                            <td>{l.date_maturity || '-'}</td>
                            <td><span className={`badge badge-${l.status}`}>{l.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <thead>
                        <tr><th>Client Code</th><th>Date Paid</th><th>Client</th><th>OR#</th><th>Loan#</th><th className="text-right">Amount</th><th className="text-right">Bal. After</th></tr>
                      </thead>
                      <tbody>
                        {selectedCollector.payments?.length === 0 ? <tr><td colSpan={7} className="empty-state">No payment details</td></tr> : selectedCollector.payments?.map(p => (
                          <tr key={p.id}>
                            <td className="mono">{p.customer_code || '-'}</td>
                            <td>{p.date_paid}</td>
                            <td className="fw-600">{p.customer_name || '-'}</td>
                            <td className="mono">{p.or_number || '-'}</td>
                            <td className="mono">{p.loan_code || '-'}</td>
                            <td className="text-right text-success fw-bold">₱ {fmt(p.amount_paid)}</td>
                            <td className="text-right">₱ {fmt(p.balance_after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
