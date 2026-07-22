import { useEffect, useRef, useState } from 'react'
import API from '../services/api'
import logoImg from '../assets/logo.png'
import html2pdf from 'html2pdf.js'
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
const shortDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '-'
const fmtMoney = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rawMoney = value => Number(value || 0).toFixed(2)
const toDisplayCase = value => String(value || '')
  .toLocaleLowerCase('en-PH')
  .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, prefix, char) => prefix + char.toLocaleUpperCase('en-PH'))
  .replace(/\bIi\b/g, 'II')
  .replace(/\bIii\b/g, 'III')
  .replace(/\bIv\b/g, 'IV')
  .replace(/\bVi\b/g, 'VI')
const formatClientAddress = loan => {
  const direct = loan.full_address || loan.customer_address
  if (direct) return toDisplayCase(direct)

  const composed = [
    loan.customer_address_line || loan.address,
    loan.customer_sitio,
    loan.customer_purok,
    loan.customer_brgy,
    loan.customer_city,
    loan.customer_province,
    loan.customer_zip_code
  ].map(part => String(part || '').trim()).filter(Boolean).join(', ')

  return composed ? toDisplayCase(composed) : '-'
}
const safeFilePart = value => String(value || '')
  .trim()
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase() || 'report'
const csvCell = value => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
const downloadCsv = (filename, rows) => {
  const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
const dateOnly = value => value ? String(value).slice(0, 10) : ''
const calculateAge = birthDate => {
  if (!birthDate) return '-'
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '-'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}
const addDays = (value, days) => {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + Number(days || 0))
  return toDateInputValue(date)
}
const addCollectionDaysSkippingSunday = (value, days) => {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  let counted = 0
  const target = Number(days || 0)
  while (counted < target) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0) counted += 1
  }
  return toDateInputValue(date)
}
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
const COLLECTION_STATUS_GROUPS = [
  { key: 'active', label: 'Active', color: '#1F2933' },
  { key: 'recon', label: 'Recon', color: '#1565C0' },
  { key: 'overdue', label: 'Overdue', color: '#EF6C00' },
  { key: 'pastdue', label: 'Past Due', color: '#D71920' },
]
const REPORT_PRINT_CLARITY_CSS = `
  @media print {
    #printable-area,
    #printable-area * {
      color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    #printable-area {
      color: #111827 !important;
      font-weight: 500 !important;
    }

    #printable-area .data-table,
    #printable-area table.data-table,
    #printable-area .table-responsive-print {
      border-color: #334155 !important;
      box-shadow: none !important;
    }

    #printable-area .data-table {
      border-collapse: collapse !important;
    }

    #printable-area .data-table th {
      background: #e5e7eb !important;
      color: #0f172a !important;
      border: 1.35px solid #334155 !important;
      font-weight: 900 !important;
      text-shadow: none !important;
    }

    #printable-area .data-table td {
      color: #111827 !important;
      border: 1.15px solid #475569 !important;
      font-weight: 600 !important;
      text-shadow: none !important;
    }

    #printable-area .data-table tbody tr:nth-child(even) td {
      background: #f8fafc !important;
    }

    #printable-area .data-table tfoot td,
    #printable-area .data-table tfoot th,
    #printable-area tr[style*="GRAND"],
    #printable-area .fw-bold {
      color: #0f172a !important;
      font-weight: 900 !important;
    }

    #printable-area .text-success,
    #printable-area .text-accent,
    #printable-area td[style*="#16a34a"],
    #printable-area span[style*="#16a34a"] {
      color: #047857 !important;
      font-weight: 900 !important;
    }

    #printable-area .text-danger,
    #printable-area td[style*="#dc2626"],
    #printable-area span[style*="#dc2626"] {
      color: #b91c1c !important;
      font-weight: 900 !important;
    }

    #printable-area .mono,
    #printable-area .tag,
    #printable-area .badge {
      color: #0f172a !important;
      border-color: #475569 !important;
      font-weight: 800 !important;
    }

    #printable-area h1,
    #printable-area h2,
    #printable-area h3,
    #printable-area .modal-title {
      color: #0f172a !important;
      font-weight: 900 !important;
    }

    #printable-area div[style*="#64748b"],
    #printable-area div[style*="var(--text-muted)"],
    #printable-area span[style*="#64748b"],
    #printable-area .nav-section-label {
      color: #334155 !important;
      font-weight: 700 !important;
    }

    #printable-area div[style*="borderBottom"],
    #printable-area div[style*="border-bottom"] {
      border-color: #334155 !important;
    }
  }
`
const classifyCollectionAccount = account => {
  const dpd = Math.max(0, parseInt(account?.days_past_due ?? account?.days_overdue, 10) || 0)
  if (dpd >= 45) return 'pastdue'
  if (dpd >= 1) return 'overdue'
  if ((account?.loan_type || '').toLowerCase().includes('recon')) return 'recon'
  return 'active'
}
const groupCollectionAccounts = accounts => COLLECTION_STATUS_GROUPS.map(group => ({
  ...group,
  rows: (accounts || [])
    .filter(account => classifyCollectionAccount(account) === group.key)
    .sort((a, b) =>
      String(a.customer_name || '').localeCompare(String(b.customer_name || '')) ||
      String(a.date_paid || '').localeCompare(String(b.date_paid || '')) ||
      String(a.loan_code || '').localeCompare(String(b.loan_code || ''))
    )
}))
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

const loanPrincipal = loan => Number(loan?.principal || 0)
const loanInterest = loan => {
  const explicitInterest = Number(loan?.interest_amount || 0)
  if (explicitInterest > 0) return explicitInterest
  const paidOverPrincipal = Number(loan?.total_paid || 0) - loanPrincipal(loan)
  return paidOverPrincipal > 0 ? paidOverPrincipal : 0
}
const loanTotalAmount = loan => loanPrincipal(loan) + loanInterest(loan)

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
  { key: 'payments-reversed', label: '↩️ Payments Reversed', desc: 'Reversed payments by date range' },
  { key: 'maturity-check', label: '📆 Maturity Checker', desc: 'Loans maturing soon' },
  { key: 'full-paid', label: '✅ Fully Paid Loans', desc: 'Fully paid loan accounts' },
  { key: 'loan-type', label: '📊 Loan Type Summary', desc: 'Summary by loan type and status' },
  { key: 'collection-sheet', label: '📋 Collection Sheet', desc: 'Per-collector active loan list' },
  { key: 'daily-target', label: '🎯 Daily Target', desc: 'Daily target collection' },
  { key: 'disclosure-statement', label: 'Disclosure Statement', desc: 'Client disclosure for every reloan' },
  { key: 'monitoring-summary', label: '🚨 Monitoring Summary', desc: 'Alerts, escalations, PTPs, and resolutions' },
]

export default function Reports() {
  const autoLoaded = useRef(false)
  const [active, setActive] = useState('collection-report')
  const [collectionSubTab, setCollectionSubTab] = useState('daily')
  const [releaseSubTab, setReleaseSubTab] = useState('daily')
  const [monthlySubTab, setMonthlySubTab] = useState('by-collector')
  const [releaseMonthlySubTab, setReleaseMonthlySubTab] = useState('by-collector')
  const [params, setParams] = useState({ date_from: yesterday(), date_to: yesterday(), year: new Date().getFullYear(), month: new Date().getMonth() + 1, collection_month: 'all', collection_cycle_type: '30', collection_cycle: 'all', release_cycle_type: '30', release_cycle: 'all', days_ahead: 30, collector_id: '', disclosure_search: '', disclosure_loan_id: '', monitoring_tab: 'new' })
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


  const printCollectionSheet = async () => {
    if (!params.collector_id) {
      alert('Please select a collector first.')
      return
    }

    if (!data) {
      const generated = await run('collection-sheet', params)
      if (!generated) return
    }

    setPrintMode('detailed')
    setTimeout(() => {
      window.print()
    }, 150)
  }

  const handleExportPdf = async () => {
    printCollectionSheet();
  }

  const handleExportDisclosurePdf = () => {
    const printable = document.getElementById('printable-area')
    if (!printable) {
      alert('Disclosure statement is not ready yet. Please run the report first.')
      return
    }

    const loanCode = data?.loan?.loan_code || params.disclosure_loan_id || 'disclosure'
    const safeLoanCode = String(loanCode).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'disclosure'
    const exportRoot = printable.cloneNode(true)
    exportRoot.removeAttribute('id')
    exportRoot.classList.add('disclosure-pdf-export')
    exportRoot.style.margin = '0'
    exportRoot.style.boxShadow = 'none'
    exportRoot.style.width = '8.22in'
    exportRoot.style.height = '13.62in'
    exportRoot.style.maxWidth = 'none'
    exportRoot.style.overflow = 'hidden'

    const pdfStyle = document.createElement('style')
    pdfStyle.textContent = `
      .disclosure-pdf-export {
        display: flex !important;
        flex-direction: column !important;
        width: 8.22in !important;
        height: 13.62in !important;
        max-width: none !important;
        border: 1.5px solid #1f365f !important;
        box-shadow: none !important;
        margin: 0 !important;
        overflow: hidden !important;
        background: #fff !important;
        color: #293344 !important;
        font-family: Arial, Helvetica, sans-serif !important;
        box-sizing: border-box !important;
      }
      .disclosure-pdf-export * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        box-sizing: border-box !important;
      }
      .disclosure-pdf-export .ds-header { flex: 0 0 auto !important; padding: 0.18in 0.32in !important; gap: 0.16in !important; border-left-width: 0.09in !important; }
      .disclosure-pdf-export .ds-company { font-size: 22pt !important; letter-spacing: 1.1px !important; }
      .disclosure-pdf-export .ds-sub { margin-top: 0.045in !important; font-size: 8.8pt !important; }
      .disclosure-pdf-export .ds-badge { min-width: 2.35in !important; padding: 0.08in 0.14in !important; border: 1.5px solid #45699d !important; border-radius: 0.08in !important; }
      .disclosure-pdf-export .ds-badge-title { font-size: 15pt !important; }
      .disclosure-pdf-export .ds-badge-id { margin-top: 0.03in !important; font-size: 11.5pt !important; }
      .disclosure-pdf-export .ds-body { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; padding: 0.1in 0.25in 0.05in !important; overflow: hidden !important; }
      .disclosure-pdf-export .ds-section { margin-bottom: 0.07in !important; border: 1.5px solid #9aabc4 !important; border-radius: 0.06in !important; break-inside: avoid !important; }
      .disclosure-pdf-export .ds-section:last-of-type { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; min-height: 2.5in !important; margin-bottom: 0.04in !important; }
      .disclosure-pdf-export .ds-section-title { padding: 0.035in 0.12in !important; font-size: 10.6pt !important; letter-spacing: 0.35px !important; }
      .disclosure-pdf-export .ds-section-body { padding: 0.065in 0.12in !important; }
      .disclosure-pdf-export .ds-section:last-of-type .ds-section-body { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; padding-bottom: 0.075in !important; }
      .disclosure-pdf-export .ds-grid-2 { gap: 0.06in 0.2in !important; }
      .disclosure-pdf-export .ds-grid-3 { gap: 0.06in 0.16in !important; }
      .disclosure-pdf-export .ds-field { grid-template-columns: 1.14in 1fr !important; gap: 0.05in !important; font-size: 8pt !important; min-height: 0.15in !important; }
      .disclosure-pdf-export .ds-field b { min-height: 0.125in !important; border-bottom: 1.4px solid #a9b7ca !important; }
      .disclosure-pdf-export .ds-charge-strip { margin-top: 0.055in !important; border: 1.2px solid #c3cfdd !important; border-radius: 0.04in !important; }
      .disclosure-pdf-export .ds-charge-strip .ds-field { padding: 0.028in 0.065in !important; grid-template-columns: 1fr auto !important; font-size: 7.4pt !important; }
      .disclosure-pdf-export .ds-charge-strip .ds-field b { border-bottom: 0 !important; }
      .disclosure-pdf-export .ds-schedule { gap: 0.07in !important; }
      .disclosure-pdf-export .ds-schedule table { font-size: 7.35pt !important; }
      .disclosure-pdf-export .ds-schedule th { border-bottom: 0.9px solid #d5dce8 !important; padding: 0.023in 0.015in !important; line-height: 1.08 !important; }
      .disclosure-pdf-export .ds-schedule td { border-bottom: 0.35px solid #f1f4f8 !important; padding: 0.016in 0.015in !important; line-height: 1.06 !important; }
      .disclosure-pdf-export .ds-schedule table:not(:last-child) { border-right: 1.2px solid #9fb0c8 !important; padding-right: 0.05in !important; }
      .disclosure-pdf-export .ds-disclosure-head { font-size: 7.4pt !important; margin-bottom: 0.04in !important; }
      .disclosure-pdf-export .ds-section:last-of-type .ds-grid-2 { gap: 0.035in 0.18in !important; }
      .disclosure-pdf-export .ds-section:last-of-type .ds-field { font-size: 7.5pt !important; min-height: 0.13in !important; }
      .disclosure-pdf-export .ds-section:last-of-type .ds-field b { min-height: 0.105in !important; }
      .disclosure-pdf-export .ds-signatures { gap: 0.16in !important; margin: 0.36in 0 0.12in !important; }
      .disclosure-pdf-export .ds-signature { font-size: 6.7pt !important; }
      .disclosure-pdf-export .ds-line { border-top: 1.4px solid #253a61 !important; margin-bottom: 0.04in !important; }
      .disclosure-pdf-export .ds-ack { font-size: 7.15pt !important; line-height: 1.1 !important; margin: 0.075in 0 !important; }
      .disclosure-pdf-export .ds-clause { font-size: 6.9pt !important; line-height: 1.1 !important; }
      .disclosure-pdf-export .ds-borrower { grid-template-columns: 1fr 1.45in !important; gap: 0.5in !important; margin: auto 0.15in 0 !important; padding-top: 0.18in !important; }
      .disclosure-pdf-export .ds-footer { flex: 0 0 auto !important; margin-top: auto !important; padding: 0.045in 0.32in !important; font-size: 7.4pt !important; }
    `
    exportRoot.prepend(pdfStyle)

    const exportHost = document.createElement('div')
    exportHost.style.position = 'fixed'
    exportHost.style.left = '-10000px'
    exportHost.style.top = '0'
    exportHost.style.width = '8.5in'
    exportHost.style.background = '#fff'
    exportHost.appendChild(exportRoot)
    document.body.appendChild(exportHost)

    html2pdf()
      .set({
        margin: [0.16, 0.14, 0.22, 0.14],
        filename: `Disclosure_Statement_${safeLoanCode}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'in', format: [8.5, 14], orientation: 'portrait' },
        pagebreak: { mode: [] }
      })
      .from(exportRoot)
      .save()
      .finally(() => exportHost.remove())
  }

  const handleExportExcel = () => {
    if (!data || data.error) return

    const addMeta = (rows, title, details = []) => [
      [title],
      ...details.filter(row => row.some(value => value !== '' && value !== null && value !== undefined)),
      [],
      ...rows,
    ]
    const periodLabel = `${dateOnly(data.date_from || params.date_from)} to ${dateOnly(data.date_to || params.date_to)}`
    const write = (name, rows) => downloadCsv(`${safeFilePart(name)}.csv`, rows)

    if (active === 'collection-report') {
      const payments = data.payments || []
      if (collectionSubTab === 'monthly') {
        const matrix = getMonthlyCollectionMatrix(payments, params)
        const cycleLabel = params.collection_cycle_type === '45' ? '45 Days / 1.5 Month' : '30 Days / By Month'
        const headers = monthlySubTab === 'overall'
          ? ['Summary', ...matrix.periods.map(period => period.label), 'Grand Total']
          : ['Collector', ...matrix.periods.map(period => period.label), 'Total Collection']
        const body = monthlySubTab === 'overall'
          ? [[
              'Overall Total',
              ...matrix.periods.map(period => rawMoney(matrix.periodTotals[period.key]?.amount || 0)),
              rawMoney(matrix.periods.reduce((sum, period) => sum + Number(matrix.periodTotals[period.key]?.amount || 0), 0)),
            ]]
          : [
              ...matrix.rows.map(row => [
                row.collector,
                ...matrix.periods.map(period => rawMoney(row.periods[period.key]?.amount || 0)),
                rawMoney(row.total_amount),
              ]),
              [
                'GRAND TOTAL',
                ...matrix.periods.map(period => rawMoney(matrix.periodTotals[period.key]?.amount || 0)),
                rawMoney(matrix.rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)),
              ],
            ]
        write(`collection-monthly-${cycleLabel}-${monthlySubTab}-${params.year}`, addMeta([headers, ...body], 'Collection Report - Monthly', [['Cycle Type', cycleLabel], ['View', monthlySubTab], ['Year', params.year]]))
        return
      }

      const collectorRows = getCollectorRows(payments)
      const rows = [
        ['Collector', 'No. of Payments', 'Total Collection'],
        ...collectorRows.map(row => [row.collector, row.payment_count, rawMoney(row.total_amount)]),
        ['GRAND TOTAL', collectorRows.reduce((sum, row) => sum + Number(row.payment_count || 0), 0), rawMoney(data.total || collectorRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0))],
        [],
        ['Details'],
        ['Client Code', 'Date Paid', 'Client', 'OR Number', 'Loan Number', 'Amount Paid', 'Balance After', 'Collector'],
        ...payments.map(payment => [
          payment.customer_code,
          dateOnly(payment.date_paid),
          payment.customer_name,
          payment.or_number,
          payment.loan_code,
          rawMoney(payment.amount_paid),
          rawMoney(payment.balance_after),
          payment.collector_name || 'Unassigned',
        ]),
      ]
      write(`collection-daily-${periodLabel}`, addMeta(rows, 'Collection Report - Daily', [['Period', periodLabel]]))
      return
    }

    if (active === 'monthly-releases') {
      const loans = data.loans || []
      if (releaseSubTab === 'monthly') {
        const matrix = getMonthlyReleaseMatrix(loans, params)
        const cycleLabel = params.release_cycle_type === '45' ? '45 Days / 1.5 Month' : '30 Days / By Month'
        const headers = releaseMonthlySubTab === 'overall'
          ? ['Summary', ...matrix.periods.map(period => period.label), 'Grand Total']
          : ['Collector', ...matrix.periods.map(period => period.label), 'Total Release Amount']
        const body = releaseMonthlySubTab === 'overall'
          ? [[
              'Overall Total',
              ...matrix.periods.map(period => rawMoney(matrix.periodTotals[period.key]?.amount || 0)),
              rawMoney(matrix.periods.reduce((sum, period) => sum + Number(matrix.periodTotals[period.key]?.amount || 0), 0)),
            ]]
          : [
              ...matrix.rows.map(row => [
                row.collector,
                ...matrix.periods.map(period => rawMoney(row.periods[period.key]?.amount || 0)),
                rawMoney(row.total_amount),
              ]),
              [
                'GRAND TOTAL',
                ...matrix.periods.map(period => rawMoney(matrix.periodTotals[period.key]?.amount || 0)),
                rawMoney(matrix.rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)),
              ],
            ]
        write(`releases-monthly-${cycleLabel}-${releaseMonthlySubTab}-${params.year}`, addMeta([headers, ...body], 'Releases Report - Monthly', [['Cycle Type', cycleLabel], ['View', releaseMonthlySubTab], ['Year', params.year]]))
        return
      }

      const collectorRows = getReleaseCollectorRows(loans)
      const rows = [
        ['Collector', 'No. of Loans', 'New Count', 'New Amount', 'Reloan Count', 'Reloan Amount', 'Recon Count', 'Recon Amount', 'Total Principal'],
        ...collectorRows.map(row => [row.collector, row.loan_count, row.new_count, rawMoney(row.new_amount), row.reloan_count, rawMoney(row.reloan_amount), row.recon_count, rawMoney(row.recon_amount), rawMoney(row.total_principal)]),
        ['GRAND TOTAL', collectorRows.reduce((sum, row) => sum + Number(row.loan_count || 0), 0), '', '', '', '', '', '', rawMoney(data.total_principal || collectorRows.reduce((sum, row) => sum + Number(row.total_principal || 0), 0))],
        [],
        ['Details'],
        ['Client Code', 'Client', 'Loan Number', 'Loan Type', 'Principal', 'Date Released', 'Maturity Date', 'Collector'],
        ...loans.map(loan => [
          loan.customer_code,
          loan.customer_name,
          loan.loan_code,
          loan.loan_type,
          rawMoney(loan.principal),
          dateOnly(loan.date_released),
          dateOnly(loan.date_maturity),
          loan.collector_name || 'Unassigned',
        ]),
      ]
      write(`releases-daily-${periodLabel}`, addMeta(rows, 'Releases Report - Daily', [['Period', periodLabel]]))
      return
    }

    if (active === 'past-due') {
      const loans = data.loans || []
      const rows = [
        ['Collector', 'Customer Code', 'Customer Name', 'Loan Number', 'Principal', 'Interest', 'Total Loan Amount', 'Running Balance', 'Date Released', 'Maturity Date', 'Days Overdue'],
        ...loans.map(loan => [
          loan.collector_name || 'Unassigned',
          loan.customer_code,
          loan.customer_name,
          loan.loan_code,
          rawMoney(loan.principal),
          rawMoney(loan.interest_amount),
          rawMoney(Number(loan.principal || 0) + Number(loan.interest_amount || 0)),
          rawMoney(loan.balance),
          dateOnly(loan.date_released),
          dateOnly(loan.date_maturity),
          loan.days_overdue || loan.days_past_due || '',
        ]),
      ]
      write(`loans-maturity-checker-${periodLabel}`, addMeta(rows, 'Loans Maturity Checker', [['Maturity Date', periodLabel], ['Total Loan Amount', rawMoney(data.total_loan_amount)], ['Total Running Balance', rawMoney(data.total_balance)]]))
      return
    }

    if (active === 'payments-reversed') {
      const payments = data.payments || []
      const rows = [
        ['Collector', 'Customer Code', 'Customer Name', 'OR Number', 'Loan Number', 'Date Paid', 'Amount Paid', 'Reversed At', 'Reversed By', 'Reason'],
        ...payments.map(payment => [
          payment.collector_name || 'Unassigned',
          payment.customer_code,
          payment.customer_name,
          payment.or_number,
          payment.loan_code,
          dateOnly(payment.date_paid),
          rawMoney(payment.amount_paid),
          dateOnly(payment.reversed_at || payment.updated_at),
          payment.reversed_by_name || payment.reversed_by || '',
          payment.reversal_reason || payment.reason || '',
        ]),
      ]
      write(`payments-reversed-${periodLabel}`, addMeta(rows, 'Payments Reversed', [['Period', periodLabel], ['Total Reversed', rawMoney(data.total_amount)]]))
      return
    }

    if (active === 'full-paid') {
      const loans = data.loans || []
      const rows = [
        ['Collector', 'Customer Code', 'Customer Name', 'Loan Number', 'Date Released', 'Principal', 'Interest', 'Total Loan Amount', 'Total Paid', 'Date Fully Paid'],
        ...loans.map(loan => [
          loan.collector_name || 'Unassigned',
          loan.customer_code,
          loan.customer_name,
          loan.loan_code,
          dateOnly(loan.date_released),
          rawMoney(loanPrincipal(loan)),
          rawMoney(loanInterest(loan)),
          rawMoney(loanTotalAmount(loan)),
          rawMoney(loan.total_paid),
          dateOnly(loan.date_fully_paid || loan.updated_at),
        ]),
      ]
      write(`full-paid-loans-${periodLabel}`, addMeta(rows, 'Full Paid Loans', [['Period', periodLabel], ['Total Principal', rawMoney(data.total_principal)], ['Total Interest', rawMoney(data.total_interest)], ['Total Loan Amount', rawMoney(data.total_loan_amount)]]))
      return
    }

    if (active === 'collection-sheet') {
      const loans = data.loans || []
      const rows = [
        ['Client Code', 'Client Name', 'Loan Number', 'Loan Type', 'Principal', 'Running Balance', 'Amortization', 'Date Released', 'Maturity Date', 'Collector', 'Contact Number'],
        ...loans.map(loan => [
          loan.customer_code,
          loan.customer_name,
          loan.loan_code,
          loan.loan_type,
          rawMoney(loan.principal),
          rawMoney(loan.balance),
          rawMoney(loan.amortization),
          dateOnly(loan.date_released),
          dateOnly(loan.date_maturity),
          loan.collector_name || data.collector_name || '',
          loan.contact || loan.phone || '',
        ]),
      ]
      write(`collection-sheet-${data.collector_name || params.collector_id || 'collector'}-${dateOnly(params.date || new Date().toISOString())}`, addMeta(rows, 'Collection Sheet', [['Collection Date', dateOnly(params.date || new Date().toISOString())], ['Collector', data.collector_name || params.collector_id]]))
      return
    }

    if (active === 'disclosure-statement') {
      const loan = data.loan || {}
      const schedule = data.schedule || []
      const rows = [
        ['Loan Information'],
        ['Client', loan.customer_name || [loan.last_name, loan.first_name, loan.middle_name].filter(Boolean).join(', ')],
        ['Loan Number', loan.loan_code || loan.id],
        ['Loan Type', loan.loan_type],
        ['Principal', rawMoney(loan.principal)],
        ['Interest Rate', loan.interest_rate],
        ['Loan Period', loan.loan_period],
        ['Amortization', rawMoney(loan.amortization)],
        ['Date Released', dateOnly(loan.date_released)],
        ['Maturity Date', dateOnly(loan.date_maturity)],
        ['Purpose', loan.loan_purpose || loan.remarks],
        [],
        ['Amortization Schedule'],
        ['Period', 'Due Date', 'Amount Due', 'Balance'],
        ...schedule.map((item, index) => [item.period_number || index + 1, dateOnly(item.due_date), rawMoney(item.amount_due), rawMoney(item.balance)]),
      ]
      write(`disclosure-statement-${loan.loan_code || loan.id || 'loan'}`, addMeta(rows, 'Disclosure Statement'))
      return
    }

    if (active === 'monitoring-summary') {
      const rows = data.rows || []
      const exportRows = [
        ['Client Code', 'Client Name', 'Running Balance', 'Last Payment', 'Contact Number', 'Remarks'],
        ...rows.map(row => [
          row.customer_code,
          row.customer_name,
          rawMoney(row.balance),
          row.last_payment_date ? `${dateOnly(row.last_payment_date)} - ${rawMoney(row.last_payment_amount)}` : '',
          row.contact,
          '',
        ]),
      ]
      write(`monitoring-summary-${data.tab_label || params.monitoring_tab}`, addMeta(exportRows, `Monitoring Summary - ${data.tab_label || ''}`, [['As of', dateOnly(data.as_of || new Date().toISOString())], ['Total Clients', rows.length]]))
    }

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
    if (key === 'collection-sheet' || key === 'daily-target') { loadCollectors(); setParams(p => ({ ...p, date: toDateInputValue(new Date()) })) }
    if (key === 'disclosure-statement') { setParams(p => ({ ...p, disclosure_loan_id: '' })) }
    if (key === 'monitoring-summary') {
      const nextParams = { ...params, monitoring_tab: params.monitoring_tab || 'new' }
      setParams(nextParams)
      run(key, nextParams)
    }
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
      if (reportKey === 'disclosure-statement') {
        endpoint = 'disclosure-statement'
        finalParams = {
          search: finalParams.disclosure_search,
          loan_id: finalParams.disclosure_loan_id,
        }
      }
      if (reportKey === 'monitoring-summary') {
        const r = await API.get('/monitoring/alerts', { params: { tab: finalParams.monitoring_tab || 'new' } })
        const labels = {
          new: 'New (Day 3)',
          monitoring: 'Under Monitoring',
          ptp: 'Promise to Pay',
          escalated: 'Escalated',
        }
        setData({
          as_of: toDateInputValue(new Date()),
          tab: finalParams.monitoring_tab || 'new',
          tab_label: labels[finalParams.monitoring_tab || 'new'],
          rows: Array.isArray(r.data) ? r.data : [],
        })
        return
      }
      if (reportKey === 'daily-target') {
        endpoint = 'collection-sheet'
      }
      const r = await API.get(`/reports/${endpoint}`, { params: finalParams })
      setData(r.data)
    } catch (err) {
      setData({ error: err.response?.data?.error || err.message || 'Failed to generate report.' })
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
    if (active === 'monitoring-summary') {
      const monitoringTabs = [
        { id: 'new', label: 'New (Day 3)' },
        { id: 'monitoring', label: 'Under Monitoring' },
        { id: 'ptp', label: 'Promise to Pay' },
        { id: 'escalated', label: 'Escalated' },
      ]
      return (
        <div className="form-group">
          <label className="form-label">Monitoring Table</label>
          <select
            className="form-control"
            value={params.monitoring_tab || 'new'}
            onChange={e => {
              const nextParams = { ...params, monitoring_tab: e.target.value }
              setParams(nextParams)
              run('monitoring-summary', nextParams)
            }}
            style={{ minWidth: 240 }}
          >
            {monitoringTabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
          </select>
        </div>
      )
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
    if (active === 'collection-sheet' || active === 'daily-target') return (
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
    if (active === 'disclosure-statement') return (
      <>
        <div className="form-group" style={{ minWidth: 320 }}>
          <label className="form-label">Client Code / Name</label>
          <input
            type="text"
            className="form-control"
            placeholder="Search client code or name..."
            value={params.disclosure_search}
            onChange={e => setParams(p => ({ ...p, disclosure_search: e.target.value, disclosure_loan_id: '' }))}
            onKeyDown={e => {
              if (e.key === 'Enter' && params.disclosure_search.trim()) run('disclosure-statement', params)
            }}
          />
        </div>
        {data?.loan_options?.length > 1 && (
          <div className="form-group" style={{ minWidth: 260 }}>
            <label className="form-label">Reloan / Loan</label>
            <select
              className="form-control"
              value={params.disclosure_loan_id || data.loan?.id || ''}
              onChange={e => {
                const nextParams = { ...params, disclosure_loan_id: e.target.value }
                setParams(nextParams)
                run('disclosure-statement', nextParams)
              }}
            >
              {data.loan_options.map(loan => (
                <option key={loan.id} value={loan.id}>
                  {loan.loan_code} - {loan.loan_type || 'Loan'} - {shortDate(loan.date_released)}
                </option>
              ))}
            </select>
          </div>
        )}
      </>
    )
    return null
  }

  const renderResult = () => {
    if (loading) return <div className="empty-state"><p>⏳ Generating report...</p></div>
    if (!data) return <div className="empty-state"><div className="empty-icon">📊</div><p>Set your parameters and click Run Report</p></div>

    if (active === 'disclosure-statement') {
      const loan = data.loan || {}
      const totalLoan = Number(loan.total_amortization || loan.principal || 0)
      const principal = Number(loan.principal || 0)
      const interestRate = Number(loan.interest_rate || 0)
      const loanPeriod = Number(loan.loan_period || 0)
      const amortization = Number(loan.amortization || 0)
      const maturityDate = loan.date_maturity || addCollectionDaysSkippingSunday(loan.date_released, loanPeriod)
      const fullName = loan.customer_name || [loan.last_name, loan.first_name, loan.middle_name].filter(Boolean).join(', ')
      const phone = [loan.contact, loan.secondary_contact].filter(Boolean).join('/')
      const businessNature = loan.business_type || loan.business_name || loan.occupation || '-'
      const purpose = loan.loan_purpose || loan.remarks || 'Additional Capital'
      const idDocument = [loan.id_type, loan.id_number].filter(Boolean).join(' - ') || '-'
      const clientAddress = formatClientAddress(loan)
      const collateral = loan.collateral || '-'
      const netProceed = Number(loan.net_proceeds || principal)
      const charges = Number(loan.service_fee || 0) + Number(loan.insurance || 0) + Number(loan.notarial_fee || 0) + Number(loan.filing_fee || 0) + Number(loan.total_deductions || 0)
      const rawSchedule = data.schedule || []
      const schedule = rawSchedule.length > 0 ? rawSchedule.map((item, idx) => {
        const amount = Number(item.amount_due || amortization || 0)
        const paidThrough = rawSchedule.slice(0, idx + 1).reduce((sum, row) => sum + Number(row.amount_due || amortization || 0), 0)
        const periodNumber = Number(item.period_number || idx + 1)
        return {
          no: periodNumber,
          date: addCollectionDaysSkippingSunday(loan.date_released, periodNumber) || item.due_date,
          amount,
          balance: Math.max(totalLoan - paidThrough, 0),
        }
      }) : Array.from({ length: Math.max(loanPeriod, 1) }, (_, idx) => {
        const count = Math.max(loanPeriod, 1)
        const isLast = idx === count - 1
        const amount = isLast ? Math.max(totalLoan - (amortization * idx), 0) : amortization
        return {
          no: idx + 1,
          date: addCollectionDaysSkippingSunday(loan.date_released, idx + 1),
          amount,
          balance: Math.max(totalLoan - (amortization * idx) - amount, 0),
        }
      })
      const scheduleRowsPerColumn = Math.ceil(schedule.length / 3)
      const scheduleColumns = [
        schedule.slice(0, scheduleRowsPerColumn),
        schedule.slice(scheduleRowsPerColumn, scheduleRowsPerColumn * 2),
        schedule.slice(scheduleRowsPerColumn * 2),
      ]
      const field = (label, value, strong = false) => (
        <div className="ds-field">
          <span>{label}</span>
          <b className={strong ? 'ds-strong' : ''}>{value || '-'}</b>
        </div>
      )
      const section = (title, children) => (
        <section className="ds-section">
          <div className="ds-section-title">{title}</div>
          <div className="ds-section-body">{children}</div>
        </section>
      )

      return (
        <div id="printable-area" className="disclosure-print">
          <style>{`
            .disclosure-print { background: #fff; color: #293344; font-family: Arial, Helvetica, sans-serif; max-width: 1120px; margin: 0 auto; border: 1px solid #d7e0ec; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08); }
            .ds-header { display: flex; justify-content: space-between; gap: 24px; align-items: center; background: #11244a; color: #fff; border-left: 14px solid #f6bd13; padding: 28px 40px; }
            .ds-company { font-size: 34px; font-weight: 900; letter-spacing: 2px; line-height: 1; }
            .ds-sub { margin-top: 10px; color: #cbd5e1; font-size: 15px; }
            .ds-badge { border: 1px solid #355587; border-radius: 10px; padding: 12px 22px; text-align: center; min-width: 270px; background: rgba(255,255,255,0.04); }
            .ds-badge-title { font-size: 22px; font-weight: 900; letter-spacing: 1px; }
            .ds-badge-id { margin-top: 6px; color: #f6bd13; font-size: 17px; font-weight: 900; }
            .ds-body { padding: 20px 30px 72px; }
            .ds-section { border: 1px solid #d9e2ef; border-radius: 8px; margin-bottom: 16px; overflow: hidden; break-inside: avoid; }
            .ds-section-title { background: #142b57; color: #fff; padding: 9px 18px; font-size: 17px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; }
            .ds-section-body { padding: 16px 22px; }
            .ds-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; }
            .ds-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px 20px; }
            .ds-field { display: grid; grid-template-columns: 160px 1fr; align-items: end; gap: 10px; font-size: 14px; min-height: 24px; }
            .ds-field span { color: #667085; font-weight: 800; }
            .ds-field b { border-bottom: 1px solid #d5dde8; min-height: 20px; color: #293344; font-weight: 600; }
            .ds-field .ds-strong { font-weight: 900; }
            .ds-charge-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0; margin-top: 16px; overflow: hidden; border-radius: 6px; background: #eef3f8; }
            .ds-charge-strip .ds-field { grid-template-columns: 1fr auto; padding: 8px 12px; }
            .ds-charge-strip .ds-field b { border-bottom: 0; text-align: right; }
            .ds-schedule { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
            .ds-schedule table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .ds-schedule th { color: #142b57; font-weight: 900; border-bottom: 1px solid #d9e2ef; padding: 6px 4px; }
            .ds-schedule td { border-bottom: 1px solid #edf1f6; padding: 5px 4px; text-align: center; }
            .ds-schedule .money { text-align: right; font-weight: 700; }
            .ds-schedule .balance { color: #df4b43; }
            .ds-disclosure-head { display: flex; justify-content: space-between; color: #667085; font-size: 13px; margin-bottom: 18px; }
            .ds-signatures { display: grid; grid-template-columns: minmax(260px, 360px); justify-content: center; margin: 28px 0 20px; }
            .ds-signature { text-align: center; color: #7a8699; font-size: 11px; }
            .ds-certified-signature { position: relative; padding-top: 48px; }
            .ds-manager-signature-img { position: absolute; left: 50%; bottom: 30px; width: 170px; max-height: 76px; transform: translateX(-50%); object-fit: contain; filter: drop-shadow(0.15px 0px 0px #000) drop-shadow(-0.15px 0px 0px #000) drop-shadow(0px 0.15px 0px #000) drop-shadow(0px -0.15px 0px #000); }
            .ds-signer-name { color: #000; font-weight: 900; letter-spacing: 0.4px; }
            .ds-signer-position { color: #3f4a5c; font-weight: 700; margin-top: 2px; }
            .ds-line { border-top: 1px solid #142b57; margin-bottom: 8px; height: 1px; }
            .ds-ack { font-size: 12px; line-height: 1.45; font-weight: 800; margin: 18px 0; }
            .ds-clause { font-size: 12px; line-height: 1.5; font-style: italic; color: #3f4a5c; }
            .ds-borrower { display: grid; grid-template-columns: 1fr 220px; gap: 80px; margin: 34px 20px 8px; }
            .ds-footer { display: flex; justify-content: space-between; background: #11244a; color: #dbe5f4; padding: 12px 40px; font-size: 12px; font-weight: 800; }
            @media print {
              @page { size: legal portrait; margin: 0.16in 0.14in 0.22in 0.14in; }
              body { margin: 0 !important; background: #fff !important; }
              .sidebar, .navbar, .reports-sidebar, .reports-screen-only, .card-title { display: none !important; }
              .content, .card, .table-wrapper { margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }
              #printable-area.disclosure-print {
                display: flex !important;
                flex-direction: column !important;
                width: 8.22in !important;
                height: 13.62in !important;
                max-width: none !important;
                border: 1.5px solid #1f365f !important;
                box-shadow: none !important;
                margin: 0 !important;
                overflow: hidden !important;
              }
              .ds-header { flex: 0 0 auto !important; padding: 0.18in 0.32in !important; gap: 0.16in !important; border-left-width: 0.09in !important; }
              .ds-company { font-size: 22pt !important; letter-spacing: 1.1px !important; }
              .ds-sub { margin-top: 0.045in !important; font-size: 8.8pt !important; }
              .ds-badge { min-width: 2.35in !important; padding: 0.08in 0.14in !important; border: 1.5px solid #45699d !important; border-radius: 0.08in !important; }
              .ds-badge-title { font-size: 15pt !important; }
              .ds-badge-id { margin-top: 0.03in !important; font-size: 11.5pt !important; }
              .ds-body { flex: 1 1 auto !important; min-height: 0 !important; display: flex !important; flex-direction: column !important; padding: 0.1in 0.25in 0.05in !important; overflow: hidden !important; }
              .ds-section { margin-bottom: 0.07in !important; border: 1.5px solid #9aabc4 !important; border-radius: 0.06in !important; break-inside: avoid !important; }
              .ds-section:last-of-type { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; min-height: 2.5in !important; margin-bottom: 0.04in !important; }
              .ds-section-title { padding: 0.035in 0.12in !important; font-size: 10.6pt !important; letter-spacing: 0.35px !important; }
              .ds-section-body { padding: 0.065in 0.12in !important; }
              .ds-section:last-of-type .ds-section-body { flex: 1 1 auto !important; display: flex !important; flex-direction: column !important; padding-bottom: 0.075in !important; }
              .ds-grid-2 { gap: 0.06in 0.2in !important; }
              .ds-grid-3 { gap: 0.06in 0.16in !important; }
              .ds-field { grid-template-columns: 1.14in 1fr !important; gap: 0.05in !important; font-size: 8pt !important; min-height: 0.15in !important; }
              .ds-field b { min-height: 0.125in !important; border-bottom: 1.4px solid #a9b7ca !important; }
              .ds-charge-strip { margin-top: 0.055in !important; border: 1.2px solid #c3cfdd !important; border-radius: 0.04in !important; }
              .ds-charge-strip .ds-field { padding: 0.028in 0.065in !important; grid-template-columns: 1fr auto !important; font-size: 7.4pt !important; }
              .ds-charge-strip .ds-field b { border-bottom: 0 !important; }
              .ds-schedule { gap: 0.07in !important; }
              .ds-schedule table { font-size: 7.35pt !important; }
              .ds-schedule th { border-bottom: 0.9px solid #d5dce8 !important; padding: 0.023in 0.015in !important; line-height: 1.08 !important; }
              .ds-schedule td { border-bottom: 0.35px solid #f1f4f8 !important; padding: 0.016in 0.015in !important; line-height: 1.06 !important; }
              .ds-schedule table:not(:last-child) { border-right: 1.2px solid #9fb0c8 !important; padding-right: 0.05in !important; }
              .ds-disclosure-head { font-size: 7.4pt !important; margin-bottom: 0.04in !important; }
              .ds-section:last-of-type .ds-grid-2 { gap: 0.035in 0.18in !important; }
              .ds-section:last-of-type .ds-field { font-size: 7.5pt !important; min-height: 0.13in !important; }
              .ds-section:last-of-type .ds-field b { min-height: 0.105in !important; }
              .ds-signatures { grid-template-columns: 2.65in !important; margin: 0.16in 0 0.08in !important; }
              .ds-signature { font-size: 6.7pt !important; }
              .ds-certified-signature { padding-top: 0.45in !important; }
              .ds-manager-signature-img { bottom: 0.19in !important; width: 1.55in !important; max-height: 0.58in !important; }
              .ds-signer-name { letter-spacing: 0.15px !important; }
              .ds-signer-position { margin-top: 0.01in !important; }
              .ds-line { border-top: 1.4px solid #253a61 !important; margin-bottom: 0.04in !important; }
              .ds-ack { font-size: 7.15pt !important; line-height: 1.1 !important; margin: 0.075in 0 !important; }
              .ds-clause { font-size: 6.9pt !important; line-height: 1.1 !important; }
              .ds-borrower { grid-template-columns: 1fr 1.45in !important; gap: 0.5in !important; margin: auto 0.15in 0 !important; padding-top: 0.18in !important; }
              .ds-footer { flex: 0 0 auto !important; margin-top: auto !important; padding: 0.045in 0.32in !important; font-size: 7.4pt !important; }
              * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          `}</style>
          <div className="ds-header">
            <div>
              <div className="ds-company">MELANN LENDING INVESTOR CORP.</div>
              <div className="ds-sub">Ormoc City</div>
              <div className="ds-sub">(On Loans/Credit Transaction As required under R.A. 3765, Truth in Lending Act)</div>
            </div>
            <div className="ds-badge">
              <div className="ds-badge-title">DISCLOSURE STATEMENT</div>
              <div className="ds-badge-id">Loan ID: {loan.loan_code || loan.id}</div>
            </div>
          </div>

          <div className="ds-body">
            {section('Client Information', (
              <div className="ds-grid-2">
                <div>
                  {field('Name', fullName, true)}
                  {field('Code', loan.customer_code)}
                  {field('Address', clientAddress)}
                  {field('Age', calculateAge(loan.birth_date))}
                  {field('Nature of Business', businessNature)}
                </div>
                <div>
                  {field('Phone Number', phone)}
                  {field('Birthday', shortDate(loan.birth_date))}
                  {field('Gender', loan.gender)}
                  {field('Purpose of Loan', purpose)}
                  {field('Email Address', loan.email)}
                  {field('FB Account', loan.fb_account || loan.messenger_account)}
                  {field('ID Document', idDocument)}
                </div>
              </div>
            ))}

            {section('Loan Information', (
              <>
                <div className="ds-grid-3">
                  <div>
                    {field('Date Release', shortDate(loan.date_released))}
                    {field('Maturity', shortDate(maturityDate))}
                    {field('Total Regular Loan Balance', fmtMoney(totalLoan), true)}
                    {field('Emergency Balance', fmtMoney(0))}
                  </div>
                  <div>
                    {field('Loan Period', loanPeriod)}
                    {field('Principal', fmtMoney(principal), true)}
                    {field('Loan Total', fmtMoney(totalLoan), true)}
                    {field('Amortization', fmtMoney(totalLoan), true)}
                  </div>
                  <div>
                    {field('Total Interest %', `${interestRate.toFixed(2)}%`, true)}
                    {field('Payment / Day', fmtMoney(amortization), true)}
                    {field('Loan Type', loan.loan_type)}
                    {field('Loan Status', loan.status, true)}
                  </div>
                </div>
                <div className="ds-charge-strip">
                  {field('Insurance', fmtMoney(loan.insurance))}
                  {field('Delivery', fmtMoney(0))}
                  {field('Collection', fmtMoney(0))}
                  {field('Service fee', fmtMoney(loan.service_fee))}
                  {field('Total Charges', fmtMoney(charges), true)}
                  {field('Passbook', fmtMoney(0))}
                  {field('Penalty', fmtMoney(0))}
                  {field('Prev.Balance', fmtMoney(0))}
                  {field('Total Payment', fmtMoney(loan.total_paid))}
                  {field('Net Proceed', fmtMoney(netProceed), true)}
                </div>
                <div className="ds-grid-2" style={{ marginTop: 10 }}>
                  {field('Monthly Effective Interest Rate:', '12.00%', true)}
                  {field('Collateral:', collateral, true)}
                </div>
                <div style={{ marginTop: 10, fontSize: 12 }}>Conditional Charges (if applicable) &nbsp; Late Payment Penalty: &nbsp; 5% per month on the remaining balance</div>
              </>
            ))}

            {section('Amortization Schedule', (
              <div className="ds-schedule">
                {scheduleColumns.map((column, columnIndex) => (
                  <table key={columnIndex}>
                    <thead>
                      <tr><th>No.</th><th>Date</th><th>Amortization</th><th>Running Balance<br />(Principal)</th></tr>
                    </thead>
                    <tbody>
                      {column.map(row => (
                        <tr key={row.no}>
                          <td>{row.no}</td>
                          <td>{shortDate(row.date)}</td>
                          <td className="money">{fmtMoney(row.amount)}</td>
                          <td className="money balance">{fmtMoney(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            ))}

            {section('Disclosure Statement', (
              <>
                <div className="ds-disclosure-head">
                  <span>(On Loans/Credit Transaction As required under R.A. 3765, Truth in Lending Act)</span>
                  <b>Loan ID: {loan.loan_code || loan.id}</b>
                </div>
                <div className="ds-grid-2">
                  <div>
                    {field('Name', fullName, true)}
                    {field('Address', clientAddress)}
                  </div>
                  <div>
                    {field('Birthday', shortDate(loan.birth_date))}
                    {field('Nationality', loan.nationality || 'Filipino')}
                    {field('Gender', loan.gender)}
                  </div>
                </div>
                <div style={{ color: '#142b57', fontWeight: 900, marginTop: 22 }}>CERTIFIED CORRECT:</div>
                <div className="ds-signatures">
                  <div className="ds-signature ds-certified-signature">
                    <div className="ds-line"></div>
                    <div className="ds-signer-name">MARILYN O. RELOBA</div>
                    <div className="ds-signer-position">Branch Manager</div>
                  </div>
                </div>
                <div className="ds-ack">I ACKNOWLEDGE RECEIPT OF A COPY OF THIS STATEMENT PRIOR TO THE CONSUMMATION OF THE CREDIT TRANSACTION AND THAT I UNDERSTAND AND FULLY AGREE TO THE TERMS AND CONDITIONS THEREOF:</div>
                <div className="ds-clause">In the event of borrower's death during the active period of the loan, the total unpaid balance of the loan will be deemed paid, provided that the account is not in a past due status. This clause does not apply in cases of death, resulting from war, natural calamities, natural disaster, criminal acts, illegal activities, participation in extreme sports, substance abuse and suicide.</div>
                <div className="ds-borrower">
                  <div className="ds-signature"><div className="ds-line"></div>Signature of Borrower Over Printed Name</div>
                  <div className="ds-signature"><div className="ds-line"></div>Date</div>
                </div>
              </>
            ))}
          </div>
          <div className="ds-footer">
            <span>{shortDate(new Date().toISOString().split('T')[0])} &nbsp;&nbsp; {new Date().toLocaleTimeString('en-US')}</span>
            <span>Page 1 of 1</span>
          </div>
        </div>
      )
    }

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
              .monthly-overall-screen {
                width: 100%;
                max-width: 100%;
                overflow-x: hidden !important;
              }
              .monthly-overall-chart {
                width: 100%;
                max-width: 100%;
                min-width: 0;
                overflow: hidden;
              }
              .monthly-overall-chart > div,
              .monthly-overall-chart svg {
                max-width: 100%;
              }
              .monthly-overall-screen table {
                table-layout: fixed;
                width: 100%;
                min-width: 0 !important;
              }
              .monthly-overall-screen th,
              .monthly-overall-screen td {
                min-width: 0 !important;
                padding: 8px 6px !important;
                font-size: 11px;
                line-height: 1.15;
                white-space: normal;
                overflow-wrap: anywhere;
              }
              .monthly-overall-screen th:first-child,
              .monthly-overall-screen td:first-child {
                width: 11%;
                text-align: left;
              }
              .monthly-overall-screen th:not(:first-child),
              .monthly-overall-screen td:not(:first-child) {
                width: auto;
              }
              .monthly-overall-screen .period-range-print {
                display: none;
              }
              .monthly-overall-screen .text-success {
                white-space: nowrap;
                font-size: 11px;
              }
              .monthly-matrix-fit-screen {
                width: 100%;
                max-width: 100%;
                overflow-x: hidden !important;
              }
              .monthly-matrix-fit-screen table {
                table-layout: fixed;
                width: 100%;
                min-width: 0 !important;
              }
              .monthly-matrix-fit-screen th,
              .monthly-matrix-fit-screen td {
                min-width: 0 !important;
                padding: 7px 5px !important;
                font-size: 11px;
                line-height: 1.15;
                white-space: normal;
                overflow-wrap: anywhere;
              }
              .monthly-matrix-fit-screen th:first-child,
              .monthly-matrix-fit-screen td:first-child {
                width: 12%;
                text-align: left;
              }
              .monthly-matrix-fit-screen th:last-child,
              .monthly-matrix-fit-screen td:last-child {
                width: 11%;
              }
              .monthly-matrix-fit-screen th:not(:first-child),
              .monthly-matrix-fit-screen td:not(:first-child) {
                text-align: right;
              }
              .monthly-matrix-fit-screen .period-range-print {
                display: none;
              }
              .monthly-matrix-fit-screen .text-success {
                white-space: nowrap;
                font-size: 11px;
              }
              @media (max-width: 1200px) {
                .monthly-overall-screen th,
                .monthly-overall-screen td,
                .monthly-overall-screen .text-success {
                  font-size: 10px;
                }
                .monthly-overall-screen th,
                .monthly-overall-screen td {
                  padding: 7px 4px !important;
                }
                .monthly-matrix-fit-screen th,
                .monthly-matrix-fit-screen td,
                .monthly-matrix-fit-screen .text-success {
                  font-size: 10px;
                }
                .monthly-matrix-fit-screen th,
                .monthly-matrix-fit-screen td {
                  padding: 6px 3px !important;
                }
              }
              @media print {
                @page { size: landscape; margin: 10mm; }
                table { min-width: auto !important; width: 100% !important; zoom: 0.9; }
                th, td { min-width: 0 !important; font-size: 9px !important; padding: 3px 4px !important; }
                th div { font-size: 9px !important; }
                .table-responsive-print { overflow: visible !important; }
                .monthly-collection-fit-print {
                  border-radius: 0 !important;
                  overflow: visible !important;
                  width: 100% !important;
                }
                .monthly-collection-fit-print table {
                  table-layout: fixed !important;
                  width: 100% !important;
                  min-width: 0 !important;
                  zoom: 1 !important;
                }
                .monthly-collection-fit-print th,
                .monthly-collection-fit-print td {
                  font-size: 6.4px !important;
                  line-height: 1.05 !important;
                  padding: 1.5px 2px !important;
                  min-width: 0 !important;
                  white-space: normal !important;
                  overflow-wrap: anywhere !important;
                }
                .monthly-collection-fit-print th:first-child,
                .monthly-collection-fit-print td:first-child {
                  width: 10.5% !important;
                  text-align: left !important;
                }
                .monthly-collection-fit-print th:not(:first-child),
                .monthly-collection-fit-print td:not(:first-child) {
                  width: 6.88% !important;
                  text-align: right !important;
                }
                .monthly-collection-fit-print .period-range-print {
                  display: none !important;
                }
                .monthly-collection-fit-print .fw-bold,
                .monthly-collection-fit-print .fw-600 {
                  font-weight: 800 !important;
                }
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
              <div className="monthly-overall-chart" style={{ marginBottom: 20, height: 350, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 16px 0 0' }}>
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
            <div
              className={`table-responsive-print monthly-matrix-fit-screen ${monthlySubTab === 'overall' ? 'monthly-overall-screen monthly-collection-fit-print' : 'monthly-collection-fit-print'}`}
              style={{ overflowX: 'hidden', border: '1px solid var(--border)', borderRadius: 8 }}
            >
              <table className="data-table" style={{ minWidth: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 0 }}>{monthlySubTab === 'by-collector' ? 'Collector' : 'Summary'}</th>
                    {matrix.periods.map(period => (
                      <th key={period.key} className="text-right" title={period.rangeLabel} style={{ minWidth: 0 }}>
                        <div>{period.label}</div>
                        <div className="period-range-print" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>{period.rangeLabel}</div>
                      </th>
                    ))}
                    <th className="text-right" style={{ minWidth: 0 }}>Total Collection</th>
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
            .maturity-summary-wrap {
              overflow-x: visible !important;
              min-width: 0;
            }
            .maturity-summary-table {
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
            }
            .maturity-summary-table th,
            .maturity-summary-table td {
              padding: 8px 6px;
              font-size: 11px;
              line-height: 1.25;
            }
            .maturity-summary-table th {
              font-size: 9px;
              letter-spacing: 0.25px;
              white-space: normal;
            }
            .maturity-summary-table .money-cell {
              white-space: nowrap;
              font-size: 11px;
            }
            .maturity-summary-table .collector-cell {
              word-break: normal;
              overflow-wrap: anywhere;
            }
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

    if (active === 'monitoring-summary') {
      if (data.error) {
        return (
          <div className="empty-state" style={{ color: '#b91c1c' }}>
            <p>Unable to load Monitoring Summary.</p>
            <p style={{ fontSize: 12 }}>{data.error}</p>
          </div>
        )
      }
      const rows = data.rows || data.alerts || (Array.isArray(data) ? data : [])
      const tabLabel = data.tab_label || 'Under Monitoring'
      const todayLabel = displayDate(data.as_of || toDateInputValue(new Date()))
      return (
        <div id="printable-area" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <style>{`${REPORT_PRINT_CLARITY_CSS}
            @media print {
              @page { size: landscape; margin: 9mm; }
              .monitoring-actions { display: none !important; }
              #printable-area table.data-table th,
              #printable-area table.data-table td { font-size: 10px !important; padding: 6px 7px !important; }
              .monitoring-print-title { text-align: center !important; }
              .monitoring-remarks { min-width: 190px !important; height: 28px !important; }
            }
          `}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div className="monitoring-print-title">
              <h3 style={{ margin: 0 }}>3-Day Monitoring - {tabLabel}</h3>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>As of {todayLabel}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>Total Clients: <b>{rows.length}</b></div>
            </div>
            <div className="monitoring-actions" style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => handlePrint('summary')}>🖨️ Print</button>
            </div>
          </div>

          <div className="card-v2" style={{ padding: 18 }}>
            <div className="table-responsive-print" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>Client Code</th>
                    <th>Client Name</th>
                    <th className="text-right">Running Balance</th>
                    <th>Last Payment</th>
                    <th>Contact Number</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? <tr><td colSpan={6} className="empty-state">No clients found for this monitoring table</td></tr> : rows.map(row => (
                    <tr key={row.id}>
                      <td className="mono">{row.customer_code || '-'}</td>
                      <td className="fw-600">{row.customer_name || '-'}</td>
                      <td className="text-right fw-bold">₱ {fmt(row.balance || 0)}</td>
                      <td>{row.last_payment_date ? `${shortDate(row.last_payment_date)} - ₱ ${fmt(row.last_payment_amount || 0)}` : '-'}</td>
                      <td>{row.contact || '-'}</td>
                      <td className="monitoring-remarks"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        const monthlyTitle = params.release_cycle_type === '45' ? 'Monthly Releases - 45 Days / 1.5 Month' : 'Monthly Releases - 30 Days / By Month'
        return (
          <>
            <style>{`
              .release-overall-screen {
                width: 100%;
                max-width: 100%;
                overflow-x: hidden !important;
              }
              .release-overall-chart {
                width: 100%;
                max-width: 100%;
                min-width: 0;
                overflow: hidden;
              }
              .release-overall-chart > div,
              .release-overall-chart svg {
                max-width: 100%;
              }
              .release-overall-screen table {
                table-layout: fixed;
                width: 100%;
                min-width: 0 !important;
              }
              .release-overall-screen th,
              .release-overall-screen td {
                min-width: 0 !important;
                padding: 8px 6px !important;
                font-size: 11px;
                line-height: 1.15;
                white-space: normal;
                overflow-wrap: anywhere;
              }
              .release-overall-screen th:first-child,
              .release-overall-screen td:first-child {
                width: 11%;
                text-align: left;
              }
              .release-overall-screen th:not(:first-child),
              .release-overall-screen td:not(:first-child) {
                width: auto;
              }
              .release-overall-screen .period-range-print {
                display: none;
              }
              .release-overall-screen .text-success {
                white-space: nowrap;
                font-size: 11px;
              }
              .release-matrix-fit-screen {
                width: 100%;
                max-width: 100%;
                overflow-x: hidden !important;
              }
              .release-matrix-fit-screen table {
                table-layout: fixed;
                width: 100%;
                min-width: 0 !important;
              }
              .release-matrix-fit-screen th,
              .release-matrix-fit-screen td {
                min-width: 0 !important;
                padding: 7px 5px !important;
                font-size: 11px;
                line-height: 1.15;
                white-space: normal;
                overflow-wrap: anywhere;
              }
              .release-matrix-fit-screen th:first-child,
              .release-matrix-fit-screen td:first-child {
                width: 12%;
                text-align: left;
              }
              .release-matrix-fit-screen th:last-child,
              .release-matrix-fit-screen td:last-child {
                width: 11%;
              }
              .release-matrix-fit-screen th:not(:first-child),
              .release-matrix-fit-screen td:not(:first-child) {
                text-align: right;
              }
              .release-matrix-fit-screen .period-range-print {
                display: none;
              }
              .release-matrix-fit-screen .text-success {
                white-space: nowrap;
                font-size: 11px;
              }
              @media (max-width: 1200px) {
                .release-overall-screen th,
                .release-overall-screen td,
                .release-overall-screen .text-success {
                  font-size: 10px;
                }
                .release-overall-screen th,
                .release-overall-screen td {
                  padding: 7px 4px !important;
                }
                .release-matrix-fit-screen th,
                .release-matrix-fit-screen td,
                .release-matrix-fit-screen .text-success {
                  font-size: 10px;
                }
                .release-matrix-fit-screen th,
                .release-matrix-fit-screen td {
                  padding: 6px 3px !important;
                }
              }
              @media print {
                @page { size: landscape; margin: 10mm; }
                table { min-width: auto !important; width: 100% !important; zoom: 0.9; }
                th, td { min-width: 0 !important; font-size: 9px !important; padding: 3px 4px !important; }
                th div { font-size: 9px !important; }
                .table-responsive-print { overflow: visible !important; }
                .release-overall-screen {
                  border-radius: 0 !important;
                  overflow: visible !important;
                  width: 100% !important;
                }
                .release-overall-screen table {
                  table-layout: fixed !important;
                  width: 100% !important;
                  min-width: 0 !important;
                  zoom: 1 !important;
                }
                .release-overall-screen th,
                .release-overall-screen td {
                  font-size: 6.4px !important;
                  line-height: 1.05 !important;
                  padding: 1.5px 2px !important;
                }
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
            {releaseMonthlySubTab === 'overall' && (
              <div className="release-overall-chart" style={{ marginBottom: 20, height: 350, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 16px 0 0' }}>
                {matrix.periods.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350} minWidth={300} minHeight={300}>
                    <BarChart data={matrix.periods.map(p => ({ name: p.label, amount: matrix.periodTotals[p.key]?.amount || 0 }))} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barGradientReleaseMonthly" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `â‚±${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip
                        cursor={{ fill: 'rgba(245, 158, 11, 0.08)' }}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }}
                        formatter={(val) => [`â‚± ${fmt(val)}`, 'Total Released']}
                        labelStyle={{ color: '#0f172a', fontWeight: 700, marginBottom: 6, fontSize: 13 }}
                      />
                      <Bar dataKey="amount" fill="url(#barGradientReleaseMonthly)" radius={[6, 6, 0, 0]} barSize={42} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">No data for chart</div>
                )}
              </div>
            )}
            <div
              className={`table-responsive-print release-matrix-fit-screen ${releaseMonthlySubTab === 'overall' ? 'release-overall-screen' : ''}`}
              style={{ overflowX: 'hidden', border: '1px solid var(--border)', borderRadius: 8 }}
            >
              <table className="data-table" style={{ minWidth: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 0 }}>{releaseMonthlySubTab === 'by-collector' ? 'Collector' : 'Summary'}</th>
                    {matrix.periods.map(period => (
                      <th key={period.key} className="text-right" title={period.rangeLabel} style={{ minWidth: 0 }}>
                        <div>{period.label}</div>
                        <div className="period-range-print" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>{period.rangeLabel}</div>
                      </th>
                    ))}
                    <th className="text-right" style={{ minWidth: 0 }}>Total Release Amount</th>
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
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reports-screen-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
                  <ResponsiveContainer width="100%" height={350} minWidth={300} minHeight={300}>
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
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reports-screen-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="maturity-summary-wrap">
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--blue-dark)', fontWeight: 700 }}>Loans Maturity Checker</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Maturity Date: {displayDate(reportFrom)} to {displayDate(reportTo)}</div>
              </div>
              <div className="fw-bold text-accent">Total Loan Amount: ₱ {fmt(totalLoanAmount)}</div>
            </div>
            <table className="data-table maturity-summary-table">
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '19%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Collector</th>
                  <th className="text-right">No. of Client</th>
                  <th className="text-right">Principal</th>
                  <th className="text-right">Interest Amount</th>
                  <th className="text-right">Total Loan Amount</th>
                  <th className="text-right">Total Running Bal.</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={6} className="empty-state">No loans found for the selected maturity date range</td></tr> : rows.map(row => (
                  <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View collector clients" style={{ cursor: 'pointer' }}>
                    <td className="fw-600 collector-cell">{row.collector}</td>
                    <td className="text-right fw-bold">{row.client_count}</td>
                    <td className="text-right money-cell">₱ {fmt(row.total_principal)}</td>
                    <td className="text-right money-cell">₱ {fmt(row.total_interest)}</td>
                    <td className="text-right fw-bold text-accent money-cell">₱ {fmt(row.total_loan_amount)}</td>
                    <td className="text-right fw-bold money-cell">₱ {fmt(row.total_balance)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                    <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                    <td className="text-right fw-bold">{totalClients}</td>
                    <td className="text-right fw-bold money-cell">₱ {fmt(totalPrincipal)}</td>
                    <td className="text-right fw-bold money-cell">₱ {fmt(totalInterest)}</td>
                    <td className="text-right fw-bold text-accent money-cell">₱ {fmt(totalLoanAmount)}</td>
                    <td className="text-right fw-bold money-cell">₱ {fmt(totalBalance)}</td>
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
      const totalInterest = loans.reduce((s, l) => s + loanInterest(l), 0)
      const totalLoanAmount = loans.reduce((s, l) => s + loanTotalAmount(l), 0)

      const fullPaidCollectorRows = Object.entries(loans.reduce((acc, l) => {
        const name = l.collector_name || 'Unassigned'
        if (!acc[name]) acc[name] = { collector: name, loan_count: 0, total_principal: 0, total_interest: 0, total_loan_amount: 0, loans: [] }
        acc[name].loan_count += 1
        acc[name].total_principal += Number(l.principal || 0)
        acc[name].total_interest += loanInterest(l)
        acc[name].total_loan_amount += loanTotalAmount(l)
        acc[name].loans.push(l)
        return acc
      }, {}))
        .map(([, row]) => ({ ...row, loans: row.loans.sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')) || String(a.customer_name || '').localeCompare(String(b.customer_name || ''))) }))
        .sort((a, b) => a.collector.localeCompare(b.collector))

      const chartData = fullPaidCollectorRows.map(r => ({ name: r.collector, amount: r.total_loan_amount })).sort((a, b) => b.amount - a.amount)

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
              <div style={{ marginBottom: 12, color: '#16a34a', fontWeight: 700 }}>Total Loan Amount: &#8369; {fmt(totalLoanAmount)}</div>
              <table className="data-table">
                <thead><tr><th>Collector</th><th className="text-right">No. of Clients</th><th className="text-right">Total Principal</th><th className="text-right">Interest</th><th className="text-right">Total Loan Amount</th></tr></thead>
                <tbody>{fullPaidCollectorRows.length === 0 ? <tr><td colSpan={5} className="empty-state">No fully paid clients found</td></tr> : fullPaidCollectorRows.map(row => <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View fully paid details" style={{ cursor: 'pointer' }}><td className="fw-600">{row.collector}</td><td className="text-right">{row.loan_count}</td><td className="text-right fw-bold" style={{ color: '#16a34a' }}>&#8369; {fmt(row.total_principal)}</td><td className="text-right fw-bold">&#8369; {fmt(row.total_interest)}</td><td className="text-right fw-bold" style={{ color: '#16a34a' }}>&#8369; {fmt(row.total_loan_amount)}</td></tr>)}</tbody>
                {fullPaidCollectorRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'rgba(22,163,74,0.04)', borderTop: '2px solid var(--border)' }}>
                      <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                      <td className="text-right fw-bold">{fullPaidCollectorRows.reduce((sum, r) => sum + r.loan_count, 0)}</td>
                      <td className="text-right fw-bold" style={{ color: '#16a34a', fontSize: '14px' }}>&#8369; {fmt(totalPrincipal)}</td>
                      <td className="text-right fw-bold" style={{ fontSize: '14px' }}>&#8369; {fmt(totalInterest)}</td>
                      <td className="text-right fw-bold" style={{ color: '#16a34a', fontSize: '14px' }}>&#8369; {fmt(totalLoanAmount)}</td>
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
                        formatter={(val) => [`${String.fromCharCode(8369)} ${fmt(val)}`, 'Total Loan Amount']}
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
              <div style={{ fontSize: 16, fontWeight: 'bold', color: '#16a34a', marginTop: 6 }}>Grand Total Loan Amount: &#8369; {fmt(totalLoanAmount)}</div>
              <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>Principal: &#8369; {fmt(totalPrincipal)} &nbsp;|&nbsp; Interest: &#8369; {fmt(totalInterest)}</div>
            </div>
            {fullPaidCollectorRows.length === 0 ? <div className="empty-state">No fully paid clients found</div> : fullPaidCollectorRows.map(row => (
              <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #16a34a', paddingBottom: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                    Clients: {row.loan_count} &nbsp;|&nbsp;
                    Total Loan Amount: <span style={{ color: '#16a34a' }}>&#8369; {fmt(row.total_loan_amount)}</span>
                  </div>
                </div>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left' }}>Client Code</th><th style={{ textAlign: 'left' }}>Client</th><th style={{ textAlign: 'left' }}>Loan#</th><th>Date Released</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="text-right">Total Loan Amount</th><th className="text-right">Total Paid</th></tr>
                  </thead>
                  <tbody>
                    {row.loans?.map(l => (
                      <tr key={l.id}>
                        <td className="mono">{l.customer_code || '-'}</td>
                        <td className="fw-600">{l.customer_name || '-'}</td>
                        <td className="mono">{l.loan_code || '-'}</td>
                        <td>{l.date_released}</td>
                        <td className="text-right fw-bold" style={{ color: '#16a34a' }}>&#8369; {fmt(l.principal)}</td>
                        <td className="text-right fw-bold">&#8369; {fmt(loanInterest(l))}</td>
                        <td className="text-right fw-bold" style={{ color: '#16a34a' }}>&#8369; {fmt(loanTotalAmount(l))}</td>
                        <td className="text-right fw-bold text-success">&#8369; {fmt(l.total_paid)}</td>
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
    if (active === 'daily-target') {
      if (!data) return null
      const { loans = [] } = data
      const groups = { active: [], recon: [], overdue: [], pastdue: [] }
      const isReconLoan = c => c.is_reconstructed === 1 || c.is_reconstructed === true
      const getClassification = c => {
        if (c.status === 'pastdue') return 'pastdue'
        if (c.days_past_due > 0) return 'overdue'
        if (isReconLoan(c)) return 'recon'
        return 'active'
      }
      loans.forEach(c => {
        const cls = getClassification(c)
        if (groups[cls]) groups[cls].push(c)
      })

      const targetAmount = [...groups.active, ...groups.overdue].reduce((sum, c) => sum + Number(c.amortization || 0), 0)
      const totalActiveClients = groups.active.length + groups.overdue.length

      return (
        <div style={{ background: '#fff', padding: 40, fontFamily: 'Arial, Helvetica, sans-serif', maxWidth: 600, margin: '0 auto', border: '1px solid #ddd', borderRadius: 8, marginTop: 20 }}>
          <h2 style={{ color: CL.navy, marginBottom: 30, textAlign: 'center' }}>DAILY TARGET</h2>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
            <div style={{ flex: 1, padding: 20, border: '1.5px solid ' + CL.navy, borderRadius: 8, textAlign: 'center', background: '#f8fafc' }}>
              <div style={{ fontSize: '11pt', color: '#666', fontWeight: 600, marginBottom: 8 }}>Total Active Client</div>
              <div style={{ fontSize: '24pt', fontWeight: 700, color: CL.navy }}>{totalActiveClients}</div>
            </div>
            <div style={{ flex: 1, padding: 20, border: '1.5px solid ' + CL.navy, borderRadius: 8, textAlign: 'center', background: '#fcf8f8' }}>
              <div style={{ fontSize: '11pt', color: '#666', fontWeight: 600, marginBottom: 8 }}>Target Amount</div>
              <div style={{ fontSize: '24pt', fontWeight: 700, color: '#d9534f' }}>{peso(targetAmount)}</div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 30, flexWrap: 'wrap' }}>
            {[
              { label: 'Active', count: groups.active.length, color: CL.active },
              { label: 'Recon', count: groups.recon.length, color: CL.recon },
              { label: 'Overdue', count: groups.overdue.length, color: CL.overdue },
              { label: 'Past Due', count: groups.pastdue.length, color: CL.pastdue }
            ].map(b => (
              <div key={b.label} style={{ background: b.color, color: '#fff', padding: '6px 16px', borderRadius: 4, fontSize: '10pt', fontWeight: 600 }}>
                {b.label}: {b.count}
              </div>
            ))}
          </div>
        </div>
      )
    }
    if (active === 'collection-sheet') {
      const { loans = [], collector: apiCollector, signatures = {}, summary = {} } = data
      const collName = collectors.find(c => c.id == params.collector_id)
      const collectorDisplayName = apiCollector?.name || (collName ? `${collName.last_name}, ${collName.first_name}`.toUpperCase() : 'UNASSIGNED')
      const collectionDate = params.date || toDateInputValue(new Date())
      const displayCollDate = new Date(collectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      const pbInsDstTotal = Number(summary.pbInsDst ?? summary.pb_ins_dst ?? summary.passbookTotal ?? summary.passbook_total ?? 0)

      const isReconLoan = (loan) => (loan.loan_type || '').toLowerCase().includes('recon')

      /* ── Classify and deduplicate ── */
      const groups = { active: [], recon: [], overdue: [], pastdue: [] }
      const seen = new Set()
      loans.forEach(l => {
        if (seen.has(l.id)) return
        seen.add(l.id)
        l.days_past_due = Math.max(0, parseInt(l.days_past_due) || 0)
        groups[classifyCollectionAccount(l)].push(l)
      })
      Object.values(groups).forEach(arr => arr.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '')))

      const totalClientsCount = groups.active.length + groups.recon.length + groups.overdue.length + groups.pastdue.length

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
        if (entry.type === 'header') return 1
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
      const reservedHeaderHeightIn = 2.75
      const reservedFooterHeightIn = 0.9
      const columnHeaderHeightIn = 0.25
      const averageEntryHeightIn = 0.265
      const autoColumnUnits = (printablePageHeightIn - reservedHeaderHeightIn - reservedFooterHeightIn - columnHeaderHeightIn) / averageEntryHeightIn
      const columns = splitByUnits(orderedEntries, autoColumnUnits)
      const pages = []
      for (let i = 0; i < columns.length; i += 2) {
        pages.push({ left: columns[i] || [], right: columns[i + 1] || [] })
      }

      const cs = { borderBottom: '1.2px solid #000', verticalAlign: 'middle', padding: '2px 1px' }
      const collectionNoteStyle = { display: 'block', color: CL.pastdue, lineHeight: 1.05 }
      const collectionAmountText = amount => Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })
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
        const rowColor = entry.color === CL.pastdue ? CL.pastdue : (isReconLoan(c) ? CL.recon : entry.color)
        const penaltyNote = Number(c.reloan_penalty_note || c.penalty_collected_today || 0)
        const balanceNote = Number(c.reloan_balance_note || 0)
        const regularCollected = Math.max(0, Number(c.collected_today || 0) - Number(c.penalty_collected_today || 0))
        return (<>
          <td style={{ ...cs, fontWeight: 600, fontSize: '7pt', textAlign: 'center', width: '5%' }}>{entry.rowNum}</td>
          <td style={{ ...cs, fontSize: '10pt', fontWeight: 700, color: rowColor, width: '12%' }}>{c.customer_code}</td>
          <td style={{ ...cs, color: rowColor, fontWeight: 700, fontSize: '10pt', padding: '2px 2px', lineHeight: 1.08, wordBreak: 'normal', overflowWrap: 'break-word', width: '43%' }}>{(c.customer_name || '').toUpperCase()}</td>
          <td style={{ ...cs, textAlign: 'center', fontSize: '6pt', width: '9%', paddingLeft: 0, paddingRight: 0 }}>{fDate(c.date_maturity)}</td>
          <td style={{ ...cs, textAlign: 'center', fontSize: '6pt', color: rowColor, fontWeight: 600, width: '4%', paddingLeft: 0, paddingRight: 0 }}>{c.days_past_due}</td>
          <td style={{ ...cs, textAlign: 'right', fontSize: '7pt', width: '8%', paddingLeft: 0 }}>{c.amortization ? Number(c.amortization).toLocaleString() : '0'}</td>
          <td style={{ ...cs, width: '19%', verticalAlign: 'bottom', paddingLeft: 2 }}>
            {regularCollected > 0 && <span style={{ fontSize: '7.5pt', fontWeight: 600 }}>{peso(regularCollected)}</span>}
            {balanceNote > 0 && (
              <span style={collectionNoteStyle}>
                <span style={{ fontSize: '9.5pt', fontWeight: 800 }}>{collectionAmountText(balanceNote)}</span>{' '}
                <span style={{ fontSize: '6.5pt', fontWeight: 600 }}>bal.</span>
              </span>
            )}
            {penaltyNote > 0 && (
              <span style={collectionNoteStyle}>
                <span style={{ fontSize: '9.5pt', fontWeight: 800 }}>{collectionAmountText(penaltyNote)}</span>{' '}
                <span style={{ fontSize: '6.5pt', fontWeight: 600 }}>Pen.</span>
              </span>
            )}
            {regularCollected <= 0 && balanceNote <= 0 && penaltyNote <= 0 && <div style={{ height: 12 }}></div>}
          </td>
        </>)
      }

      const headerCell = { padding: '3px 1px', borderTop: '1.5px solid '+CL.navy, borderBottom: '1.5px solid '+CL.navy, fontSize: '7pt', color: CL.navy, background: '#D9F0E6' }
      const colHdr = (side) => [
        <th key={side+'n'} style={{ ...headerCell, width: '5%', textAlign: 'center' }}>#</th>,
        <th key={side+'c'} style={{ ...headerCell, width: '12%', textAlign: 'left', fontSize: '9pt' }}>Code</th>,
        <th key={side+'nm'} style={{ ...headerCell, width: '43%', textAlign: 'left', padding: '3px 2px', fontSize: '9pt' }}>Client Name</th>,
        <th key={side+'d'} style={{ ...headerCell, width: '9%', textAlign: 'center', fontSize: '5.5pt', paddingLeft: 0, paddingRight: 0 }}>Due</th>,
        <th key={side+'dp'} style={{ ...headerCell, width: '4%', textAlign: 'center', fontSize: '5.5pt', paddingLeft: 0, paddingRight: 0 }}>DPD</th>,
        <th key={side+'dl'} style={{ ...headerCell, width: '8%', textAlign: 'right', paddingLeft: 0, paddingRight: 0 }}>Daily</th>,
        <th key={side+'co'} style={{ ...headerCell, width: '19%', textAlign: 'center' }}>Collected</th>
      ]
      const renderClientColumn = (entries, keyPrefix) => (
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '8pt' }}>
          <thead><tr style={{ textTransform: 'uppercase', fontWeight: 700 }}>{colHdr(keyPrefix)}</tr></thead>
          <tbody>{entries.map((entry, i) => <tr key={`${keyPrefix}-${i}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>{entryCells(entry)}</tr>)}</tbody>
        </table>
      )
      const cashSummaryAmount = amount => Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })
      const cashSummaryNoteStyle = { color: CL.pastdue, fontWeight: 800, fontSize: '8.5pt', lineHeight: 1 }
      const blankCashLine = (label, value = null, isRed = false) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ color: isRed ? CL.pastdue : '#555', fontWeight: isRed ? 700 : 400, flex: '0 0 90px', fontSize: '8.5pt' }}>{label}:</span>
          <span style={{ flex: 1, borderBottom: '1.5px solid #000', height: 14, display: 'flex', alignItems: 'flex-end', paddingLeft: value ? 4 : 0 }}>
            {value && (typeof value === 'string' ? <span style={cashSummaryNoteStyle}>{value}</span> : value)}
          </span>
        </div>
      )
      const blankCashLineSingle = label => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 2px 0' }}>
          <span style={{ color: '#555', flex: '0 0 60px', fontSize: '8.5pt' }}>{label}:</span>
          <span style={{ flex: 1, borderBottom: '1.5px solid #000', height: 14 }}></span>
        </div>
      )
      const denominationLine = value => (
        <div key={value} style={{ display: 'grid', gridTemplateColumns: '32px 12px 1fr 12px 1fr', alignItems: 'center', columnGap: 4, padding: '2px 0', fontSize: '7.5pt' }}>
          <span style={{ fontWeight: 700, color: CL.navy, textAlign: 'right' }}>{value}</span>
          <span style={{ textAlign: 'center' }}>x</span>
          <span style={{ borderBottom: '1.2px solid #000', height: 12 }}></span>
          <span style={{ textAlign: 'center' }}>=</span>
          <span style={{ borderBottom: '1.2px solid #000', height: 12 }}></span>
        </div>
      )
      const denominationTotalLine = () => (
        <div key="total" style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 4, marginTop: 2, fontSize: '7.5pt' }}>
          <span style={{ fontWeight: 700, color: CL.navy }}>OVERALL TOTAL:</span>
          <span style={{ flex: 1, borderBottom: '1.2px solid #000', height: 12 }}></span>
        </div>
      )
      const headerBox = (title, children, width) => (
        <div style={{ flex: `0 0 ${width}px`, width, border: '1.5px solid '+CL.navy, borderRadius: 3 }}>
          <div style={{ background: CL.navy, color: '#fff', padding: '4px 6px', fontWeight: 700, fontSize: '9pt', textAlign: 'center' }}>{title}</div>
          <div style={{ padding: '6px 8px', fontSize: '8pt' }}>
            {children}
          </div>
        </div>
      )
      const pageHeader = (showSideBoxes = true) => (
        <div className="collection-sheet-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: '0 0 auto' }}>
            {showSideBoxes ? headerBox('DENOMINATION', [...[1000, 500, 200, 100, 50, 20, 10, 5, 1].map(denominationLine), denominationTotalLine()], 225) : <div style={{ width: 225 }}></div>}
          </div>
          <div style={{ flex: '1 1 auto', minWidth: 0, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '14pt', color: CL.navy, letterSpacing: 0.2 }}>MELANN LENDING INVESTOR CORPORATION</div>
            <div style={{ fontWeight: 700, fontSize: '10.5pt', color: CL.navy, marginBottom: 4 }}>FIELD COLLECTION SHEET</div>
            
            <div style={{ fontSize: '10pt', fontWeight: 700, color: '#333', marginBottom: 6 }}>
              {collectorDisplayName} &nbsp;|&nbsp; {displayCollDate}
            </div>

            <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              <div style={{ background: CL.navy, color: '#fff', padding: '1.5px 7px', borderRadius: 2, fontSize: '7.5pt', fontWeight: 700 }}>
                Overall Total Client: {totalClientsCount}
              </div>
              {[
                { label: 'Active', count: groups.active.length, color: CL.active },
                { label: 'Recon', count: groups.recon.length, color: CL.recon },
                { label: 'Overdue', count: groups.overdue.length, color: CL.overdue },
                { label: 'Past Due', count: groups.pastdue.length, color: CL.pastdue }
              ].map(b => (
                <div key={b.label} style={{ background: b.color, color: '#fff', padding: '1.5px 7px', borderRadius: 2, fontSize: '7.5pt', fontWeight: 600 }}>
                  {b.label}: {b.count}
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: 6, padding: '3px 12px', border: '1.2px solid ' + CL.navy, borderRadius: 4, display: 'inline-block', textAlign: 'center', background: '#f8fafc' }}>
              <div style={{ fontWeight: 800, fontSize: '7.5pt', color: CL.navy, marginBottom: 1 }}>DAILY TARGET</div>
              <div style={{ fontSize: '9.5pt', fontWeight: 700, color: '#d9534f' }}>
                {peso([...groups.active, ...groups.overdue].reduce((sum, c) => sum + Number(c.amortization || 0), 0))}
              </div>
            </div>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            {showSideBoxes ? headerBox('DAILY CASH SUMMARY', (
              <>
                {[
                  ['Total Collection'],
                  ['PB/Ins/DST', pbInsDstTotal > 0 ? (
                    <span style={{ color: CL.pastdue, lineHeight: 1, display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
                      <span style={{ fontSize: '6.5pt', fontWeight: 600 }}>PB:</span>
                      <span style={{ fontSize: '10pt', fontWeight: 800 }}>{cashSummaryAmount(pbInsDstTotal)}</span>
                    </span>
                  ) : null],
                  ['Total', null, true],
                  ['Field Release'],
                  ['Total Expense'],
                  ['Grand Total', null, true]
                ].map(([label, value, isRed]) => blankCashLine(label, value, isRed))}
                <div style={{ borderTop: '1.5px solid '+CL.navy, margin: '6px -8px -6px -8px', padding: '6px 8px 6px' }}>
                   {blankCashLine('Over / Short')}
                </div>
              </>
            ), 235) : <div style={{ width: 235 }}></div>}
          </div>
        </div>
      )
      const pageFooter = (currentPage, totalPages) => (
        <div className="collection-sheet-page-footer" style={{ borderTop: '2px solid '+CL.navy, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6, pageBreakInside: 'avoid' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid '+CL.navy, paddingTop: 4, fontSize: '7.5pt', color: '#333', fontWeight: 600 }}>
            <span>Collection Date: {displayCollDate}</span>
            <span>Page {currentPage} of {totalPages}</span>
          </div>
        </div>
      )

      if (loans.length === 0) return (
        <div className="empty-state"><p>No collection-sheet clients found for the selected collector and collection date.</p></div>
      )

      return (
        <div id="printable-area" className="collection-sheet-print" style={{ background: '#fff', fontFamily: 'Arial, Helvetica, sans-serif' }}>
          {pages.map((page, pageIndex) => (
            <div key={pageIndex} className="collection-sheet-page" style={{ pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto', breakAfter: pageIndex < pages.length - 1 ? 'page' : 'auto' }}>
              {pageHeader(pageIndex === 0)}
              <div className="collection-sheet-page-body" style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                <div style={{ flex: 1, minWidth: 0, borderRight: '1.5px solid #000', paddingRight: 8 }}>
                  {renderClientColumn(page.left, `L${pageIndex}`)}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
                  {renderClientColumn(page.right, `R${pageIndex}`)}
                </div>
              </div>
              {pageFooter(pageIndex + 1, pages.length)}
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

  const renderCollectionPaymentRows = () => {
    const groups = groupCollectionAccounts(selectedCollector?.payments || [])
    if (groups.every(group => group.rows.length === 0)) {
      return <tr><td colSpan={7} className="empty-state">No payment details</td></tr>
    }

    return groups.flatMap(group => {
      const header = (
        <tr key={`${group.key}-header`}>
          <td colSpan={7} style={{ background: group.color, color: '#fff', fontWeight: 700, padding: '7px 12px', textTransform: 'uppercase', letterSpacing: 0.2 }}>
            {group.label} - {group.rows.length} {group.rows.length === 1 ? 'Client' : 'Clients'}
          </td>
        </tr>
      )
      const empty = group.rows.length === 0 ? (
        <tr key={`${group.key}-empty`}>
          <td colSpan={7} className="empty-state" style={{ padding: '8px 12px', textAlign: 'center' }}>No clients in this classification</td>
        </tr>
      ) : null
      const rows = group.rows.map(p => (
        <tr key={`${group.key}-${p.id}`}>
          <td className="mono">{p.customer_code || '-'}</td>
          <td>{p.date_paid}</td>
          <td className="fw-600">{p.customer_name || '-'}</td>
          <td className="mono">{p.or_number || '-'}</td>
          <td className="mono">{p.loan_code || '-'}</td>
          <td className="text-right text-success fw-bold">₱ {fmt(p.amount_paid)}</td>
          <td className="text-right">₱ {fmt(p.balance_after)}</td>
        </tr>
      ))
      return empty ? [header, empty] : [header, ...rows]
    })
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
        ${REPORT_PRINT_CLARITY_CSS}
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
              <button id="btn-run-report" className="btn btn-primary" onClick={() => run(active, params, active === 'monthly-releases' ? releaseSubTab : collectionSubTab)} disabled={loading || (active === 'disclosure-statement' && !params.disclosure_search.trim() && !params.disclosure_loan_id)}>{loading ? '⏳ Running...' : '▶ Run Report'}</button>
              {(data || active === 'collection-sheet') && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={handleExportExcel} disabled={loading || data?.error}>Export Excel</button>
                  {active === 'collection-sheet' ? (
                    <>
                      <button className="btn btn-secondary" onClick={printCollectionSheet} disabled={loading}>🖨️ Print</button>
                      <button className="btn btn-secondary" onClick={handleExportPdf} disabled={loading}>📄 Export PDF</button>
                    </>
                  ) : ['collection-report', 'monthly-releases', 'past-due', 'payments-reversed', 'full-paid'].includes(active) ? (
                    <>
                      <button className="btn btn-secondary" onClick={() => handlePrint('summary')}>🖨️ Print Summary</button>
                      <button className="btn btn-secondary" onClick={() => handlePrint('detailed')}>🖨️ Print Detailed</button>
                    </>
                  ) : (
                    <button className="btn btn-secondary" onClick={() => handlePrint('summary')}>{active === 'disclosure-statement' ? 'Print Disclosure' : '🖨️ Print'}</button>
                  )}
                  {active === 'disclosure-statement' && (
                    <button className="btn btn-secondary" onClick={handleExportDisclosurePdf}>Export PDF</button>
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
          <div className="modal modal-print-area" id="printable-area" style={{ maxWidth: active === 'full-paid' ? 1180 : 980 }}>
            <div className="modal-header">
              <span className="modal-title">{active === 'full-paid' ? 'Fully Paid Details' : active === 'payments-reversed' ? 'Reversed Payment Details' : (active === 'monthly-releases' || active === 'loan-type') ? 'Release Details' : active === 'past-due' ? 'Maturity Details' : 'Collection Details'} - {selectedCollector.collector}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => window.print()}>🖨️ Print</button>
                <button className="modal-close" onClick={() => setSelectedCollector(null)}>x</button>
              </div>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: active === 'full-paid' ? 'repeat(5, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
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
                {active === 'full-paid' && (
                  <>
                    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                      <div className="nav-section-label" style={{ marginBottom: 4 }}>Interest</div>
                      <div className="fw-bold">&#8369; {fmt(selectedCollector.total_interest || 0)}</div>
                    </div>
                    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                      <div className="nav-section-label" style={{ marginBottom: 4 }}>Total Loan Amount</div>
                      <div className="fw-bold text-success">&#8369; {fmt(selectedCollector.total_loan_amount || 0)}</div>
                    </div>
                  </>
                )}
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
                        <tr><th>Client Code</th><th>Client</th><th>Loan#</th><th>Date Released</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="text-right">Total Loan Amount</th><th className="text-right">Total Paid</th></tr>
                      </thead>
                      <tbody>
                        {selectedCollector.loans?.length === 0 ? <tr><td colSpan={8} className="empty-state">No fully paid details</td></tr> : selectedCollector.loans?.map(l => (
                          <tr key={l.id}>
                            <td className="mono">{l.customer_code || '-'}</td>
                            <td className="fw-600">{l.customer_name || '-'}</td>
                            <td className="mono">{l.loan_code || '-'}</td>
                            <td>{l.date_released}</td>
                            <td className="text-right fw-bold" style={{ color: '#16a34a' }}>&#8369; {fmt(l.principal)}</td>
                            <td className="text-right fw-bold">&#8369; {fmt(loanInterest(l))}</td>
                            <td className="text-right fw-bold text-success">&#8369; {fmt(loanTotalAmount(l))}</td>
                            <td className="text-right fw-bold text-success">&#8369; {fmt(l.total_paid)}</td>
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
                        {renderCollectionPaymentRows()}
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
