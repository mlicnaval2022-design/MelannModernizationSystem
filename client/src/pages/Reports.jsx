import { useEffect, useRef, useState } from 'react'
import API from '../services/api'
import logoImg from '../assets/logo.png'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
const fmt = n => Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })
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
  const [printMode, setPrintMode] = useState('detailed')

  const handlePrint = (mode) => {
    setPrintMode(mode)
    setTimeout(() => {
      window.print()
    }, 100)
  }

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
    if (key === 'loan-type') {
      const defaultDate = yesterday()
      const nextParams = { ...params, date_from: defaultDate, date_to: defaultDate }
      setParams(nextParams)
      run(key, nextParams)
    }
    if (key === 'collection-sheet') { loadCollectors(); setParams(p => ({ ...p, date: toDateInputValue(new Date()) })) }
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
    if (['past-due', 'payments-encoded', 'payments-reversed', 'full-paid', 'loan-type'].includes(active)) return (
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
      <>
        <div className="form-group"><label className="form-label">Collector *</label>
          <select className="form-control" value={params.collector_id} onChange={e => { const nextParams = { ...params, collector_id: e.target.value }; setParams(nextParams); if (e.target.value) run(active, nextParams); }} style={{ minWidth: 220 }}>
            <option value="">Select collector...</option>
            {collectors.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Collection Date</label>
          <input type="date" className="form-control" value={params.date || toDateInputValue(new Date())} onChange={e => { const nextParams = { ...params, date: e.target.value }; setParams(nextParams); if (params.collector_id) run(active, nextParams); }} />
        </div>
      </>
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
        const monthlyTitle = params.collection_cycle_type === '45' ? 'Monthly Collection - 45 Days / 1.5 Month' : 'Monthly Collection - 30 Days / By Month'
        return (
          <>
            <style>{`
              @media print {
                @page { size: landscape; margin: 10mm; }
                table { min-width: auto !important; width: 100% !important; zoom: 0.9; }
                th, td { min-width: 0 !important; font-size: 9px !important; padding: 3px 4px !important; }
                th div { font-size: 9px !important; }
                .table-responsive-print { overflow: visible !important; }
                .monthly-print-detailed { display: none !important; }
                ${printMode === 'detailed' ? `
                .monthly-print-summary { display: none !important; }
                .monthly-print-detailed { display: block !important; }
                ` : ``}
              }
            `}</style>
            <div id={!selectedCollector ? "printable-area" : undefined}>
            <div className="monthly-print-summary">
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--blue-dark)', fontWeight: 700 }}>
                  {monthlyTitle}
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
                  printMode === 'summary' ? (
                    <div style={{ width: 1000, height: 350, margin: '0 auto' }}>
                      <BarChart width={1000} height={350} data={matrix.periods.map(p => ({ name: p.label, amount: matrix.periodTotals[p.key]?.amount || 0 }))} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="barGradientMonthly" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.6}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                        <Bar dataKey="amount" fill="url(#barGradientMonthly)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={0} />
                      </BarChart>
                    </div>
                  ) : (
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
                  )
                ) : (
                  <div className="empty-state">No data for chart</div>
                )}
              </div>
            )}
            <div className="table-responsive-print" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
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
            {/* Detailed print view - per collector breakdown */}
            <div className="monthly-print-detailed" style={{ display: 'none', padding: 20, background: '#fff' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, color: 'var(--blue-dark)' }}>{monthlyTitle}</h2>
                <div style={{ fontSize: 14, color: '#64748b' }}>{displayDate(reportFrom)} to {displayDate(reportTo)}</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#16a34a', marginTop: 6 }}>Grand Total: ₱ {fmt(total)}</div>
              </div>
              {matrix.rows.map(row => (
                <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--blue-dark)', paddingBottom: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                    <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                      Payments: {row.payment_count} &nbsp;|&nbsp;
                      Total: <span className="text-success">₱ {fmt(row.total_amount)}</span>
                    </div>
                  </div>
                  {matrix.periods.filter(period => row.periods[period.key].payment_count > 0).map(period => {
                    const cell = row.periods[period.key]
                    return (
                      <div key={period.key} style={{ marginBottom: 16, paddingLeft: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{period.label} ({period.rangeLabel}) — ₱ {fmt(cell.amount)}</div>
                        <table className="data-table" style={{ width: '100%', fontSize: 11 }}>
                          <thead>
                            <tr><th>Client Code</th><th>Date Paid</th><th>Client</th><th>OR#</th><th>Loan#</th><th className="text-right">Amount</th></tr>
                          </thead>
                          <tbody>
                            {cell.payments.map(p => (
                              <tr key={p.id}>
                                <td className="mono">{p.customer_code || '-'}</td>
                                <td>{p.date_paid}</td>
                                <td className="fw-600">{p.customer_name || '-'}</td>
                                <td className="mono">{p.or_number || '-'}</td>
                                <td className="mono">{p.loan_code || '-'}</td>
                                <td className="text-right text-success fw-bold">₱ {fmt(p.amount_paid)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            </div>
          </>
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
        <>
          <style>{`
            @media print {
              ${printMode === 'detailed' ? `
              .reports-screen-only { display: none !important; }
              .reports-print-only { display: block !important; }
              ` : `
              .reports-print-only { display: none !important; }
              .reports-screen-only { display: flex !important; flex-direction: column !important; }
              .reports-screen-only > div:first-child { order: 2; }
              .reports-screen-only > div:last-child { order: 1; margin-bottom: 30px; }
              `}
            }
          `}</style>
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reports-screen-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
          <div id={(!selectedCollector && printMode === 'detailed') ? "printable-area" : undefined} className="reports-print-only" style={{ display: 'none', padding: 20, background: '#fff' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, color: 'var(--blue-dark)' }}>Collection Report</h2>
              <div style={{ fontSize: 14, color: '#64748b' }}>{transactionLabel}</div>
            </div>
            
            {collectorRows.length === 0 ? <div className="empty-state">No collections found</div> : collectorRows.map(row => (
              <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--blue-dark)', paddingBottom: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                    Payments: {row.payment_count} &nbsp;|&nbsp; 
                    Total: <span className="text-success">₱ {fmt(row.total_amount)}</span>
                  </div>
                </div>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left' }}>Client Code</th><th>Date Paid</th><th style={{ textAlign: 'left' }}>Client</th><th style={{ textAlign: 'left' }}>OR#</th><th style={{ textAlign: 'left' }}>Loan#</th><th className="text-right">Amount</th><th className="text-right">Bal. After</th></tr>
                  </thead>
                  <tbody>
                    {row.payments?.map(p => (
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
                </table>
              </div>
            ))}
            
            {collectorRows.length > 0 && (
              <div style={{ marginTop: 40, borderTop: '3px double var(--blue-dark)', paddingTop: 16, pageBreakInside: 'avoid' }}>
                <h3 style={{ margin: '0 0 16px 0', color: 'var(--blue-dark)' }}>GRAND TOTALS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Total Payments</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold' }}>{collectorRows.reduce((sum, r) => sum + r.payment_count, 0)}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(14,165,114,0.1)', borderRadius: 8, border: '1px solid rgba(14,165,114,0.2)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Grand Total Collection</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--accent-success)' }}>₱ {fmt(total)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )
    }
    if (active === 'monthly-releases') {
      const { loans = [], total_principal } = data
      const reportFrom = data.date_from || params.date_from
      const reportTo = data.date_to || params.date_to

      if (releaseSubTab === 'monthly') {
        const matrix = getMonthlyReleaseMatrix(loans, params)
        const monthlyTitle = params.release_cycle_type === '45' ? 'Monthly Releases - 45 Days / 1.5 Month' : 'Monthly Releases - 30 Days / By Month'
        return (
          <>
            <style>{`
              @media print {
                @page { size: landscape; margin: 10mm; }
                table { min-width: auto !important; width: 100% !important; zoom: 0.9; }
                th, td { min-width: 0 !important; font-size: 9px !important; padding: 3px 4px !important; }
                th div { font-size: 9px !important; }
                .table-responsive-print { overflow: visible !important; }
                .release-monthly-print-detailed { display: none !important; }
                ${printMode === 'detailed' ? `
                .release-monthly-print-summary { display: none !important; }
                .release-monthly-print-detailed { display: block !important; }
                ` : ``}
              }
            `}</style>
            <div id={!selectedCollector ? "printable-area" : undefined}>
            <div className="release-monthly-print-summary">
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--blue-dark)', fontWeight: 700 }}>
                  {monthlyTitle}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  {displayDate(reportFrom)} to {displayDate(reportTo)}
                </div>
              </div>
              <div className="fw-bold text-success">Grand Total: ₱ {fmt(total_principal)}</div>
            </div>
            <div className="table-responsive-print" style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
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
            {/* Detailed print view */}
            <div className="release-monthly-print-detailed" style={{ display: 'none', padding: 20, background: '#fff' }}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <h2 style={{ margin: 0, color: 'var(--blue-dark)' }}>{monthlyTitle}</h2>
                <div style={{ fontSize: 14, color: '#64748b' }}>{displayDate(reportFrom)} to {displayDate(reportTo)}</div>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#16a34a', marginTop: 6 }}>Grand Total: ₱ {fmt(total_principal)}</div>
              </div>
              {matrix.rows.map(row => (
                <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--blue-dark)', paddingBottom: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                    <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                      Releases: {row.loan_count} &nbsp;|&nbsp;
                      Total: <span className="text-success">₱ {fmt(row.total_amount)}</span>
                    </div>
                  </div>
                  {matrix.periods.filter(period => row.periods[period.key].loan_count > 0).map(period => {
                    const cell = row.periods[period.key]
                    return (
                      <div key={period.key} style={{ marginBottom: 16, paddingLeft: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{period.label} ({period.rangeLabel}) — ₱ {fmt(cell.amount)}</div>
                        <table className="data-table" style={{ width: '100%', fontSize: 11 }}>
                          <thead>
                            <tr><th>Client Code</th><th>Client</th><th>Loan#</th><th>Type</th><th className="text-right">Loan Amount</th><th className="text-right">Net Proceeds</th><th>Date Released</th></tr>
                          </thead>
                          <tbody>
                            {cell.loans.map(l => (
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
                        </table>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            </div>
          </>
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
        <>
          <style>{`
            @media print {
              ${printMode === 'detailed' ? `
              .reports-screen-only { display: none !important; }
              .reports-print-only { display: block !important; }
              ` : `
              .reports-print-only { display: none !important; }
              .reports-screen-only { display: flex !important; flex-direction: column !important; }
              .reports-screen-only > div:first-child { order: 2; }
              .reports-screen-only > div:last-child { order: 1; margin-bottom: 30px; }
              `}
            }
          `}</style>
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reports-screen-only" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
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
                  <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View release details" style={{ cursor: 'pointer', transition: 'background 0.2s' }} className="clickable-row">
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
                printMode === 'summary' ? (
                  <div style={{ width: 1000, height: 400, margin: '0 auto' }}>
                    <BarChart width={1000} height={400} data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barGradientRelease" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#c4b5fd" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Bar dataKey="amount" fill="url(#barGradientRelease)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={0} />
                    </BarChart>
                  </div>
                ) : (
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
                )
              ) : (
                <div className="empty-state">No data for chart</div>
              )}
            </div>
          </div>
          </div>
          <div id={(!selectedCollector && printMode === 'detailed') ? "printable-area" : undefined} className="reports-print-only" style={{ display: 'none', padding: 20, background: '#fff' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, color: 'var(--blue-dark)' }}>Releases Report</h2>
              <div style={{ fontSize: 14, color: '#64748b' }}>{transactionLabel}</div>
            </div>
            
            {collectorRows.length === 0 ? <div className="empty-state">No releases found</div> : collectorRows.map(row => (
              <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--blue-dark)', paddingBottom: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                    Releases: {row.loan_count} &nbsp;|&nbsp; 
                    Total: <span className="text-accent">₱ {fmt(row.total_principal)}</span>
                  </div>
                </div>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left' }}>Client Code</th><th style={{ textAlign: 'left' }}>Client</th><th style={{ textAlign: 'left' }}>Loan#</th><th style={{ textAlign: 'left' }}>Type</th><th className="text-right">Loan Amount</th><th className="text-right">Net Proceeds</th><th style={{ textAlign: 'left' }}>Date Released</th></tr>
                  </thead>
                  <tbody>
                    {row.loans?.map(l => (
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
                </table>
              </div>
            ))}
            
            {collectorRows.length > 0 && (
              <div style={{ marginTop: 40, borderTop: '3px double var(--blue-dark)', paddingTop: 16, pageBreakInside: 'avoid' }}>
                <h3 style={{ margin: '0 0 16px 0', color: 'var(--blue-dark)' }}>GRAND TOTALS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Total Releases</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold' }}>{collectorRows.reduce((sum, r) => sum + r.loan_count, 0)}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>New</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>₱ {fmt(collectorRows.reduce((sum, r) => sum + r.new_amount, 0))}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Reloan</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>₱ {fmt(collectorRows.reduce((sum, r) => sum + r.reloan_amount, 0))}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Recon</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>₱ {fmt(collectorRows.reduce((sum, r) => sum + r.recon_amount, 0))}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(139,92,246,0.1)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Grand Total Released</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--accent-2)' }}>₱ {fmt(total_principal)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )
    }
    if (active === 'past-due') {
      const { loans = [] } = data
      const rows = getMaturityCollectorRows(loans)
      const totalClients = rows.reduce((sum, r) => sum + r.client_count, 0)
      const totalPrincipal = rows.reduce((sum, r) => sum + r.total_principal, 0)
      const totalInterest = rows.reduce((sum, r) => sum + r.total_interest, 0)
      const totalBalance = rows.reduce((sum, r) => sum + r.total_balance, 0)
      const totalLoanAmount = rows.reduce((sum, r) => sum + r.total_loan_amount, 0)
      const reportFrom = data.date_from || params.date_from
      const reportTo = data.date_to || params.date_to
      const chartData = rows.map(r => ({ name: (r.collector || '').trim() || 'Unassigned', amount: r.total_loan_amount })).sort((a, b) => b.amount - a.amount)
      return (
        <>
          <style>{`
            @media print {
              ${printMode === 'detailed' ? `
              .reports-screen-only { display: none !important; }
              .reports-print-only { display: block !important; }
              ` : `
              .reports-print-only { display: none !important; }
              .reports-screen-only { display: flex !important; flex-direction: column !important; }
              .reports-screen-only > div:first-child { order: 2; }
              .reports-screen-only > div:last-child { order: 1; margin-bottom: 30px; }
              `}
            }
          `}</style>
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reports-screen-only" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
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
                printMode === 'summary' ? (
                  <div style={{ width: 1000, height: 400, margin: '0 auto' }}>
                    <BarChart width={1000} height={400} data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barGradientMaturity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#fcd34d" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Bar dataKey="amount" fill="url(#barGradientMaturity)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={0} />
                    </BarChart>
                  </div>
                ) : (
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
                )
              ) : (
                <div className="empty-state">No data for chart</div>
              )}
            </div>
          </div>
          </div>
          <div id={(!selectedCollector && printMode === 'detailed') ? "printable-area" : undefined} className="reports-print-only" style={{ display: 'none', padding: 20, background: '#fff' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, color: 'var(--blue-dark)' }}>Loans Maturity Checker</h2>
              <div style={{ fontSize: 14, color: '#64748b' }}>Maturity Date: {displayDate(reportFrom)} to {displayDate(reportTo)}</div>
            </div>
            
            {rows.length === 0 ? <div className="empty-state">No loans found for the selected maturity date range</div> : rows.map(row => (
              <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--blue-dark)', paddingBottom: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                    Clients: {row.client_count} &nbsp;|&nbsp; 
                    Total Balance: <span className="text-accent">₱ {fmt(row.total_balance)}</span>
                  </div>
                </div>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Client</th>
                      <th style={{ textAlign: 'left' }}>Loan#</th>
                      <th className="text-right">Principal</th>
                      <th className="text-right">Total Loan Amount</th>
                      <th className="text-right">Balance</th>
                      <th style={{ textAlign: 'left' }}>Maturity</th>
                      <th style={{ textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.loans?.map(l => (
                      <tr key={l.id}>
                        <td className="fw-600">{l.customer_name || '-'}</td>
                        <td className="mono">{l.loan_code || '-'}</td>
                        <td className="text-right">₱ {fmt(l.principal)}</td>
                        <td className="text-right fw-bold text-accent">₱ {fmt(Number(l.principal || 0) + Number(l.interest_amount || 0))}</td>
                        <td className="text-right fw-bold">₱ {fmt(l.balance)}</td>
                        <td>{l.date_maturity || '-'}</td>
                        <td>{l.status === 'pastdue' && l.days_overdue > 0 ? `Pastdue (${l.days_overdue} days)` : l.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            
            {rows.length > 0 && (
              <div style={{ marginTop: 40, borderTop: '3px double var(--blue-dark)', paddingTop: 16, pageBreakInside: 'avoid' }}>
                <h3 style={{ margin: '0 0 16px 0', color: 'var(--blue-dark)' }}>GRAND TOTALS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Total Clients</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold' }}>{totalClients}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Total Principal</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold' }}>₱ {fmt(totalPrincipal)}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Grand Total Balance</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--blue-dark)' }}>₱ {fmt(totalBalance)}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(139,92,246,0.1)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Grand Total Loan Amount</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--blue-mid)' }}>₱ {fmt(totalLoanAmount)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )
    }
    if (active === 'payments-encoded') {
      const records = data.data || []
      return <><div style={{ marginBottom: 12 }} className="fw-bold">{records.length} records {data.total != null ? `— Total: ₱ ${fmt(data.total)}` : ''}</div>
        <table className="data-table"><thead><tr><th>OR#</th><th>Customer</th><th>Loan#</th><th>Date</th><th className="text-right">Amount</th><th>By</th></tr></thead>
        <tbody>{records.length === 0 ? <tr><td colSpan={6} className="empty-state">No records</td></tr> : records.map(p => <tr key={p.id}><td className="mono">{p.or_number}</td><td>{p.customer_name}</td><td className="mono">{p.loan_code}</td><td>{p.date_paid}</td><td className="text-right">₱ {fmt(p.amount_paid)}</td><td>{p.encoded_by_name || '—'}</td></tr>)}</tbody></table></>
    }
    if (active === 'payments-reversed') {
      const { payments = [], total } = data
      const reportFrom = data.date_from || params.date_from
      const reportTo = data.date_to || params.date_to

      const reversedCollectorRows = Object.entries(payments.reduce((acc, p) => {
        const name = p.collector_name || 'Unassigned'
        if (!acc[name]) acc[name] = { collector: name, payment_count: 0, total_amount: 0, payments: [] }
        acc[name].payment_count += 1
        acc[name].total_amount += Number(p.amount_paid || 0)
        acc[name].payments.push(p)
        return acc
      }, {}))
        .map(([, row]) => ({ ...row, payments: row.payments.sort((a, b) => String(a.reversed_at || '').localeCompare(String(b.reversed_at || '')) || String(a.customer_name || '').localeCompare(String(b.customer_name || ''))) }))
        .sort((a, b) => a.collector.localeCompare(b.collector))

      const chartData = reversedCollectorRows.map(r => ({ name: r.collector, amount: r.total_amount })).sort((a, b) => b.amount - a.amount)

      let transactionLabel = reportFrom === reportTo
        ? `Reversal Date: ${displayDate(reportFrom)}`
        : `Reversal Period: ${displayDate(reportFrom)} to ${displayDate(reportTo)}`

      return (
        <>
          <style>{`
            @media print {
              ${printMode === 'detailed' ? `
              .reversed-screen-only { display: none !important; }
              .reversed-print-only { display: block !important; }
              ` : `
              .reversed-print-only { display: none !important; }
              .reversed-screen-only { display: flex !important; flex-direction: column !important; }
              .reversed-screen-only > div:first-child { order: 2; }
              .reversed-screen-only > div:last-child { order: 1; margin-bottom: 30px; }
              `}
            }
          `}</style>
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reversed-screen-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ marginBottom: 6, color: 'var(--blue-dark)', fontWeight: 700 }}>{transactionLabel}</div>
              <div style={{ marginBottom: 12, color: '#dc2626', fontWeight: 700 }}>Total Reversed: ₱ {fmt(total)}</div>
              <table className="data-table">
                <thead><tr><th>Collector</th><th className="text-right">No. of Reversals</th><th className="text-right">Total Amount</th></tr></thead>
                <tbody>{reversedCollectorRows.length === 0 ? <tr><td colSpan={3} className="empty-state">No reversed payments found</td></tr> : reversedCollectorRows.map(row => <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View reversed payment details" style={{ cursor: 'pointer' }}><td className="fw-600">{row.collector}</td><td className="text-right">{row.payment_count}</td><td className="text-right fw-bold" style={{ color: '#dc2626' }}>₱ {fmt(row.total_amount)}</td></tr>)}</tbody>
                {reversedCollectorRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'rgba(220,38,38,0.04)', borderTop: '2px solid var(--border)' }}>
                      <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                      <td className="text-right fw-bold">{reversedCollectorRows.reduce((sum, r) => sum + r.payment_count, 0)}</td>
                      <td className="text-right fw-bold" style={{ color: '#dc2626', fontSize: '14px' }}>₱ {fmt(total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div>
              <div style={{ marginBottom: 12 }} className="fw-bold">Reversed Amounts per Collector</div>
              <div style={{ height: 400, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barGradientReversed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#dc2626" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#f87171" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(220, 38, 38, 0.08)' }} 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                        formatter={(val) => [`₱ ${fmt(val)}`, 'Total Reversed']} 
                        labelStyle={{ color: '#0f172a', fontWeight: 700, marginBottom: 6, fontSize: 13 }} 
                      />
                      <Bar dataKey="amount" fill="url(#barGradientReversed)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">No data for chart</div>
                )}
              </div>
            </div>
          </div>
          <div id={(!selectedCollector && printMode === 'detailed') ? "printable-area" : undefined} className="reversed-print-only" style={{ display: 'none', padding: 20, background: '#fff' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, color: '#dc2626' }}>Payments Reversed Report</h2>
              <div style={{ fontSize: 14, color: '#64748b' }}>{transactionLabel}</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: '#dc2626', marginTop: 6 }}>Grand Total Reversed: ₱ {fmt(total)}</div>
            </div>
            {reversedCollectorRows.length === 0 ? <div className="empty-state">No reversed payments found</div> : reversedCollectorRows.map(row => (
              <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #dc2626', paddingBottom: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                    Reversals: {row.payment_count} &nbsp;|&nbsp;
                    Total: <span style={{ color: '#dc2626' }}>₱ {fmt(row.total_amount)}</span>
                  </div>
                </div>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left' }}>Client Code</th><th style={{ textAlign: 'left' }}>Client</th><th style={{ textAlign: 'left' }}>OR#</th><th style={{ textAlign: 'left' }}>Loan#</th><th>Date Paid</th><th className="text-right">Amount</th><th style={{ textAlign: 'left' }}>Reason</th><th style={{ textAlign: 'left' }}>Reversed By</th></tr>
                  </thead>
                  <tbody>
                    {row.payments?.map(p => (
                      <tr key={p.id}>
                        <td className="mono">{p.customer_code || '-'}</td>
                        <td className="fw-600">{p.customer_name || '-'}</td>
                        <td className="mono">{p.or_number || '-'}</td>
                        <td className="mono">{p.loan_code || '-'}</td>
                        <td>{p.date_paid}</td>
                        <td className="text-right fw-bold" style={{ color: '#dc2626' }}>₱ {fmt(p.amount_paid)}</td>
                        <td style={{ fontSize: 11 }}>{p.reversal_reason || '-'}</td>
                        <td style={{ fontSize: 11 }}>{p.reversed_by_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )
    }
    if (active === 'maturity-check') {
      const { loans = [] } = data
      return <table className="data-table"><thead><tr><th>Loan#</th><th>Customer</th><th>Contact</th><th className="text-right">Balance</th><th>Maturity</th><th>Days Left</th><th>Collector</th></tr></thead>
        <tbody>{loans.length === 0 ? <tr><td colSpan={7} className="empty-state">No loans maturing soon</td></tr> : loans.map(l => <tr key={l.id}><td className="mono">{l.loan_code}</td><td className="fw-600">{l.customer_name}</td><td>{l.contact || '—'}</td><td className="text-right">₱ {fmt(l.balance)}</td><td>{l.date_maturity}</td><td className={`fw-bold ${l.days_to_maturity <= 7 ? 'text-danger' : 'text-warning'}`}>{l.days_to_maturity} days</td><td>{l.collector_name || '—'}</td></tr>)}</tbody></table>
    }
    if (active === 'full-paid') {
      const loans = Array.isArray(data) ? data : (data.loans || [])
      const reportFrom = data.date_from || params.date_from
      const reportTo = data.date_to || params.date_to
      const totalPrincipal = loans.reduce((s, l) => s + Number(l.principal || 0), 0)

      const fullPaidCollectorRows = Object.entries(loans.reduce((acc, l) => {
        const name = l.collector_name || 'Unassigned'
        if (!acc[name]) acc[name] = { collector: name, loan_count: 0, total_principal: 0, loans: [] }
        acc[name].loan_count += 1
        acc[name].total_principal += Number(l.principal || 0)
        acc[name].loans.push(l)
        return acc
      }, {}))
        .map(([, row]) => ({ ...row, loans: row.loans.sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')) || String(a.customer_name || '').localeCompare(String(b.customer_name || ''))) }))
        .sort((a, b) => a.collector.localeCompare(b.collector))

      const chartData = fullPaidCollectorRows.map(r => ({ name: r.collector, amount: r.total_principal })).sort((a, b) => b.amount - a.amount)

      let transactionLabel = reportFrom === reportTo
        ? `Fully Paid Date: ${displayDate(reportFrom)}`
        : `Fully Paid Period: ${displayDate(reportFrom)} to ${displayDate(reportTo)}`

      return (
        <>
          <style>{`
            @media print {
              ${printMode === 'detailed' ? `
              .fullpaid-screen-only { display: none !important; }
              .fullpaid-print-only { display: block !important; }
              ` : `
              .fullpaid-print-only { display: none !important; }
              .fullpaid-screen-only { display: flex !important; flex-direction: column !important; }
              .fullpaid-screen-only > div:first-child { order: 2; }
              .fullpaid-screen-only > div:last-child { order: 1; margin-bottom: 30px; }
              `}
            }
          `}</style>
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="fullpaid-screen-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ marginBottom: 6, color: 'var(--blue-dark)', fontWeight: 700 }}>{transactionLabel}</div>
              <div style={{ marginBottom: 12, color: '#16a34a', fontWeight: 700 }}>Total Principal: ₱ {fmt(totalPrincipal)}</div>
              <table className="data-table">
                <thead><tr><th>Collector</th><th className="text-right">No. of Clients</th><th className="text-right">Total Principal</th></tr></thead>
                <tbody>{fullPaidCollectorRows.length === 0 ? <tr><td colSpan={3} className="empty-state">No fully paid clients found</td></tr> : fullPaidCollectorRows.map(row => <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View fully paid details" style={{ cursor: 'pointer' }}><td className="fw-600">{row.collector}</td><td className="text-right">{row.loan_count}</td><td className="text-right fw-bold" style={{ color: '#16a34a' }}>₱ {fmt(row.total_principal)}</td></tr>)}</tbody>
                {fullPaidCollectorRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'rgba(22,163,74,0.04)', borderTop: '2px solid var(--border)' }}>
                      <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                      <td className="text-right fw-bold">{fullPaidCollectorRows.reduce((sum, r) => sum + r.loan_count, 0)}</td>
                      <td className="text-right fw-bold" style={{ color: '#16a34a', fontSize: '14px' }}>₱ {fmt(totalPrincipal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div>
              <div style={{ marginBottom: 12 }} className="fw-bold">Fully Paid Amount per Collector</div>
              <div style={{ height: 400, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barGradientFullPaid" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#16a34a" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#4ade80" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `₱${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(22, 163, 74, 0.08)' }} 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                        formatter={(val) => [`₱ ${fmt(val)}`, 'Total Principal']} 
                        labelStyle={{ color: '#0f172a', fontWeight: 700, marginBottom: 6, fontSize: 13 }} 
                      />
                      <Bar dataKey="amount" fill="url(#barGradientFullPaid)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">No data for chart</div>
                )}
              </div>
            </div>
          </div>
          <div id={(!selectedCollector && printMode === 'detailed') ? "printable-area" : undefined} className="fullpaid-print-only" style={{ display: 'none', padding: 20, background: '#fff' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, color: '#16a34a' }}>Fully Paid Loans Report</h2>
              <div style={{ fontSize: 14, color: '#64748b' }}>{transactionLabel}</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: '#16a34a', marginTop: 6 }}>Grand Total Principal: ₱ {fmt(totalPrincipal)}</div>
            </div>
            {fullPaidCollectorRows.length === 0 ? <div className="empty-state">No fully paid clients found</div> : fullPaidCollectorRows.map(row => (
              <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #16a34a', paddingBottom: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                    Clients: {row.loan_count} &nbsp;|&nbsp;
                    Total Principal: <span style={{ color: '#16a34a' }}>₱ {fmt(row.total_principal)}</span>
                  </div>
                </div>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left' }}>Client Code</th><th style={{ textAlign: 'left' }}>Client</th><th style={{ textAlign: 'left' }}>Loan#</th><th>Date Released</th><th className="text-right">Principal</th><th className="text-right">Total Paid</th></tr>
                  </thead>
                  <tbody>
                    {row.loans?.map(l => (
                      <tr key={l.id}>
                        <td className="mono">{l.customer_code || '-'}</td>
                        <td className="fw-600">{l.customer_name || '-'}</td>
                        <td className="mono">{l.loan_code || '-'}</td>
                        <td>{l.date_released}</td>
                        <td className="text-right fw-bold" style={{ color: '#16a34a' }}>₱ {fmt(l.principal)}</td>
                        <td className="text-right fw-bold text-success">₱ {fmt(l.total_paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )
    }
    if (active === 'loan-type') {
      const { loans = [] } = data || {}
      const reportFrom = data?.date_from || params.date_from
      const reportTo = data?.date_to || params.date_to
      const transactionLabel = reportFrom === reportTo
        ? `Transaction Date: ${displayDate(reportFrom)}`
        : `Transaction Period: ${displayDate(reportFrom)} to ${displayDate(reportTo)}`
      
      const collectorRows = getReleaseCollectorRows(loans)
      
      let grandTotalNew = 0, grandTotalReloan = 0, grandTotalRecon = 0, grandTotal = 0;
      let grandCountNew = 0, grandCountReloan = 0, grandCountRecon = 0, grandCount = 0;

      collectorRows.forEach(r => {
        grandTotalNew += r.new_amount;
        grandTotalReloan += r.reloan_amount;
        grandTotalRecon += r.recon_amount;
        grandTotal += r.total_principal;
        
        grandCountNew += r.new_count;
        grandCountReloan += r.reloan_count;
        grandCountRecon += r.recon_count;
        grandCount += r.loan_count;
      })

      const chartData = collectorRows.map(r => ({ name: r.collector, amount: r.total_principal })).sort((a, b) => b.amount - a.amount);

      return (
        <div className="reports-screen-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ marginBottom: 6, color: 'var(--blue-dark)', fontWeight: 700 }}>{transactionLabel}</div>
            <div style={{ marginBottom: 12 }} className="fw-bold text-success">Total Amount: ₱ {fmt(grandTotal)}</div>
            
            <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ verticalAlign: 'middle', minWidth: 200, textTransform: 'uppercase' }}>Collector</th>
                    <th className="text-right" style={{ textTransform: 'uppercase' }}>New</th>
                    <th className="text-right" style={{ textTransform: 'uppercase' }}>Reloan</th>
                    <th className="text-right" style={{ textTransform: 'uppercase' }}>Recon</th>
                    <th className="text-right" style={{ textTransform: 'uppercase' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {collectorRows.length === 0 ? <tr><td colSpan={5} className="empty-state">No records</td></tr> : collectorRows.map(row => (
                    <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View release details" style={{ cursor: 'pointer', transition: 'background 0.2s' }} className="clickable-row">
                      <td className="fw-600" style={{ verticalAlign: 'middle' }}>{row.collector}</td>
                      
                      <td className="text-right">
                        {row.new_count > 0 ? (
                          <>
                            <div className="fw-bold" style={{ color: 'var(--blue-dark)', fontSize: 14 }}>₱ {fmt(row.new_amount)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.new_count} Client{row.new_count > 1 ? 's' : ''}</div>
                          </>
                        ) : '-'}
                      </td>
                      
                      <td className="text-right">
                        {row.reloan_count > 0 ? (
                          <>
                            <div className="fw-bold" style={{ color: 'var(--blue-dark)', fontSize: 14 }}>₱ {fmt(row.reloan_amount)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.reloan_count} Client{row.reloan_count > 1 ? 's' : ''}</div>
                          </>
                        ) : '-'}
                      </td>
                      
                      <td className="text-right">
                        {row.recon_count > 0 ? (
                          <>
                            <div className="fw-bold" style={{ color: 'var(--blue-dark)', fontSize: 14 }}>₱ {fmt(row.recon_amount)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.recon_count} Client{row.recon_count > 1 ? 's' : ''}</div>
                          </>
                        ) : '-'}
                      </td>
                      
                      <td className="text-right">
                        {row.loan_count > 0 ? (
                          <>
                            <div className="fw-bold" style={{ color: 'var(--blue)', fontSize: 14 }}>₱ {fmt(row.total_principal)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.loan_count} Release{row.loan_count > 1 ? 's' : ''}</div>
                          </>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {collectorRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                      <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                      <td className="text-right">
                        <div className="fw-bold" style={{ color: 'var(--blue-dark)', fontSize: 14 }}>₱ {fmt(grandTotalNew)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{grandCountNew} Client{grandCountNew > 1 ? 's' : ''}</div>
                      </td>
                      <td className="text-right">
                        <div className="fw-bold" style={{ color: 'var(--blue-dark)', fontSize: 14 }}>₱ {fmt(grandTotalReloan)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{grandCountReloan} Client{grandCountReloan > 1 ? 's' : ''}</div>
                      </td>
                      <td className="text-right">
                        <div className="fw-bold" style={{ color: 'var(--blue-dark)', fontSize: 14 }}>₱ {fmt(grandTotalRecon)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{grandCountRecon} Client{grandCountRecon > 1 ? 's' : ''}</div>
                      </td>
                      <td className="text-right">
                        <div className="fw-bold" style={{ color: 'var(--blue)', fontSize: 14 }}>₱ {fmt(grandTotal)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{grandCount} Release{grandCount > 1 ? 's' : ''}</div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 12 }} className="fw-bold">Total Released per Collector</div>
            <div style={{ height: 400, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barGradientType" x1="0" y1="0" x2="0" y2="1">
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
                      formatter={(val) => [`₱ ${fmt(val)}`, 'Total Released']} 
                      labelStyle={{ color: '#0f172a', fontWeight: 700, marginBottom: 6, fontSize: 13 }} 
                    />
                    <Bar dataKey="amount" fill="url(#barGradientType)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1000} />
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
    if (active === 'collection-sheet') {
      const { loans = [], collector: apiCollector, signatures = {} } = data
      const collName = collectors.find(c => c.id == params.collector_id)
      const collectorDisplayName = apiCollector?.name || (collName ? `${collName.last_name}, ${collName.first_name}`.toUpperCase() : 'UNASSIGNED')
      const collectionDate = params.date || toDateInputValue(new Date())
      const displayCollDate = new Date(collectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

      /* ── Classification helper (reusable, priority: PastDue > Overdue > Recon > Active) ── */
      const classifyLoan = (loan) => {
        const dpd = Math.max(0, parseInt(loan.days_past_due) || 0)
        if (dpd >= 30) return 'pastdue'
        if (dpd >= 1) return 'overdue'
        if ((loan.loan_type || '').toLowerCase().includes('recon')) return 'recon'
        return 'active'
      }

      /* ── Classify and deduplicate ── */
      const groups = { active: [], recon: [], overdue: [], pastdue: [] }
      const seen = new Set()
      loans.forEach(l => {
        if (seen.has(l.id)) return
        seen.add(l.id)
        l.days_past_due = Math.max(0, parseInt(l.days_past_due) || 0)
        groups[classifyLoan(l)].push(l)
      })
      Object.values(groups).forEach(arr => arr.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '')))

      /* ── Color constants ── */
      const CL = { navy: '#0D1B3D', active: '#1F2933', recon: '#1565C0', overdue: '#EF6C00', pastdue: '#D71920', lightBg: '#F5F7FA' }
      const peso = n => { const v = Number(n || 0); const f = Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? `-₱${f}` : `₱${f}` }
      const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '-'

      /* Build one ordered stream, then flow down column 1, column 2, next page. */
      const buildEntries = (sections) => {
        const entries = []
        sections.forEach(s => {
          entries.push({ type: 'header', title: `${s.num}. ${s.title}`, count: s.clients.length, color: s.color })
          if (s.clients.length === 0) entries.push({ type: 'empty' })
          s.clients.forEach((client, i) => entries.push({ type: 'row', client, rowNum: i + 1, color: s.color }))
        })
        return entries
      }
      const orderedEntries = buildEntries([
        { num: 1, title: 'ACTIVE CLIENTS', clients: groups.active, color: CL.active },
        { num: 2, title: 'RECONSTRUCTED ACCOUNTS', clients: groups.recon, color: CL.recon },
        { num: 3, title: 'OVERDUE CLIENTS', clients: groups.overdue, color: CL.overdue },
        { num: 4, title: 'PAST DUE CLIENTS', clients: groups.pastdue, color: CL.pastdue }
      ])
      const entryUnits = entry => {
        if (!entry) return 0
        if (entry.type === 'header') return 1.25
        if (entry.type === 'empty') return 1
        return String(entry.client?.customer_name || '').length > 24 ? 1.35 : 1
      }
      const splitByUnits = (entries, maxUnits) => {
        const cols = []
        let col = []
        let units = 0
        entries.forEach(entry => {
          const needed = entryUnits(entry)
          if (col.length && units + needed > maxUnits) {
            cols.push(col)
            col = []
            units = 0
          }
          col.push(entry)
          units += needed
        })
        if (col.length) cols.push(col)
        return cols
      }
      const printablePageHeightIn = 13.4
      const reservedHeaderHeightIn = 2.05
      const reservedFooterHeightIn = 1.1
      const columnHeaderHeightIn = 0.25
      const averageEntryHeightIn = 0.285
      const autoColumnUnits = Math.floor((printablePageHeightIn - reservedHeaderHeightIn - reservedFooterHeightIn - columnHeaderHeightIn) / averageEntryHeightIn)
      const columns = splitByUnits(orderedEntries, autoColumnUnits)
      const pages = []
      for (let i = 0; i < columns.length; i += 2) {
        pages.push({ left: columns[i] || [], right: columns[i + 1] || [] })
      }

      const cs = { borderBottom: '1px solid #d9d9d9', verticalAlign: 'middle', padding: '2px 1px' }
      const entryCells = (entry) => {
        if (!entry) return <td colSpan={7} style={{ border: 'none', padding: 0 }}></td>
        if (entry.type === 'header') return (
          <td colSpan={7} style={{ background: entry.color, color: '#fff', padding: '4px 6px', fontWeight: 700, fontSize: '9pt', border: 'none' }}>
            {entry.title} - {entry.count} {entry.count === 1 ? 'Client' : 'Clients'}
          </td>
        )
        if (entry.type === 'empty') return (
          <td colSpan={7} style={{ ...cs, fontSize: '7.5pt', color: '#999', fontStyle: 'italic', textAlign: 'center' }}>
            No clients in this classification
          </td>
        )
        const c = entry.client
        return (<>
          <td style={{ ...cs, fontWeight: 600, fontSize: '7pt', textAlign: 'center', width: '5%' }}>{entry.rowNum}</td>
          <td style={{ ...cs, fontSize: '10pt', fontWeight: 700, color: entry.color, width: '12%' }}>{c.customer_code}</td>
          <td style={{ ...cs, color: entry.color, fontWeight: 700, fontSize: '10pt', padding: '2px 2px', lineHeight: 1.08, wordBreak: 'normal', overflowWrap: 'break-word', width: '43%' }}>{(c.customer_name || '').toUpperCase()}</td>
          <td style={{ ...cs, textAlign: 'center', fontSize: '7pt', width: '9%' }}>{fDate(c.date_maturity)}</td>
          <td style={{ ...cs, textAlign: 'center', fontSize: '7pt', color: entry.color, fontWeight: 600, width: '4%', paddingLeft: 0, paddingRight: 0 }}>{c.days_past_due}</td>
          <td style={{ ...cs, textAlign: 'right', fontSize: '7pt', width: '8%', paddingLeft: 0 }}>{c.amortization ? Number(c.amortization).toLocaleString() : '0'}</td>
          <td style={{ ...cs, width: '19%', verticalAlign: 'bottom', paddingLeft: 2 }}>
            {c.collected_today > 0
              ? <span style={{ fontSize: '7.5pt', fontWeight: 600 }}>{peso(c.collected_today)}</span>
              : <div style={{ height: 12, borderBottom: '1.5px solid #000' }}></div>}
          </td>
        </>)
      }

      const headerCell = { padding: '3px 1px', borderTop: '1.5px solid '+CL.navy, borderBottom: '1.5px solid '+CL.navy, fontSize: '7pt', color: CL.navy }
      const colHdr = (side) => [
        <th key={side+'n'} style={{ ...headerCell, width: '5%', textAlign: 'center' }}>#</th>,
        <th key={side+'c'} style={{ ...headerCell, width: '12%', textAlign: 'left', fontSize: '9pt' }}>Code</th>,
        <th key={side+'nm'} style={{ ...headerCell, width: '43%', textAlign: 'left', padding: '3px 2px', fontSize: '9pt' }}>Client Name</th>,
        <th key={side+'d'} style={{ ...headerCell, width: '9%', textAlign: 'center' }}>Due</th>,
        <th key={side+'dp'} style={{ ...headerCell, width: '4%', textAlign: 'center', paddingLeft: 0, paddingRight: 0 }}>DPD</th>,
        <th key={side+'dl'} style={{ ...headerCell, width: '8%', textAlign: 'right', paddingLeft: 0, paddingRight: 0 }}>Daily</th>,
        <th key={side+'co'} style={{ ...headerCell, width: '19%', textAlign: 'center' }}>Collected</th>
      ]
      const renderClientColumn = (entries, keyPrefix) => (
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '8pt' }}>
          <thead><tr style={{ textTransform: 'uppercase', fontWeight: 700 }}>{colHdr(keyPrefix)}</tr></thead>
          <tbody>{entries.map((entry, i) => <tr key={`${keyPrefix}-${i}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>{entryCells(entry)}</tr>)}</tbody>
        </table>
      )
      const blankCashLine = label => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
          <span style={{ color: '#555', flex: '0 0 78px' }}>{label}:</span>
          <span style={{ flex: 1, borderBottom: '1.5px solid #000', height: 13 }}></span>
        </div>
      )
      const denominationLine = value => (
        <div key={value} style={{ display: 'grid', gridTemplateColumns: '24px 8px 1fr 8px 1fr', alignItems: 'center', columnGap: 3, padding: '1px 0', fontSize: '6.4pt' }}>
          <span style={{ fontWeight: 700, color: CL.navy, textAlign: 'right' }}>{value}</span>
          <span style={{ textAlign: 'center' }}>x</span>
          <span style={{ borderBottom: '1.2px solid #000', height: 10 }}></span>
          <span style={{ textAlign: 'center' }}>=</span>
          <span style={{ borderBottom: '1.2px solid #000', height: 10 }}></span>
        </div>
      )
      const headerBox = (title, children, width) => (
        <div style={{ flex: `0 0 ${width}px`, width, border: '1.5px solid '+CL.navy, borderRadius: 3 }}>
          <div style={{ background: CL.navy, color: '#fff', padding: '3px 6px', fontWeight: 700, fontSize: '8pt', textAlign: 'center' }}>{title}</div>
          <div style={{ padding: '4px 6px', fontSize: '7pt' }}>
            {children}
          </div>
        </div>
      )
      const pageHeader = (
        <div className="collection-sheet-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
              <img src={logoImg} alt="" style={{ height: 50, width: 50, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '16pt', color: CL.navy, letterSpacing: 0.3 }}>MELANN LENDING INVESTOR CORPORATION</div>
                <div style={{ fontWeight: 700, fontSize: '11.5pt', color: CL.navy }}>FIELD COLLECTION SHEET</div>
                <div style={{ fontSize: '8pt', color: '#999' }}>Legal Portrait - Two-Column Field Format</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: '10pt', marginBottom: 5, flexWrap: 'wrap' }}>
              <div><b>Collector:</b> {collectorDisplayName}</div>
              <div><b>Collection Date:</b> {displayCollDate}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <b>Over / Short:</b> <span style={{ display: 'inline-block', width: 90, borderBottom: '1.5px solid #000' }}>&nbsp;</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              {[
                { label: 'Active', count: groups.active.length, color: CL.active },
                { label: 'Recon', count: groups.recon.length, color: CL.recon },
                { label: 'Overdue', count: groups.overdue.length, color: CL.overdue },
                { label: 'Past Due', count: groups.pastdue.length, color: CL.pastdue }
              ].map(b => (
                <div key={b.label} style={{ background: b.color, color: '#fff', padding: '2px 8px', borderRadius: 2, fontSize: '8pt', fontWeight: 600 }}>
                  {b.label}: {b.count}
                </div>
              ))}
            </div>
            <div style={{ fontSize: '7pt', color: '#777', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span><b style={{ color: CL.active }}>-</b> Active - Not yet overdue</span>
              <span><b style={{ color: CL.recon }}>-</b> Recon - Reconstructed account</span>
              <span><b style={{ color: CL.overdue }}>-</b> Overdue - 1 to 29 days late</span>
              <span><b style={{ color: CL.pastdue }}>-</b> Past Due - 30+ days late</span>
            </div>
          </div>
          <div style={{ flex: '0 0 auto', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            {headerBox('DAILY CASH SUMMARY', ['Total Collection', 'Field Release', 'Total Expense', 'Grand Total'].map(blankCashLine), 190)}
            {headerBox('DENOMINATION', [1000, 500, 200, 100, 50, 20, 10, 5, 1].map(denominationLine), 170)}
          </div>
        </div>
      )
      const pageFooter = (
        <div className="collection-sheet-page-footer" style={{ borderTop: '2px solid '+CL.navy, paddingTop: 12, display: 'flex', justifyContent: 'space-between', pageBreakInside: 'avoid' }}>
          {[
            { role: 'Collector', name: collectorDisplayName },
            { role: 'Checked by', name: signatures.checkedBy || 'MARILYN O. RELOBA' },
            { role: 'Encoded by', name: signatures.encodedBy || 'IT/ACCOUNTING CLERK' },
            { role: 'Approved by', name: signatures.approvedBy || 'VICTORIO L. RELOBA JR.' }
          ].map(sig => (
            <div key={sig.role} style={{ width: '22%', textAlign: 'center' }}>
              <div style={{ fontSize: '7pt', color: '#666', lineHeight: 1.1, marginBottom: 18 }}>{sig.role}</div>
              <div style={{ borderBottom: '1.5px solid #000', marginBottom: 3 }}></div>
              <div style={{ fontWeight: 600, fontSize: '7pt', lineHeight: 1.1 }}>{sig.name}</div>
            </div>
          ))}
        </div>
      )

      if (loans.length === 0) return (
        <div className="empty-state"><p>No collection-sheet clients found for the selected collector and collection date.</p></div>
      )

      return (
        <div id="printable-area" className="collection-sheet-print" style={{ background: '#fff', fontFamily: 'Arial, Helvetica, sans-serif' }}>
          {pages.map((page, pageIndex) => (
            <div key={pageIndex} className="collection-sheet-page" style={{ pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto', breakAfter: pageIndex < pages.length - 1 ? 'page' : 'auto' }}>
              {pageHeader}
              <div className="collection-sheet-page-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'start' }}>
                {renderClientColumn(page.left, `L${pageIndex}`)}
                {renderClientColumn(page.right, `R${pageIndex}`)}
              </div>
              {pageFooter}
            </div>
          ))}

          <style>{`
            @media print {
              @page { size: 8.5in 14in; margin: 0.25in 0.15in 0.35in 0.15in; }
              body { margin: 0; padding: 0; }
              .sidebar, .navbar, .reports-sidebar { display: none !important; }
              .content { margin: 0 !important; padding: 0 !important; }
              .reports-screen-only { display: none !important; }
              .collection-sheet-print { border: none !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
              .collection-sheet-page {
                height: 13.4in !important;
                min-height: 13.4in !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
              }
              .collection-sheet-page-header {
                flex: 0 0 auto !important;
              }
              .collection-sheet-page-body {
                flex: 1 1 auto !important;
                align-content: start !important;
                min-height: 0 !important;
              }
              .collection-sheet-page-footer {
                flex: 0 0 auto !important;
                margin-top: auto !important;
                min-height: 0.72in !important;
              }
              tr { page-break-inside: avoid; }
              thead { display: table-header-group; }
              tfoot { display: table-footer-group; }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
            @media screen {
              .collection-sheet-print {
                margin: 16px auto;
                border: 1px solid var(--border);
                border-radius: 8px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                padding: 15px;
                max-width: 1160px;
              }
              .collection-sheet-page {
                min-height: 13.4in;
                display: flex;
                flex-direction: column;
                margin-bottom: 24px;
              }
              .collection-sheet-page-footer {
                margin-top: auto;
              }
            }
          `}</style>
        </div>
      )
    }
    return <pre style={{ fontSize: 12, color: 'var(--text-muted)' }}>{JSON.stringify(data, null, 2)}</pre>
  }

  return (
    <div>
      <style>{`
        @media print {
          @page { size: portrait; margin: 10mm; }
          .modal-print-ready { max-height: none !important; overflow: visible !important; }
          .modal-print-area { box-shadow: none !important; border: none !important; max-width: 100% !important; width: 100% !important; }
          .data-table th, .data-table td { padding: 4px 6px !important; font-size: 10px !important; }
          .badge { padding: 2px 6px !important; font-size: 9px !important; }
          .modal-header, .modal-body { padding: 12px !important; }
        }
      `}</style>
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
              {data && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {['collection-report', 'monthly-releases', 'past-due', 'payments-reversed', 'full-paid'].includes(active) ? (
                    <>
                      <button className="btn btn-secondary" onClick={() => handlePrint('summary')}>🖨️ Print Summary</button>
                      <button className="btn btn-secondary" onClick={() => handlePrint('detailed')}>🖨️ Print Detailed</button>
                    </>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => handlePrint('summary')}>🖨️ Print</button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="table-wrapper">{renderResult()}</div>
          </div>
        </div>
      </div>
      {selectedCollector && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setSelectedCollector(null)}>
          <div className="modal modal-print-area" id="printable-area" style={{ maxWidth: 980 }}>
            <div className="modal-header">
              <span className="modal-title">{active === 'full-paid' ? 'Fully Paid Details' : active === 'payments-reversed' ? 'Reversed Payment Details' : (active === 'monthly-releases' || active === 'loan-type') ? 'Release Details' : active === 'past-due' ? 'Maturity Details' : 'Collection Details'} - {selectedCollector.collector}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => window.print()}>🖨️ Print</button>
                <button className="modal-close" onClick={() => setSelectedCollector(null)}>x</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>Collector</div>
                  <div className="fw-bold">{selectedCollector.collector}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>{active === 'payments-reversed' ? 'No. of Reversals' : (active === 'monthly-releases' || active === 'loan-type') ? 'No. of Releases' : active === 'past-due' || active === 'full-paid' ? 'No. of Client' : 'No. of Payments'}</div>
                  <div className="fw-bold">{(active === 'monthly-releases' || active === 'loan-type') || active === 'full-paid' ? (selectedCollector.loan_count || selectedCollector.payment_count) : active === 'past-due' ? selectedCollector.client_count : selectedCollector.payment_count}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>{active === 'payments-reversed' ? 'Total Reversed' : (active === 'monthly-releases' || active === 'loan-type') ? 'Total Released' : active === 'past-due' ? 'Total Balance' : active === 'full-paid' ? 'Total Principal' : 'Total Collection'}</div>
                  <div className={`fw-bold ${active === 'payments-reversed' ? '' : 'text-success'}`} style={active === 'payments-reversed' ? { color: '#dc2626' } : {}}>₱ {fmt(active === 'past-due' ? selectedCollector.total_balance : (selectedCollector.total_amount || selectedCollector.total_principal))}</div>
                </div>
              </div>
              <div style={{ maxHeight: '55vh', overflow: 'auto' }} className="modal-print-ready">
                <table className="data-table">
                  {active === 'monthly-releases' || active === 'loan-type' ? (
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
                        <tr><th>Client Code</th><th>Client</th><th>Loan#</th><th className="text-right">Principal</th><th className="text-right">Total Loan Amount</th><th className="text-right">Balance</th><th>Maturity</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {selectedCollector.loans?.length === 0 ? <tr><td colSpan={9} className="empty-state">No maturity details</td></tr> : selectedCollector.loans?.map(l => (
                          <tr key={l.id}>
                            <td className="mono">{l.customer_code || '-'}</td>
                            <td className="fw-600">{l.customer_name || '-'}</td>
                            <td className="mono">{l.loan_code || '-'}</td>
                            <td className="text-right">₱ {fmt(l.principal)}</td>
                            <td className="text-right fw-bold text-accent">₱ {fmt(Number(l.principal || 0) + Number(l.interest_amount || 0))}</td>
                            <td className="text-right fw-bold">₱ {fmt(l.balance)}</td>
                            <td>{l.date_maturity || '-'}</td>
                            <td><span className={`badge badge-${l.status}`}>{l.status === 'pastdue' && l.days_overdue > 0 ? `Pastdue (${l.days_overdue} days)` : l.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                   ) : active === 'payments-reversed' ? (
                    <>
                      <thead>
                        <tr><th>Client Code</th><th>Client</th><th>OR#</th><th>Loan#</th><th>Date Paid</th><th className="text-right">Amount</th><th>Reason</th><th>Reversed By</th></tr>
                      </thead>
                      <tbody>
                        {selectedCollector.payments?.length === 0 ? <tr><td colSpan={8} className="empty-state">No reversed payment details</td></tr> : selectedCollector.payments?.map(p => (
                          <tr key={p.id}>
                            <td className="mono">{p.customer_code || '-'}</td>
                            <td className="fw-600">{p.customer_name || '-'}</td>
                            <td className="mono">{p.or_number || '-'}</td>
                            <td className="mono">{p.loan_code || '-'}</td>
                            <td>{p.date_paid}</td>
                            <td className="text-right fw-bold" style={{ color: '#dc2626' }}>₱ {fmt(p.amount_paid)}</td>
                            <td style={{ fontSize: 11 }}>{p.reversal_reason || '-'}</td>
                            <td style={{ fontSize: 11 }}>{p.reversed_by_name || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                   ) : active === 'full-paid' ? (
                    <>
                      <thead>
                        <tr><th>Client Code</th><th>Client</th><th>Loan#</th><th>Date Released</th><th className="text-right">Principal</th><th className="text-right">Total Paid</th></tr>
                      </thead>
                      <tbody>
                        {selectedCollector.loans?.length === 0 ? <tr><td colSpan={6} className="empty-state">No fully paid details</td></tr> : selectedCollector.loans?.map(l => (
                          <tr key={l.id}>
                            <td className="mono">{l.customer_code || '-'}</td>
                            <td className="fw-600">{l.customer_name || '-'}</td>
                            <td className="mono">{l.loan_code || '-'}</td>
                            <td>{l.date_released}</td>
                            <td className="text-right fw-bold" style={{ color: '#16a34a' }}>₱ {fmt(l.principal)}</td>
                            <td className="text-right fw-bold text-success">₱ {fmt(l.total_paid)}</td>
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
