import { Fragment, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import API from '../services/api'
import html2pdf from 'html2pdf.js'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import SoaModal from '../components/SoaModal'
import DeathCertificateModal from '../components/DeathCertificateModal'
import { useAuth } from '../context/AuthContext'
import { reportPermissionKey } from '../access'
import { buildAdaptiveCollectionSheetPages } from '../utils/collectionSheetLayout'
import {
  AlertTriangle,
  ArrowUp,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileX,
  FileText,
  Filter,
  Pencil,
  Plus,
  Printer,
  RefreshCcw,
  Rocket,
  Save,
  Settings,
  Trash2,
  UsersRound,
  WalletCards,
} from 'lucide-react'
const CL = { navy: '#0D1B3D', active: '#1F2933', recon: '#1565C0', overdue: '#EF6C00', pastdue: '#D71920', lightBg: '#F5F7FA' }
const fmt = n => Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })
const compactChartLabel = value => {
  const text = String(value || '')
  return text.length > 18 ? `${text.slice(0, 17)}...` : text
}
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
const collectorDisplayName = collector => `${collector?.first_name || ''} ${collector?.last_name || ''}`.trim() || collector?.collector_code || `Collector ${collector?.id || ''}`.trim()
const specialReportCollectors = (reportData, fallbackCollectors) => reportData?.collector_sheets?.length ? reportData.collector_sheets : fallbackCollectors
const specialAccountsForTab = (reportData, tab) => {
  if (tab === 'deceased') return reportData?.deceased || []
  if (tab === 'written-off') return reportData?.written_off || []
  return [...(reportData?.deceased || []), ...(reportData?.written_off || [])]
}
const specialAccountsForCollector = (accounts, collectorId, reportCollectors) => {
  if (collectorId === 'all') return accounts
  const collector = reportCollectors.find(item => String(item.id) === String(collectorId))
  const collectorName = collectorDisplayName(collector).toLowerCase()
  return accounts.filter(account =>
    String(account.collector_id || '') === String(collectorId)
    || String(account.collector_name || '').trim().toLowerCase() === collectorName
  )
}
const toDisplayCase = value => String(value || '')
  .toLocaleLowerCase('en-PH')
  .replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_, prefix, char) => prefix + char.toLocaleUpperCase('en-PH'))
  .replace(/\bIi\b/g, 'II')
  .replace(/\bIii\b/g, 'III')
  .replace(/\bIv\b/g, 'IV')
  .replace(/\bVi\b/g, 'VI')
const formatExcelDate = dateStr => {
  if (!dateStr) return '-'
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`
}

function ExpenseGridCell({ initialValue, onSave, rowIndex, colIndex, totalRows, totalCols }) {
  const [val, setVal] = useState(initialValue > 0 ? String(initialValue) : '')
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!isFocused) {
      setVal(initialValue > 0 ? String(initialValue) : '')
    }
  }, [initialValue, isFocused])

  const commit = (nextVal) => {
    const valueToSave = nextVal !== undefined ? nextVal : val
    setIsFocused(false)
    const num = Math.max(0, parseFloat(valueToSave) || 0)
    const prev = Math.max(0, parseFloat(initialValue) || 0)
    if (num !== prev) {
      onSave(num)
    }
  }

  const navigateTo = (targetRow, targetCol) => {
    const targetEl = document.querySelector(`input[data-expense-row="${targetRow}"][data-expense-col="${targetCol}"]`)
    if (targetEl) {
      targetEl.focus()
      targetEl.select?.()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      commit()
      const targetRow = Math.max(0, rowIndex - 1)
      navigateTo(targetRow, colIndex)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      commit()
      const targetRow = Math.min(totalRows - 1, rowIndex + 1)
      navigateTo(targetRow, colIndex)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      commit()
      let targetRow = rowIndex
      let targetCol = colIndex - 1
      if (targetCol < 0) {
        if (targetRow > 0) {
          targetRow -= 1
          targetCol = totalCols - 1
        } else {
          targetCol = 0
        }
      }
      navigateTo(targetRow, targetCol)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      commit()
      let targetRow = rowIndex
      let targetCol = colIndex + 1
      if (targetCol >= totalCols) {
        if (targetRow < totalRows - 1) {
          targetRow += 1
          targetCol = 0
        } else {
          targetCol = totalCols - 1
        }
      }
      navigateTo(targetRow, targetCol)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      if (e.shiftKey) {
        const targetRow = Math.max(0, rowIndex - 1)
        navigateTo(targetRow, colIndex)
      } else {
        if (rowIndex < totalRows - 1) {
          navigateTo(rowIndex + 1, colIndex)
        } else {
          e.target.blur()
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commit()
      if (e.shiftKey) {
        let targetRow = rowIndex
        let targetCol = colIndex - 1
        if (targetCol < 0 && targetRow > 0) {
          targetRow -= 1
          targetCol = totalCols - 1
        }
        if (targetCol >= 0) {
          navigateTo(targetRow, targetCol)
        }
      } else {
        let targetRow = rowIndex
        let targetCol = colIndex + 1
        if (targetCol >= totalCols && targetRow < totalRows - 1) {
          targetRow += 1
          targetCol = 0
        }
        if (targetCol < totalCols) {
          navigateTo(targetRow, targetCol)
        }
      }
    }
  }

  return (
    <td style={{ padding: 0, background: isFocused ? '#eff6ff' : 'transparent', minWidth: 85, border: '1px solid #cbd5e1', textAlign: 'right' }}>
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={val}
        placeholder="-"
        data-expense-row={rowIndex}
        data-expense-col={colIndex}
        onFocus={e => {
          setIsFocused(true)
          e.target.select?.()
        }}
        onBlur={() => commit()}
        onWheel={e => e.currentTarget.blur()}
        onKeyDown={handleKeyDown}
        onChange={e => setVal(e.target.value)}
        style={{
          width: '100%',
          height: '26px',
          border: isFocused ? '2px solid #0f766e' : '1px solid transparent',
          textAlign: 'right',
          padding: '2px 6px',
          background: 'transparent',
          fontSize: '11.5px',
          fontWeight: val && Number(val) > 0 ? '700' : 'normal',
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          color: val && Number(val) > 0 ? '#0D1B3D' : '#94a3b8',
        }}
      />
    </td>
  )
}

const middleInitial = value => {
  const middle = String(value || '').trim()
  if (!middle) return ''
  const firstLetter = middle.match(/\p{L}/u)?.[0]
  return firstLetter ? `${firstLetter.toLocaleUpperCase('en-PH')}.` : ''
}
const formatCollectionClientName = loan => {
  const lastName = String(loan.last_name || '').trim()
  const firstName = String(loan.first_name || '').trim()
  const middleName = String(loan.middle_name || '').trim()

  if (lastName || firstName) {
    return [
      lastName,
      [firstName, middleInitial(middleName)].filter(Boolean).join(' ')
    ].filter(Boolean).join(', ')
  }

  const rawName = String(loan.customer_name || '').trim()
  const [rawLast, ...rest] = rawName.split(',')
  if (rest.length === 0) return rawName

  const givenParts = rest.join(',').trim().split(/\s+/).filter(Boolean)
  if (givenParts.length <= 1) return rawName

  const possibleMiddle = givenParts[givenParts.length - 1]
  const firstNames = givenParts.slice(0, -1).join(' ')
  return `${rawLast.trim()}, ${firstNames} ${middleInitial(possibleMiddle)}`.trim()
}
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
  const reportedDpd = parseInt(account?.days_past_due ?? account?.days_overdue, 10)
  let dpd = Math.max(0, Number.isFinite(reportedDpd) ? reportedDpd : 0)
  if (!dpd && account?.date_maturity && (account?.date_paid || account?.payment_date)) {
    const paidDate = new Date(`${account.date_paid || account.payment_date}T00:00:00`)
    const maturityDate = new Date(`${account.date_maturity}T00:00:00`)
    if (!Number.isNaN(paidDate.getTime()) && !Number.isNaN(maturityDate.getTime()) && paidDate > maturityDate) {
      dpd = Math.floor((paidDate - maturityDate) / (1000 * 60 * 60 * 24))
    }
  }
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

const getReleaseCollectorRows = loans => Object.entries((loans || []).filter(l => !['cancelled', 'canceled', 'reversed', 'rejected'].includes(String(l?.status || '').toLowerCase())).reduce((acc, l) => {
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
  .map(([, row]) => ({
    ...row,
    total_without_recon_count: row.new_count + row.reloan_count,
    total_without_recon_amount: row.new_amount + row.reloan_amount,
    loans: row.loans.sort((a, b) => String(a.date_released || '').localeCompare(String(b.date_released || '')) || String(a.customer_name || '').localeCompare(String(b.customer_name || '')))
  }))
  .sort((a, b) => a.collector.localeCompare(b.collector))

const loanPrincipal = loan => Number(loan?.principal || 0)
const loanInterest = loan => {
  const explicitInterest = Number(loan?.interest_amount || 0)
  if (explicitInterest > 0) return explicitInterest
  const paidOverPrincipal = Number(loan?.total_paid || 0) - loanPrincipal(loan)
  return paidOverPrincipal > 0 ? paidOverPrincipal : 0
}
const loanTotalAmount = loan => loanPrincipal(loan) + loanInterest(loan)

const getNewClientCollectorRows = loans => Object.entries((loans || [])
  .filter(loan => {
    const type = String(loan?.loan_type || '').toLowerCase()
    return !type.includes('reloan') && !type.includes('re-loan') && !type.includes('recon')
  })
  .reduce((rows, loan) => {
    const collector = loan.collector_name || 'Unassigned'
    if (!rows[collector]) {
      rows[collector] = {
        collector,
        clientIds: new Set(),
        principal: 0,
        interest: 0,
        totalLoan: 0
      }
    }

    const row = rows[collector]
    row.clientIds.add(loan.customer_id || loan.customer_code || loan.id)
    row.principal += loanPrincipal(loan)
    row.interest += loanInterest(loan)
    row.totalLoan += loanTotalAmount(loan)
    return rows
  }, {}))
  .map(([, row]) => ({ ...row, newClientCount: row.clientIds.size }))
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
  const activeLoans = (loans || []).filter(l => !['cancelled', 'canceled', 'reversed', 'rejected'].includes(String(l?.status || '').toLowerCase()))
  const periods = getMonthlyReleasePeriods(params)
  const rowsByCollector = {}
  const periodTotals = periods.reduce((acc, period) => ({ ...acc, [period.key]: { amount: 0, loan_count: 0, loans: [] } }), {})

  activeLoans.forEach(loan => {
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
  { key: 'collection-report', label: 'Collection Report', desc: 'Daily and monthly collections', Icon: CalendarDays, color: '#2563eb', bg: '#dbeafe' },
  { key: 'monthly-releases', label: 'Releases Report', desc: 'Daily and monthly releases', Icon: Rocket, color: '#ea580c', bg: '#ffedd5' },
  { key: 'past-due', label: 'Loans Maturity Checker', desc: 'Loans by maturity date range', Icon: AlertTriangle, color: '#dc2626', bg: '#fee2e2' },
  { key: 'payments-reversed', label: 'Payments Reversed', desc: 'Reversed payments by date range', Icon: RefreshCcw, color: '#7c3aed', bg: '#ede9fe' },
  { key: 'full-paid', label: 'Fully Paid Loans', desc: 'Fully paid loan accounts', Icon: CheckCircle2, color: '#16a34a', bg: '#dcfce7' },
  { key: 'collection-sheet', label: 'Collection Sheet', desc: 'Per-collector active loan list', Icon: ClipboardList, color: '#4f46e5', bg: '#e0e7ff' },
  { key: 'disclosure-statement', label: 'Disclosure Statement', desc: 'Client disclosure for every reloan', Icon: FileText, color: '#0f766e', bg: '#ccfbf1' },
  { key: 'aging-report', label: 'Aging Report', desc: 'Overdue aging by period and collector', Icon: Bell, color: '#ca8a04', bg: '#fef3c7' },
  { key: 'special-accounts', label: 'Deceased & Written-Off Accounts', desc: 'Deceased and written-off account reports', Icon: FileX, color: '#b91c1c', bg: '#fee2e2' },
  { key: 'expenses-report', label: 'Expenses Reports', desc: 'Employee expense input and summary', Icon: WalletCards, color: '#0f766e', bg: '#ccfbf1' },
]

export default function Reports() {
  const { hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab') || searchParams.get('type') || ''
  const autoLoaded = useRef(false)
  const [active, setActive] = useState('')
  const [collectionSubTab, setCollectionSubTab] = useState('daily')
  const [releaseSubTab, setReleaseSubTab] = useState('daily')
  const [monthlySubTab, setMonthlySubTab] = useState('by-collector')
  const [releaseMonthlySubTab, setReleaseMonthlySubTab] = useState('by-collector')
  const [releaseChartMetric, setReleaseChartMetric] = useState('overall')
  const [params, setParams] = useState({ date_from: yesterday(), date_to: yesterday(), year: new Date().getFullYear(), month: new Date().getMonth() + 1, collection_month: 'all', collection_cycle_type: '30', collection_cycle: 'all', release_cycle_type: '30', release_cycle: 'all', days_ahead: 30, collector_id: '', disclosure_search: '', disclosure_loan_id: '' })
  const [collectors, setCollectors] = useState([])
  const [collectorsLoaded, setCollectorsLoaded] = useState(false)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedCollector, setSelectedCollector] = useState(null)
  const [agingDetail, setAgingDetail] = useState(null)
  const [soaCustomerId, setSoaCustomerId] = useState(null)
  const [soaInitialTab, setSoaInitialTab] = useState('summary')
  const [selectedDeathCertAccount, setSelectedDeathCertAccount] = useState(null)
  const [modalSortConfig, setModalSortConfig] = useState({ key: null, direction: 'asc' })
  const [modalTypeFilter, setModalTypeFilter] = useState([])
  const [typeFilterMenuOpen, setTypeFilterMenuOpen] = useState(false)
  const [showMaturityBackToTop, setShowMaturityBackToTop] = useState(false)
  const maturityTopRef = useRef(null)

  useEffect(() => {
    if (active !== 'past-due' || !data) {
      setShowMaturityBackToTop(false)
      return undefined
    }

    const scrollContainer = maturityTopRef.current?.closest('.page-content')
    if (!scrollContainer) return undefined

    const updateBackToTopVisibility = () => {
      setShowMaturityBackToTop(scrollContainer.scrollTop > 300)
    }

    updateBackToTopVisibility()
    scrollContainer.addEventListener('scroll', updateBackToTopVisibility, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', updateBackToTopVisibility)
  }, [active, data])

  const scrollToMaturityCollector = collectorIndex => {
    const section = document.getElementById(`maturity-collector-${collectorIndex}`)
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    section.focus({ preventScroll: true })
  }

  const scrollMaturityReportToTop = () => {
    const scrollContainer = maturityTopRef.current?.closest('.page-content')
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      maturityTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    maturityTopRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (selectedCollector) {
      setModalTypeFilter([])
      setTypeFilterMenuOpen(false)
    }
  }, [selectedCollector])

  const toggleModalTypeFilter = (type) => {
    setModalTypeFilter(prev => {
      if (prev.includes(type)) return prev.filter(t => t !== type)
      return [...prev, type]
    })
  }

  const handleModalSort = (key) => {
    let direction = 'asc'
    if (modalSortConfig.key === key && modalSortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setModalSortConfig({ key, direction })
  }
  const getSortedModalData = () => {
    if (!selectedCollector) return []
    const list = selectedCollector.loans || selectedCollector.payments || []
    
    let filteredList = list
    if (modalTypeFilter.length > 0) {
      filteredList = list.filter(l => modalTypeFilter.includes(l.loan_type))
    }

    if (!modalSortConfig.key) return filteredList
    return [...filteredList].sort((a, b) => {
      let aVal = a[modalSortConfig.key]
      let bVal = b[modalSortConfig.key]
      if (modalSortConfig.key === 'principal' || modalSortConfig.key === 'net_proceeds') {
        aVal = Number(aVal || 0)
        bVal = Number(bVal || 0)
      } else {
        aVal = String(aVal || '').toLowerCase()
        bVal = String(bVal || '').toLowerCase()
      }
      if (aVal < bVal) return modalSortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return modalSortConfig.direction === 'asc' ? 1 : -1
      return 0
    })
  }
  const [fieldReleaseOpen, setFieldReleaseOpen] = useState(false)
  const [fieldReleaseRows, setFieldReleaseRows] = useState([])
  const [fieldReleaseLoading, setFieldReleaseLoading] = useState(false)
  const [fieldReleaseSaving, setFieldReleaseSaving] = useState(false)
  const [fieldReleaseTab, setFieldReleaseTab] = useState('amounts')
  const [fieldReleaseCollectors, setFieldReleaseCollectors] = useState([])
  const [fieldReleaseCollectorsSaving, setFieldReleaseCollectorsSaving] = useState(false)
  const [advanceManualOpen, setAdvanceManualOpen] = useState(false)
  const [advanceManualForm, setAdvanceManualForm] = useState({ client_code: '', client: null, amount: '', searching: false, saving: false, error: '' })
  const [advanceManualEntries, setAdvanceManualEntries] = useState([])
  const [advanceEntriesLoading, setAdvanceEntriesLoading] = useState(false)
  const [advanceEditingId, setAdvanceEditingId] = useState(null)
  const [advanceEditAmount, setAdvanceEditAmount] = useState('')
  const [advanceDeletingId, setAdvanceDeletingId] = useState(null)
  const [advanceManualSuccess, setAdvanceManualSuccess] = useState(null)
  const [printMode, setPrintMode] = useState('detailed')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [specialAccountsTab, setSpecialAccountsTab] = useState('summary')
  const [specialCollectorSheetId, setSpecialCollectorSheetId] = useState('all')
  const [expensesTab, setExpensesTab] = useState('summary')
  const [expenseSummaryTab, setExpenseSummaryTab] = useState('total-each-employee')
  const [configurationTab, setConfigurationTab] = useState('personnel')
  const [expensePersonnel, setExpensePersonnel] = useState([])
  const [expenseCategories, setExpenseCategories] = useState([])
  const [expenseEntries, setExpenseEntries] = useState([])
  const [expenseSummary, setExpenseSummary] = useState(null)
  const [expenseMatrix, setExpenseMatrix] = useState(null)
  const [activeCollectorSheetId, setActiveCollectorSheetId] = useState(null)
  const [expenseCategoryFilterOpen, setExpenseCategoryFilterOpen] = useState(false)
  const [selectedExpenseCategories, setSelectedExpenseCategories] = useState(null)
  const [selectedExpenseEmployee, setSelectedExpenseEmployee] = useState(null)
  const [expensesLoading, setExpensesLoading] = useState(false)
  const [, setExpenseForm] = useState({ id: '', personnel_id: '', expense_date: toDateInputValue(new Date()), category: '', description: '', amount: '', remarks: '' })
  const [expenseActionModal, setExpenseActionModal] = useState(null)
  const [personnelForm, setPersonnelForm] = useState({ id: '', employee_name: '', position: '', status: 'active' })
  const [categoryForm, setCategoryForm] = useState({ id: '', category_name: '', status: 'active' })
  const allowedReportTypes = REPORT_TYPES.filter(report => hasPermission(reportPermissionKey(report.key), 'view'))
  const allowedReportKeys = allowedReportTypes.map(report => report.key).join('|')

  const openAgingDetails = (group, bucket, reportData) => {
    const loans = (reportData?.loans || []).filter(loan => {
      const collectorMatches = group.collector_id !== null && group.collector_id !== undefined
        ? String(loan.collector_id) === String(group.collector_id)
        : String(loan.collector_name || 'Unassigned').trim().toLowerCase()
          === String(group.collector || 'Unassigned').trim().toLowerCase()
      const days = Number(loan.aging_days || 0)
      const bucketMatches = bucket.bucket_key === '121+'
        ? days >= 121
        : (() => {
            const [min, max] = String(bucket.bucket_key).split('-').map(Number)
            return days >= min && days <= max
          })()
      return collectorMatches && bucketMatches
    })

    const clientIds = new Set(loans.map(loan => loan.customer_id || loan.customer_code).filter(Boolean))
    const totals = loans.reduce((summary, loan) => ({
      total_clients: clientIds.size,
      total_principal: summary.total_principal + Number(loan.principal || 0),
      total_interest: summary.total_interest + Number(loan.interest_amount || 0),
      total_loan_amount: summary.total_loan_amount + Number(loan.total_loan_amount || 0),
      total_collectibles: summary.total_collectibles + Number(loan.balance || 0),
    }), {
      total_clients: clientIds.size,
      total_principal: 0,
      total_interest: 0,
      total_loan_amount: 0,
      total_collectibles: 0,
    })

    setAgingDetail({
      collector: group.collector || 'Unassigned',
      bucket: bucket.bucket_label,
      totals,
      loans,
    })
  }

  const openExpenseEmployeeDetails = (row) => {
    setSelectedExpenseEmployee({
      ...row,
      expenses: expenseEntries.filter(entry => Number(entry.personnel_id) === Number(row.personnel_id)),
    })
  }

  const openFieldReleaseModal = async () => {
    const reportDate = params.date || toDateInputValue(new Date())
    setFieldReleaseOpen(true)
    setFieldReleaseTab('amounts')
    setFieldReleaseLoading(true)
    try {
      const [releaseRes, collectorRes] = await Promise.all([
        API.get('/reports/collection-sheet/field-releases', { params: { date: reportDate } }),
        API.get('/reports/collection-sheet/field-releases/collectors'),
      ])
      setFieldReleaseRows(Array.isArray(releaseRes.data?.releases) ? releaseRes.data.releases : [])
      setFieldReleaseCollectors(Array.isArray(collectorRes.data?.collectors) ? collectorRes.data.collectors : [])
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load field release data')
    } finally {
      setFieldReleaseLoading(false)
    }
  }

  const toggleFieldReleaseCollector = collectorId => {
    setFieldReleaseCollectors(prev => prev.map(collector => (
      Number(collector.collector_id) === Number(collectorId)
        ? { ...collector, selected: collector.selected ? 0 : 1 }
        : collector
    )))
  }

  const saveFieldReleaseCollectors = async () => {
    const reportDate = params.date || toDateInputValue(new Date())
    setFieldReleaseCollectorsSaving(true)
    try {
      await API.put('/reports/collection-sheet/field-releases/collectors', {
        collector_ids: fieldReleaseCollectors.filter(collector => collector.selected).map(collector => collector.collector_id),
      })
      const res = await API.get('/reports/collection-sheet/field-releases', { params: { date: reportDate } })
      setFieldReleaseRows(Array.isArray(res.data?.releases) ? res.data.releases : [])
      setFieldReleaseTab('amounts')
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save Field Release collector selection')
    } finally {
      setFieldReleaseCollectorsSaving(false)
    }
  }

  const updateFieldReleaseAmount = (collectorId, val) => {
    setFieldReleaseRows(prev => prev.map(r => r.collector_id === collectorId ? { ...r, amount: val } : r))
  }

  const clearAllFieldReleaseAmounts = () => {
    setFieldReleaseRows(prev => prev.map(row => ({ ...row, amount: '' })))
  }

  const saveFieldReleases = async () => {
    const reportDate = params.date || toDateInputValue(new Date())
    setFieldReleaseSaving(true)
    try {
      await API.post('/reports/collection-sheet/field-releases', {
        date: reportDate,
        releases: fieldReleaseRows.map(r => ({ collector_id: r.collector_id, amount: Number(r.amount || 0) }))
      })
      setFieldReleaseOpen(false)
      if (active === 'collection-sheet' && params.collector_id) {
        run('collection-sheet', params)
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save field release data')
    } finally {
      setFieldReleaseSaving(false)
    }
  }

  const loadAdvanceManualEntries = async (reportDate = params.date || toDateInputValue(new Date())) => {
    setAdvanceEntriesLoading(true)
    try {
      const res = await API.get('/reports/collection-sheet/advance-manual', { params: { date: reportDate } })
      setAdvanceManualEntries(Array.isArray(res.data?.entries) ? res.data.entries : [])
    } catch (err) {
      setAdvanceManualEntries([])
      setAdvanceManualForm(prev => ({ ...prev, error: err.response?.data?.error || 'Failed to load advance entries.' }))
    } finally {
      setAdvanceEntriesLoading(false)
    }
  }

  const openAdvanceManualModal = () => {
    setAdvanceManualForm({ client_code: '', client: null, amount: '', searching: false, saving: false, error: '' })
    setAdvanceEditingId(null)
    setAdvanceEditAmount('')
    setAdvanceManualOpen(true)
    loadAdvanceManualEntries()
  }

  const searchAdvanceClient = async (event) => {
    event?.preventDefault()
    const clientCode = advanceManualForm.client_code.trim()
    if (!clientCode) {
      setAdvanceManualForm(prev => ({ ...prev, client: null, error: 'Enter a Client Code first.' }))
      return
    }
    setAdvanceManualForm(prev => ({ ...prev, client: null, searching: true, error: '' }))
    try {
      const res = await API.get('/reports/collection-sheet/advance-client', { params: { client_code: clientCode } })
      setAdvanceManualForm(prev => ({ ...prev, client: res.data, searching: false, error: '' }))
    } catch (err) {
      setAdvanceManualForm(prev => ({ ...prev, client: null, searching: false, error: err.response?.data?.error || 'Client lookup failed.' }))
    }
  }

  const saveAdvanceManualEntry = async (event) => {
    event?.preventDefault()
    const client = advanceManualForm.client
    const amount = Number(advanceManualForm.amount)
    if (!client) {
      setAdvanceManualForm(prev => ({ ...prev, error: 'Search and select a valid Client Code first.' }))
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setAdvanceManualForm(prev => ({ ...prev, error: 'Amount must be greater than zero.' }))
      return
    }

    setAdvanceManualForm(prev => ({ ...prev, saving: true, error: '' }))
    try {
      const reportDate = params.date || toDateInputValue(new Date())
      await API.post('/reports/collection-sheet/advance-manual', {
        date: reportDate,
        customer_id: client.customer_id,
        loan_id: client.loan_id,
        amount,
      })
      await loadAdvanceManualEntries(reportDate)
      setAdvanceManualForm({ client_code: '', client: null, amount: '', searching: false, saving: false, error: '' })
      setAdvanceManualSuccess({
        client_name: client.customer_name,
        loan_code: client.loan_code,
        collector_name: client.collector_name,
        amount,
        date: reportDate,
      })
      if (active === 'collection-sheet' && String(params.collector_id) === String(client.collector_id)) {
        await run('collection-sheet', params)
      }
    } catch (err) {
      setAdvanceManualForm(prev => ({ ...prev, saving: false, error: err.response?.data?.error || 'Failed to save advance entry.' }))
    }
  }

  const updateAdvanceManualEntry = async (entry) => {
    const amount = Number(advanceEditAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setAdvanceManualForm(prev => ({ ...prev, error: 'Amount must be greater than zero.' }))
      return
    }
    setAdvanceManualForm(prev => ({ ...prev, error: '' }))
    try {
      await API.put(`/reports/collection-sheet/advance-manual/${entry.id}`, { amount })
      setAdvanceEditingId(null)
      setAdvanceEditAmount('')
      await loadAdvanceManualEntries()
      if (active === 'collection-sheet' && String(params.collector_id) === String(entry.collector_id)) {
        await run('collection-sheet', params)
      }
    } catch (err) {
      setAdvanceManualForm(prev => ({ ...prev, error: err.response?.data?.error || 'Failed to update advance entry.' }))
    }
  }

  const deleteAdvanceManualEntry = async (entry) => {
    if (!window.confirm(`Delete Adv. ${Number(entry.amount).toLocaleString('en-PH', { maximumFractionDigits: 2 })} for ${entry.customer_name}?`)) return
    setAdvanceDeletingId(entry.id)
    setAdvanceManualForm(prev => ({ ...prev, error: '' }))
    try {
      await API.delete(`/reports/collection-sheet/advance-manual/${entry.id}`)
      if (advanceEditingId === entry.id) {
        setAdvanceEditingId(null)
        setAdvanceEditAmount('')
      }
      await loadAdvanceManualEntries()
      if (active === 'collection-sheet' && String(params.collector_id) === String(entry.collector_id)) {
        await run('collection-sheet', params)
      }
    } catch (err) {
      setAdvanceManualForm(prev => ({ ...prev, error: err.response?.data?.error || 'Failed to delete advance entry.' }))
    } finally {
      setAdvanceDeletingId(null)
    }
  }

  const loadExpensesReport = async (nextParams = params) => {
    setExpensesLoading(true)
    try {
      const query = { date_from: nextParams.date_from, date_to: nextParams.date_to }
      const [personnelRes, categoriesRes, entriesRes, summaryRes, matrixRes] = await Promise.all([
        API.get('/reports/expenses/personnel'),
        API.get('/reports/expenses/categories'),
        API.get('/reports/expenses/entries', { params: query }),
        API.get('/reports/expenses/summary', { params: query }),
        API.get('/reports/expenses/collector-matrix', { params: query }),
      ])
      setExpensePersonnel(Array.isArray(personnelRes.data) ? personnelRes.data : [])
      setExpenseCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : [])
      setExpenseEntries(Array.isArray(entriesRes.data) ? entriesRes.data : [])
      const nextSummary = summaryRes.data || null
      setExpenseSummary(nextSummary)
      const matrixData = matrixRes.data || null
      setExpenseMatrix(matrixData)
      if (matrixData?.sheets?.length) {
        setActiveCollectorSheetId(current => {
          if (current && matrixData.sheets.some(s => Number(s.personnel_id) === Number(current))) {
            return current
          }
          return matrixData.sheets[0].personnel_id
        })
      }
      setSelectedExpenseCategories(null)
      setExpenseCategoryFilterOpen(false)
      setData(nextSummary || { ready: true })
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load expenses report')
      setData({ error: err.response?.data?.error || 'Failed to load expenses report' })
    } finally {
      setExpensesLoading(false)
    }
  }

  const handleExpenseCellChange = async (personnelId, dateStr, category, value) => {
    const numVal = Math.max(0, Number(value) || 0)
    setExpenseMatrix(prev => {
      if (!prev || !prev.sheets) return prev
      const newSheets = prev.sheets.map(sheet => {
        if (Number(sheet.personnel_id) !== Number(personnelId)) return sheet
        const prevDay = sheet.days?.[dateStr] || { collection: 0, release: 0, expenses: {}, total_expense: 0, net: 0 }
        const prevCatAmt = Number(prevDay.expenses?.[category]?.amount || 0)
        const diff = numVal - prevCatAmt

        const newExpenses = {
          ...prevDay.expenses,
          [category]: {
            ...prevDay.expenses?.[category],
            amount: numVal,
          }
        }
        const newTotalExpense = Object.values(newExpenses).reduce((s, e) => s + (Number(e?.amount) || 0), 0)
        const newNet = Number(prevDay.collection || 0) - Number(prevDay.release || 0) - newTotalExpense

        const newCatTotals = {
          ...sheet.totals.categories,
          [category]: (sheet.totals.categories[category] || 0) + diff
        }
        const newSheetTotalExpense = (sheet.totals.total_expense || 0) + diff
        const newSheetNet = (sheet.totals.net || 0) - diff

        return {
          ...sheet,
          totals: {
            ...sheet.totals,
            categories: newCatTotals,
            total_expense: newSheetTotalExpense,
            net: newSheetNet,
          },
          days: {
            ...sheet.days,
            [dateStr]: {
              ...prevDay,
              expenses: newExpenses,
              total_expense: newTotalExpense,
              net: newNet,
            }
          }
        }
      })
      return { ...prev, sheets: newSheets }
    })

    try {
      await API.post('/reports/expenses/cell-update', {
        personnel_id: personnelId,
        expense_date: dateStr,
        category,
        amount: numVal,
      })
      const query = { date_from: params.date_from, date_to: params.date_to }
      const [entriesRes, summaryRes] = await Promise.all([
        API.get('/reports/expenses/entries', { params: query }),
        API.get('/reports/expenses/summary', { params: query }),
      ])
      setExpenseEntries(Array.isArray(entriesRes.data) ? entriesRes.data : [])
      setExpenseSummary(summaryRes.data || null)
    } catch (err) {
      console.error('Failed to update expense cell:', err)
      alert(err.response?.data?.error || 'Failed to save expense entry')
      loadExpensesReport(params)
    }
  }

  const savePersonnel = async (event) => {
    event.preventDefault()
    const payload = {
      employee_name: personnelForm.employee_name.trim(),
      position: personnelForm.position.trim(),
      status: personnelForm.status || 'active',
    }
    if (!payload.employee_name) {
      alert('Employee name is required.')
      return
    }
    try {
      if (personnelForm.id) {
        await API.put(`/reports/expenses/personnel/${personnelForm.id}`, payload)
      } else {
        await API.post('/reports/expenses/personnel', payload)
      }
      setPersonnelForm({ id: '', employee_name: '', position: '', status: 'active' })
      await loadExpensesReport()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save employee')
    }
  }

  const expenseEmployeeName = personnelId => expensePersonnel.find(personnel => String(personnel.id) === String(personnelId))?.employee_name || 'Unknown Employee'

  const saveCategory = async (event) => {
    event.preventDefault()
    const payload = {
      category_name: categoryForm.category_name.trim(),
      status: categoryForm.status || 'active',
    }
    if (!payload.category_name) {
      alert('Category name is required.')
      return
    }
    try {
      if (categoryForm.id) {
        await API.put(`/reports/expenses/categories/${categoryForm.id}`, payload)
      } else {
        await API.post('/reports/expenses/categories', payload)
      }
      setCategoryForm({ id: '', category_name: '', status: 'active' })
      await loadExpensesReport()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save category')
    }
  }

  const applyExpenseEdit = entry => {
    setExpensesTab('input')
    setExpenseForm({
      id: entry.id,
      personnel_id: String(entry.personnel_id || ''),
      expense_date: dateOnly(entry.expense_date) || toDateInputValue(new Date()),
      category: entry.category || '',
      description: entry.description || '',
      amount: entry.amount || '',
      remarks: entry.remarks || '',
    })
  }

  const confirmExpenseAction = async () => {
    if (!expenseActionModal || expenseActionModal.busy) return
    const { action, entry, entryId, payload } = expenseActionModal
    if (action === 'edit') {
      applyExpenseEdit(entry)
      setExpenseActionModal(null)
      return
    }

    setExpenseActionModal(current => ({ ...current, busy: true }))
    try {
      if (action === 'delete') {
        await API.delete(`/reports/expenses/entries/${entry.id}`)
      } else if (action === 'update') {
        await API.put(`/reports/expenses/entries/${entryId}`, payload)
      } else {
        await API.post('/reports/expenses/entries', payload)
      }
      if (action === 'create' || action === 'update') {
        setExpenseForm({ id: '', personnel_id: payload.personnel_id, expense_date: toDateInputValue(new Date()), category: '', description: '', amount: '', remarks: '' })
      }
      await loadExpensesReport()
      const resultTitles = { create: 'Expense Saved', update: 'Expense Updated', delete: 'Expense Deleted' }
      const resultMessages = {
        create: 'The new expense entry was saved successfully.',
        update: 'The expense entry was updated successfully.',
        delete: 'The expense entry was removed successfully.',
      }
      setExpenseActionModal({ phase: 'success', title: resultTitles[action], message: resultMessages[action] })
    } catch (err) {
      setExpenseActionModal({
        phase: 'error',
        title: 'Action Failed',
        message: err.response?.data?.error || `Failed to ${action === 'delete' ? 'delete' : 'save'} the expense entry. Please try again.`,
      })
    }
  }

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
    if (!params.collector_id) {
      alert('Please select a collector first.')
      return
    }

    let reportData = data
    if (!reportData || reportData.error) {
      try {
        setLoading(true)
        const response = await API.get('/reports/collection-sheet', { params })
        reportData = response.data
        setData(reportData)
      } catch (err) {
        alert(err.response?.data?.error || err.message || 'Failed to generate collection sheet PDF.')
        setLoading(false)
        return
      } finally {
        setLoading(false)
      }
    }

    const { loans = [], collector: apiCollector, signatures: sigs = {}, summary = {} } = reportData
    const collName = collectors.find(c => c.id == params.collector_id)
    const collectorDisplayName = apiCollector?.name || (collName ? `${collName.last_name}, ${collName.first_name}`.toUpperCase() : 'UNASSIGNED')
    const collectionDate = params.date || toDateInputValue(new Date())
    const displayCollDate = new Date(collectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    const pbInsDstTotal = Number(summary.pbInsDst ?? summary.pb_ins_dst ?? summary.passbookTotal ?? summary.passbook_total ?? 0)
    const fieldReleaseTotal = params.manual_field_release !== undefined && params.manual_field_release !== ''
      ? Number(params.manual_field_release)
      : Number(summary.fieldRelease ?? summary.field_release ?? 0)
    const isReconLoan = (loan) => (loan.loan_type || '').toLowerCase().includes('recon')

    // Classify loans into groups
    const groups = { active: [], recon: [], overdue: [], pastdue: [] }
    const seen = new Set()
    loans.forEach(l => {
      if (seen.has(l.id)) return
      seen.add(l.id)
      l.days_past_due = Math.max(0, parseInt(l.days_past_due) || 0)
      groups[classifyCollectionAccount(l)].push(l)
    })
    Object.values(groups).forEach(arr => arr.sort((a, b) => formatCollectionClientName(a).localeCompare(formatCollectionClientName(b))))

    const baseClientsCount = groups.active.length + groups.recon.length + groups.overdue.length + groups.pastdue.length
    const totalClientsCount = params.manual_clients ? Number(params.manual_clients) : baseClientsCount
    const baseTarget = [...groups.active, ...groups.overdue.filter(c => !isReconLoan(c))].reduce((sum, c) => sum + Number(c.amortization || 0), 0)
    const targetAmount = params.manual_target ? Number(params.manual_target) : baseTarget

    // Currency formatter using standard ASCII 'P' to avoid \u20B1 () encoding corruption in WinAnsi pdf fonts
    const pesoFmtPdf = n => { const v = Number(n || 0); const f = Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? `-P${f}` : `P${f}` }
    const cashSummaryAmountPdf = amount => Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })
    const fDatePdf = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '-'

    // Color definitions (RGB arrays for jsPDF)
    const CL_PDF = {
      navy: [13, 27, 61],
      active: [31, 41, 51],
      recon: [21, 101, 192],
      overdue: [239, 108, 0],
      pastdue: [215, 25, 32],
      headerBg: [217, 240, 230],
      white: [255, 255, 255]
    }

    // Build table sections & body
    const sections = [
      { num: 1, title: 'ACTIVE CLIENTS', clients: groups.active, color: CL_PDF.active },
      { num: 2, title: 'RECONSTRUCTED ACCOUNTS', clients: groups.recon, color: CL_PDF.recon },
      { num: 3, title: 'OVERDUE CLIENTS', clients: groups.overdue, color: CL_PDF.overdue },
      { num: 4, title: 'PAST DUE CLIENTS', clients: groups.pastdue, color: CL_PDF.pastdue }
    ]

    const tableBody = []
    let totalRowCounter = 1

    sections.forEach(section => {
      tableBody.push([{
        content: `${section.num}. ${section.title} - ${section.clients.length} ${section.clients.length === 1 ? 'Client' : 'Clients'}`,
        colSpan: 7,
        styles: {
          fillColor: section.color,
          textColor: CL_PDF.white,
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'left',
          cellPadding: { top: 0.03, bottom: 0.03, left: 0.05, right: 0.05 }
        }
      }])

      if (section.clients.length === 0) {
        tableBody.push([{
          content: 'No clients in this classification',
          colSpan: 7,
          styles: { fontStyle: 'italic', textColor: [153, 153, 153], fontSize: 7, halign: 'center' }
        }])
      } else {
        section.clients.forEach((c) => {
          const rowColor = section.color === CL_PDF.pastdue ? CL_PDF.pastdue : ((c.loan_type || '').toLowerCase().includes('recon') ? CL_PDF.recon : section.color)
          const penaltyNote = Number(c.reloan_penalty_note || c.penalty_collected_today || 0)
          const balanceNote = Number(c.reloan_balance_note || 0)
          const advanceNote = Number(c.advance_manual_today || 0)
          const regularCollected = Math.max(0, Number(c.collected_today || 0) - Number(c.penalty_collected_today || 0))

          let collectedText = ''
          if (regularCollected > 0) collectedText += pesoFmtPdf(regularCollected)
          if (balanceNote > 0) collectedText += (collectedText ? '\n' : '') + `Bal. ${Number(balanceNote).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
          if (penaltyNote > 0) collectedText += (collectedText ? '\n' : '') + `Pen. ${Number(penaltyNote).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
          if (advanceNote > 0) collectedText += (collectedText ? '\n' : '') + `Adv. ${Number(advanceNote).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`

          tableBody.push([
            { content: String(totalRowCounter++), styles: { halign: 'center', fontSize: 7 } },
            { content: c.customer_code || '-', styles: { textColor: rowColor, fontStyle: 'bold', fontSize: 7, halign: 'center' } },
            { content: formatCollectionClientName(c).toUpperCase(), styles: { textColor: rowColor, fontStyle: 'bold', fontSize: 7 } },
            { content: fDatePdf(c.date_maturity), styles: { halign: 'center', fontSize: 6.5 } },
            { content: String(c.days_past_due || 0), styles: { halign: 'center', textColor: rowColor, fontStyle: 'bold', fontSize: 6.5 } },
            { content: c.amortization ? Number(c.amortization).toLocaleString('en-PH') : '0', styles: { halign: 'right', fontSize: 7 } },
            { content: collectedText, styles: { halign: 'right', fontSize: 7, textColor: regularCollected > 0 ? [0, 0, 0] : [215, 25, 32] } }
          ])
        })
      }
    })

    // Create PDF - Long Bond Paper size (8.5 x 13 inches)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'in', format: [8.5, 13] })
    const pageW = 8.5
    const marginL = 0.4
    const marginR = 0.4
    const contentW = pageW - marginL - marginR

    const callAutoTable = (docInstance, options) => {
      if (typeof autoTable === 'function') {
        autoTable(docInstance, options)
      } else if (docInstance.autoTable) {
        docInstance.autoTable(options)
      } else if (autoTable && typeof autoTable.default === 'function') {
        autoTable.default(docInstance, options)
      }
    }

    const drawPageHeader = (docInst, pageNum) => {
      if (pageNum === 1) {
        // --- 1. Denomination Box (Top-Left) ---
        const denomX = marginL
        const denomY = 0.35
        const denomW = 2.0
        const denomH = 2.45

        docInst.setDrawColor(...CL_PDF.navy)
        docInst.setLineWidth(0.01)
        docInst.rect(denomX, denomY, denomW, denomH)

        docInst.setFillColor(...CL_PDF.navy)
        docInst.rect(denomX, denomY, denomW, 0.22, 'F')
        docInst.setFontSize(7.5)
        docInst.setFont('helvetica', 'bold')
        docInst.setTextColor(255, 255, 255)
        docInst.text('DENOMINATION', denomX + denomW / 2, denomY + 0.15, { align: 'center' })

        const denoms = ['1000', '500', '200', '100', '50', '20', '10', '5', '1']
        let dRowY = denomY + 0.38
        docInst.setFontSize(6.5)
        docInst.setFont('helvetica', 'normal')
        docInst.setTextColor(40, 40, 40)
        denoms.forEach(d => {
          docInst.text(`${d.padStart(4, ' ')}  x  ______ = ______`, denomX + 0.15, dRowY)
          dRowY += 0.18
        })
        docInst.setDrawColor(180, 180, 180)
        docInst.setLineWidth(0.005)
        docInst.line(denomX + 0.1, dRowY - 0.04, denomX + denomW - 0.1, dRowY - 0.04)
        docInst.setFont('helvetica', 'bold')
        docInst.setFontSize(6.5)
        docInst.text('OVERALL TOTAL: ______', denomX + 0.15, dRowY + 0.10)

        // --- 2. Center Header ---
        let curY = 0.35
        docInst.setFontSize(13)
        docInst.setFont('helvetica', 'bold')
        docInst.setTextColor(...CL_PDF.navy)
        docInst.text('MELANN LENDING INVESTOR CORPORATION', pageW / 2, curY + 0.18, { align: 'center' })

        docInst.setFontSize(10.5)
        docInst.text('FIELD COLLECTION SHEET', pageW / 2, curY + 0.40, { align: 'center' })

        docInst.setFontSize(9)
        docInst.setFont('helvetica', 'bold')
        docInst.setTextColor(51, 51, 51)
        docInst.text(`${collectorDisplayName}  |  ${displayCollDate}`, pageW / 2, curY + 0.62, { align: 'center' })

        // Badges - dynamic width measurement to prevent overlap
        const badges = [
          { label: `Overall Total Client: ${totalClientsCount}`, color: CL_PDF.navy },
          { label: `Active: ${groups.active.length}`, color: CL_PDF.active },
          { label: `Recon: ${groups.recon.length}`, color: CL_PDF.recon },
          { label: `Overdue: ${groups.overdue.length}`, color: CL_PDF.overdue },
          { label: `Past Due: ${groups.pastdue.length}`, color: CL_PDF.pastdue }
        ]

        docInst.setFontSize(6)
        docInst.setFont('helvetica', 'bold')
        const badgeGap = 0.05
        const measuredBadges = badges.map(b => ({
          ...b,
          width: Math.max(0.65, docInst.getTextWidth(b.label) + 0.10)
        }))
        const totalBadgeW = measuredBadges.reduce((s, b) => s + b.width, 0) + (measuredBadges.length - 1) * badgeGap
        let badgeX = (pageW - totalBadgeW) / 2
        const badgeY = curY + 0.90

        measuredBadges.forEach(b => {
          docInst.setFillColor(...b.color)
          docInst.roundedRect(badgeX, badgeY - 0.09, b.width, 0.18, 0.03, 0.03, 'F')
        docInst.setTextColor(...CL_PDF.white)
          docInst.text(b.label, badgeX + b.width / 2, badgeY + 0.03, { align: 'center' })
          badgeX += b.width + badgeGap
        })

        // Daily Target Box
        const targetBoxW = 2.2
        const targetBoxX = (pageW - targetBoxW) / 2
        const targetBoxY = curY + 1.25
        docInst.setDrawColor(...CL_PDF.navy)
        docInst.setLineWidth(0.012)
        docInst.roundedRect(targetBoxX, targetBoxY, targetBoxW, 0.50, 0.04, 0.04, 'S')
        docInst.setFontSize(7.5)
        docInst.setFont('helvetica', 'bold')
        docInst.setTextColor(...CL_PDF.navy)
        docInst.text('DAILY TARGET', pageW / 2, targetBoxY + 0.16, { align: 'center' })
        docInst.setFontSize(12)
        docInst.setTextColor(215, 25, 32)
        docInst.text(pesoFmtPdf(targetAmount), pageW / 2, targetBoxY + 0.38, { align: 'center' })

        // Expense Box (Meals, Gas, Others)
        const expBoxW = 2.2
        const expBoxX = (pageW - expBoxW) / 2
        const expBoxY = targetBoxY + 0.55
        const expBoxH = 0.68

        docInst.setDrawColor(...CL_PDF.navy)
        docInst.setLineWidth(0.01)
        docInst.rect(expBoxX, expBoxY, expBoxW, expBoxH)

        docInst.setFillColor(...CL_PDF.navy)
        docInst.rect(expBoxX, expBoxY, expBoxW, 0.16, 'F')
        docInst.setFontSize(7)
        docInst.setFont('helvetica', 'bold')
        docInst.setTextColor(255, 255, 255)
        docInst.text('EXPENSE', expBoxX + expBoxW / 2, expBoxY + 0.11, { align: 'center' })

        const expRows = ['Meals:', 'Gas:', 'Others:']
        let expRowY = expBoxY + 0.30
        docInst.setFontSize(6.5)
        docInst.setFont('helvetica', 'bold')
        docInst.setTextColor(40, 40, 40)
        expRows.forEach(label => {
          docInst.text(label, expBoxX + 0.10, expRowY)
          docInst.setDrawColor(180, 180, 180)
          docInst.setLineWidth(0.005)
          docInst.line(expBoxX + 0.55, expRowY, expBoxX + expBoxW - 0.10, expRowY)
          expRowY += 0.15
        })

        // --- 3. Daily Cash Summary Box (Top-Right) ---
        const cashX = 6.10
        const cashY = 0.35
        const cashW = 2.0
        const cashH = 2.65

        docInst.setDrawColor(...CL_PDF.navy)
        docInst.setLineWidth(0.01)
        docInst.rect(cashX, cashY, cashW, cashH)

        docInst.setFillColor(...CL_PDF.navy)
        docInst.rect(cashX, cashY, cashW, 0.22, 'F')
        docInst.setFontSize(7.5)
        docInst.setFont('helvetica', 'bold')
        docInst.setTextColor(255, 255, 255)
        docInst.text('DAILY CASH SUMMARY', cashX + cashW / 2, cashY + 0.15, { align: 'center' })

        const cashRows = [
          { label: 'Total Collection:', val: '__________________' },
          { label: 'PB/Ins/DST:', val: pbInsDstTotal > 0 ? `PB ${cashSummaryAmountPdf(pbInsDstTotal)}` : '__________________' },
          { label: 'Total:', val: '__________________' },
          { label: 'Field Release:', val: fieldReleaseTotal > 0 ? pesoFmtPdf(fieldReleaseTotal) : '__________________' },
          { label: 'Total Expense:', val: '__________________' },
          { label: 'Grand Total:', val: '__________________' },
          { label: 'Over / Short:', val: '__________________' },
          { label: 'PD Collection:', val: '__________________' }
        ]

        let cRowY = cashY + 0.38
        cashRows.forEach(r => {
          if (r.label === 'Field Release:' && r.val !== '__________________') {
            docInst.setFont('helvetica', 'bold')
            docInst.setFontSize(6.5)
            docInst.setTextColor(40, 40, 40)
            docInst.text(r.label, cashX + 0.10, cRowY)

            docInst.setFont('helvetica', 'bold')
            docInst.setFontSize(14)
            docInst.setTextColor(...CL_PDF.navy)
            docInst.text(r.val, cashX + cashW - 0.10, cRowY, { align: 'right' })
          } else if (r.label === 'Grand Total:') {
            docInst.setFont('helvetica', 'bold')
            docInst.setFontSize(6.5)
            docInst.setTextColor(215, 25, 32)
            docInst.text(r.label, cashX + 0.10, cRowY)
            docInst.text(r.val, cashX + cashW - 0.10, cRowY, { align: 'right' })
          } else {
            docInst.setFont('helvetica', r.label === 'Total:' ? 'bold' : 'normal')
            docInst.setFontSize(6.5)
            docInst.setTextColor(40, 40, 40)
            docInst.text(r.label, cashX + 0.10, cRowY)
            docInst.text(r.val, cashX + cashW - 0.10, cRowY, { align: 'right' })
          }
          cRowY += 0.24
        })
      } else {
        // Page 2+ Header
        docInst.setFontSize(10)
        docInst.setFont('helvetica', 'bold')
        docInst.setTextColor(...CL_PDF.navy)
        docInst.text('MELANN LENDING INVESTOR CORPORATION - FIELD COLLECTION SHEET', pageW / 2, 0.40, { align: 'center' })
        docInst.setFontSize(8)
        docInst.setTextColor(80, 80, 80)
        docInst.text(`${collectorDisplayName} | Date: ${displayCollDate}`, pageW / 2, 0.58, { align: 'center' })
        docInst.setDrawColor(...CL_PDF.navy)
        docInst.setLineWidth(0.01)
        docInst.line(marginL, 0.65, pageW - marginR, 0.65)
      }
    }

    callAutoTable(doc, {
      startY: 3.12,
      margin: { top: 3.12, bottom: 1.3, left: marginL, right: marginR },
      head: [['#', 'Code', 'Client Name', 'Due', 'DPD', 'Daily', 'Collected']],
      body: tableBody,
      headStyles: {
        fillColor: CL_PDF.headerBg,
        textColor: CL_PDF.navy,
        fontStyle: 'bold',
        fontSize: 7.5,
        lineWidth: 0.01,
        lineColor: CL_PDF.navy,
        cellPadding: { top: 0.03, bottom: 0.03, left: 0.04, right: 0.04 }
      },
      styles: {
        fontSize: 7,
        cellPadding: { top: 0.02, bottom: 0.02, left: 0.04, right: 0.04 },
        lineWidth: 0.005,
        lineColor: [200, 200, 200],
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { cellWidth: 0.35, halign: 'center' },
        1: { cellWidth: 0.75 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 0.7, halign: 'center' },
        4: { cellWidth: 0.35, halign: 'center' },
        5: { cellWidth: 0.55, halign: 'right' },
        6: { cellWidth: 0.9, halign: 'right' }
      },
      didDrawPage: () => {
        const pageCount = doc.internal.getNumberOfPages()
        const pageNum = doc.internal.getCurrentPageInfo().pageNumber
        drawPageHeader(doc, pageNum)

        // Footer on each page (adjusted for 13-inch height)
        doc.setDrawColor(...CL_PDF.navy)
        doc.setLineWidth(0.02)
        doc.line(marginL, 12.3, pageW - marginR, 12.3)

        // Signatures
        const sigY = 12.45
        const sigNames = [
          { role: 'Collector', name: collectorDisplayName },
          { role: 'Checked by', name: sigs.checkedBy || 'MARILYN O. RELOBA' },
          { role: 'Encoded by', name: sigs.encodedBy || 'IT/ACCOUNTING CLERK' },
          { role: 'Approved by', name: sigs.approvedBy || 'VICTORIO L. RELOBA JR.' }
        ]
        const sigSpacing = contentW / sigNames.length
        sigNames.forEach((sig, idx) => {
          const cx = marginL + sigSpacing * idx + sigSpacing / 2
          doc.setFontSize(6)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(100, 100, 100)
          doc.text(sig.role, cx, sigY, { align: 'center' })
          doc.setLineWidth(0.01)
          doc.setDrawColor(0, 0, 0)
          doc.line(cx - 0.65, sigY + 0.22, cx + 0.65, sigY + 0.22)
          doc.setFontSize(6.5)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(0, 0, 0)
          doc.text(sig.name, cx, sigY + 0.32, { align: 'center' })
        })

        // Page number and date
        doc.setFontSize(7)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(51, 51, 51)
        doc.setFontSize(12)
        doc.text(displayCollDate, marginL, 12.85)
        doc.setFontSize(7)
        doc.text(`Page ${pageNum} of ${pageCount}`, pageW - marginR, 12.85, { align: 'right' })
      }
    })

    const safeName = collectorDisplayName.replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `Collection_Sheet_${safeName}_${collectionDate}.pdf`
    try {
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err.message || 'Failed to download collection sheet PDF.')
    }
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
        ['Client Code', 'Date Paid', 'Client', 'Payment Code', 'Loan Number', 'Amount Paid', 'Balance After', 'Collector'],
        ...payments.map(payment => [
          payment.customer_code,
          dateOnly(payment.date_paid),
          payment.customer_name,
          payment.payment_code || payment.or_number,
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
      const loans = (data.loans || []).filter(l => !['cancelled', 'canceled', 'reversed', 'rejected'].includes(String(l?.status || '').toLowerCase()))
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
        ['Collector', 'No. of Loans', 'New Count', 'New Amount', 'Reloan Count', 'Reloan Amount', 'Recon Count', 'Recon Amount', 'Non-Recon Release', 'Overall Total'],
        ...collectorRows.map(row => [row.collector, row.loan_count, row.new_count, rawMoney(row.new_amount), row.reloan_count, rawMoney(row.reloan_amount), row.recon_count, rawMoney(row.recon_amount), rawMoney(row.total_without_recon_amount), rawMoney(row.total_principal)]),
        ['GRAND TOTAL', collectorRows.reduce((sum, row) => sum + Number(row.loan_count || 0), 0), '', '', '', '', '', '', rawMoney(collectorRows.reduce((sum, row) => sum + Number(row.total_without_recon_amount || 0), 0)), rawMoney(data.total_principal || collectorRows.reduce((sum, row) => sum + Number(row.total_principal || 0), 0))],
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
        ['Collector', 'Customer Code', 'Customer Name', 'Loan Number', 'Principal', 'Interest', 'Total Loan Amount', 'Total Payment', 'Running Balance', 'Date Released', 'Maturity Date', 'Days Overdue'],
        ...loans.map(loan => [
          loan.collector_name || 'Unassigned',
          loan.customer_code,
          loan.customer_name,
          loan.loan_code,
          rawMoney(loan.principal),
          rawMoney(loan.interest_amount),
          rawMoney(Number(loan.principal || 0) + Number(loan.interest_amount || 0)),
          rawMoney(loan.total_paid),
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
        ['Collector', 'Customer Code', 'Customer Name', 'Payment Code', 'Loan Number', 'Date Paid', 'Amount Paid', 'Reversed At', 'Reversed By', 'Reason'],
        ...payments.map(payment => [
          payment.collector_name || 'Unassigned',
          payment.customer_code,
          payment.customer_name,
          payment.payment_code || payment.or_number,
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
          formatCollectionClientName(loan),
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

    if (active === 'special-accounts') {
      const specialCollectors = specialReportCollectors(data, collectors)
      const allAccounts = specialAccountsForTab(data, specialAccountsTab)
      const accounts = specialAccountsForCollector(allAccounts, specialCollectorSheetId, specialCollectors)
      const reportLabel = specialAccountsTab === 'summary' ? 'Deceased & Written-Off Accounts Summary' : specialAccountsTab === 'deceased' ? 'Deceased Accounts' : 'Written-Off Accounts'
      const selectedCollector = specialCollectors.find(collector => String(collector.id) === String(specialCollectorSheetId))
      const collectorLabel = selectedCollector ? collectorDisplayName(selectedCollector) : 'All Collectors'
      const totalAmount = accounts.reduce((sum, account) => sum + Number(account.amount_paid || 0), 0)
      const rows = [
        ['Account Type', 'Client Code', 'Client Name', 'Loan Number', 'Principal', 'Total Loans', 'Collector', 'Settlement Date', 'Amount', 'Balance Before', 'Payment Code', 'Remarks', 'Encoded By'],
        ...accounts.map(account => [
          account.classification === 'deceased' ? 'Deceased' : 'Written-Off',
          account.customer_code,
          account.customer_name,
          account.loan_code,
          rawMoney(account.principal),
          rawMoney(account.total_amortization),
          account.collector_name,
          dateOnly(account.settlement_date),
          rawMoney(account.amount_paid),
          rawMoney(account.balance_before),
          account.payment_code || account.or_number,
          account.remarks,
          account.encoded_by_name,
        ]),
      ]
      const deceasedAccounts = specialAccountsForCollector(data.deceased || [], specialCollectorSheetId, specialCollectors)
      const writtenOffAccounts = specialAccountsForCollector(data.written_off || [], specialCollectorSheetId, specialCollectors)
      write(`special-accounts-${specialAccountsTab}-${collectorLabel}-${periodLabel}`, addMeta(rows, reportLabel, [
        ['Collector Sheet', collectorLabel],
        ['Period', periodLabel],
        ['Deceased Accounts', deceasedAccounts.length],
        ['Written-Off Accounts', writtenOffAccounts.length],
        ['Total Accounts', accounts.length],
        ['Total Amount', rawMoney(totalAmount)],
      ]))
      return
    }

    if (active === 'aging-report') {
      const overall = data.buckets || []
      const collectorsRows = (data.collectors || []).flatMap(group => (group.buckets || []).map((row, index) => ({ ...row, collector: index === 0 ? group.collector : '' })))
      const agingFrom = dateOnly(data.date_from || params.date_from)
      const agingTo = dateOnly(data.date_to || data.as_of || params.date_to || toDateInputValue(new Date()))
      const agingPeriodLabel = agingFrom ? `${agingFrom} to ${agingTo}` : `Up to ${agingTo}`
      const agingHeaders = ['Period', 'Total Client', 'Total Principal', 'Total Interest', 'Total Loan Amount', 'Total Collectibles']
      const collectorHeaders = ['Collector', ...agingHeaders]
      const exportRows = [
        ['Overall Aging Report'],
        agingHeaders,
        ...overall.map(row => [
          row.bucket_label,
          row.total_clients,
          rawMoney(row.total_principal),
          rawMoney(row.total_interest),
          rawMoney(row.total_loan_amount),
          rawMoney(row.total_collectibles),
        ]),
        [],
        ['Aging Report By Collector'],
        collectorHeaders,
        ...collectorsRows.map(row => [
          row.collector,
          row.bucket_label,
          row.total_clients,
          rawMoney(row.total_principal),
          rawMoney(row.total_interest),
          rawMoney(row.total_loan_amount),
          rawMoney(row.total_collectibles),
        ]),
      ]
      write(`aging-report-${agingFrom || 'all'}-to-${agingTo}`, addMeta(exportRows, 'Aging Report', [['Maturity Period', agingPeriodLabel], ['As of', agingTo]]))
      return
    }

  }

  const loadCollectors = () => {
    if (!collectorsLoaded) {
      API.get('/collectors').then(r => { setCollectors(r.data); setCollectorsLoaded(true) })
    }
  }

  const handleSelect = (key) => {
    if (!hasPermission(reportPermissionKey(key), 'view')) return
    setActive(key); setData(null); setSelectedCollector(null); setAgingDetail(null)
    setExportMenuOpen(false)
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
    if (key === 'collection-sheet' || key === 'daily-target') { loadCollectors(); setParams(p => ({ ...p, date: toDateInputValue(new Date()) })) }
    if (key === 'disclosure-statement') { setParams(p => ({ ...p, disclosure_loan_id: '' })) }
    if (key === 'aging-report') {
      const nextParams = { ...params, date_from: '', date_to: toDateInputValue(new Date()) }
      setParams(nextParams)
      run(key, nextParams)
    }
    if (key === 'special-accounts') {
      const nextParams = { ...params, date_from: '', date_to: toDateInputValue(new Date()) }
      setParams(nextParams)
      setSpecialAccountsTab('summary')
      setSpecialCollectorSheetId('all')
      loadCollectors()
      run(key, nextParams)
    }
    if (key === 'expenses-report') {
      const nextParams = { ...params, date_from: '', date_to: toDateInputValue(new Date()) }
      setParams(nextParams)
      setExpensesTab('summary')
      loadExpensesReport(nextParams)
    }
  }

  const run = async (reportKey = active, reportParams = params, subTab = collectionSubTab) => {
    if (!hasPermission(reportPermissionKey(reportKey), 'view')) {
      setData({ error: 'Your role does not have access to this report type.' })
      return null
    }
    setLoading(true); setData(null); setSelectedCollector(null); setAgingDetail(null)
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
      if (reportKey === 'daily-target') {
        endpoint = 'collection-sheet'
      }
      if (reportKey === 'expenses-report') {
        return await loadExpensesReport(finalParams)
      }
      const r = await API.get(`/reports/${endpoint}`, { params: finalParams })
      setData(r.data)
      return r.data
    } catch (err) {
      const errorData = { error: err.response?.data?.error || err.message || 'Failed to generate report.' }
      setData(errorData)
      return null
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const targetReport = requestedTab && allowedReportTypes.find(r => r.key === requestedTab)
    const initialReport = targetReport || allowedReportTypes[0]
    if (!initialReport) return
    if (autoLoaded.current && active === initialReport.key) return
    autoLoaded.current = true
    handleSelect(initialReport.key)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedReportKeys, requestedTab])

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
    if (active === 'special-accounts') {
      const specialCollectors = specialReportCollectors(data, collectors)
      const activeTabAccounts = specialAccountsForTab(data, specialAccountsTab)
      const badgeStyle = isActive => ({
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20,
        padding: '0 6px', borderRadius: 999, fontSize: 11, fontWeight: 800,
        background: isActive ? 'rgba(255,255,255,0.2)' : '#dbeafe', color: isActive ? '#fff' : '#2563eb',
      })
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`btn ${specialAccountsTab === 'summary' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSpecialAccountsTab('summary')}>Summary</button>
            <button className={`btn ${specialAccountsTab === 'deceased' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSpecialAccountsTab('deceased')}>Deceased</button>
            <button className={`btn ${specialAccountsTab === 'written-off' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSpecialAccountsTab('written-off')}>Written-Off</button>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 7 }}>Collector Sheets</div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <button className={`btn ${specialCollectorSheetId === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setSpecialCollectorSheetId('all')}>
                All Collectors <span style={badgeStyle(specialCollectorSheetId === 'all')}>{activeTabAccounts.length}</span>
              </button>
              {specialCollectors.map(collector => {
                const label = collectorDisplayName(collector)
                const isActive = String(specialCollectorSheetId) === String(collector.id)
                const count = specialAccountsForCollector(activeTabAccounts, collector.id, specialCollectors).length
                return <button key={collector.id} className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setSpecialCollectorSheetId(String(collector.id))}>{label} <span style={badgeStyle(isActive)}>{count}</span></button>
              })}
            </div>
          </div>
        </div>
      )
    }
    if (active === 'expenses-report') {
      const tabs = [
        { key: 'summary', label: 'Summary', Icon: BarChart3 },
        { key: 'input', label: 'Input Expense', Icon: Plus },
        { key: 'configuration', label: 'Configuration', Icon: Settings },
      ]
      return (
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {tabs.map(tab => {
            const Icon = tab.Icon
            return (
              <button key={tab.key} className={`btn ${expensesTab === tab.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setExpensesTab(tab.key)}>
                <Icon size={15} /> {tab.label}
              </button>
            )
          })}
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
    if (['aging-report', 'special-accounts'].includes(active)) return (
      <>
        <div className="form-group"><label className="form-label">Date From</label><input type="date" className="form-control" value={params.date_from || ''} onChange={e => setParams(p => ({ ...p, date_from: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Date To</label><input type="date" className="form-control" value={params.date_to || toDateInputValue(new Date())} onChange={e => setParams(p => ({ ...p, date_to: e.target.value }))} /></div>
      </>
    )
    if (active === 'expenses-report') return (
      <>
        <div className="form-group"><label className="form-label">Date From</label><input type="date" className="form-control" value={params.date_from || ''} onChange={e => setParams(p => ({ ...p, date_from: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Date To</label><input type="date" className="form-control" value={params.date_to || ''} onChange={e => setParams(p => ({ ...p, date_to: e.target.value }))} /></div>
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
        {active === 'daily-target' && (
          <>
            <div className="form-group"><label className="form-label">Manual Target Amt.</label>
              <input type="number" className="form-control" placeholder="Auto" value={params.manual_target || ''} onChange={e => { const nextParams = { ...params, manual_target: e.target.value }; setParams(nextParams); if (params.collector_id) run(active, nextParams); }} style={{ width: 160 }} />
            </div>
            <div className="form-group"><label className="form-label">Manual Active Clients</label>
              <input type="number" className="form-control" placeholder="Auto" value={params.manual_clients || ''} onChange={e => { const nextParams = { ...params, manual_clients: e.target.value }; setParams(nextParams); if (params.collector_id) run(active, nextParams); }} style={{ width: 160 }} />
            </div>
            <div className="form-group"><label className="form-label">Manual Field Release</label>
              <input type="number" className="form-control" placeholder="0.00" value={params.manual_field_release || ''} onChange={e => { const nextParams = { ...params, manual_field_release: e.target.value }; setParams(nextParams); if (params.collector_id) run(active, nextParams); }} style={{ width: 160 }} />
            </div>
          </>
        )}
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
    if (loading || (active === 'expenses-report' && expensesLoading)) return <div className="empty-state"><p>Generating report...</p></div>
    if (!data) return <div className="empty-state"><div className="empty-icon">REPORT</div><p>Set your parameters and click Run Report</p></div>

    if (active === 'expenses-report') {
      const summary = expenseSummary || {}
      const byEmployee = summary.by_employee || []
      const byCategory = summary.by_category || []
      const isAllSelected = selectedExpenseCategories === null || (byCategory.length > 0 && selectedExpenseCategories.length === byCategory.length)
      const filteredByCategory = selectedExpenseCategories === null
        ? byCategory
        : byCategory.filter(row => selectedExpenseCategories.includes(row.category))
      const filteredCategoryTotal = filteredByCategory.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
      const allExpenseCategoriesSelected = isAllSelected
      const netIncomeByCollector = summary.net_income_by_collector || []
      const activePersonnel = expensePersonnel.filter(p => p.status === 'active')
      const totalAmount = Number(summary.total_amount || 0)

      if (data.error) return <div className="empty-state"><p>{data.error}</p></div>

      if (expensesTab === 'summary') return (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button type="button" className={`btn ${expenseSummaryTab === 'total-each-employee' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setExpenseSummaryTab('total-each-employee')}>Total Each Employee</button>
            <button type="button" className={`btn ${expenseSummaryTab === 'net-income-by-collector' ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setExpenseSummaryTab('net-income-by-collector')}>Net Income by Collector</button>
          </div>
          {expenseSummaryTab === 'total-each-employee' ? <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: '#fff' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Total Expenses</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0f766e', marginTop: 6 }}>PHP {fmtMoney(totalAmount)}</div>
            </div>
            <div style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: '#fff' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Expense Entries</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0D1B3D', marginTop: 6 }}>{summary.expense_count || 0}</div>
            </div>
            <div style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: '#fff' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Active Employees</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0D1B3D', marginTop: 6 }}>{activePersonnel.length}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            <div>
              <h3 style={{ margin: '0 0 10px 0', color: 'var(--blue-dark)' }}>Total Each Employee</h3>
              <table className="data-table">
                <thead><tr><th>Employee</th><th>Position</th><th className="text-right">Entries</th><th className="text-right">Total Expense</th><th className="text-center">Action</th></tr></thead>
                <tbody>
                  {byEmployee.length === 0 ? <tr><td colSpan={5} className="empty-state">No employees found</td></tr> : byEmployee.map(row => (
                    <tr key={row.personnel_id}>
                      <td className="fw-600">{row.employee_name}</td>
                      <td>{row.position || '-'}</td>
                      <td className="text-right">{row.expense_count || 0}</td>
                      <td className="text-right fw-700" style={{ fontWeight: 800 }}>{fmtMoney(row.total_amount)}</td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={`View expense details for ${row.employee_name}`}
                          aria-haspopup="dialog"
                          aria-expanded={selectedExpenseEmployee?.personnel_id === row.personnel_id}
                          onClick={event => {
                            event.stopPropagation()
                            openExpenseEmployeeDetails(row)
                          }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, color: 'var(--blue-dark)' }}>By Category</h3>
                <div style={{ position: 'relative' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpenseCategoryFilterOpen(open => !open)} aria-haspopup="menu" aria-expanded={expenseCategoryFilterOpen} disabled={byCategory.length === 0}>
                    <Filter size={14} /> {allExpenseCategoriesSelected ? 'All Categories' : `${filteredByCategory.length} Selected`} <ChevronDown size={14} />
                  </button>
                  {expenseCategoryFilterOpen && (
                    <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 30, width: 250, maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 14px 30px rgba(15, 23, 42, 0.16)', padding: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderBottom: '1px solid var(--border)', fontWeight: 700, cursor: 'pointer' }}>
                        <input type="checkbox" checked={allExpenseCategoriesSelected} onChange={() => setSelectedExpenseCategories(allExpenseCategoriesSelected ? [] : null)} />
                        Select All
                      </label>
                      {byCategory.map(row => {
                        const isChecked = selectedExpenseCategories === null ? true : selectedExpenseCategories.includes(row.category)
                        return (
                          <label key={row.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9, padding: '8px 9px', cursor: 'pointer' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  const currentList = selectedExpenseCategories === null ? byCategory.map(r => r.category) : selectedExpenseCategories
                                  const nextList = isChecked ? currentList.filter(c => c !== row.category) : [...currentList, row.category]
                                  setSelectedExpenseCategories(nextList.length === byCategory.length ? null : nextList)
                                }}
                              />
                              {row.category}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>PHP {fmtMoney(row.total_amount)}</span>
                          </label>
                        )
                      })}
                      <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 6 }} onClick={() => setExpenseCategoryFilterOpen(false)}>Done</button>
                    </div>
                  )}
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Category</th><th className="text-right">Total</th></tr></thead>
                <tbody>
                  <tr style={{ background: '#f0fdfa' }}><td className="fw-700" style={{ color: '#0f766e' }}>Overall Total</td><td className="text-right fw-700" style={{ color: '#0f766e' }}>PHP {fmtMoney(filteredCategoryTotal)}</td></tr>
                  {byCategory.length === 0 ? <tr><td colSpan={2} className="empty-state">No expenses yet</td></tr> : filteredByCategory.length === 0 ? <tr><td colSpan={2} className="empty-state">No categories selected</td></tr> : filteredByCategory.map(row => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td className="text-right fw-700">PHP {fmtMoney(row.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </> : (() => {
            const rankedCollectors = [...netIncomeByCollector].sort((a, b) => Number(b.net_income || 0) - Number(a.net_income || 0))
            const totals = rankedCollectors.reduce((acc, row) => ({
              collection: acc.collection + Number(row.collection_amount || 0),
              release: acc.release + Number(row.release_amount || 0),
              expense: acc.expense + Number(row.expense_amount || 0),
              netIncome: acc.netIncome + Number(row.net_income || 0),
            }), { collection: 0, release: 0, expense: 0, netIncome: 0 })
            return (
              <div>
                <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 13 }}>Net Income = Collection - Non-Recon Release - Expense, based on the selected date range. Ranked by highest Net Income.</div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 60, textAlign: 'center' }}>Rank</th>
                        <th>Collector</th>
                        <th>Position</th>
                        <th className="text-right">Collection</th>
                        <th className="text-right">Release</th>
                        <th className="text-right">Expense</th>
                        <th className="text-right" style={{ fontWeight: 800 }}>Net Income</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedCollectors.length === 0 ? (
                        <tr><td colSpan={7} className="empty-state">No active personnel with Collector position found</td></tr>
                      ) : (
                        rankedCollectors.map((row, idx) => (
                          <tr key={row.personnel_id}>
                            <td className="text-center fw-700" style={{ color: idx === 0 ? '#d97706' : idx === 1 ? '#475569' : idx === 2 ? '#b45309' : 'var(--text-muted)' }}>
                              #{idx + 1}
                            </td>
                            <td className="fw-600">{row.employee_name}</td>
                            <td>{row.position}</td>
                            <td className="text-right">PHP {fmtMoney(row.collection_amount)}</td>
                            <td className="text-right">PHP {fmtMoney(row.release_amount)}</td>
                            <td className="text-right">PHP {fmtMoney(row.expense_amount)}</td>
                            <td className="text-right" style={{ fontWeight: 800, color: Number(row.net_income || 0) >= 0 ? '#15803d' : '#dc2626' }}>
                              PHP {fmtMoney(row.net_income)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {rankedCollectors.length > 0 && (
                      <tfoot>
                        <tr style={{ background: '#fff1f2', borderTop: '2px solid #fda4af', borderBottom: '2px solid #fda4af' }}>
                          <td colSpan={3} style={{ fontWeight: 800, color: '#b91c1c' }}>Total</td>
                          <td className="text-right" style={{ fontWeight: 800, color: '#b91c1c' }}>PHP {fmtMoney(totals.collection)}</td>
                          <td className="text-right" style={{ fontWeight: 800, color: '#b91c1c' }}>PHP {fmtMoney(totals.release)}</td>
                          <td className="text-right" style={{ fontWeight: 800, color: '#b91c1c' }}>PHP {fmtMoney(totals.expense)}</td>
                          <td className="text-right" style={{ fontWeight: 900, color: '#b91c1c' }}>
                            PHP {fmtMoney(totals.netIncome)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )
          })()}
        </div>
      )

      if (expensesTab === 'input') {
        const sheets = expenseMatrix?.sheets || []
        const activeSheet = sheets.find(s => Number(s.personnel_id) === Number(activeCollectorSheetId)) || sheets[0]
        const categories = expenseCategories.filter(c => c.status === 'active')
        const dates = expenseMatrix?.dates || []

        if (!activeSheet || sheets.length === 0) {
          return (
            <div className="empty-state" style={{ padding: 40, textAlign: 'center', background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }}>
              <UsersRound size={40} style={{ color: '#0f766e', marginBottom: 12 }} />
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--blue-dark)' }}>No Employees Configured</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>Please configure active employees or collectors first to use the Excel Expense Sheet.</p>
              <button type="button" className="btn btn-primary" onClick={() => { setExpensesTab('configuration'); setConfigurationTab('personnel') }}>
                <Plus size={15} /> Go to Personnel Configuration
              </button>
            </div>
          )
        }

        return (
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            {/* Header Banner with Employee Dropdown Selector */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)', color: '#fff', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', opacity: 0.85 }}>Select Employee / Collector:</div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select
                      value={activeSheet.personnel_id}
                      onChange={e => setActiveCollectorSheetId(Number(e.target.value))}
                      style={{
                        background: '#ffffff',
                        color: '#0f172a',
                        fontWeight: 700,
                        fontSize: '13px',
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.4)',
                        outline: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        minWidth: 230
                      }}
                    >
                      {sheets.map(sheet => (
                        <option key={sheet.personnel_id} value={sheet.personnel_id} style={{ color: '#0f172a', fontWeight: 600 }}>
                          {sheet.employee_name.toUpperCase()} {sheet.position ? `(${sheet.position})` : ''}
                        </option>
                      ))}
                    </select>
                    {activeSheet.position && (
                      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.95, background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: 4 }}>
                        {activeSheet.position}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11.5, opacity: 0.95, background: 'rgba(0,0,0,0.22)', padding: '6px 12px', borderRadius: 6 }}>
                  Period: <strong>{expenseMatrix?.date_from ? formatExcelDate(expenseMatrix.date_from) : '-'}</strong> to <strong>{expenseMatrix?.date_to ? formatExcelDate(expenseMatrix.date_to) : '-'}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: '#ffffff', color: '#0f766e', fontWeight: 700, border: 'none', fontSize: 12 }}
                  onClick={() => { setExpensesTab('configuration'); setConfigurationTab('category') }}
                >
                  <Plus size={14} /> Add Category
                </button>
              </div>
            </div>

            {/* Instruction strip */}
            <div style={{ padding: '6px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span>💡 <strong>Tip:</strong> Click on any category cell to input or edit expenses. Use <strong>arrow keys (↑ ↓ ← →)</strong> or <strong>Enter/Tab</strong> to navigate between cells. Values save automatically.</span>
              <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 600 }}>Releases automatically count Reloan & New only (excluding Recon)</span>
            </div>

            {/* Excel Sheet Table Grid */}
            <div style={{ overflowX: 'auto', maxHeight: '680px', position: 'relative', background: '#fff' }}>
              <table style={{ width: '100%', minWidth: '100%', borderCollapse: 'collapse', fontSize: '11.5px', background: '#fff' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 3, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '6px 8px', fontWeight: 800, fontSize: 11, textAlign: 'left', minWidth: 85, letterSpacing: '0.4px' }}>
                      DATE
                    </th>
                    <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 3, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '6px 8px', fontWeight: 800, fontSize: 11, textAlign: 'right', minWidth: 105, letterSpacing: '0.4px' }}>
                      COLLECTION
                    </th>
                    <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 3, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '6px 8px', fontWeight: 800, fontSize: 11, textAlign: 'right', minWidth: 105, letterSpacing: '0.4px' }}>
                      RELEASE
                    </th>
                    <th colSpan={Math.max(1, categories.length)} style={{ position: 'sticky', top: 0, zIndex: 3, background: '#ccfbf1', color: '#0f766e', border: '1px solid #cbd5e1', padding: '6px 8px', fontWeight: 900, fontSize: 11.5, textAlign: 'center', letterSpacing: '0.8px' }}>
                      EXPENSES
                    </th>
                    <th rowSpan={2} style={{ position: 'sticky', top: 0, zIndex: 3, background: '#f8fafc', border: '1px solid #cbd5e1', padding: '6px 10px', fontWeight: 900, fontSize: 11.5, textAlign: 'right', minWidth: 110, letterSpacing: '0.4px', color: '#0f172a' }}>
                      NET
                    </th>
                  </tr>
                  <tr>
                    {categories.length === 0 ? (
                      <th style={{ position: 'sticky', top: 29, zIndex: 3, background: '#f8fafc', border: '1px solid #cbd5e1', padding: '5px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textAlign: 'center', minWidth: 85 }}>
                        No categories (Add in Config)
                      </th>
                    ) : (
                      categories.map(cat => (
                        <th key={cat.id} style={{ position: 'sticky', top: 29, zIndex: 3, background: '#f8fafc', border: '1px solid #cbd5e1', padding: '5px 6px', fontSize: 10, fontWeight: 800, textAlign: 'right', minWidth: 85, whiteSpace: 'nowrap', color: '#334155' }}>
                          {cat.category_name.toUpperCase()}
                        </th>
                      ))
                    )}
                  </tr>

                  {/* Grand Totals Summary Row */}
                  <tr style={{ position: 'sticky', top: 55, zIndex: 2, background: '#fff1f2', borderBottom: '2px solid #fda4af' }}>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', fontWeight: 900, color: '#b91c1c', fontSize: 11.5 }}>
                      TOTAL
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 900, color: '#b91c1c', fontSize: 11.5 }}>
                      {fmtMoney(activeSheet.totals.collection)}
                    </td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'right', fontWeight: 900, color: '#b91c1c', fontSize: 11.5 }}>
                      {fmtMoney(activeSheet.totals.release)}
                    </td>
                    {categories.length === 0 ? (
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'center', color: '#94a3b8' }}>-</td>
                    ) : (
                      categories.map(cat => (
                        <td key={cat.id} style={{ border: '1px solid #cbd5e1', padding: '6px 6px', textAlign: 'right', fontWeight: 900, color: '#b91c1c', fontSize: 11 }}>
                          {activeSheet.totals.categories?.[cat.category_name] ? fmtMoney(activeSheet.totals.categories[cat.category_name]) : '-'}
                        </td>
                      ))
                    )}
                    <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', textAlign: 'right', fontWeight: 900, fontSize: 12, color: activeSheet.totals.net >= 0 ? '#15803d' : '#dc2626' }}>
                      {activeSheet.totals.net < 0 ? `-${fmtMoney(Math.abs(activeSheet.totals.net))}` : fmtMoney(activeSheet.totals.net)}
                    </td>
                  </tr>
                </thead>

                <tbody>
                  {dates.length === 0 ? (
                    <tr>
                      <td colSpan={4 + Math.max(1, categories.length)} className="empty-state" style={{ padding: 24, textAlign: 'center' }}>
                        No dates in selected range.
                      </td>
                    </tr>
                  ) : (
                    dates.map((d, rowIndex) => {
                      const day = activeSheet.days?.[d] || { collection: 0, release: 0, expenses: {}, total_expense: 0, net: 0 }
                      const isNeg = day.net < 0
                      const hasActivity = day.collection > 0 || day.release > 0 || day.total_expense > 0

                      return (
                        <tr key={d} style={{ background: '#ffffff', transition: 'background 0.1s ease' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', fontWeight: 600, fontSize: 11.5, color: '#475569', whiteSpace: 'nowrap' }}>
                            {formatExcelDate(d)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontSize: 11.5, fontWeight: day.collection > 0 ? 700 : 'normal', color: day.collection > 0 ? '#0f172a' : '#94a3b8' }}>
                            {day.collection > 0 ? fmtMoney(day.collection) : '-'}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'right', fontSize: 11.5, fontWeight: day.release > 0 ? 700 : 'normal', color: day.release > 0 ? '#0f172a' : '#94a3b8' }}>
                            {day.release > 0 ? fmtMoney(day.release) : '-'}
                          </td>
                          {categories.length === 0 ? (
                            <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', textAlign: 'center', color: '#cbd5e1' }}>-</td>
                          ) : (
                            categories.map((cat, colIndex) => (
                              <ExpenseGridCell
                                key={cat.id}
                                rowIndex={rowIndex}
                                colIndex={colIndex}
                                totalRows={dates.length}
                                totalCols={categories.length}
                                initialValue={day.expenses?.[cat.category_name]?.amount || 0}
                                onSave={val => handleExpenseCellChange(activeSheet.personnel_id, d, cat.category_name, val)}
                              />
                            ))
                          )}
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 10px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: !hasActivity ? '#94a3b8' : isNeg ? '#dc2626' : '#15803d' }}>
                            {hasActivity ? (isNeg ? `-${fmtMoney(Math.abs(day.net))}` : fmtMoney(day.net)) : '-'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      }

      const configurationTabs = [
        { key: 'personnel', label: 'Personnel Management', Icon: UsersRound },
        { key: 'category', label: 'Category Management', Icon: ClipboardList },
      ]

      return (
        <div>
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {configurationTabs.map(tab => {
              const Icon = tab.Icon
              return (
                <button key={tab.key} className={`btn ${configurationTab === tab.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setConfigurationTab(tab.key)}>
                  <Icon size={15} /> {tab.label}
                </button>
              )
            })}
          </div>

          {configurationTab === 'personnel' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <form onSubmit={savePersonnel} style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: '#fff' }}>
            <h3 style={{ margin: '0 0 12px 0', color: 'var(--blue-dark)' }}>{personnelForm.id ? 'Edit Employee' : 'Add Employee'}</h3>
            <div className="form-group"><label className="form-label">Employee Name *</label><input className="form-control" value={personnelForm.employee_name} onChange={e => setPersonnelForm(f => ({ ...f, employee_name: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Position</label><input className="form-control" value={personnelForm.position} onChange={e => setPersonnelForm(f => ({ ...f, position: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={personnelForm.status} onChange={e => setPersonnelForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {personnelForm.id && <button type="button" className="btn btn-secondary" onClick={() => setPersonnelForm({ id: '', employee_name: '', position: '', status: 'active' })}>Cancel</button>}
              <button type="submit" className="btn btn-primary"><Save size={15} /> Save Employee</button>
            </div>
          </form>
          <div>
            <h3 style={{ margin: '0 0 10px 0', color: 'var(--blue-dark)' }}>Personnel List</h3>
            <table className="data-table">
              <thead><tr><th>Employee Name</th><th>Position</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {expensePersonnel.length === 0 ? <tr><td colSpan={4} className="empty-state">No employees yet</td></tr> : expensePersonnel.map(person => (
                  <tr key={person.id}>
                    <td className="fw-600">{person.employee_name}</td>
                    <td>{person.position || '-'}</td>
                    <td><span className={`badge ${person.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>{person.status}</span></td>
                    <td><button className="btn btn-secondary" style={{ padding: '5px 8px' }} onClick={() => setPersonnelForm({ id: person.id, employee_name: person.employee_name || '', position: person.position || '', status: person.status || 'active' })} title="Edit"><Pencil size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <form onSubmit={saveCategory} style={{ margin: 0, border: '1px solid var(--border)', borderRadius: 8, padding: 16, background: '#fff' }}>
                <h3 style={{ margin: '0 0 12px 0', color: 'var(--blue-dark)' }}>{categoryForm.id ? 'Edit Category' : 'Add Category'}</h3>
                <div className="form-group"><label className="form-label">Category Name *</label><input className="form-control" value={categoryForm.category_name} onChange={e => setCategoryForm(f => ({ ...f, category_name: e.target.value }))} placeholder="e.g. Fuel, Meals, Allowance" /></div>
                <div className="form-group"><label className="form-label">Status</label>
                  <select className="form-control" value={categoryForm.status} onChange={e => setCategoryForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {categoryForm.id && <button type="button" className="btn btn-secondary" onClick={() => setCategoryForm({ id: '', category_name: '', status: 'active' })}>Cancel</button>}
                  <button type="submit" className="btn btn-primary"><Save size={15} /> Save Category</button>
                </div>
              </form>
              <div>
                <h3 style={{ margin: '0 0 10px 0', color: 'var(--blue-dark)' }}>Category List</h3>
                <table className="data-table">
                  <thead><tr><th>Category Name</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {expenseCategories.length === 0 ? <tr><td colSpan={3} className="empty-state">No categories yet</td></tr> : expenseCategories.map(category => (
                      <tr key={category.id}>
                        <td className="fw-600">{category.category_name}</td>
                        <td><span className={`badge ${category.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>{category.status}</span></td>
                        <td><button className="btn btn-secondary" style={{ padding: '5px 8px' }} onClick={() => setCategoryForm({ id: category.id, category_name: category.category_name || '', status: category.status || 'active' })} title="Edit"><Pencil size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )
    }

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
              <div className="fw-bold text-success">Grand Total: PHP {fmt(total)}</div>
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
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `PHP ${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
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
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `PHP ${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                        formatter={(val) => [`PHP ${fmt(val)}`, 'Total Collected']}
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
                                {cell.amount > 0 ? <span className="text-success fw-bold">PHP {fmt(cell.amount)}</span> : '-'}
                              </td>
                            )
                          })}
                          <td className="text-right text-success fw-bold">PHP {fmt(row.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {matrix.rows.length > 0 && (
                      <tfoot>
                        <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                          <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                          {matrix.periods.map(period => (
                            <td key={`total-${period.key}`} className="text-right text-success fw-bold">PHP {fmt(matrix.periodTotals[period.key].amount)}</td>
                          ))}
                          <td className="text-right text-success fw-bold">PHP {fmt(total)}</td>
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
                              {cell.amount > 0 ? <span className="text-success fw-bold">PHP {fmt(cell.amount)}</span> : '-'}
                            </td>
                          )
                        })}
                        <td className="text-right text-success fw-bold">PHP {fmt(total)}</td>
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
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#16a34a', marginTop: 6 }}>Grand Total: PHP {fmt(total)}</div>
              </div>
              {matrix.rows.map(row => (
                <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--blue-dark)', paddingBottom: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                    <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                      Payments: {row.payment_count} &nbsp;|&nbsp;
                      Total: <span className="text-success">PHP {fmt(row.total_amount)}</span>
                    </div>
                  </div>
                  {matrix.periods.filter(period => row.periods[period.key].payment_count > 0).map(period => {
                    const cell = row.periods[period.key]
                    return (
                      <div key={period.key} style={{ marginBottom: 16, paddingLeft: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{period.label} ({period.rangeLabel})  PHP {fmt(cell.amount)}</div>
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
                                <td className="text-right text-success fw-bold">PHP {fmt(p.amount_paid)}</td>
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
              .reports-chart-toggle { display: none !important; }
              `}
            }
          `}</style>
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reports-screen-only" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ marginBottom: 6, color: 'var(--blue-dark)', fontWeight: 700 }}>{transactionLabel}</div>
              <div style={{ marginBottom: 12 }} className="fw-bold text-success">Total Collections: PHP {fmt(total)}</div>
              <table className="data-table">
                <thead><tr><th>Collector</th><th className="text-right">No. of Payments</th><th className="text-right">Total Collection</th></tr></thead>
                <tbody>{collectorRows.length === 0 ? <tr><td colSpan={3} className="empty-state">No records</td></tr> : collectorRows.map(row => <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View collection details" style={{ cursor: 'pointer' }}><td className="fw-600">{row.collector}</td><td className="text-right">{row.payment_count}</td><td className="text-right text-success fw-bold">PHP {fmt(row.total_amount)}</td></tr>)}</tbody>
              {collectorRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                    <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                    <td className="text-right fw-bold">{collectorRows.reduce((sum, r) => sum + r.payment_count, 0)}</td>
                    <td className="text-right text-success fw-bold" style={{ fontSize: '14px' }}>PHP {fmt(total)}</td>
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
                  <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 72 }}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.6}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} tickFormatter={compactChartLabel} angle={-40} textAnchor="end" height={76} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `PHP ${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }} 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                      formatter={(val) => [`PHP ${fmt(val)}`, 'Total Collected']}
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
                    Total: <span className="text-success">PHP {fmt(row.total_amount)}</span>
                  </div>
                </div>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left' }}>Client Code</th><th>Date Paid</th><th style={{ textAlign: 'left' }}>Client</th><th style={{ textAlign: 'left' }}>Payment Code</th><th style={{ textAlign: 'left' }}>Loan#</th><th className="text-right">Amount</th><th className="text-right">Bal. After</th></tr>
                  </thead>
                  <tbody>
                    {row.payments?.map(p => (
                      <tr key={p.id}>
                        <td className="mono">{p.customer_code || '-'}</td>
                        <td>{p.date_paid}</td>
                        <td className="fw-600">{p.customer_name || '-'}</td>
                        <td className="mono">{p.payment_code || p.or_number || '-'}</td>
                        <td className="mono">{p.loan_code || '-'}</td>
                        <td className="text-right text-success fw-bold">PHP {fmt(p.amount_paid)}</td>
                        <td className="text-right">PHP {fmt(p.balance_after)}</td>
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
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--accent-success)' }}>PHP {fmt(total)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )
    }

    if (active === 'special-accounts') {
      if (data.error) {
        return (
          <div className="empty-state" style={{ color: '#b91c1c' }}>
            <p>Unable to load Deceased & Written-Off Accounts.</p>
            <p style={{ fontSize: 12 }}>{data.error}</p>
          </div>
        )
      }
      const specialCollectors = specialReportCollectors(data, collectors)
      const selectedCollector = specialCollectors.find(collector => String(collector.id) === String(specialCollectorSheetId))
      const collectorLabel = selectedCollector ? collectorDisplayName(selectedCollector) : 'All Collectors'
      const from = dateOnly(data.date_from || params.date_from)
      const to = dateOnly(data.date_to || params.date_to || toDateInputValue(new Date()))
      const accountPeriod = from ? `${displayDate(from)} to ${displayDate(to)}` : `Up to ${displayDate(to)}`
      const deceasedAccounts = specialAccountsForCollector(data.deceased || [], specialCollectorSheetId, specialCollectors)
      const writtenOffAccounts = specialAccountsForCollector(data.written_off || [], specialCollectorSheetId, specialCollectors)
      const summarizeAccounts = rows => ({
        count: rows.length,
        principal: rows.reduce((sum, row) => sum + Number(row.principal || 0), 0),
        totalLoans: rows.reduce((sum, row) => sum + Number(row.total_amortization || 0), 0),
        settlement: rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0),
      })

      if (specialAccountsTab === 'summary') {
        const deceasedSummary = summarizeAccounts(deceasedAccounts)
        const writtenOffSummary = summarizeAccounts(writtenOffAccounts)
        const grandSummary = summarizeAccounts([...deceasedAccounts, ...writtenOffAccounts])
        const summaryRows = [
          { label: 'Deceased', ...deceasedSummary, color: '#b45309' },
          { label: 'Written-Off', ...writtenOffSummary, color: '#b91c1c' },
          { label: 'Grand Total', ...grandSummary, color: '#0D1B3D' },
        ]
        return (
          <div id="printable-area" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <style>{`${REPORT_PRINT_CLARITY_CSS}
              .special-accounts-card {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 14px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
                overflow: hidden;
              }
              .special-accounts-table {
                width: 100%;
                border-collapse: collapse;
                text-align: left;
              }
              .special-accounts-table th {
                background: #f8fafc;
                color: #475569;
                font-size: 11.5px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                padding: 14px 18px;
                border-bottom: 2px solid #e2e8f0;
                white-space: nowrap !important;
              }
              .special-accounts-table td {
                padding: 14px 18px;
                font-size: 13px;
                color: #1e293b;
                border-bottom: 1px solid #f1f5f9;
                white-space: nowrap !important;
                vertical-align: middle;
              }
              .special-accounts-table tbody tr {
                transition: background-color 0.15s ease;
              }
              .special-accounts-table tbody tr:hover {
                background-color: #f8fafc;
              }
              @media print {
                @page { size: landscape; margin: 9mm; }
                .special-account-actions { display: none !important; }
                .special-accounts-card { border: none !important; box-shadow: none !important; }
                .special-accounts-table th,
                .special-accounts-table td { font-size: 9px !important; padding: 6px 8px !important; white-space: nowrap !important; }
              }
            `}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>Deceased & Written-Off Accounts Summary</h3>
                <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Collector Sheet: <b>{collectorLabel}</b></div>
                <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Settlement Period: {accountPeriod}</div>
              </div>
              <div className="special-account-actions"><button className="btn btn-secondary" onClick={() => handlePrint('summary')}>Print</button></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(200px, 1fr))', gap: 12 }}>
              <div className="card-v2" style={{ padding: 16, borderTop: '4px solid #b45309' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Deceased</div>
                <div style={{ fontSize: 27, fontWeight: 800, color: '#b45309', marginTop: 6 }}>{deceasedSummary.count} Accounts</div>
                <div style={{ marginTop: 5, color: '#475569' }}>PHP {fmtMoney(deceasedSummary.settlement)}</div>
              </div>
              <div className="card-v2" style={{ padding: 16, borderTop: '4px solid #b91c1c' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Written-Off</div>
                <div style={{ fontSize: 27, fontWeight: 800, color: '#b91c1c', marginTop: 6 }}>{writtenOffSummary.count} Accounts</div>
                <div style={{ marginTop: 5, color: '#475569' }}>PHP {fmtMoney(writtenOffSummary.settlement)}</div>
              </div>
              <div className="card-v2" style={{ padding: 16, borderTop: '4px solid #0D1B3D' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Combined Total</div>
                <div style={{ fontSize: 27, fontWeight: 800, color: '#0D1B3D', marginTop: 6 }}>{grandSummary.count} Accounts</div>
                <div style={{ marginTop: 5, color: '#475569' }}>PHP {fmtMoney(grandSummary.settlement)}</div>
              </div>
            </div>
            <div className="special-accounts-card">
              <div style={{ overflowX: 'auto' }}>
                <table className="special-accounts-table" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th>Account Type</th>
                      <th style={{ textAlign: 'center' }}>Total Accounts</th>
                      <th style={{ textAlign: 'right' }}>Total Principal</th>
                      <th style={{ textAlign: 'right' }}>Total Loans</th>
                      <th style={{ textAlign: 'right' }}>Total Settlement Amount</th>
                    </tr>
                  </thead>
                  <tbody>{summaryRows.map(row => (
                    <tr key={row.label} style={row.label === 'Grand Total' ? { fontWeight: 800, background: '#f8fafc' } : undefined}>
                      <td style={{ color: row.color, fontWeight: 800 }}>{row.label}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.count}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#475569' }}>PHP {fmtMoney(row.principal)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#475569' }}>PHP {fmtMoney(row.totalLoans)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: row.color }}>PHP {fmtMoney(row.settlement)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        )
      }

      const isDeceased = specialAccountsTab === 'deceased'
      const allAccounts = isDeceased ? (data.deceased || []) : (data.written_off || [])
      const accounts = specialAccountsForCollector(allAccounts, specialCollectorSheetId, specialCollectors)
      const reportLabel = isDeceased ? 'Deceased Accounts' : 'Written-Off Accounts'
      const totalAmount = accounts.reduce((sum, account) => sum + Number(account.amount_paid || 0), 0)
      const showCollectorColumn = specialCollectorSheetId === 'all'
      const totalColumns = 11 + (showCollectorColumn ? 1 : 0) + (isDeceased ? 1 : 0)
      return (
        <div id="printable-area" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <style>{`${REPORT_PRINT_CLARITY_CSS}
            .special-accounts-card {
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 14px;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
              overflow: hidden;
            }
            .special-accounts-table {
              width: 100%;
              border-collapse: collapse;
              text-align: left;
            }
            .special-accounts-table th {
              background: #f8fafc;
              color: #475569;
              font-size: 11.5px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.6px;
              padding: 14px 18px;
              border-bottom: 2px solid #e2e8f0;
              white-space: nowrap !important;
            }
            .special-accounts-table td {
              padding: 14px 18px;
              font-size: 13px;
              color: #1e293b;
              border-bottom: 1px solid #f1f5f9;
              white-space: nowrap !important;
              vertical-align: middle;
            }
            .special-accounts-table tbody tr {
              transition: background-color 0.15s ease;
            }
            .special-accounts-table tbody tr:hover {
              background-color: #f8fafc;
            }
            @media print {
              @page { size: landscape; margin: 9mm; }
              .special-account-actions { display: none !important; }
              .special-accounts-card { border: none !important; box-shadow: none !important; }
              .special-accounts-table th,
              .special-accounts-table td { font-size: 9px !important; padding: 6px 8px !important; white-space: nowrap !important; }
            }
          `}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0 }}>{reportLabel}</h3>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Collector Sheet: <b>{collectorLabel}</b></div>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Settlement Period: {accountPeriod}</div>
            </div>
            <div className="special-account-actions">
              <button className="btn btn-secondary" onClick={() => handlePrint('summary')}>Print</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div className="card-v2" style={{ padding: 16 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Total Accounts</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0D1B3D', marginTop: 6 }}>{accounts.length}</div>
            </div>
            <div className="card-v2" style={{ padding: 16 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Total Settlement Amount</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: isDeceased ? '#b45309' : '#b91c1c', marginTop: 6 }}>PHP {fmtMoney(totalAmount)}</div>
            </div>
          </div>
          <div className="special-accounts-card">
            <div style={{ overflowX: 'auto' }}>
              <table className="special-accounts-table" style={{ minWidth: 1420 }}>
                <thead>
                  <tr>
                    <th>Client Code</th>
                    <th>Client Name</th>
                    <th>Loan Number</th>
                    <th style={{ textAlign: 'right' }}>Principal</th>
                    <th style={{ textAlign: 'right' }}>Total Loans</th>
                    {showCollectorColumn && <th>Collector</th>}
                    <th>Settlement Date</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Balance Before</th>
                    <th>Payment Code</th>
                    <th>Remarks</th>
                    <th>Encoded By</th>
                    {isDeceased && <th style={{ textAlign: 'center' }} className="reports-screen-only">Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {accounts.length === 0 ? (
                    <tr>
                      <td colSpan={totalColumns} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                        No {reportLabel.toLowerCase()} found for this period.
                      </td>
                    </tr>
                  ) : accounts.map(account => (
                    <tr key={account.payment_id}>
                      <td>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: 6, fontSize: 12 }}>
                          {account.customer_code || '-'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                          {account.customer_name || '-'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#475569' }}>
                          {account.loan_code || '-'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#475569' }}>
                        PHP {fmtMoney(account.principal)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        PHP {fmtMoney(account.total_amortization)}
                      </td>
                      {showCollectorColumn && (
                        <td style={{ fontWeight: 600, color: '#334155' }}>
                          {account.collector_name || 'Unassigned'}
                        </td>
                      )}
                      <td style={{ color: '#334155' }}>
                        {displayDate(dateOnly(account.settlement_date))}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: isDeceased ? '#b45309' : '#b91c1c', fontSize: 13.5 }}>
                        PHP {fmtMoney(account.amount_paid)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#64748b' }}>
                        PHP {fmtMoney(account.balance_before)}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#475569', background: '#f1f5f9', padding: '3px 8px', borderRadius: 4, fontSize: 11.5 }}>
                          {account.payment_code || account.or_number || '-'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: isDeceased ? '#fffbeb' : '#fef2f2',
                          color: isDeceased ? '#92400e' : '#991b1b',
                          border: isDeceased ? '1px solid #fef3c7' : '1px solid #fee2e2'
                        }}>
                          {account.remarks || '-'}
                        </span>
                      </td>
                      <td style={{ color: '#475569', fontWeight: 500 }}>
                        {account.encoded_by_name || '-'}
                      </td>
                      {isDeceased && (
                        <td style={{ textAlign: 'center' }} className="reports-screen-only">
                          <button
                            type="button"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: 12,
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                              color: '#b45309',
                              border: '1px solid #fde68a',
                              background: '#fffbeb',
                              padding: '5px 12px',
                              borderRadius: 8,
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = '#fef3c7';
                              e.currentTarget.style.borderColor = '#f59e0b';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = '#fffbeb';
                              e.currentTarget.style.borderColor = '#fde68a';
                            }}
                            onClick={() => {
                              setSelectedDeathCertAccount(account);
                            }}
                            title="View Death Certificate"
                          >
                            <FileText size={13} /> View Death Cert.
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )
    }

    if (active === 'aging-report') {
      if (data.error) {
        return (
          <div className="empty-state" style={{ color: '#b91c1c' }}>
            <p>Unable to load Aging Report.</p>
            <p style={{ fontSize: 12 }}>{data.error}</p>
          </div>
        )
      }
      const overallRows = data.buckets || []
      const collectorGroups = data.collectors || []
      const agingFrom = dateOnly(data.date_from || params.date_from)
      const agingTo = dateOnly(data.date_to || data.as_of || params.date_to || toDateInputValue(new Date()))
      const periodLabel = agingFrom ? `${displayDate(agingFrom)} to ${displayDate(agingTo)}` : `Up to ${displayDate(agingTo)}`
      const todayLabel = displayDate(data.as_of || agingTo)
      const sumRows = rows => rows.reduce((total, row) => ({
        total_clients: total.total_clients + Number(row.total_clients || 0),
        total_principal: total.total_principal + Number(row.total_principal || 0),
        total_interest: total.total_interest + Number(row.total_interest || 0),
        total_loan_amount: total.total_loan_amount + Number(row.total_loan_amount || 0),
        total_collectibles: total.total_collectibles + Number(row.total_collectibles || 0),
      }), { total_clients: 0, total_principal: 0, total_interest: 0, total_loan_amount: 0, total_collectibles: 0 })
      const overallTotals = sumRows(overallRows)
      const collectorFlatRows = collectorGroups.flatMap(group => (group.buckets || []).map(row => ({ ...row, collector: group.collector })))
      const collectorTotals = sumRows(collectorFlatRows)
      const renderAmount = value => `PHP ${fmt(value || 0)}`
      const renderMetricCells = row => (
        <>
          <td className="text-center fw-bold">{row.total_clients || 0}</td>
          <td className="text-right fw-bold">{renderAmount(row.total_principal)}</td>
          <td className="text-right fw-bold">{renderAmount(row.total_interest)}</td>
          <td className="text-right fw-bold">{renderAmount(row.total_loan_amount)}</td>
          <td className="text-right fw-bold" style={{ color: '#2563eb' }}>{renderAmount(row.total_collectibles)}</td>
        </>
      )
      const renderAgingHeader = (withCollector = false) => (
        <tr>
          {withCollector && <th>Collector</th>}
          <th>Period</th>
          <th className="text-center">Total Client</th>
          <th className="text-right">Total Principal</th>
          <th className="text-right">Total Interest</th>
          <th className="text-right">Total Loan Amount</th>
          <th className="text-right">Total Collectibles</th>
        </tr>
      )
      return (
        <div id="printable-area" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <style>{`${REPORT_PRINT_CLARITY_CSS}
            .aging-detail-row { cursor: pointer; transition: background 150ms ease, box-shadow 150ms ease; }
            .aging-detail-row:hover td, .aging-detail-row:focus td { background: #eff6ff !important; }
            .aging-detail-row:focus { outline: 2px solid #2563eb; outline-offset: -2px; }
            @media print {
              @page { size: landscape; margin: 9mm; }
              .aging-actions { display: none !important; }
              #printable-area table.data-table th,
              #printable-area table.data-table td { font-size: 9px !important; padding: 5px 6px !important; }
              .aging-print-title { text-align: center !important; }
              .aging-section { page-break-inside: avoid; }
            }
          `}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
            <div className="aging-print-title">
              <h3 style={{ margin: 0 }}>Aging Report</h3>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Maturity Period: {periodLabel}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>As of {todayLabel}</div>
              <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>Total Collectibles: <b>PHP {fmt(overallTotals.total_collectibles)}</b></div>
            </div>
            <div className="aging-actions" style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => handlePrint('summary')}>Print</button>
            </div>
          </div>

          <div className="card-v2 aging-section" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: 'var(--blue-dark)' }}>Overall Aging Report</h3>
              <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 12 }}>{overallTotals.total_clients} Clients</span>
            </div>
            <div className="table-responsive-print" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 860 }}>
                <thead>
                  {renderAgingHeader(false)}
                </thead>
                <tbody>
                  {overallRows.length === 0 ? <tr><td colSpan={6} className="empty-state">No overdue loans found</td></tr> : overallRows.map(row => (
                    <tr key={row.bucket_key}>
                      <td className="fw-600">{row.bucket_label}</td>
                      {renderMetricCells(row)}
                    </tr>
                  ))}
                </tbody>
                {overallRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className="fw-bold">GRAND TOTAL</td>
                      {renderMetricCells(overallTotals)}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="card-v2 aging-section" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: 'var(--blue-dark)' }}>Aging Report By Collector</h3>
              <span className="aging-actions" style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Click a period row to view client details</span>
            </div>
            <div className="table-responsive-print" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 860 }}>
                <thead>
                  {renderAgingHeader(false)}
                </thead>
                <tbody>
                  {collectorGroups.length === 0 ? <tr><td colSpan={6} className="empty-state">No collector aging records found</td></tr> : collectorGroups.map(group => {
                    const groupRows = group.buckets || []
                    const groupTotals = sumRows(groupRows)
                    return (
                      <Fragment key={group.collector_id || group.collector || 'Unassigned'}>
                        <tr>
                          <td colSpan={6} className="fw-bold" style={{ background: '#eef4ff', color: '#1d4ed8', fontSize: 13 }}>
                            {group.collector || 'Unassigned'} <span style={{ color: '#64748b', fontWeight: 600 }}>- {groupTotals.total_clients} Clients</span>
                          </td>
                        </tr>
                        {groupRows.map(row => (
                          <tr
                            key={`${group.collector_id || group.collector}-${row.bucket_key}`}
                            className="aging-detail-row"
                            role="button"
                            tabIndex={0}
                            title={`View ${group.collector || 'Unassigned'} clients in ${row.bucket_label}`}
                            aria-label={`View ${group.collector || 'Unassigned'} client details for ${row.bucket_label}`}
                            onClick={() => openAgingDetails(group, row, data)}
                            onKeyDown={event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                openAgingDetails(group, row, data)
                              }
                            }}
                          >
                            <td style={{ paddingLeft: 24 }}>{row.bucket_label}</td>
                            {renderMetricCells(row)}
                          </tr>
                        ))}
                        <tr>
                          <td className="fw-bold" style={{ paddingLeft: 24, background: '#f8fafc' }}>Subtotal</td>
                          {renderMetricCells(groupTotals)}
                        </tr>
                      </Fragment>
                    )
                  })}
                </tbody>
                {collectorFlatRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className="fw-bold">GRAND TOTAL</td>
                      {renderMetricCells(collectorTotals)}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )
    }

    if (active === 'monthly-releases') {
      const loans = (data.loans || []).filter(l => !['cancelled', 'canceled', 'reversed', 'rejected'].includes(String(l?.status || '').toLowerCase()))
      const total_principal = data.total_principal !== undefined && data.loans?.length === loans.length
        ? data.total_principal
        : loans.reduce((s, l) => s + Number(l.principal || 0), 0)
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
              <div className="fw-bold text-success">Grand Total: PHP {fmt(total_principal)}</div>
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
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `PHP ${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(245, 158, 11, 0.08)' }} 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                        formatter={(val) => [`PHP ${fmt(val)}`, 'Total Released']}
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
                            return <td key={`${row.collector}-${period.key}`} className="text-right">{cell.amount > 0 ? <span className="text-success fw-bold">PHP {fmt(cell.amount)}</span> : '-'}</td>
                          })}
                          <td className="text-right text-success fw-bold">PHP {fmt(row.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {matrix.rows.length > 0 && (
                      <tfoot>
                        <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                          <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                          {matrix.periods.map(period => (
                            <td key={`release-total-${period.key}`} className="text-right text-success fw-bold">PHP {fmt(matrix.periodTotals[period.key].amount)}</td>
                          ))}
                          <td className="text-right text-success fw-bold">PHP {fmt(total_principal)}</td>
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
                          return <td key={`release-overall-${period.key}`} className="text-right">{cell.amount > 0 ? <span className="text-success fw-bold">PHP {fmt(cell.amount)}</span> : '-'}</td>
                        })}
                        <td className="text-right text-success fw-bold">PHP {fmt(total_principal)}</td>
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
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#16a34a', marginTop: 6 }}>Grand Total: PHP {fmt(total_principal)}</div>
              </div>
              {matrix.rows.map(row => (
                <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid var(--blue-dark)', paddingBottom: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                    <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                      Releases: {row.loan_count} &nbsp;|&nbsp;
                      Total: <span className="text-success">PHP {fmt(row.total_amount)}</span>
                    </div>
                  </div>
                  {matrix.periods.filter(period => row.periods[period.key].loan_count > 0).map(period => {
                    const cell = row.periods[period.key]
                    return (
                      <div key={period.key} style={{ marginBottom: 16, paddingLeft: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{period.label} ({period.rangeLabel})   PHP {fmt(cell.amount)}</div>
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
                                <td className="text-right fw-bold">PHP {fmt(l.principal)}</td>
                                <td className="text-right">PHP {fmt(l.net_proceeds)}</td>
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
      
      const collectorRows = getReleaseCollectorRows(loans)
      const newClientRows = getNewClientCollectorRows(loans)
      const newClientTotals = newClientRows.reduce((totals, row) => ({
        newClientCount: totals.newClientCount + row.newClientCount,
        principal: totals.principal + row.principal,
        interest: totals.interest + row.interest,
        totalLoan: totals.totalLoan + row.totalLoan
      }), { newClientCount: 0, principal: 0, interest: 0, totalLoan: 0 })
      const releaseChartLabel = releaseChartMetric === 'non-recon' ? 'Non-Recon Release' : 'Overall Total'
      const releaseChartColor = releaseChartMetric === 'non-recon' ? '#dc2626' : '#2563eb'
      const releaseChartSoftColor = releaseChartMetric === 'non-recon' ? '#fecaca' : '#bfdbfe'
      const chartData = collectorRows
        .map(row => ({
          name: row.collector,
          amount: releaseChartMetric === 'non-recon' ? row.total_without_recon_amount : row.total_principal
        }))
        .sort((a, b) => b.amount - a.amount);

      return (
        <>
          <style>{`
            .release-daily-layout {
              display: grid;
              grid-template-columns: minmax(700px, 0.95fr) minmax(420px, 1.05fr);
              gap: 20px;
              align-items: start;
            }
            .release-daily-table {
              min-width: 0;
              overflow-x: auto;
            }
            .release-daily-table table {
              width: 100%;
              min-width: 680px;
            }
            .release-daily-chart {
              min-width: 0;
              overflow: hidden;
            }
            @media (max-width: 1280px) {
              .release-daily-layout {
                grid-template-columns: 1fr;
              }
            }
            @media print {
              ${printMode === 'new-clients' ? `
              .reports-screen-only, .reports-print-only { display: none !important; }
              .release-new-clients-print { display: block !important; }
              ` : printMode === 'detailed' ? `
              .reports-screen-only { display: none !important; }
              .reports-print-only { display: block !important; }
              .release-new-clients-print { display: none !important; }
              ` : `
              .reports-print-only, .release-new-clients-print { display: none !important; }
              .reports-screen-only { display: flex !important; flex-direction: column !important; }
              .reports-screen-only > div:first-child { order: 2; }
              .reports-screen-only > div:last-child { order: 1; margin-bottom: 30px; }
              `}
            }
          `}</style>
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reports-screen-only release-daily-layout">
          <div className="release-daily-table">
            <div style={{ marginBottom: 6, color: 'var(--blue-dark)', fontWeight: 700 }}>{transactionLabel}</div>
            <div style={{ marginBottom: 12 }} className="fw-bold text-accent">Total Released: PHP {fmt(total_principal)}</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>Collector</th>
                  <th className="text-center" style={{ borderBottom: '1px solid var(--border)' }}>New</th>
                  <th className="text-center" style={{ borderBottom: '1px solid var(--border)' }}>Reloan</th>
                  <th className="text-center" style={{ borderBottom: '1px solid var(--border)' }}>Recon</th>
                  <th className="text-center" style={{ borderBottom: '1px solid var(--border)', width: 112, maxWidth: 112, whiteSpace: 'normal', lineHeight: 1.15, color: '#dc2626' }}>Non-Recon Release</th>
                  <th className="text-center" style={{ borderBottom: '1px solid var(--border)', width: 112, maxWidth: 112, whiteSpace: 'normal', lineHeight: 1.15, color: '#2563eb' }}>Overall Total</th>
                </tr>
              </thead>
              <tbody>
                {collectorRows.length === 0 ? <tr><td colSpan={6} className="empty-state">No records</td></tr> : collectorRows.map(row => (
                  <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View release details" style={{ cursor: 'pointer', transition: 'background 0.2s' }} className="clickable-row">
                    <td className="fw-600" style={{ verticalAlign: 'middle' }}>{row.collector}</td>
                    <td className="text-center">
                      {row.new_amount > 0 ? (
                        <>
                          <div className="fw-600">PHP {fmt(row.new_amount)}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.new_count} {row.new_count > 1 ? 'Clients' : 'Client'}</div>
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-center">
                      {row.reloan_amount > 0 ? (
                        <>
                          <div className="fw-600">PHP {fmt(row.reloan_amount)}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.reloan_count} {row.reloan_count > 1 ? 'Clients' : 'Client'}</div>
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-center">
                      {row.recon_amount > 0 ? (
                        <>
                          <div className="fw-600">PHP {fmt(row.recon_amount)}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{row.recon_count} {row.recon_count > 1 ? 'Clients' : 'Client'}</div>
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-center" style={{ background: 'rgba(220, 38, 38, 0.05)', color: '#dc2626', width: 112, maxWidth: 112 }}>
                      {row.total_without_recon_amount > 0 ? (
                        <>
                          <div className="fw-bold" style={{ fontSize: '13px', color: '#dc2626' }}>PHP {fmt(row.total_without_recon_amount)}</div>
                          <div style={{ fontSize: 11, color: '#dc2626' }}>{row.total_without_recon_count} {row.total_without_recon_count > 1 ? 'Releases' : 'Release'}</div>
                        </>
                      ) : '-'}
                    </td>
                    <td className="text-center" style={{ background: 'rgba(37, 99, 235, 0.06)', color: '#2563eb', width: 112, maxWidth: 112 }}>
                      {row.total_principal > 0 ? (
                        <>
                          <div className="fw-bold" style={{ fontSize: '13px', color: '#2563eb' }}>PHP {fmt(row.total_principal)}</div>
                          <div style={{ fontSize: 11, color: '#2563eb' }}>{row.loan_count} {row.loan_count > 1 ? 'Releases' : 'Release'}</div>
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
                    <td className="text-center">
                      <div className="fw-bold">PHP {fmt(collectorRows.reduce((sum, r) => sum + r.new_amount, 0))}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{collectorRows.reduce((sum, r) => sum + r.new_count, 0)} Clients</div>
                    </td>
                    <td className="text-center">
                      <div className="fw-bold">PHP {fmt(collectorRows.reduce((sum, r) => sum + r.reloan_amount, 0))}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{collectorRows.reduce((sum, r) => sum + r.reloan_count, 0)} Clients</div>
                    </td>
                    <td className="text-center">
                      <div className="fw-bold">PHP {fmt(collectorRows.reduce((sum, r) => sum + r.recon_amount, 0))}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{collectorRows.reduce((sum, r) => sum + r.recon_count, 0)} Clients</div>
                    </td>
                    <td className="text-center" style={{ color: '#dc2626' }}>
                      <div className="fw-bold" style={{ color: '#dc2626' }}>PHP {fmt(collectorRows.reduce((sum, r) => sum + r.total_without_recon_amount, 0))}</div>
                      <div style={{ fontSize: 11, color: '#dc2626' }}>{collectorRows.reduce((sum, r) => sum + r.total_without_recon_count, 0)} Releases</div>
                    </td>
                    <td className="text-center" style={{ color: '#2563eb' }}>
                      <div className="fw-bold" style={{ fontSize: '14px', color: '#2563eb' }}>PHP {fmt(total_principal)}</div>
                      <div style={{ fontSize: 11, color: '#2563eb' }}>{collectorRows.reduce((sum, r) => sum + r.loan_count, 0)} Releases</div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="release-daily-chart">
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="fw-bold">Releases per Collector ({releaseChartLabel})</div>
              <div className="reports-chart-toggle" style={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <button type="button" onClick={() => setReleaseChartMetric('overall')} style={{ border: 0, padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: releaseChartMetric === 'overall' ? '#2563eb' : 'transparent', color: releaseChartMetric === 'overall' ? '#fff' : '#475569' }}>Overall Total</button>
                <button type="button" onClick={() => setReleaseChartMetric('non-recon')} style={{ border: 0, borderLeft: '1px solid var(--border-color)', padding: '8px 12px', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: releaseChartMetric === 'non-recon' ? '#dc2626' : 'transparent', color: releaseChartMetric === 'non-recon' ? '#fff' : '#475569' }}>Non-Recon Release</button>
              </div>
            </div>
            <div style={{ height: 400, background: 'var(--bg-card, #fff)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350} minWidth={300} minHeight={300}>
                    <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="barGradientRelease" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={releaseChartColor} stopOpacity={1}/>
                          <stop offset="100%" stopColor={releaseChartSoftColor} stopOpacity={0.6}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }} dy={10} interval={0} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `PHP ${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip
                        cursor={{ fill: releaseChartMetric === 'non-recon' ? 'rgba(220, 38, 38, 0.08)' : 'rgba(37, 99, 235, 0.08)' }}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }}
                        formatter={(val) => [`PHP ${fmt(val)}`, releaseChartLabel]}
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
                    Total: <span className="text-accent">PHP {fmt(row.total_principal)}</span>
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
                        <td className="text-right fw-bold">PHP {fmt(l.principal)}</td>
                        <td className="text-right">PHP {fmt(l.net_proceeds)}</td>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Total Releases</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold' }}>{collectorRows.reduce((sum, r) => sum + r.loan_count, 0)}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>New</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>PHP {fmt(collectorRows.reduce((sum, r) => sum + r.new_amount, 0))}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Reloan</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>PHP {fmt(collectorRows.reduce((sum, r) => sum + r.reloan_amount, 0))}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Recon</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>PHP {fmt(collectorRows.reduce((sum, r) => sum + r.recon_amount, 0))}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(220,38,38,0.06)', borderRadius: 8, border: '1px solid rgba(220,38,38,0.18)' }}>
                    <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 4, fontWeight: 600 }}>Non-Recon Release</div>
                    <div style={{ fontSize: 16, fontWeight: 'bold', color: '#dc2626' }}>PHP {fmt(collectorRows.reduce((sum, r) => sum + r.total_without_recon_amount, 0))}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(37,99,235,0.06)', borderRadius: 8, border: '1px solid rgba(37,99,235,0.18)' }}>
                    <div style={{ fontSize: 12, color: '#2563eb', marginBottom: 4, fontWeight: 600 }}>Overall Total</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2563eb' }}>PHP {fmt(total_principal)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div id={(!selectedCollector && printMode === 'new-clients') ? "printable-area" : undefined} className="release-new-clients-print" style={{ display: 'none', padding: 20, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: '2px solid var(--blue-dark)', paddingBottom: 12, marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, color: 'var(--blue-dark)' }}>New Clients Release Summary</h2>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 5 }}>{transactionLabel}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 12, color: '#475569' }}>
                <div>Total New Clients: <strong style={{ color: 'var(--blue-dark)' }}>{newClientTotals.newClientCount}</strong></div>
                <div style={{ marginTop: 4 }}>Total Loans: <strong style={{ color: '#059669' }}>PHP {fmt(newClientTotals.totalLoan)}</strong></div>
              </div>
            </div>

            {newClientRows.length === 0 ? <div className="empty-state">No new-client releases found for this period.</div> : (
              <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Collector</th>
                    <th className="text-center">New Clients</th>
                    <th className="text-right">Principal</th>
                    <th className="text-right">Interest</th>
                    <th className="text-right">Total Loans</th>
                  </tr>
                </thead>
                <tbody>
                  {newClientRows.map(row => (
                    <tr key={row.collector}>
                      <td className="fw-600">{row.collector}</td>
                      <td className="text-center">{row.newClientCount}</td>
                      <td className="text-right">PHP {fmt(row.principal)}</td>
                      <td className="text-right">PHP {fmt(row.interest)}</td>
                      <td className="text-right fw-bold text-success">PHP {fmt(row.totalLoan)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(18,58,99,0.05)', borderTop: '2px solid var(--blue-dark)' }}>
                    <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>OVERALL TOTAL</td>
                    <td className="text-center fw-bold">{newClientTotals.newClientCount}</td>
                    <td className="text-right fw-bold">PHP {fmt(newClientTotals.principal)}</td>
                    <td className="text-right fw-bold">PHP {fmt(newClientTotals.interest)}</td>
                    <td className="text-right fw-bold text-success">PHP {fmt(newClientTotals.totalLoan)}</td>
                  </tr>
                </tfoot>
              </table>
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
      return (
        <>
          <style>{`
            .maturity-report-modern {
              display: flex;
              flex-direction: column;
              gap: 18px;
              color: #172033;
            }
            .maturity-hero {
              display: grid;
              grid-template-columns: minmax(260px, 1fr) repeat(4, minmax(140px, 180px));
              gap: 12px;
              align-items: stretch;
              padding: 18px;
              border: 1px solid rgba(203, 213, 225, 0.75);
              border-radius: 8px;
              background:
                linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(5, 150, 105, 0.08)),
                #ffffff;
              box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
            }
            .maturity-hero-title {
              display: flex;
              flex-direction: column;
              justify-content: center;
              gap: 4px;
            }
            .maturity-hero-title strong {
              color: #172033;
              font-size: 17px;
              font-weight: 900;
            }
            .maturity-hero-title span {
              color: #64748b;
              font-size: 12px;
              font-weight: 650;
            }
            .maturity-kpi {
              min-height: 82px;
              padding: 14px;
              border: 1px solid rgba(219, 228, 240, 0.9);
              border-radius: 8px;
              background: rgba(255, 255, 255, 0.82);
              box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
            }
            .maturity-kpi span {
              display: block;
              color: #64748b;
              font-size: 10.5px;
              font-weight: 850;
              letter-spacing: 0.35px;
              text-transform: uppercase;
              margin-bottom: 8px;
            }
            .maturity-kpi strong {
              display: block;
              color: #172033;
              font-size: 18px;
              font-weight: 900;
              line-height: 1.15;
            }
            .maturity-kpi.accent strong {
              color: #2563eb;
            }
            .maturity-summary-wrap,
            .maturity-collector-section {
              min-width: 0;
              overflow: hidden;
              border: 1px solid rgba(203, 213, 225, 0.75);
              border-radius: 8px;
              background: #ffffff;
              box-shadow: 0 14px 34px rgba(15, 23, 42, 0.06);
            }
            .maturity-summary-table {
              width: 100%;
              table-layout: fixed;
              border-collapse: separate;
              border-spacing: 0;
            }
            .maturity-summary-table th,
            .maturity-summary-table td {
              padding: 10px 8px;
              font-size: 13px;
              line-height: 1.28;
              text-align: center !important;
              vertical-align: middle;
            }
            .maturity-summary-table th {
              background: #f8fbff !important;
              color: #2f72ff !important;
              border-bottom: 1px solid #dbe4f0 !important;
              font-size: 10.5px;
              letter-spacing: 0.35px;
              white-space: normal;
              overflow-wrap: anywhere;
            }
            .maturity-summary-table .money-cell,
            .maturity-summary-table .collector-cell {
              white-space: normal;
              word-break: normal;
              overflow-wrap: anywhere;
            }
            .maturity-summary-table .money-cell {
              font-size: 12.5px;
            }
            .maturity-summary-table th:first-child,
            .maturity-summary-table td:first-child {
              text-align: left !important;
              padding-left: 12px;
            }
            .maturity-summary-row {
              cursor: pointer;
              transition: background-color 0.15s ease, box-shadow 0.15s ease;
            }
            .maturity-summary-row:hover td {
              background: #eef6ff !important;
            }
            .maturity-summary-row:focus {
              outline: 3px solid rgba(37, 99, 235, 0.35);
              outline-offset: -3px;
            }
            .maturity-summary-row:focus td {
              background: #eef6ff !important;
            }
            .maturity-collector-stack {
              display: grid;
              gap: 14px;
            }
            .maturity-collector-section {
              scroll-margin-top: 18px;
            }
            .maturity-collector-section:focus {
              outline: 3px solid rgba(37, 99, 235, 0.38);
              outline-offset: 2px;
            }
            .maturity-collector-header {
              display: grid;
              grid-template-columns: minmax(220px, 1fr) repeat(4, minmax(120px, auto));
              gap: 12px;
              align-items: center;
              padding: 16px 18px;
              background: linear-gradient(135deg, #ffffff, #f8fbff);
              border-bottom: 1px solid #dbe4f0;
            }
            .maturity-collector-name {
              color: #172033;
              font-size: 15px;
              font-weight: 900;
            }
            .maturity-collector-meta {
              text-align: right;
            }
            .maturity-collector-meta span {
              display: block;
              color: #64748b;
              font-size: 10px;
              font-weight: 850;
              letter-spacing: 0.35px;
              text-transform: uppercase;
            }
            .maturity-collector-meta strong {
              color: #172033;
              font-size: 13px;
              font-weight: 900;
            }
            .maturity-detail-table {
              width: 100%;
              min-width: 1320px;
              border-collapse: separate;
              border-spacing: 0;
            }
            .maturity-detail-table th {
              padding: 12px 14px;
              background: #f8fbff !important;
              border-bottom: 1px solid #dbe4f0 !important;
              color: #2f72ff !important;
              font-size: 10.5px;
              font-weight: 900;
              letter-spacing: 0.35px;
              text-transform: uppercase;
              white-space: nowrap;
            }
            .maturity-detail-table td {
              padding: 13px 14px;
              border-bottom: 1px solid #edf2f7;
              color: #263449;
              font-size: 13px;
              vertical-align: middle;
            }
            .maturity-detail-table tbody tr:hover td {
              background: #f9fcff;
            }
            .maturity-loan-code {
              display: inline-flex;
              align-items: center;
              padding: 4px 8px;
              border-radius: 999px;
              background: #eef6ff;
              color: #1d4ed8;
              font-size: 12px;
              font-weight: 850;
            }
            .maturity-code-pill {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              min-width: 58px;
              padding: 5px 10px;
              border-radius: 8px;
              background: linear-gradient(180deg, #ffffff, #eff6ff);
              border: 1px solid #cfe1ff;
              color: #245bd6;
              font-size: 12px;
              font-weight: 900;
              box-shadow: 0 7px 16px rgba(37, 99, 235, 0.08);
            }
            .maturity-soa-btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              min-width: 74px;
              min-height: 34px;
              padding: 7px 12px;
              border: 1px solid #bcd7ff;
              border-radius: 8px;
              background: linear-gradient(180deg, #ffffff 0%, #eef6ff 100%);
              color: #1d4ed8;
              font-size: 12px;
              font-weight: 900;
              cursor: pointer;
              box-shadow: 0 10px 20px rgba(37, 99, 235, 0.12);
              transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
              white-space: nowrap;
            }
            .maturity-soa-btn:hover:not(:disabled) {
              transform: translateY(-1px);
              border-color: #60a5fa;
              box-shadow: 0 14px 26px rgba(37, 99, 235, 0.18);
            }
            .maturity-soa-btn:disabled {
              opacity: 0.5;
              cursor: not-allowed;
              box-shadow: none;
            }
            .maturity-status-pill {
              display: inline-flex;
              align-items: center;
              min-height: 28px;
              padding: 5px 10px;
              border-radius: 999px;
              background: #fff7ed;
              color: #c2410c;
              border: 1px solid #fed7aa;
              font-size: 12px;
              font-weight: 850;
              white-space: nowrap;
            }
            .maturity-back-to-top {
              position: fixed;
              right: 28px;
              bottom: 28px;
              z-index: 40;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              width: 46px;
              height: 46px;
              border: 1px solid #1d4ed8;
              border-radius: 50%;
              background: #2563eb;
              color: #ffffff;
              cursor: pointer;
              box-shadow: 0 12px 28px rgba(37, 99, 235, 0.35);
              transition: transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
            }
            .maturity-back-to-top:hover {
              transform: translateY(-2px);
              background: #1d4ed8;
              box-shadow: 0 16px 32px rgba(37, 99, 235, 0.42);
            }
            .maturity-back-to-top:focus-visible {
              outline: 3px solid rgba(37, 99, 235, 0.35);
              outline-offset: 3px;
            }
            @media (max-width: 1320px) {
              .maturity-hero {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
              .maturity-collector-header {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
              .maturity-collector-meta {
                text-align: left;
              }
            }
            @media print {
              .maturity-back-to-top { display: none !important; }
              ${printMode === 'detailed' ? `
              .reports-screen-only { display: none !important; }
              .reports-print-only { display: block !important; }
              ` : `
              .reports-print-only { display: none !important; }
              .reports-screen-only { display: block !important; }
              `}
            }
          `}</style>
          <div id={(!selectedCollector && printMode === 'summary') ? "printable-area" : undefined} className="reports-screen-only maturity-report-modern">
            <section className="maturity-hero" ref={maturityTopRef} tabIndex={-1}>
              <div className="maturity-hero-title">
                <strong>Loans Maturity Checker</strong>
                <span>Maturity Date: {displayDate(reportFrom)} to {displayDate(reportTo)}</span>
              </div>
              <div className="maturity-kpi"><span>Collectors</span><strong>{rows.length}</strong></div>
              <div className="maturity-kpi"><span>Clients</span><strong>{totalClients}</strong></div>
              <div className="maturity-kpi"><span>Running Balance</span><strong>PHP {fmt(totalBalance)}</strong></div>
              <div className="maturity-kpi accent"><span>Total Loan Amount</span><strong>PHP {fmt(totalLoanAmount)}</strong></div>
            </section>
            <div className="maturity-summary-wrap">
            <table className="data-table maturity-summary-table">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '22%' }} />
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
                {rows.length === 0 ? <tr><td colSpan={6} className="empty-state">No loans found for the selected maturity date range</td></tr> : rows.map((row, collectorIndex) => (
                  <tr
                    key={row.collector}
                    className="maturity-summary-row"
                    role="button"
                    tabIndex={0}
                    title={`Go to ${row.collector} details`}
                    aria-label={`Go to details for collector ${row.collector}`}
                    onClick={() => scrollToMaturityCollector(collectorIndex)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        scrollToMaturityCollector(collectorIndex)
                      }
                    }}
                  >
                    <td className="fw-600 collector-cell">{row.collector}</td>
                    <td className="text-right fw-bold">{row.client_count}</td>
                    <td className="text-right money-cell">PHP {fmt(row.total_principal)}</td>
                    <td className="text-right money-cell">PHP {fmt(row.total_interest)}</td>
                    <td className="text-right fw-bold text-accent money-cell">PHP {fmt(row.total_loan_amount)}</td>
                    <td className="text-right fw-bold money-cell">PHP {fmt(row.total_balance)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'rgba(18,58,99,0.03)', borderTop: '2px solid var(--border)' }}>
                    <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                    <td className="text-right fw-bold">{totalClients}</td>
                    <td className="text-right fw-bold money-cell">PHP {fmt(totalPrincipal)}</td>
                    <td className="text-right fw-bold money-cell">PHP {fmt(totalInterest)}</td>
                    <td className="text-right fw-bold text-accent money-cell">PHP {fmt(totalLoanAmount)}</td>
                    <td className="text-right fw-bold money-cell">PHP {fmt(totalBalance)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
            <div className="maturity-collector-stack">
              {rows.length === 0 ? (
                <div className="empty-state">No loans found for the selected maturity date range</div>
              ) : rows.map((row, collectorIndex) => (
                <section
                  id={`maturity-collector-${collectorIndex}`}
                  className="maturity-collector-section"
                  key={row.collector}
                  tabIndex={-1}
                  aria-label={`${row.collector} maturity details`}
                >
                  <div className="maturity-collector-header">
                    <div className="maturity-collector-name">{row.collector}</div>
                    <div className="maturity-collector-meta"><span>Clients</span><strong>{row.client_count}</strong></div>
                    <div className="maturity-collector-meta"><span>Principal</span><strong>PHP {fmt(row.total_principal)}</strong></div>
                    <div className="maturity-collector-meta"><span>Total Loan</span><strong>PHP {fmt(row.total_loan_amount)}</strong></div>
                    <div className="maturity-collector-meta"><span>Running Bal.</span><strong>PHP {fmt(row.total_balance)}</strong></div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="maturity-detail-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Code</th>
                          <th style={{ textAlign: 'left' }}>Client</th>
                          <th style={{ textAlign: 'left' }}>Loan Account</th>
                          <th className="text-right">Principal</th>
                          <th className="text-right">Interest</th>
                          <th className="text-right">Total Loan Amount</th>
                          <th className="text-right">Running Balance</th>
                          <th style={{ textAlign: 'left' }}>Maturity Date</th>
                          <th style={{ textAlign: 'left' }}>Status</th>
                          <th style={{ textAlign: 'left' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.loans?.length === 0 ? <tr><td colSpan={10} className="empty-state">No maturity details</td></tr> : row.loans?.map(l => (
                          <tr key={l.id}>
                            <td><span className="maturity-code-pill">{l.customer_code || '-'}</span></td>
                            <td className="fw-600">{l.customer_name || '-'}</td>
                            <td><span className="maturity-loan-code">{l.loan_code || '-'}</span></td>
                            <td className="text-right">PHP {fmt(l.principal)}</td>
                            <td className="text-right">PHP {fmt(l.interest_amount)}</td>
                            <td className="text-right fw-bold text-accent">PHP {fmt(Number(l.principal || 0) + Number(l.interest_amount || 0))}</td>
                            <td className="text-right fw-bold">PHP {fmt(l.balance)}</td>
                            <td>{displayDate(l.date_maturity)}</td>
                            <td><span className="maturity-status-pill">{l.status === 'pastdue' && l.days_overdue > 0 ? `Pastdue (${l.days_overdue} days)` : l.status || '-'}</span></td>
                            <td>
                              <button
                                type="button"
                                className="maturity-soa-btn"
                                onClick={() => setSoaCustomerId(l.customer_id)}
                                disabled={!l.customer_id}
                                title="View SOA"
                              >
                                <FileText size={13} /> SOA
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </div>
          {showMaturityBackToTop && (
            <button
              type="button"
              className="reports-screen-only maturity-back-to-top"
              onClick={scrollMaturityReportToTop}
              title="Back to top"
              aria-label="Back to top of Loans Maturity Checker"
            >
              <ArrowUp size={22} strokeWidth={2.5} />
            </button>
          )}
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
                    Total Balance: <span className="text-accent">PHP {fmt(row.total_balance)}</span>
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
                        <td className="text-right">PHP {fmt(l.principal)}</td>
                        <td className="text-right fw-bold text-accent">PHP {fmt(Number(l.principal || 0) + Number(l.interest_amount || 0))}</td>
                        <td className="text-right fw-bold">PHP {fmt(l.balance)}</td>
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
                    <div style={{ fontSize: 20, fontWeight: 'bold' }}>PHP {fmt(totalPrincipal)}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(18,58,99,0.05)', borderRadius: 8, border: '1px solid rgba(18,58,99,0.1)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Grand Total Balance</div>
                    <div style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--blue-dark)' }}>PHP {fmt(totalBalance)}</div>
                  </div>
                  <div style={{ padding: 16, background: 'rgba(139,92,246,0.1)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.2)' }}>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>Grand Total Loan Amount</div>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: 'var(--blue-mid)' }}>PHP {fmt(totalLoanAmount)}</div>
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
      return <><div style={{ marginBottom: 12 }} className="fw-bold">{records.length} records {data.total != null ? ` Total: PHP ${fmt(data.total)}` : ''}</div>
        <table className="data-table"><thead><tr><th>OR#</th><th>Customer</th><th>Loan#</th><th>Date</th><th className="text-right">Amount</th><th>By</th></tr></thead>
        <tbody>{records.length === 0 ? <tr><td colSpan={6} className="empty-state">No records</td></tr> : records.map(p => <tr key={p.id}><td className="mono">{p.or_number}</td><td>{p.customer_name}</td><td className="mono">{p.loan_code}</td><td>{p.date_paid}</td><td className="text-right">PHP {fmt(p.amount_paid)}</td><td>{p.encoded_by_name || ''}</td></tr>)}</tbody></table></>
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
              <div style={{ marginBottom: 12, color: '#dc2626', fontWeight: 700 }}>Total Reversed: PHP {fmt(total)}</div>
              <table className="data-table">
                <thead><tr><th>Collector</th><th className="text-right">No. of Reversals</th><th className="text-right">Total Amount</th></tr></thead>
                <tbody>{reversedCollectorRows.length === 0 ? <tr><td colSpan={3} className="empty-state">No reversed payments found</td></tr> : reversedCollectorRows.map(row => <tr key={row.collector} onClick={() => setSelectedCollector(row)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedCollector(row) }} tabIndex={0} title="View reversed payment details" style={{ cursor: 'pointer' }}><td className="fw-600">{row.collector}</td><td className="text-right">{row.payment_count}</td><td className="text-right fw-bold" style={{ color: '#dc2626' }}>PHP {fmt(row.total_amount)}</td></tr>)}</tbody>
                {reversedCollectorRows.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'rgba(220,38,38,0.04)', borderTop: '2px solid var(--border)' }}>
                      <td className="fw-bold" style={{ color: 'var(--blue-dark)' }}>GRAND TOTAL</td>
                      <td className="text-right fw-bold">{reversedCollectorRows.reduce((sum, r) => sum + r.payment_count, 0)}</td>
                      <td className="text-right fw-bold" style={{ color: '#dc2626', fontSize: '14px' }}>PHP {fmt(total)}</td>
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
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `PHP ${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(220, 38, 38, 0.08)' }} 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                        formatter={(val) => [`PHP ${fmt(val)}`, 'Total Reversed']}
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
              <div style={{ fontSize: 16, fontWeight: 'bold', color: '#dc2626', marginTop: 6 }}>Grand Total Reversed: PHP {fmt(total)}</div>
            </div>
            {reversedCollectorRows.length === 0 ? <div className="empty-state">No reversed payments found</div> : reversedCollectorRows.map(row => (
              <div key={row.collector} style={{ marginBottom: 30, pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #dc2626', paddingBottom: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--blue-dark)' }}>{row.collector}</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold' }}>
                    Reversals: {row.payment_count} &nbsp;|&nbsp;
                    Total: <span style={{ color: '#dc2626' }}>PHP {fmt(row.total_amount)}</span>
                  </div>
                </div>
                <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left' }}>Client Code</th><th style={{ textAlign: 'left' }}>Client</th><th style={{ textAlign: 'left' }}>Payment Code</th><th style={{ textAlign: 'left' }}>Loan#</th><th>Date Paid</th><th className="text-right">Amount</th><th style={{ textAlign: 'left' }}>Reason</th><th style={{ textAlign: 'left' }}>Reversed By</th></tr>
                  </thead>
                  <tbody>
                    {row.payments?.map(p => (
                      <tr key={p.id}>
                        <td className="mono">{p.customer_code || '-'}</td>
                        <td className="fw-600">{p.customer_name || '-'}</td>
                        <td className="mono">{p.payment_code || p.or_number || '-'}</td>
                        <td className="mono">{p.loan_code || '-'}</td>
                        <td>{p.date_paid}</td>
                        <td className="text-right fw-bold" style={{ color: '#dc2626' }}>PHP {fmt(p.amount_paid)}</td>
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
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }} tickFormatter={val => `PHP ${val >= 1000 ? (val/1000).toFixed(0)+'k' : val}`} dx={-10} />
                      <Tooltip 
                        cursor={{ fill: 'rgba(22, 163, 74, 0.08)' }} 
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }} 
                        formatter={(val) => [`${'PHP'} ${fmt(val)}`, 'Total Loan Amount']}
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

      const calculatedTarget = [...groups.active, ...groups.overdue.filter(c => !isReconLoan(c))].reduce((sum, c) => sum + Number(c.amortization || 0), 0)
      const calculatedClients = groups.active.length + groups.overdue.filter(c => !isReconLoan(c)).length

      const targetAmount = params.manual_target ? Number(params.manual_target) : calculatedTarget
      const totalActiveClients = params.manual_clients ? Number(params.manual_clients) : calculatedClients
      const peso = n => { const v = Number(n || 0); const f = Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? `-PHP ${f}` : `PHP ${f}` }

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
      if (!data) return null
      if (data.error) {
        return (
          <div className="empty-state">
            <div className="empty-icon">REPORT</div>
            <p>{data.error}</p>
          </div>
        )
      }
      const rawLoans = Array.isArray(data.loans) ? data.loans : []
      const { collector: apiCollector, signatures = {}, summary = {} } = data
      const loans = rawLoans
      const collName = collectors.find(c => c.id == params.collector_id)
      const collectorDisplayName = apiCollector?.name || (collName ? `${collName.last_name}, ${collName.first_name}`.toUpperCase() : 'UNASSIGNED')
      const collectionDate = params.date || toDateInputValue(new Date())
      const displayCollDate = new Date(collectionDate + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      const pbInsDstTotal = Number(summary.pbInsDst ?? summary.pb_ins_dst ?? summary.passbookTotal ?? summary.passbook_total ?? 0)
      const fieldReleaseTotal = params.manual_field_release !== undefined && params.manual_field_release !== ''
        ? Number(params.manual_field_release)
        : Number(summary.fieldRelease ?? summary.field_release ?? 0)

      const isReconLoan = (loan) => (loan.loan_type || '').toLowerCase().includes('recon')

      /*  Classify and deduplicate  */
      const groups = { active: [], recon: [], overdue: [], pastdue: [] }
      const seen = new Set()
      loans.forEach(l => {
        if (!l || seen.has(l.id)) return
        seen.add(l.id)
        l.days_past_due = Math.max(0, parseInt(l.days_past_due) || 0)
        const cat = classifyCollectionAccount(l)
        if (groups[cat]) groups[cat].push(l)
        else groups.active.push(l)
      })
      Object.values(groups).forEach(arr => arr.sort((a, b) => formatCollectionClientName(a).localeCompare(formatCollectionClientName(b))))

      const baseClientsCount = groups.active.length + groups.recon.length + groups.overdue.length + groups.pastdue.length
      const totalClientsCount = params.manual_clients ? Number(params.manual_clients) : baseClientsCount
      const baseTarget = [...groups.active, ...groups.overdue.filter(c => !isReconLoan(c))].reduce((sum, c) => sum + Number(c.amortization || 0), 0)
      const targetAmount = params.manual_target ? Number(params.manual_target) : baseTarget

      /*  Color constants  */
      const peso = n => { const v = Number(n || 0); const f = Math.abs(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? `-PHP ${f}` : `PHP ${f}` }
      const fDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '-'

      /* Build one ordered stream, using one column whenever it fits on the page. */
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
        const client = entry.client || {}
        const noteUnits = [
          Number(client.reloan_balance_note || 0),
          Number(client.reloan_penalty_note || client.penalty_collected_today || 0),
          Number(client.advance_manual_today || 0)
        ].filter(amount => amount > 0).length * 0.65
        return (formatCollectionClientName(client).length > 24 ? 1.35 : 1) + noteUnits
      }
      const autoColumnUnits = 28
      const maxColumnEntries = 27
      /*
       * Keep a short remainder in one full-width column. When the entries no
       * longer fit vertically, balance them across two columns while retaining
       * the original reading order.
       */
      const pages = buildAdaptiveCollectionSheetPages({
        entries: orderedEntries,
        entryUnits,
        maxColumnEntries,
        maxColumnUnits: autoColumnUnits,
      })

      const cs = { borderBottom: '1.2px solid #000', verticalAlign: 'middle', padding: '2px 1px' }
      const collectionNoteStyle = { display: 'block', color: CL.pastdue, lineHeight: 1.05 }
      const collectionNoteLabelStyle = { fontSize: '8.5pt', fontWeight: 600 }
      const collectionNoteAmountStyle = { fontSize: '14pt', fontWeight: 800 }
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
        const advanceNote = Number(c.advance_manual_today || 0)
        const regularCollected = Math.max(0, Number(c.collected_today || 0) - Number(c.penalty_collected_today || 0))
        return (<>
          <td style={{ ...cs, fontWeight: 600, fontSize: '7pt', textAlign: 'center', width: '5%' }}>{entry.rowNum}</td>
          <td style={{ ...cs, fontSize: '10pt', fontWeight: 700, color: rowColor, width: '12%' }}>{c.customer_code}</td>
          <td style={{ ...cs, color: rowColor, fontWeight: 700, fontSize: '10pt', padding: '2px 2px', lineHeight: 1.08, wordBreak: 'normal', overflowWrap: 'break-word', width: '43%' }}>{formatCollectionClientName(c).toUpperCase()}</td>
          <td style={{ ...cs, textAlign: 'center', fontSize: '6pt', width: '9%', paddingLeft: 0, paddingRight: 0 }}>{fDate(c.date_maturity)}</td>
          <td style={{ ...cs, textAlign: 'center', fontSize: '6pt', color: rowColor, fontWeight: 600, width: '4%', paddingLeft: 0, paddingRight: 0 }}>{c.days_past_due}</td>
          <td style={{ ...cs, textAlign: 'right', fontSize: '7pt', width: '8%', paddingLeft: 0 }}>{c.amortization ? Number(c.amortization).toLocaleString() : '0'}</td>
          <td style={{ ...cs, width: '19%', verticalAlign: 'bottom', paddingLeft: 2 }}>
            {regularCollected > 0 && <span style={{ fontSize: '7.5pt', fontWeight: 600 }}>{peso(regularCollected)}</span>}
            {balanceNote > 0 && (
              <span style={collectionNoteStyle}>
                <span style={collectionNoteLabelStyle}>Bal.</span>{' '}
                <span style={collectionNoteAmountStyle}>{collectionAmountText(balanceNote)}</span>
              </span>
            )}
            {penaltyNote > 0 && (
              <span style={collectionNoteStyle}>
                <span style={collectionNoteLabelStyle}>Pen.</span>{' '}
                <span style={collectionNoteAmountStyle}>{collectionAmountText(penaltyNote)}</span>
              </span>
            )}
            {advanceNote > 0 && (
              <span style={collectionNoteStyle}>
                <span style={collectionNoteLabelStyle}>Adv.</span>{' '}
                <span style={collectionNoteAmountStyle}>{collectionAmountText(advanceNote)}</span>
              </span>
            )}
            {regularCollected <= 0 && balanceNote <= 0 && penaltyNote <= 0 && advanceNote <= 0 && <div style={{ height: 12 }}></div>}
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
      const renderClientColumn = (entries = [], keyPrefix) => {
        const clientEntries = (entries || []).filter(e => e && e.type === 'row' && e.client)
        const hasClients = clientEntries.length > 0
        const totalDaily = clientEntries.reduce((sum, e) => sum + Number(e.client.amortization || 0), 0)

        return (
          <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '8pt' }}>
            <thead><tr style={{ textTransform: 'uppercase', fontWeight: 700 }}>{colHdr(keyPrefix)}</tr></thead>
            <tbody>
              {(entries || []).map((entry, i) => <tr key={`${keyPrefix}-${i}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>{entryCells(entry)}</tr>)}
              {hasClients && (
                <tr key={`${keyPrefix}-total`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                  <td colSpan={6} style={{ ...cs, textAlign: 'right', fontWeight: 800, fontSize: '11pt', color: '#000', paddingRight: 6 }}>
                    Total:
                  </td>
                  <td style={{ ...cs, width: '19%' }}></td>
                </tr>
              )}
            </tbody>
          </table>
        )
      }
      const cashSummaryAmount = amount => Number(amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })
      const cashSummaryNoteStyle = { color: CL.pastdue, fontWeight: 800, fontSize: '8.5pt', lineHeight: 1 }
      const fieldReleaseNoteStyle = { color: '#D71920', fontWeight: 800, fontSize: '14pt', lineHeight: 1 }
      const blankCashLine = (label, value = null, isRed = false) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ color: isRed ? CL.pastdue : '#555', fontWeight: isRed ? 700 : 400, flex: '0 0 90px', fontSize: '8.5pt' }}>{label}:</span>
          <span style={{ flex: 1, borderBottom: '1.5px solid #000', height: 14, display: 'flex', alignItems: 'flex-end', paddingLeft: value ? 4 : 0 }}>
            {value && (typeof value === 'string' ? <span style={cashSummaryNoteStyle}>{value}</span> : value)}
          </span>
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
                {peso(targetAmount)}
              </div>
            </div>

            {showSideBoxes && (
              <div style={{ marginTop: 6, width: 210, margin: '6px auto 0', border: '1.2px solid ' + CL.navy, borderRadius: 4, overflow: 'hidden', background: '#fff', textAlign: 'left' }}>
                <div style={{ background: CL.navy, color: '#fff', padding: '2px 6px', fontWeight: 700, fontSize: '7.5pt', textAlign: 'center' }}>EXPENSE</div>
                <div style={{ padding: '4px 8px', fontSize: '7.5pt', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 600, color: '#333', width: 48 }}>Meals:</span>
                    <span style={{ flex: 1, borderBottom: '1.2px solid #000', height: 11 }}></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 600, color: '#333', width: 48 }}>Gas:</span>
                    <span style={{ flex: 1, borderBottom: '1.2px solid #000', height: 11 }}></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 600, color: '#333', width: 48 }}>Others:</span>
                    <span style={{ flex: 1, borderBottom: '1.2px solid #000', height: 11 }}></span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div style={{ flex: '0 0 auto' }}>
            {showSideBoxes ? headerBox('DAILY CASH SUMMARY', (
              <>
                {[
                  ['Total Collection', null],
                  ['PB/Ins/DST', pbInsDstTotal > 0 ? (
                    <span style={{ color: CL.pastdue, lineHeight: 1, display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
                      <span style={{ fontSize: '8.5pt', fontWeight: 600 }}>PB</span>
                      <span style={{ fontSize: '14pt', fontWeight: 800 }}>{cashSummaryAmount(pbInsDstTotal)}</span>
                    </span>
                  ) : null],
                  ['Total', null, true],
                  ['Field Release', fieldReleaseTotal > 0 ? <span style={fieldReleaseNoteStyle}>{cashSummaryAmount(fieldReleaseTotal)}</span> : null],
                  ['Total Expense', null],
                  ['Grand Total', null, true]
                ].map(([label, value, isRed]) => blankCashLine(label, value, isRed))}
                <div style={{ borderTop: '1.5px solid '+CL.navy, margin: '6px -8px -6px -8px', padding: '6px 8px 6px' }}>
                   {blankCashLine('Over / Short')}
                   {blankCashLine('PD Collection')}
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
            <span style={{ fontSize: '12pt' }}>{displayCollDate}</span>
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
                  {renderClientColumn(page.left || [], `L${pageIndex}`)}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
                  {renderClientColumn(page.right || [], `R${pageIndex}`)}
                </div>
              </div>
              {pageFooter(pageIndex + 1, pages.length)}
            </div>
          ))}

          <style>{`
            @media print {
              @page { size: 8.5in 13in; margin: 0.25in 0.15in 0.35in 0.15in; }
              body { margin: 0; padding: 0; }
              .sidebar, .navbar, .reports-sidebar { display: none !important; }
              .content { margin: 0 !important; padding: 0 !important; }
              .reports-screen-only { display: none !important; }
              .collection-sheet-print { border: none !important; box-shadow: none !important; margin: 0 !important; padding: 0 !important; }
              .collection-sheet-page {
                height: 12.4in !important;
                min-height: 12.4in !important;
                max-height: 12.4in !important;
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
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
                min-height: 0.82in !important;
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
                min-height: 12.4in;
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
          <td className="mono">{p.payment_code || p.or_number || '-'}</td>
          <td className="mono">{p.loan_code || '-'}</td>
          <td className="text-right text-success fw-bold">PHP {fmt(p.amount_paid)}</td>
          <td className="text-right">PHP {fmt(p.balance_after)}</td>
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
          {allowedReportTypes.length === 0 && <div className="empty-state" style={{ padding: 16 }}>No report types are assigned to your role.</div>}
          {allowedReportTypes.map(r => {
            const Icon = r.Icon
            const isActive = active === r.key
            return (
            <div key={r.key} className={`report-nav-item${isActive ? ' active' : ''}`} onClick={() => handleSelect(r.key)}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                  color: isActive ? '#fff' : r.color,
                  background: isActive ? r.color : r.bg,
                  boxShadow: isActive ? `0 8px 18px ${r.color}33` : 'inset 0 0 0 1px rgba(255,255,255,0.65)',
                }}
              >
                <Icon size={17} strokeWidth={2.4} />
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                <div className="report-desc" style={{ fontSize: 11, marginTop: 2 }}>{r.desc}</div>
              </div>
            </div>
          )})}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title" style={{ marginBottom: 14 }}>{allowedReportTypes.find(r => r.key === active)?.label || 'Reports'}</div>
            {renderSubTabs()}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {renderParams()}
              <button id="btn-run-report" className="btn btn-primary" onClick={() => run(active, params, active === 'monthly-releases' ? releaseSubTab : collectionSubTab)} disabled={loading || (active === 'disclosure-statement' && !params.disclosure_search.trim() && !params.disclosure_loan_id)}>{loading ? 'Running...' : 'Run Report'}</button>
              {(data || active === 'collection-sheet') && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {active === 'collection-sheet' ? (
                    <>
                      <div style={{ position: 'relative' }}>
                        <button className="btn btn-secondary" onClick={() => setExportMenuOpen(open => !open)} disabled={loading || data?.error}>Export</button>
                        {exportMenuOpen && (
                          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, minWidth: 130, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)', padding: 4 }}>
                            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', border: 0 }} onClick={() => { setExportMenuOpen(false); handleExportExcel() }}>Excel</button>
                            <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', border: 0 }} onClick={() => { setExportMenuOpen(false); handleExportPdf() }}>PDF</button>
                          </div>
                        )}
                      </div>
                      <button className="btn btn-secondary" onClick={openFieldReleaseModal} disabled={loading}>Field Release</button>
                      <button className="btn btn-secondary" onClick={openAdvanceManualModal} disabled={loading}>
                        <Plus size={15} /> Adv. Manual Input
                      </button>
                      <button className="btn btn-secondary" onClick={printCollectionSheet} disabled={loading}><Printer size={15} /> Print</button>
                    </>
                  ) : active === 'expenses-report' ? (
                    <button className="btn btn-secondary" onClick={() => loadExpensesReport()} disabled={loading || expensesLoading}>Refresh</button>
                  ) : ['collection-report', 'monthly-releases', 'past-due', 'payments-reversed', 'full-paid'].includes(active) ? (
                    <>
                      <button className="btn btn-secondary" onClick={handleExportExcel} disabled={loading || data?.error}>Export Excel</button>
                      <button className="btn btn-secondary" onClick={() => handlePrint('summary')}><Printer size={15} /> Print Summary</button>
                      <button className="btn btn-secondary" onClick={() => handlePrint('detailed')}><Printer size={15} /> Print Detailed</button>
                      {active === 'monthly-releases' && releaseSubTab === 'daily' && <button className="btn btn-secondary" onClick={() => handlePrint('new-clients')}><Printer size={15} /> Print New Clients</button>}
                    </>
                  ) : (
                    <>
                      <button className="btn btn-secondary" onClick={handleExportExcel} disabled={loading || data?.error}>Export Excel</button>
                      <button className="btn btn-secondary" onClick={() => handlePrint('summary')}><Printer size={15} /> {active === 'disclosure-statement' ? 'Print Disclosure' : 'Print'}</button>
                    </>
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
      {fieldReleaseOpen && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && !fieldReleaseSaving && !fieldReleaseCollectorsSaving && setFieldReleaseOpen(false)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <span className="modal-title">Field Release - {displayDate(params.date || toDateInputValue(new Date()))}</span>
              <button className="modal-close" onClick={() => setFieldReleaseOpen(false)} disabled={fieldReleaseSaving || fieldReleaseCollectorsSaving}>x</button>
            </div>
            <div className="modal-body">
              {fieldReleaseLoading ? (
                <div className="empty-state">Loading field release amounts...</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                    <button className={`btn ${fieldReleaseTab === 'amounts' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFieldReleaseTab('amounts')}>
                      <WalletCards size={15} /> Field Release Amounts
                    </button>
                    <button className={`btn ${fieldReleaseTab === 'collectors' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFieldReleaseTab('collectors')}>
                      <Settings size={15} /> Configure Collectors
                    </button>
                  </div>
                  {fieldReleaseTab === 'amounts' ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'rgba(37, 99, 235, 0.06)' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Total Field Release</span>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#0D1B3D' }}>PHP {fmt(fieldReleaseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</span>
                      </div>
                      <div style={{ maxHeight: '55vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <table className="data-table" style={{ minWidth: 0, width: '100%' }}>
                          <thead><tr><th>Collector</th><th className="text-right">Field Release Amount</th></tr></thead>
                          <tbody>
                            {fieldReleaseRows.length === 0 ? (
                              <tr>
                                <td colSpan={2} className="empty-state">
                                  <div>No collectors selected for Field Release.</div>
                                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setFieldReleaseTab('collectors')}>Configure Collectors</button>
                                </td>
                              </tr>
                            ) : fieldReleaseRows.map(row => (
                              <tr key={row.collector_id}>
                                <td className="fw-600">{row.last_name}, {row.first_name}</td>
                                <td className="text-right">
                                  <input type="number" min="0" step="0.01" className="form-control" value={row.amount} onChange={e => updateFieldReleaseAmount(row.collector_id, e.target.value)} style={{ width: 180, marginLeft: 'auto', textAlign: 'right' }} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-secondary" onClick={clearAllFieldReleaseAmounts} disabled={fieldReleaseSaving || fieldReleaseRows.length === 0}>
                          <Trash2 size={15} /> Clear All
                        </button>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="btn btn-secondary" onClick={() => setFieldReleaseOpen(false)} disabled={fieldReleaseSaving}>Cancel</button>
                          <button type="button" className="btn btn-primary" onClick={saveFieldReleases} disabled={fieldReleaseSaving || fieldReleaseLoading || fieldReleaseRows.length === 0}>
                            {fieldReleaseSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 800, color: '#0D1B3D' }}>Choose collectors for Field Release</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>{fieldReleaseCollectors.filter(collector => collector.selected).length} of {fieldReleaseCollectors.length} selected</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setFieldReleaseCollectors(prev => prev.map(collector => ({ ...collector, selected: 1 })))}>Select All</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setFieldReleaseCollectors(prev => prev.map(collector => ({ ...collector, selected: 0 })))}>Clear All</button>
                        </div>
                      </div>
                      <div style={{ maxHeight: '55vh', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <table className="data-table" style={{ minWidth: 0, width: '100%' }}>
                          <thead><tr><th style={{ width: 72, textAlign: 'center' }}>Include</th><th>Collector Name</th><th>Collector Code</th></tr></thead>
                          <tbody>
                            {fieldReleaseCollectors.length === 0 ? (
                              <tr><td colSpan={3} className="empty-state">No active collectors found in the Collectors Module.</td></tr>
                            ) : fieldReleaseCollectors.map(collector => (
                              <tr key={collector.collector_id} onClick={() => toggleFieldReleaseCollector(collector.collector_id)} style={{ cursor: 'pointer' }}>
                                <td style={{ textAlign: 'center' }}>
                                  <input type="checkbox" checked={Boolean(collector.selected)} onChange={() => toggleFieldReleaseCollector(collector.collector_id)} onClick={event => event.stopPropagation()} aria-label={`Include ${collectorDisplayName(collector)} in Field Release`} />
                                </td>
                                <td className="fw-600">{collectorDisplayName(collector)}</td>
                                <td>{collector.collector_code || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                        <button className="btn btn-secondary" onClick={() => setFieldReleaseTab('amounts')} disabled={fieldReleaseCollectorsSaving}>Cancel</button>
                        <button className="btn btn-primary" onClick={saveFieldReleaseCollectors} disabled={fieldReleaseCollectorsSaving || fieldReleaseLoading}>
                          <Save size={15} /> {fieldReleaseCollectorsSaving ? 'Saving...' : 'Save Selection'}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {advanceManualOpen && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && !advanceManualForm.saving && setAdvanceManualOpen(false)}>
          <div className="modal" style={{ maxWidth: 920 }}>
            <div className="modal-header">
              <span className="modal-title">Advance Manual Input</span>
              <button className="modal-close" onClick={() => setAdvanceManualOpen(false)} disabled={advanceManualForm.saving}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: '#eff6ff', color: '#1e3a8a', fontSize: 13 }}>
                Collection Date: <strong>{displayDate(params.date || toDateInputValue(new Date()))}</strong>
              </div>
              {advanceManualForm.error && (
                <div className="login-error" style={{ marginBottom: 14 }}>{advanceManualForm.error}</div>
              )}
              <form onSubmit={searchAdvanceClient} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end', marginBottom: 18 }}>
                <div className="form-group">
                  <label className="form-label">Search Client Code</label>
                  <input
                    className="form-control"
                    value={advanceManualForm.client_code}
                    onChange={e => setAdvanceManualForm(prev => ({ ...prev, client_code: e.target.value, client: null, error: '' }))}
                    placeholder="Enter exact Client Code"
                    autoFocus
                    disabled={advanceManualForm.searching || advanceManualForm.saving}
                  />
                </div>
                <button className="btn btn-secondary" type="submit" disabled={advanceManualForm.searching || advanceManualForm.saving}>
                  {advanceManualForm.searching ? 'Searching...' : 'Search'}
                </button>
              </form>

              {advanceManualForm.client ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
                    {[
                      ['Client Name', advanceManualForm.client.customer_name],
                      ['Loan Code', advanceManualForm.client.loan_code],
                      ['Loan Type', advanceManualForm.client.loan_type],
                      ['Collector', advanceManualForm.client.collector_name],
                    ].map(([label, value]) => (
                      <div key={label} style={{ padding: '11px 12px', border: '1px solid var(--border)', borderRadius: 8, background: '#f8fafc' }}>
                        <div style={{ marginBottom: 4, color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
                        <div style={{ color: '#0f172a', fontSize: 14, fontWeight: 800 }}>{value || '-'}</div>
                      </div>
                    ))}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Advance Amount</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="form-control"
                      value={advanceManualForm.amount}
                      onChange={e => setAdvanceManualForm(prev => ({ ...prev, amount: e.target.value, error: '' }))}
                      placeholder="0.00"
                      style={{ maxWidth: 260, textAlign: 'right', fontWeight: 800 }}
                      disabled={advanceManualForm.saving}
                    />
                  </div>
                  <div style={{ marginTop: 12, color: '#64748b', fontSize: 12 }}>
                    Collection Sheet entry preview: <strong style={{ color: '#D71920', fontSize: 16 }}>Adv. {Number(advanceManualForm.amount || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong>
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ minHeight: 100 }}>
                  Enter a Client Code to display the client, active loan, and assigned collector.
                </div>
              )}

              <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ color: '#0f172a', fontSize: 15, fontWeight: 800 }}>Entries Today</div>
                    <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 11 }}>
                      Advance entries for {displayDate(params.date || toDateInputValue(new Date()))}
                    </div>
                  </div>
                  <div style={{ padding: '4px 9px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 800 }}>
                    {advanceManualEntries.length} {advanceManualEntries.length === 1 ? 'entry' : 'entries'}
                  </div>
                </div>
                {advanceEntriesLoading ? (
                  <div className="empty-state" style={{ minHeight: 90 }}>Loading entries...</div>
                ) : advanceManualEntries.length === 0 ? (
                  <div className="empty-state" style={{ minHeight: 90 }}>No advance entries for this collection date.</div>
                ) : (
                  <div style={{ overflowX: 'auto', maxHeight: 245, border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table className="data-table" style={{ minWidth: 780 }}>
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th>Loan Code</th>
                          <th>Collector</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                          <th style={{ width: 105, textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advanceManualEntries.map(entry => {
                          const isEditing = advanceEditingId === entry.id
                          return (
                            <tr key={entry.id}>
                              <td>
                                <div style={{ fontWeight: 800 }}>{entry.customer_name}</div>
                                <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 11 }}>{entry.customer_code}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 700 }}>{entry.loan_code}</div>
                                <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 11 }}>{entry.loan_type || '-'}</div>
                              </td>
                              <td>{entry.collector_name}</td>
                              <td style={{ textAlign: 'right' }}>
                                {isEditing ? (
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    className="form-control"
                                    value={advanceEditAmount}
                                    onChange={e => setAdvanceEditAmount(e.target.value)}
                                    style={{ width: 110, marginLeft: 'auto', textAlign: 'right', fontWeight: 800 }}
                                    autoFocus
                                  />
                                ) : (
                                  <strong style={{ color: '#D71920' }}>Adv. {Number(entry.amount).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 5 }}>
                                  {isEditing ? (
                                    <>
                                      <button className="btn btn-primary" style={{ padding: '5px 8px' }} onClick={() => updateAdvanceManualEntry(entry)} title="Save changes"><Save size={13} /></button>
                                      <button className="btn btn-secondary" style={{ padding: '5px 8px' }} onClick={() => { setAdvanceEditingId(null); setAdvanceEditAmount('') }} title="Cancel editing">x</button>
                                    </>
                                  ) : (
                                    <button className="btn btn-secondary" style={{ padding: '5px 8px' }} onClick={() => { setAdvanceEditingId(entry.id); setAdvanceEditAmount(String(entry.amount)); setAdvanceManualForm(prev => ({ ...prev, error: '' })) }} title="Edit"><Pencil size={13} /></button>
                                  )}
                                  <button className="btn btn-secondary" style={{ padding: '5px 8px', color: '#dc2626' }} onClick={() => deleteAdvanceManualEntry(entry)} disabled={advanceDeletingId === entry.id} title="Delete"><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button className="btn btn-secondary" onClick={() => setAdvanceManualOpen(false)} disabled={advanceManualForm.saving}>Cancel</button>
                <button className="btn btn-primary" onClick={saveAdvanceManualEntry} disabled={!advanceManualForm.client || advanceManualForm.saving}>
                  <Save size={15} /> {advanceManualForm.saving ? 'Saving...' : 'Save Entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {advanceManualSuccess && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setAdvanceManualSuccess(null)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title">Successful Entry</span>
              <button className="modal-close" onClick={() => setAdvanceManualSuccess(null)}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ padding: 16, border: '1px solid #a7f3d0', borderLeft: '4px solid #10b981', borderRadius: 8, background: '#ecfdf5', color: '#065f46' }}>
                <div style={{ marginBottom: 8, fontSize: 15, fontWeight: 800 }}>Advance entry saved successfully.</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  <strong>{advanceManualSuccess.client_name}</strong><br />
                  Loan: {advanceManualSuccess.loan_code}<br />
                  Collector: {advanceManualSuccess.collector_name}<br />
                  Collection Sheet: <strong>Adv. {Number(advanceManualSuccess.amount).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong>
                </div>
              </div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 18 }} onClick={() => setAdvanceManualSuccess(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
      {soaCustomerId && (
        <SoaModal
          customerId={soaCustomerId}
          initialTab={soaInitialTab}
          onClose={() => {
            setSoaCustomerId(null)
            setSoaInitialTab('summary')
          }}
        />
      )}
      {selectedDeathCertAccount && (
        <DeathCertificateModal
          account={selectedDeathCertAccount}
          onClose={() => setSelectedDeathCertAccount(null)}
          onUpdated={(newUrl) => {
            setSelectedDeathCertAccount(prev => prev ? { ...prev, death_certificate_image: newUrl } : null)
            setData(prev => {
              if (!prev || !prev.deceased) return prev
              const targetId = selectedDeathCertAccount.customer_id || selectedDeathCertAccount.id
              return {
                ...prev,
                deceased: prev.deceased.map(acc =>
                  (acc.customer_id === targetId || acc.id === targetId)
                    ? { ...acc, death_certificate_image: newUrl }
                    : acc
                )
              }
            })
          }}
        />
      )}
      {selectedExpenseEmployee && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setSelectedExpenseEmployee(null)}>
          <div className="modal" style={{ maxWidth: 980 }}>
            <div className="modal-header">
              <span className="modal-title">Expense Details - {selectedExpenseEmployee.employee_name}</span>
              <button className="modal-close" onClick={() => setSelectedExpenseEmployee(null)}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>Employee</div>
                  <div className="fw-bold">{selectedExpenseEmployee.employee_name}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>Position</div>
                  <div className="fw-bold">{selectedExpenseEmployee.position || '-'}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>Expense Entries</div>
                  <div className="fw-bold">{selectedExpenseEmployee.expense_count || 0}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>Total Expense</div>
                  <div className="fw-bold" style={{ color: '#0f766e' }}>PHP {fmtMoney(selectedExpenseEmployee.total_amount)}</div>
                </div>
              </div>
              <div style={{ marginBottom: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                Selected period: {params.date_from ? displayDate(params.date_from) : 'All dates'} to {params.date_to ? displayDate(params.date_to) : 'Present'}
              </div>
              <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Remarks</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {selectedExpenseEmployee.expenses.length === 0 ? (
                      <tr><td colSpan={5} className="empty-state">No expense entries for this employee in the selected period</td></tr>
                    ) : selectedExpenseEmployee.expenses.map(entry => (
                      <tr key={entry.id}>
                        <td>{displayDate(entry.expense_date)}</td>
                        <td>{entry.category || 'Uncategorized'}</td>
                        <td>{entry.description || '-'}</td>
                        <td>{entry.remarks || '-'}</td>
                        <td className="text-right fw-700">PHP {fmtMoney(entry.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {selectedExpenseEmployee.expenses.length > 0 && (
                    <tfoot><tr><td colSpan={4} className="fw-700">Total</td><td className="text-right fw-700">PHP {fmtMoney(selectedExpenseEmployee.total_amount)}</td></tr></tfoot>
                  )}
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-primary" onClick={() => setSelectedExpenseEmployee(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {expenseActionModal && (() => {
        const isConfirm = expenseActionModal.phase === 'confirm'
        const isDelete = expenseActionModal.action === 'delete'
        const isEdit = expenseActionModal.action === 'edit'
        const isSuccess = expenseActionModal.phase === 'success'
        const entry = expenseActionModal.entry
        const modalCopy = {
          create: { title: 'Confirm New Expense', message: 'Please review the expense details before saving.', button: 'Save Expense' },
          update: { title: 'Confirm Expense Update', message: 'Please confirm the changes to this expense entry.', button: 'Update Expense' },
          edit: { title: 'Edit Expense Entry?', message: 'The selected expense will be loaded into the form for editing.', button: 'Continue Editing' },
          delete: { title: 'Delete Expense Entry?', message: 'This action cannot be undone. Please review the entry before deleting it.', button: 'Delete Expense' },
        }
        const copy = modalCopy[expenseActionModal.action] || {}
        const iconColor = isSuccess ? '#15803d' : expenseActionModal.phase === 'error' || isDelete ? '#dc2626' : '#2563eb'
        const iconBackground = isSuccess ? '#dcfce7' : expenseActionModal.phase === 'error' || isDelete ? '#fee2e2' : '#dbeafe'
        const closeModal = () => !expenseActionModal.busy && setExpenseActionModal(null)
        return (
          <div className="modal-overlay" onMouseDown={event => event.target === event.currentTarget && closeModal()}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="expense-action-modal-title" style={{ maxWidth: 500, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(15, 23, 42, 0.24)' }}>
              <div style={{ padding: '26px 26px 18px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, flex: '0 0 auto', display: 'grid', placeItems: 'center', color: iconColor, background: iconBackground }}>
                  {isSuccess ? <CheckCircle2 size={26} /> : expenseActionModal.phase === 'error' || isDelete ? <AlertTriangle size={26} /> : isEdit ? <Pencil size={24} /> : <Save size={24} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 id="expense-action-modal-title" style={{ margin: '1px 0 6px', fontSize: 19, color: '#0f172a' }}>{isConfirm ? copy.title : expenseActionModal.title}</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.55 }}>{isConfirm ? copy.message : expenseActionModal.message}</p>
                </div>
                <button type="button" className="modal-close" aria-label="Close" disabled={expenseActionModal.busy} onClick={closeModal} style={{ marginTop: -7 }}>×</button>
              </div>
              {isConfirm && entry && (
                <div style={{ margin: '0 26px', padding: 16, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px' }}>
                    <div><div className="nav-section-label" style={{ marginBottom: 4 }}>Employee</div><div className="fw-600">{entry.employee_name || expenseEmployeeName(entry.personnel_id)}</div></div>
                    <div><div className="nav-section-label" style={{ marginBottom: 4 }}>Amount</div><div className="fw-700" style={{ color: isDelete ? '#dc2626' : '#0f766e' }}>PHP {fmtMoney(entry.amount)}</div></div>
                    <div><div className="nav-section-label" style={{ marginBottom: 4 }}>Category</div><div>{entry.category || 'Uncategorized'}</div></div>
                    <div><div className="nav-section-label" style={{ marginBottom: 4 }}>Expense Date</div><div>{displayDate(dateOnly(entry.expense_date))}</div></div>
                  </div>
                  {entry.description && <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #e2e8f0' }}><div className="nav-section-label" style={{ marginBottom: 4 }}>Description</div><div style={{ color: '#334155' }}>{entry.description}</div></div>}
                </div>
              )}
              <div style={{ padding: '22px 26px 26px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                {isConfirm ? (
                  <>
                    <button type="button" className="btn btn-secondary" disabled={expenseActionModal.busy} onClick={closeModal}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={expenseActionModal.busy} onClick={confirmExpenseAction} style={isDelete ? { background: '#dc2626', borderColor: '#dc2626' } : undefined}>
                      {expenseActionModal.busy ? <RefreshCcw size={15} className="spin" /> : isDelete ? <Trash2 size={15} /> : isEdit ? <Pencil size={15} /> : <Save size={15} />}
                      {expenseActionModal.busy ? 'Processing...' : copy.button}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={closeModal}>Done</button>
                )}
              </div>
            </div>
          </div>
        )
      })()}
      {agingDetail && (
        <div className="modal-overlay" onMouseDown={event => event.target === event.currentTarget && setAgingDetail(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="aging-detail-title" style={{ width: 'min(1500px, 96vw)', maxWidth: '96vw' }}>
            <div className="modal-header">
              <div>
                <div id="aging-detail-title" className="modal-title">Aging Client Details — {agingDetail.collector}</div>
                <div style={{ marginTop: 3, color: '#64748b', fontSize: 12 }}>{agingDetail.bucket}</div>
              </div>
              <button type="button" className="modal-close" aria-label="Close aging client details" onClick={() => setAgingDetail(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                {[
                  ['Total Clients', agingDetail.totals.total_clients || 0],
                  ['Loan Accounts', agingDetail.loans.length],
                  ['Total Principal', `PHP ${fmt(agingDetail.totals.total_principal)}`],
                  ['Total Interest', `PHP ${fmt(agingDetail.totals.total_interest)}`],
                  ['Total Loan Amount', `PHP ${fmt(agingDetail.totals.total_loan_amount)}`],
                  ['Total Collectibles', `PHP ${fmt(agingDetail.totals.total_collectibles)}`],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
                    <div className="nav-section-label" style={{ marginBottom: 5 }}>{label}</div>
                    <div className="fw-bold" style={{ color: label === 'Total Collectibles' ? '#2563eb' : '#0f172a' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ maxHeight: '62vh', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table className="data-table" style={{ minWidth: 1500 }}>
                  <thead>
                    <tr>
                      <th>Client Code</th><th>Client Name</th><th>Contact</th><th>Address</th><th>Loan #</th><th>Type</th>
                      <th>Date Released</th><th>Maturity Date</th><th className="text-center">Days Overdue</th>
                      <th className="text-right">Principal</th><th className="text-right">Interest</th>
                      <th className="text-right">Total Loan Amount</th><th className="text-right">Amortization</th>
                      <th className="text-right">Collectibles</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingDetail.loans.length === 0 ? (
                      <tr><td colSpan={15} className="empty-state">No clients found for this collector and aging period.</td></tr>
                    ) : agingDetail.loans.map(loan => (
                      <tr key={loan.id}>
                        <td className="mono">{loan.customer_code || '-'}</td>
                        <td className="fw-600">{loan.customer_name || '-'}</td>
                        <td>{loan.contact || '-'}</td>
                        <td style={{ minWidth: 210, whiteSpace: 'normal' }}>{loan.address || '-'}</td>
                        <td className="mono">{loan.loan_code || '-'}</td>
                        <td><span className="tag">{loan.loan_type || '-'}</span></td>
                        <td>{displayDate(dateOnly(loan.date_released))}</td>
                        <td>{displayDate(dateOnly(loan.date_maturity))}</td>
                        <td className="text-center fw-bold" style={{ color: '#b45309' }}>{loan.aging_days || 0}</td>
                        <td className="text-right">PHP {fmt(loan.principal)}</td>
                        <td className="text-right">PHP {fmt(loan.interest_amount)}</td>
                        <td className="text-right fw-bold">PHP {fmt(loan.total_loan_amount)}</td>
                        <td className="text-right">{loan.amortization === null || loan.amortization === undefined ? '—' : `PHP ${fmt(loan.amortization)}`}</td>
                        <td className="text-right fw-bold" style={{ color: '#2563eb' }}>PHP {fmt(loan.balance)}</td>
                        <td><span className="tag">{loan.status || '-'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedCollector && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setSelectedCollector(null)}>
          <div className="modal modal-print-area" id="printable-area" style={{ maxWidth: (active === 'full-paid' || active === 'past-due') ? 1180 : 980 }}>
            <div className="modal-header">
              <span className="modal-title">{active === 'full-paid' ? 'Fully Paid Details' : active === 'payments-reversed' ? 'Reversed Payment Details' : active === 'monthly-releases' ? 'Release Details' : active === 'past-due' ? 'Maturity Details' : 'Collection Details'} - {selectedCollector.collector}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {active === 'monthly-releases' && (
                  <div style={{ position: 'relative' }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => setTypeFilterMenuOpen(open => !open)}>
                      Filter Type {modalTypeFilter.length > 0 && `(${modalTypeFilter.length})`}
                    </button>
                    {typeFilterMenuOpen && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 20, minWidth: 160, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)', padding: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, padding: '0 4px' }}>SELECT TYPES</div>
                        <div style={{ maxHeight: 200, overflow: 'auto' }}>
                          {Array.from(new Set((selectedCollector.loans || []).map(l => l.loan_type).filter(Boolean))).sort().map(type => (
                            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}>
                              <input type="checkbox" checked={modalTypeFilter.includes(type)} onChange={() => toggleModalTypeFilter(type)} style={{ cursor: 'pointer' }} />
                              {type}
                            </label>
                          ))}
                        </div>
                        {modalTypeFilter.length > 0 && (
                          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-secondary" style={{ width: '100%', fontSize: 12, padding: '4px 0' }} onClick={() => setModalTypeFilter([])}>Clear Filters</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => window.print()}><Printer size={14} /> Print</button>
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
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>{active === 'payments-reversed' ? 'No. of Reversals' : active === 'monthly-releases' ? 'No. of Releases' : active === 'past-due' || active === 'full-paid' ? 'No. of Client' : 'No. of Payments'}</div>
                  <div className="fw-bold">{active === 'monthly-releases' ? getSortedModalData().length : active === 'full-paid' ? (selectedCollector.loan_count || selectedCollector.payment_count) : active === 'past-due' ? selectedCollector.client_count : selectedCollector.payment_count}</div>
                </div>
                <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-soft, #f8fafc)' }}>
                  <div className="nav-section-label" style={{ marginBottom: 4 }}>{active === 'payments-reversed' ? 'Total Reversed' : active === 'monthly-releases' ? 'Total Released' : active === 'past-due' ? 'Total Balance' : active === 'full-paid' ? 'Total Principal' : 'Total Collection'}</div>
                  <div className={`fw-bold ${active === 'payments-reversed' ? '' : 'text-success'}`} style={active === 'payments-reversed' ? { color: '#dc2626' } : {}}>PHP {fmt(active === 'past-due' ? selectedCollector.total_balance : (active === 'monthly-releases' ? getSortedModalData().reduce((sum, l) => sum + Number(l.principal || 0), 0) : (selectedCollector.total_amount || selectedCollector.total_principal)))}</div>
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
                  {active === 'monthly-releases' ? (
                    <>
                      <thead>
                        <tr>
                          <th>Client Code</th>
                          <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleModalSort('customer_name')}>
                            Client {modalSortConfig.key === 'customer_name' ? (modalSortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                          </th>
                          <th>Loan#</th>
                          <th>Type</th>
                          <th className="text-right" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleModalSort('principal')}>
                            Loan Amount {modalSortConfig.key === 'principal' ? (modalSortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                          </th>
                          <th className="text-right">Net Proceeds</th>
                          <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleModalSort('date_released')}>
                            Date Released {modalSortConfig.key === 'date_released' ? (modalSortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedCollector.loans || selectedCollector.payments)?.length === 0 ? <tr><td colSpan={7} className="empty-state">No release details</td></tr> : getSortedModalData().map(l => (
                          <tr key={l.id}>
                            <td className="mono">{l.customer_code || '-'}</td>
                            <td className="fw-600">{l.customer_name || '-'}</td>
                            <td className="mono">{l.loan_code || '-'}</td>
                            <td><span className="tag">{l.loan_type}</span></td>
                            <td className="text-right fw-bold">PHP {fmt(l.principal)}</td>
                            <td className="text-right">PHP {fmt(l.net_proceeds)}</td>
                            <td>{l.date_released}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : active === 'past-due' ? (
                    <>
                      <thead>
                        <tr><th>Client Code</th><th>Client</th><th>Loan#</th><th className="text-right">Principal</th><th className="text-right">Total Loan Amount</th><th className="text-right">Total Payment</th><th className="text-right">Balance</th><th>Maturity</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {selectedCollector.loans?.length === 0 ? <tr><td colSpan={9} className="empty-state">No maturity details</td></tr> : selectedCollector.loans?.map(l => (
                          <tr key={l.id}>
                            <td className="mono">{l.customer_code || '-'}</td>
                            <td className="fw-600">{l.customer_name || '-'}</td>
                            <td className="mono">{l.loan_code || '-'}</td>
                            <td className="text-right">PHP {fmt(l.principal)}</td>
                            <td className="text-right fw-bold text-accent">PHP {fmt(Number(l.principal || 0) + Number(l.interest_amount || 0))}</td>
                            <td className="text-right fw-bold text-success">PHP {fmt(l.total_paid)}</td>
                            <td className="text-right fw-bold">PHP {fmt(l.balance)}</td>
                            <td>{l.date_maturity || '-'}</td>
                            <td><span className={`badge badge-${l.status}`}>{l.status === 'pastdue' && l.days_overdue > 0 ? `Pastdue (${l.days_overdue} days)` : l.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                   ) : active === 'payments-reversed' ? (
                    <>
                      <thead>
                        <tr><th>Client Code</th><th>Client</th><th>Payment Code</th><th>Loan#</th><th>Date Paid</th><th className="text-right">Amount</th><th>Reason</th><th>Reversed By</th></tr>
                      </thead>
                      <tbody>
                        {selectedCollector.payments?.length === 0 ? <tr><td colSpan={8} className="empty-state">No reversed payment details</td></tr> : selectedCollector.payments?.map(p => (
                          <tr key={p.id}>
                            <td className="mono">{p.customer_code || '-'}</td>
                            <td className="fw-600">{p.customer_name || '-'}</td>
                            <td className="mono">{p.payment_code || p.or_number || '-'}</td>
                            <td className="mono">{p.loan_code || '-'}</td>
                            <td>{p.date_paid}</td>
                            <td className="text-right fw-bold" style={{ color: '#dc2626' }}>PHP {fmt(p.amount_paid)}</td>
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
                        <tr><th>Client Code</th><th>Date Paid</th><th>Client</th><th>Payment Code</th><th>Loan#</th><th className="text-right">Amount</th><th className="text-right">Bal. After</th></tr>
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
