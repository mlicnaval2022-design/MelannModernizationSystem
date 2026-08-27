import { useEffect, useMemo, useState } from 'react'
import API from '../services/api'
import letterHeadImg from '../assets/new-letter-head-logo.jpg'
import './DemandLetter.css'
import { ChevronDown, FileText, Printer, RefreshCw, Search, Calendar, Trash2, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, Filter, Send, ArrowRightCircle } from 'lucide-react'

const DEMAND_TYPES = {
  first: {
    label: '1st Demand',
    title: 'First Demand Letter for Payment of Outstanding Loan Balance',
  },
  second: {
    label: '2nd Demand',
    title: 'Second Demand Letter for Payment of Outstanding Loan Balance',
  },
  third: {
    label: '3rd Demand Letter',
    title: 'Third Demand Letter for Payment of Outstanding Loan Balance',
  },
}

const MONITORING_TYPES = [
  { key: 'first', label: '1st Demand' },
  { key: 'second', label: '2nd Demand' },
  { key: 'third', label: '3rd Demand Letter' },
]

const parseLocalDate = (value) => {
  if (!value) return null
  const text = String(value).slice(0, 10)
  const parts = text.split('-').map(Number)
  if (parts.length === 3 && parts.every(Boolean)) return new Date(parts[0], parts[1] - 1, parts[2])
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const addMonths = (date, months) => {
  const result = new Date(date)
  const day = result.getDate()
  result.setMonth(result.getMonth() + months)
  if (result.getDate() !== day) result.setDate(0)
  return result
}

const addDays = (date, days) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const toDateInputValue = (value) => {
  const date = value instanceof Date ? value : parseLocalDate(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  const local = new Date(date)
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset())
  return local.toISOString().slice(0, 10)
}

const getDemandFollowUpDays = (demandType) => {
  if (demandType === 'second') return 10
  if (demandType === 'first') return 15
  return 0
}

const getFollowUpDate = (dateReceived, demandType) => {
  const receivedDate = parseLocalDate(dateReceived)
  const days = getDemandFollowUpDays(demandType)
  if (!receivedDate || !days) return ''
  return toDateInputValue(addDays(receivedDate, days))
}

const getDemandStatus = (row) => {
  const storedStatus = String(row?.status || '').trim()
  const preservedStatuses = ['Draft', 'Generated', 'Sent', 'Awaiting Receipt', 'Superseded', 'Closed']
  if (storedStatus.toLowerCase().startsWith('settled(') || preservedStatuses.includes(storedStatus)) return storedStatus
  if (!row?.date_received) return row?.date_sent ? 'Awaiting Receipt' : 'Generated'
  const followUpDate = parseLocalDate(row.follow_up_date)
  const today = parseLocalDate(toDateInputValue(new Date()))
  if (followUpDate && followUpDate <= today) return 'Follow-up Due'
  return 'Received'
}

const getReceivedDemandStatus = (followUpDate) => {
  const dueDate = parseLocalDate(followUpDate)
  const today = parseLocalDate(toDateInputValue(new Date()))
  return dueDate && dueDate <= today ? 'Follow-up Due' : 'Received'
}

const getNextDemandType = (demandType) => demandType === 'first' ? 'second' : demandType === 'second' ? 'third' : ''

const getDemandNextAction = (row) => {
  const status = getDemandStatus(row)
  if (status === 'Awaiting Receipt' || status === 'Sent') return 'Confirm receipt'
  if (status === 'Follow-up Due' || status === 'Urgent Action Require') {
    const nextType = getNextDemandType(row.demand_type)
    return nextType ? `Proceed to ${DEMAND_TYPES[nextType].label}` : 'Review account'
  }
  if (status === 'Received') return 'Wait for follow-up date'
  return 'Review demand'
}

const getStatusClassName = (status) => `status-${String(status || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`

function MultiSelectFilter({ label, icon = null, allLabel, options, selectedValues, onChange }) {
  const [open, setOpen] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const selectedLabel = selectedValues.length === 0
    ? allLabel
    : selectedValues.length === 1
      ? selectedValues[0]
      : `${selectedValues.length} selected`

  const toggleValue = (value) => {
    onChange(selectedSet.has(value)
      ? selectedValues.filter(item => item !== value)
      : [...selectedValues, value])
  }

  return (
    <div className="filter-group demand-multiselect-filter">
      <label>{icon}{label}:</label>
      <div className="demand-multiselect" onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}>
        <button
          type="button"
          className={`filter-select demand-multiselect-trigger${open ? ' open' : ''}`}
          onClick={() => setOpen(prev => !prev)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{selectedLabel}</span>
          <ChevronDown size={14} />
        </button>
        {open && (
          <div className="demand-multiselect-menu" role="listbox" aria-multiselectable="true" tabIndex={-1}>
            <label className="demand-multiselect-option">
              <input
                type="checkbox"
                checked={selectedValues.length === 0}
                onChange={() => onChange([])}
              />
              <span>{allLabel}</span>
            </label>
            {options.map(option => (
              <label className="demand-multiselect-option" key={option}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(option)}
                  onChange={() => toggleValue(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


const formatDateLong = (value) => {
  if (!value) return '-'
  const date = value instanceof Date ? value : parseLocalDate(value)
  if (!date || Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const formatPhpNumber = (value) => Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const formatPhp = (value) => `PHP ${formatPhpNumber(value)}`

const toNormalAddressCase = (str) => {
  if (!str) return ''
  return String(str)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => {
      if (!word) return ''
      return word.replace(/(^|[/\-("'.])(\w)/g, (_, prefix, letter) => prefix + letter.toUpperCase())
    })
    .join(' ')
}

const buildAddressParts = (customer) => [
  customer?.address,
  customer?.sitio,
  customer?.purok,
  customer?.brgy,
  customer?.city,
  customer?.province,
  customer?.zip_code,
].map(part => toNormalAddressCase(String(part || '').trim())).filter(Boolean)

const isGoodPayment = (payment) => {
  const statusText = String(payment.status || payment.payment_status || 'active').toLowerCase()
  return !['cancelled', 'canceled', 'void', 'reversed', 'bad', 'bounced', 'penalty'].includes(statusText)
}

const getLoanPayments = (loan, payments) => (payments || [])
  .filter(p => (p.loan_id === loan?.id || p.loan_code === loan?.loan_code) && isGoodPayment(p))
  .map(p => ({ ...p, paidDate: parseLocalDate(p.date_paid), amount: Number(p.amount_paid || 0) }))
  .filter(p => p.paidDate)
  .sort((a, b) => a.paidDate - b.paidDate)

const getPenaltyComputation = (loan, payments, asOfDate) => {
  const dueDate = parseLocalDate(loan?.date_maturity)
  const datePrepared = parseLocalDate(asOfDate) || new Date()
  const principal = Number(loan?.principal || 0)
  const interestAmount = Number(loan?.interest_amount || 0)
  const registeredOutstanding = Number(loan?.total_amortization || 0) || principal + interestAmount || Number(loan?.balance || 0)
  const hasRegisteredRunningBalance = loan?.balance !== undefined && loan?.balance !== null && String(loan.balance).trim() !== ''
  const registeredRunningBalance = hasRegisteredRunningBalance ? Number(loan.balance || 0) : null
  const loanPayments = getLoanPayments(loan, payments)

  if (!dueDate) {
    return {
      datePrepared,
      registeredOutstanding,
      runningBalance: registeredRunningBalance ?? registeredOutstanding,
      paymentsBeforeDue: 0,
      beginningOverdueBalance: registeredOutstanding,
      remainingOverdueBalance: registeredRunningBalance ?? registeredOutstanding,
      totalPenalty: 0,
      updatedAmountDue: registeredRunningBalance ?? registeredOutstanding,
    }
  }

  const paymentsBeforeDue = loanPayments
    .filter(p => p.paidDate <= dueDate)
    .reduce((sum, p) => sum + p.amount, 0)
  let beginningBalance = Math.max(0, registeredOutstanding - paymentsBeforeDue)
  const monthlyPeriods = []
  let totalPenalty = 0

  if (beginningBalance > 0 && datePrepared > dueDate) {
    let periodStart = new Date(dueDate)
    while (periodStart < datePrepared) {
      const nextBoundary = addMonths(periodStart, 1)
      const periodEnd = nextBoundary < datePrepared ? addDays(nextBoundary, -1) : new Date(datePrepared)
      const paymentMade = loanPayments
        // Payments made on a later period's first day belong to that period.
        // Maturity-date payments remain part of the pre-due balance instead.
        .filter(p => p.paidDate > dueDate && p.paidDate >= periodStart && p.paidDate <= periodEnd)
        .reduce((sum, p) => sum + p.amount, 0)
      monthlyPeriods.push({ periodStart, periodEnd, paymentMade })
      periodStart = nextBoundary
    }

    let groupStartIndex = 0
    for (let index = 0; index < monthlyPeriods.length; index += 1) {
      const period = monthlyPeriods[index]
      const isFirstMonth = index === 0
      const hasPayment = period.paymentMade > 0
      const isLastMonth = index === monthlyPeriods.length - 1
      if (!isFirstMonth && !hasPayment && !isLastMonth) continue

      const groupPeriods = monthlyPeriods.slice(groupStartIndex, index + 1)
      const paymentMade = groupPeriods.reduce((sum, item) => sum + item.paymentMade, 0)
      const penaltyBase = Math.max(0, beginningBalance - paymentMade)
      const monthlyPenalty = penaltyBase * 0.05
      totalPenalty += monthlyPenalty * groupPeriods.length
      beginningBalance = penaltyBase
      groupStartIndex = index + 1
      if (beginningBalance <= 0) break
    }
  }

  return {
    datePrepared,
    registeredOutstanding,
    runningBalance: registeredRunningBalance ?? beginningBalance,
    paymentsBeforeDue,
    beginningOverdueBalance: Math.max(0, registeredOutstanding - paymentsBeforeDue),
    remainingOverdueBalance: registeredRunningBalance ?? beginningBalance,
    totalPenalty,
    updatedAmountDue: (registeredRunningBalance ?? beginningBalance) + totalPenalty,
  }
}

const getPreferredLoan = (loans = []) => {
  const activeStatuses = ['active', 'pastdue', 'overdue']
  const sorted = [...loans].sort((a, b) => {
    const aActive = activeStatuses.includes(String(a.status || '').toLowerCase()) ? 0 : 1
    const bActive = activeStatuses.includes(String(b.status || '').toLowerCase()) ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return String(b.created_at || b.date_released || '').localeCompare(String(a.created_at || a.date_released || ''))
  })
  return sorted[0] || null
}

const getLastName = (customer) => {
  if (customer?.last_name) return String(customer.last_name).trim().toUpperCase()
  const parts = String(customer?.full_name || '').trim().split(/\s+/)
  return (parts[parts.length - 1] || '').toUpperCase()
}

const formatClientName = (customer) => {
  const firstName = String(customer?.first_name || '').trim()
  const lastName = String(customer?.last_name || '').trim()
  const middleName = String(customer?.middle_name || '').trim()
  const middleInitial = middleName ? `${middleName.charAt(0).toUpperCase()}.` : ''

  if (firstName && lastName) {
    return [firstName, middleInitial, lastName].filter(Boolean).join(' ').toUpperCase()
  }

  const fullName = String(customer?.full_name || '').trim()
  const commaName = fullName.match(/^([^,]+),\s*(.+)$/)
  if (commaName) return `${commaName[2]} ${commaName[1]}`.trim().toUpperCase()
  return fullName.toUpperCase()
}

function DemandLetterSheet({ type, customer, loan, computation, previousDemand }) {
  const fullName = formatClientName(customer)
  const addressParts = buildAddressParts(customer)
  const today = computation?.datePrepared || new Date()
  const salutation = `${customer?.sex === 'Male' ? 'MR.' : 'MR./MS.'} ${getLastName(customer)}`.trim()
  const runningBalance = computation?.runningBalance || 0
  const penaltyCharges = computation?.totalPenalty || 0
  const totalDue = computation?.updatedAmountDue || 0
  const previousDemandReceivedDate = previousDemand?.date_received || ''

  return (
    <div id="printable-area" className="demand-letter-sheet">
      <div className="dl-letter-inner">
        <header className="dl-header">
          <img src={letterHeadImg} alt="Melann Lending Investor Corporation" className="dl-letterhead" />
        </header>

        <h2 className="dl-title">{DEMAND_TYPES[type].title}</h2>

        <section className="dl-recipient">
          <div className="dl-date-row">
            <span>Date:</span>
            <strong>{formatDateLong(today)}</strong>
          </div>

          <div className="dl-to-block">
            <strong>TO:</strong>
            <strong className="dl-client-name">{fullName || 'SELECT CLIENT'}</strong>
            {addressParts.length > 0 ? addressParts.map(part => <span key={part}>{part}</span>) : <span>-</span>}
          </div>
        </section>

        <p className="dl-salutation">Dear <strong>{salutation}</strong></p>

        {type === 'first' ? (
          <>
            <p>
              This letter serve as a formal demand for a payment of your outstanding loan with Melann Lending Investor
              Corporation under Loan Account No. <u>{loan?.loan_code || '-'}</u>, which has become overdue on
              <u>{formatDateLong(loan?.date_maturity)}</u>.
            </p>

            <p>
              Our records show that as of <u>{formatDateLong(today)}</u>, your outstanding obligation inclusive of the 5%
              accrued penalties and interest calculated in the terms and conditions of your loan agreement is as follows:
            </p>
          </>
        ) : (
          <>
            <p>
              This letter serves as our Second Demand Letter regarding your overdue loan with Melann Lending Investor
              Corporation under Loan Account No. <u>{loan?.loan_code || '-'}</u>, which remains unsettled despite our first
              demand letter dated <u>{formatDateLong(previousDemandReceivedDate)}</u>.
            </p>

            <p>
              As of <u>{formatDateLong(today)}</u>, your total outstanding balance amounts to inclusive of the 5% accrued
              penalties and interest from the due date of <u>{formatDateLong(loan?.date_maturity)}</u> until the present.
              The breakdown is as follows:
            </p>
          </>
        )}

        <table className="dl-breakdown">
          <tbody>
            <tr>
              <th>Running Balance</th>
              <td>:</td>
              <td>PHP</td>
              <td>{formatPhpNumber(runningBalance)}</td>
            </tr>
            <tr>
              <th>Penalty Charges</th>
              <td>:</td>
              <td>PHP</td>
              <td>{formatPhpNumber(penaltyCharges)}</td>
            </tr>
            <tr className="total">
              <th>Total Amount Due</th>
              <td>:</td>
              <td>PHP</td>
              <td>{formatPhpNumber(totalDue)}</td>
            </tr>
          </tbody>
        </table>

        {type === 'first' ? (
          <>
            <p>
              Despite previous reminders, we have not received your payment. You are hereby given fifteen <strong>(15)</strong>
              calendar days from receipt of this letter to settle the above-mentioned amount in full.
            </p>

            <p>
              Failure to settle your account within the stated period will compel us to initiate appropriate legal action
              or collection proceedings without further notice, and any additional costs incurred shall be charged to your
              account.
            </p>
          </>
        ) : (
          <p>
            Please settle the full amount within ten <strong>(10)</strong> calendar days from receipt of this letter. If no
            payment is made within this period, we will be forced to endorse your account for legal or collection action
            without prior notice.
          </p>
        )}

        <p>
          You may settle your payment at our office or through payment channels like Gcash. Please contact
          <strong> Ms. Marilyn O. Reloba</strong>, Branch Manager at 0917-1131000 or
          (053) 520-1138 or thru our email address melann.lic2016@gmail.com should you wish to discuss this matter or
          request a detailed statement of account.
        </p>

        <p>
          {type === 'first'
            ? 'We urge you to give this matter your immediate attention to avoid further penalties and possible legal action.'
            : 'We encourage you to settle this matter immediately to avoid further charges and legal action.'}
        </p>

        {type === 'first' && <p>Thank you for your prompt cooperation.</p>}

        <footer className="dl-signature">
          <p>Sincerely,</p>
          <strong>VICTORIO L. RELOBA, JR.</strong>
          <span>Operations Manager</span>
          <span>Melann Lending Investor Corporation</span>
        </footer>

        <section className="dl-received">
          <strong>Received:</strong>
          <div className="dl-received-lines">
            <div>
              <span></span>
              <small>Signature Over Printed Name</small>
            </div>
            <div>
              <span></span>
              <small>Date Received</small>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function DemandLetter() {
  const [activeTab, setActiveTab] = useState('updates')
  const [type, setType] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [courier, setCourier] = useState('Field Personnel')
  const [asOfDate, setAsOfDate] = useState(toDateInputValue(new Date()))
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [previousDemand, setPreviousDemand] = useState(null)
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  const [monitoringType, setMonitoringType] = useState('first')
  const [monitoringRows, setMonitoringRows] = useState([])
  const [monitoringLoading, setMonitoringLoading] = useState(false)
  const [monitoringError, setMonitoringError] = useState('')
  const [demandUpdates, setDemandUpdates] = useState([])
  const [demandUpdateCount, setDemandUpdateCount] = useState(0)
  const [demandTodayCount, setDemandTodayCount] = useState(0)
  const [demandDueCount, setDemandDueCount] = useState(0)
  const [demandOverdueCount, setDemandOverdueCount] = useState(0)
  const [demandPendingReceiptCount, setDemandPendingReceiptCount] = useState(0)
  const [demandFilterTab, setDemandFilterTab] = useState('all')
  const [demandUpdatesLoading, setDemandUpdatesLoading] = useState(false)
  const [demandUpdatesError, setDemandUpdatesError] = useState('')
  const [savingRecord, setSavingRecord] = useState(false)
  const [successModal, setSuccessModal] = useState(null)
  const [errorModal, setErrorModal] = useState(null)
  const [receivedModal, setReceivedModal] = useState(null)
  const [progressionModal, setProgressionModal] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)

  const [courierFilter, setCourierFilter] = useState([])
  const [collectorFilter, setCollectorFilter] = useState([])
  const [statusFilter, setStatusFilter] = useState([])
  const [monitoringSearch, setMonitoringSearch] = useState('')
  const [sortField, setSortField] = useState('date_generated')
  const [sortOrder, setSortOrder] = useState('desc')

  const uniqueCouriers = useMemo(() => {
    const set = new Set(monitoringRows.map(r => String(r.courier || '').trim()).filter(Boolean))
    return Array.from(set).sort()
  }, [monitoringRows])

  const uniqueCollectors = useMemo(() => {
    const set = new Set(monitoringRows.map(r => String(r.collector_name || '').trim()).filter(Boolean))
    return Array.from(set).sort()
  }, [monitoringRows])

  const uniqueStatuses = useMemo(() => {
    const set = new Set(monitoringRows.map(r => getDemandStatus(r)).filter(Boolean))
    return Array.from(set).sort()
  }, [monitoringRows])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const filteredAndSortedRows = useMemo(() => {
    let result = [...monitoringRows]

    if (courierFilter.length > 0) {
      const courierSet = new Set(courierFilter.map(value => value.toLowerCase()))
      result = result.filter(r => courierSet.has(String(r.courier || '').trim().toLowerCase()))
    }
    if (collectorFilter.length > 0) {
      const collectorSet = new Set(collectorFilter.map(value => value.toLowerCase()))
      result = result.filter(r => collectorSet.has(String(r.collector_name || '').trim().toLowerCase()))
    }
    if (statusFilter.length > 0) {
      const statusSet = new Set(statusFilter)
      result = result.filter(r => statusSet.has(getDemandStatus(r)))
    }
    if (monitoringSearch.trim()) {
      const query = monitoringSearch.trim().toLowerCase()
      result = result.filter(r => [
        r.client_name,
        r.loan_code,
        r.collector_name,
        r.courier,
        r.remarks,
        getDemandStatus(r),
      ].some(value => String(value || '').toLowerCase().includes(query)))
    }

    if (sortField) {
      result.sort((a, b) => {
        let valA = ''
        let valB = ''

        if (sortField === 'client_name') {
          valA = String(a.client_name || '').toLowerCase()
          valB = String(b.client_name || '').toLowerCase()
        } else if (sortField === 'date_generated') {
          valA = a.date_generated ? parseLocalDate(a.date_generated)?.getTime() || 0 : 0
          valB = b.date_generated ? parseLocalDate(b.date_generated)?.getTime() || 0 : 0
        } else if (sortField === 'date_received') {
          valA = a.date_received ? parseLocalDate(a.date_received)?.getTime() || 0 : 0
          valB = b.date_received ? parseLocalDate(b.date_received)?.getTime() || 0 : 0
        } else if (sortField === 'follow_up_date') {
          valA = a.follow_up_date ? parseLocalDate(a.follow_up_date)?.getTime() || 0 : 0
          valB = b.follow_up_date ? parseLocalDate(b.follow_up_date)?.getTime() || 0 : 0
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [monitoringRows, courierFilter, collectorFilter, statusFilter, monitoringSearch, sortField, sortOrder])

  const monitoringColumnCount = monitoringType === 'third' ? 13 : monitoringType === 'second' ? 12 : 11

  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const res = await API.get('/customers', { params: { search: query } })
        setResults(res.data || [])
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to search clients')
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  const calculatedComputation = useMemo(
    () => getPenaltyComputation(selectedLoan, payments, asOfDate),
    [selectedLoan, payments, asOfDate]
  )
  const computation = useMemo(() => {
    if (type === 'first' || !previousDemand) return calculatedComputation

    const lockedPenalty = Number(previousDemand.penalty_charges || 0)
    return {
      ...calculatedComputation,
      totalPenalty: lockedPenalty,
      updatedAmountDue: calculatedComputation.runningBalance + lockedPenalty,
    }
  }, [type, previousDemand, calculatedComputation])

  useEffect(() => {
    const previousType = type === 'second' ? 'first' : type === 'third' ? 'second' : ''
    if (!previousType || !selectedCustomer || !selectedLoan) {
      setPreviousDemand(null)
      return
    }

    let cancelled = false
    API.get('/demand-letters/previous-received', {
      params: {
        type: previousType,
        customer_id: selectedCustomer.id,
        loan_id: selectedLoan.id,
        loan_code: selectedLoan.loan_code || '',
      }
    })
      .then(res => {
        if (!cancelled) setPreviousDemand(res.data || null)
      })
      .catch(() => {
        if (!cancelled) setPreviousDemand(null)
      })

    return () => { cancelled = true }
  }, [type, selectedCustomer, selectedLoan])

  const loadDemandUpdates = async () => {
    setDemandUpdatesLoading(true)
    setDemandUpdatesError('')
    try {
      const res = await API.get('/demand-letters/notifications')
      const activeNotifications = (res.data.notifications || [])
        .filter(row => !String(row.status || '').trim().toLowerCase().startsWith('settled('))
      setDemandUpdates(activeNotifications)
      setDemandUpdateCount(activeNotifications.length)
      const today = toDateInputValue(new Date())

      const dueRows = activeNotifications.filter(row => {
        const status = getDemandStatus(row)
        return status === 'Follow-up Due' || status === 'Urgent Action Require' || Boolean(row.date_received && row.follow_up_date && String(row.follow_up_date).slice(0, 10) <= today)
      })
      const pendingRows = activeNotifications.filter(row => !dueRows.includes(row))

      setDemandDueCount(dueRows.length)
      setDemandTodayCount(dueRows.filter(row => String(row.follow_up_date || '').slice(0, 10) === today).length)
      setDemandOverdueCount(dueRows.filter(row => String(row.follow_up_date || '').slice(0, 10) < today).length)
      setDemandPendingReceiptCount(pendingRows.length)
    } catch (err) {
      setDemandUpdatesError(err.response?.data?.error || 'Failed to load demand updates')
    } finally {
      setDemandUpdatesLoading(false)
    }
  }

  const loadMonitoring = async (targetType = monitoringType) => {
    setMonitoringLoading(true)
    setMonitoringError('')
    try {
      const res = await API.get('/demand-letters', { params: { type: targetType } })
      setMonitoringRows(res.data || [])
    } catch (err) {
      setMonitoringError(err.response?.data?.error || 'Failed to load demand monitoring')
    } finally {
      setMonitoringLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'monitoring') loadMonitoring(monitoringType)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, monitoringType])

  useEffect(() => {
    loadDemandUpdates()
  }, [])

  useEffect(() => {
    if (activeTab === 'updates') loadDemandUpdates()
  }, [activeTab])

  const handleSelectCustomer = async (row) => {
    setError('')
    setSelectedCustomer(null)
    setSelectedLoan(null)
    setPreviousDemand(null)
    setPayments([])
    try {
      const res = await API.get(`/customers/${row.id}`)
      const customer = res.data
      const loan = getPreferredLoan(customer.loans || [])
      setSelectedCustomer(customer)
      setSelectedLoan(loan)
      setPayments(customer.payments || [])
      if (!loan) setError('No loan record found for selected client.')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load client details')
    }
  }

  const saveDemandRecord = async () => {
    if (!type || !selectedCustomer || !selectedLoan) return null
    const res = await API.post('/demand-letters', {
      demand_type: type,
      customer_id: selectedCustomer.id,
      loan_id: selectedLoan.id,
      loan_code: selectedLoan.loan_code || '',
      collector_name: selectedLoan.collector_name || selectedCustomer.collector_name || '',
      client_name: formatClientName(selectedCustomer),
      total_loan: computation.registeredOutstanding,
      running_balance: computation.runningBalance,
      beginning_overdue: computation.beginningOverdueBalance,
      penalty_charges: computation.totalPenalty,
      total_amount_due: computation.updatedAmountDue,
      date_generated: asOfDate || toDateInputValue(computation.datePrepared),
      date_sent: asOfDate || toDateInputValue(new Date()),
      courier,
      delivery_status: 'Awaiting Receipt',
      status: 'Awaiting Receipt',
    })
    return res.data
  }

  const handleSaveDemand = async () => {
    if (!type || !selectedCustomer || !selectedLoan) return
    setSavingRecord(true)
    setError('')
    try {
      const saved = await saveDemandRecord()
      await loadMonitoring(type)
      setMonitoringType(type)
      setActiveTab('monitoring')
      setSuccessModal({
        title: 'Successfully Saved',
        message: `${DEMAND_TYPES[type].label} for ${saved?.client_name || formatClientName(selectedCustomer)} has been saved to Monitoring.`,
      })
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to save demand letter transaction'
      if (err.response?.data?.missing_first_demand) {
        setErrorModal({
          title: '1st Demand Required',
          message,
          variant: 'warning',
        })
      } else if (err.response?.status === 409 || err.response?.data?.is_ongoing_demand) {
        setErrorModal({
          title: 'Cannot Save Demand Letter',
          message,
        })
      } else {
        setError(message)
      }
    } finally {
      setSavingRecord(false)
    }
  }

  const handlePrint = async () => {
    if (!type || !selectedCustomer || !selectedLoan) return
    setError('')
    const printableArea = document.getElementById('printable-area')
    if (!printableArea) {
      setError('Printable demand letter is not ready yet.')
      return
    }

    const printRoot = document.createElement('div')
    printRoot.className = 'demand-print-root'
    printRoot.appendChild(printableArea.cloneNode(true))

    const cleanupPrintMode = () => {
      document.body.classList.remove('demand-letter-printing')
      printRoot.remove()
    }

    try {
      document.body.appendChild(printRoot)
      document.body.classList.add('demand-letter-printing')
      window.addEventListener('afterprint', cleanupPrintMode, { once: true })
      setTimeout(() => {
        window.print()
        setTimeout(cleanupPrintMode, 500)
      }, 100)
    } catch (err) {
      cleanupPrintMode()
      setError(err.response?.data?.error || 'Failed to print demand letter')
    }
  }

  const updateMonitoringRow = async (id, patch) => {
    setMonitoringRows(prev => prev.map(row => row.id === id ? { ...row, ...patch, __saving: true } : row))
    try {
      const res = await API.put(`/demand-letters/${id}`, patch)
      setMonitoringRows(prev => prev.map(row => row.id === id ? res.data : row))
    } catch (err) {
      setMonitoringError(err.response?.data?.error || 'Failed to update monitoring record')
      loadMonitoring(monitoringType)
    }
  }

  const openReceivedModal = (row) => {
    const dateReceived = row.date_received || toDateInputValue(new Date())
    setReceivedModal({
      ...row,
      courier: row.courier || 'Field Personnel',
      date_received: dateReceived,
      follow_up_date: row.follow_up_date || getFollowUpDate(dateReceived, row.demand_type),
      remarks: row.remarks || '',
      saving: false,
      error: '',
    })
  }

  const updateReceivedForm = (patch) => {
    setReceivedModal(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      if (patch.date_received !== undefined) {
        next.follow_up_date = getFollowUpDate(patch.date_received, prev.demand_type)
      }
      return next
    })
  }

  const saveReceivedDetails = async () => {
    if (!receivedModal) return
    const status = getReceivedDemandStatus(receivedModal.follow_up_date)
    setReceivedModal(prev => ({ ...prev, saving: true, error: '' }))
    try {
      const res = await API.put(`/demand-letters/${receivedModal.id}`, {
        courier: receivedModal.courier,
        date_received: receivedModal.date_received,
        follow_up_date: receivedModal.follow_up_date,
        remarks: receivedModal.remarks,
        delivery_status: 'Received',
        status,
      })
      setMonitoringRows(prev => prev.map(row => row.id === receivedModal.id ? res.data : row))
      await loadDemandUpdates()
      setReceivedModal(null)
      setSuccessModal({
        title: 'Updated Successfully',
        message: `${receivedModal.client_name} received details have been updated.`,
      })
    } catch (err) {
      setReceivedModal(prev => ({
        ...prev,
        saving: false,
        error: err.response?.data?.error || 'Failed to save received details',
      }))
    }
  }

  const openProgressionModal = (row) => {
    setProgressionModal({
      ...row,
      next_demand_type: getNextDemandType(row.demand_type),
      date_sent: toDateInputValue(new Date()),
      courier: row.courier || 'Field Personnel',
      remarks: '',
      saving: false,
      error: '',
    })
  }

  const saveDemandProgression = async () => {
    if (!progressionModal) return
    setProgressionModal(prev => ({ ...prev, saving: true, error: '' }))
    try {
      const res = await API.post(`/demand-letters/${progressionModal.id}/advance`, {
        date_sent: progressionModal.date_sent,
        courier: progressionModal.courier,
        remarks: progressionModal.remarks,
      })
      const nextDemand = res.data.next_demand
      await loadDemandUpdates()
      setProgressionModal(null)
      setMonitoringType(nextDemand.demand_type)
      setActiveTab('monitoring')
      await loadMonitoring(nextDemand.demand_type)
      setSuccessModal({
        title: 'Demand Stage Updated',
        message: `${nextDemand.client_name} is now under ${DEMAND_TYPES[nextDemand.demand_type]?.label || nextDemand.demand_type} — Awaiting Receipt.`,
      })
    } catch (err) {
      setProgressionModal(prev => ({
        ...prev,
        saving: false,
        error: err.response?.data?.error || 'Failed to advance demand stage',
      }))
    }
  }

  const openDeleteModal = (row) => {
    setDeleteModal({
      ...row,
      deleting: false,
      error: '',
    })
  }

  const handleDeleteDemand = async () => {
    if (!deleteModal) return
    setDeleteModal(prev => ({ ...prev, deleting: true, error: '' }))
    try {
      await API.delete(`/demand-letters/${deleteModal.id}`)
      const clientName = deleteModal.client_name
      setDeleteModal(null)
      await loadMonitoring(monitoringType)
      await loadDemandUpdates()
      setSuccessModal({
        title: 'Deleted Successfully',
        message: `Demand letter record for ${clientName} has been successfully deleted.`,
      })
    } catch (err) {
      console.error('Demand letter delete error:', err)
      setDeleteModal(prev => ({
        ...prev,
        deleting: false,
        error: err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to delete demand letter record',
      }))
    }
  }

  const filteredDemandUpdates = useMemo(() => {
    const today = toDateInputValue(new Date())
    if (demandFilterTab === 'due') {
      return demandUpdates.filter(row => {
        const status = getDemandStatus(row)
        return status === 'Follow-up Due' || status === 'Urgent Action Require' || Boolean(row.date_received && row.follow_up_date && String(row.follow_up_date).slice(0, 10) <= today)
      })
    }
    if (demandFilterTab === 'pending') {
      return demandUpdates.filter(row => {
        const status = getDemandStatus(row)
        const isDue = status === 'Follow-up Due' || status === 'Urgent Action Require' || Boolean(row.date_received && row.follow_up_date && String(row.follow_up_date).slice(0, 10) <= today)
        return !isDue
      })
    }
    return demandUpdates
  }, [demandUpdates, demandFilterTab])

  return (
    <div className="demand-letter-page">
      <div className="demand-module-tabs">
        <button className={activeTab === 'updates' ? 'active' : ''} onClick={() => setActiveTab('updates')}>
          Demand Update
          {demandUpdateCount > 0 && <span className="demand-tab-badge">{demandDueCount > 0 ? demandDueCount : demandUpdateCount}</span>}
        </button>
        <button className={activeTab === 'generate' ? 'active' : ''} onClick={() => setActiveTab('generate')}>Generate Demand</button>
        <button className={activeTab === 'monitoring' ? 'active' : ''} onClick={() => setActiveTab('monitoring')}>Monitoring</button>
      </div>

      {activeTab === 'updates' ? (
        <div className="card demand-update-card">
          <div className="card-header">
            <div>
              <div className="card-title">Demand Update & Action Center</div>
              <div className="card-subtitle">Track demand letters with follow-up due or pending receipt confirmation</div>
            </div>
            <button className="btn btn-secondary" onClick={loadDemandUpdates} disabled={demandUpdatesLoading}>
              <RefreshCw size={14} /> {demandUpdatesLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {demandUpdatesError && <div className="login-error" style={{ marginBottom: 12 }}>{demandUpdatesError}</div>}

          <div className="demand-update-summary" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div
              className={`summary-card-due ${demandFilterTab === 'due' ? 'active-filter' : ''}`}
              onClick={() => setDemandFilterTab(curr => curr === 'due' ? 'all' : 'due')}
              style={{ cursor: 'pointer', border: demandFilterTab === 'due' ? '2px solid #ef4444' : '1px solid rgba(239,68,68,0.2)', background: 'linear-gradient(135deg, #fff 0%, #fff1f2 100%)' }}
            >
              <div className="summary-icon" style={{ background: '#fee2e2' }}><AlertTriangle size={20} color="#dc2626" /></div>
              <div className="summary-details">
                <span style={{ color: '#dc2626' }}>Follow-up Due</span>
                <strong style={{ color: '#991b1b' }}>{demandDueCount}</strong>
                <small style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  {demandDueCount === 0 ? 'No due follow-ups' : `${demandTodayCount} Today • ${demandOverdueCount} Overdue`}
                </small>
              </div>
            </div>

            <div
              className={`summary-card-pending ${demandFilterTab === 'pending' ? 'active-filter' : ''}`}
              onClick={() => setDemandFilterTab(curr => curr === 'pending' ? 'all' : 'pending')}
              style={{ cursor: 'pointer', border: demandFilterTab === 'pending' ? '2px solid #3b82f6' : '1px solid rgba(59,130,246,0.2)', background: 'linear-gradient(135deg, #fff 0%, #eff6ff 100%)' }}
            >
              <div className="summary-icon" style={{ background: '#dbeafe' }}><Send size={20} color="#2563eb" /></div>
              <div className="summary-details">
                <span style={{ color: '#2563eb' }}>Pending Receipt</span>
                <strong style={{ color: '#1e40af' }}>{demandPendingReceiptCount}</strong>
                <small style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Awaiting signed receipt
                </small>
              </div>
            </div>

            <div
              className={`summary-card-total ${demandFilterTab === 'all' ? 'active-filter' : ''}`}
              onClick={() => setDemandFilterTab('all')}
              style={{ cursor: 'pointer', border: demandFilterTab === 'all' ? '2px solid #0f766e' : '1px solid rgba(15,118,110,0.2)', background: 'linear-gradient(135deg, #fff 0%, #f0fdfa 100%)' }}
            >
              <div className="summary-icon" style={{ background: '#ccfbf1' }}><Calendar size={20} color="#0f766e" /></div>
              <div className="summary-details">
                <span style={{ color: '#0f766e' }}>Total Updates</span>
                <strong style={{ color: '#115e59' }}>{demandUpdateCount}</strong>
                <small style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  All actionable demands
                </small>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '0 4px' }}>
            <div style={{ display: 'inline-flex', gap: 6, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
              <button
                type="button"
                className={`btn btn-sm ${demandFilterTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6 }}
                onClick={() => setDemandFilterTab('all')}
              >
                All Updates ({demandUpdateCount})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${demandFilterTab === 'due' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6, color: demandFilterTab === 'due' ? '#fff' : (demandDueCount > 0 ? '#dc2626' : undefined), fontWeight: demandDueCount > 0 ? 800 : undefined }}
                onClick={() => setDemandFilterTab('due')}
              >
                Follow-up Due ({demandDueCount})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${demandFilterTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '5px 14px', borderRadius: 6 }}
                onClick={() => setDemandFilterTab('pending')}
              >
                Awaiting Receipt ({demandPendingReceiptCount})
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Showing <strong>{filteredDemandUpdates.length}</strong> of <strong>{demandUpdateCount}</strong> record{demandUpdateCount !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table demand-update-table">
              <thead>
                <tr>
                  <th>Current Stage</th>
                  <th>Client Name</th>
                  <th>Collector</th>
                  <th>Relevant Date</th>
                  <th>Status</th>
                  <th>Next Action</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {demandUpdatesLoading ? (
                  <tr className="loading-row"><td colSpan={7}>Loading demand updates...</td></tr>
                ) : filteredDemandUpdates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty-state">
                      {demandFilterTab === 'due'
                        ? 'No demand letters currently due for follow-up.'
                        : demandFilterTab === 'pending'
                        ? 'No demand letters currently pending receipt confirmation.'
                        : 'No demand letter follow-up notifications or pending updates.'}
                    </td>
                  </tr>
                ) : filteredDemandUpdates.map(row => {
                  const today = toDateInputValue(new Date())
                  const status = getDemandStatus(row)
                  const isDue = status === 'Follow-up Due' || status === 'Urgent Action Require' || Boolean(row.date_received && row.follow_up_date && String(row.follow_up_date).slice(0, 10) <= today)

                  return (
                    <tr key={row.id}>
                      <td>{DEMAND_TYPES[row.demand_type]?.label || row.demand_type}</td>
                      <td className="fw-600">{row.client_name}</td>
                      <td>{row.collector_name || '-'}</td>
                      <td>
                        {isDue ? (
                          <span className="demand-update-date" style={{ background: '#fee2e2', color: '#dc2626', fontWeight: 800 }}>
                            Due: {formatDateLong(row.follow_up_date)}
                          </span>
                        ) : (
                          <span className="demand-update-date" style={{ background: '#eff6ff', color: '#2563eb', fontWeight: 700 }}>
                            Sent: {formatDateLong(row.date_sent || row.date_generated)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`demand-status-badge ${getStatusClassName(status)}`}>
                          {status}
                        </span>
                      </td>
                      <td className="demand-next-action-cell">{getDemandNextAction(row)}</td>
                      <td>
                        <div className="demand-action-group">
                          <button className="btn btn-secondary demand-received-btn" onClick={() => openReceivedModal(row)}>
                            {status === 'Awaiting Receipt' ? 'Receive' : 'Update'}
                          </button>
                          {getNextDemandType(row.demand_type) && !['Awaiting Receipt', 'Sent'].includes(status) && (
                            <button className="btn btn-primary demand-advance-btn" onClick={() => openProgressionModal(row)}>
                              <ArrowRightCircle size={14} /> Proceed
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'generate' ? (
        <>
          <div className="page-toolbar demand-letter-toolbar">
            <div className="form-group">
              <label className="form-label">Search Client Code, Last Name, or First Name</label>
              <div className="search-input-wrap" style={{ maxWidth: 'none' }}>
                <Search className="search-icon" size={15} />
                <input
                  className="form-control"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Type client code or name..."
                />
              </div>
            </div>

            <div className="demand-letter-generate">
              <button className="btn btn-primary" onClick={() => setMenuOpen(open => !open)}>
                <FileText size={16} /> Generate <ChevronDown size={15} />
              </button>
              {menuOpen && (
                <div className="demand-letter-menu">
                  {Object.entries(DEMAND_TYPES).filter(([key]) => key !== 'third').map(([key, item]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setType(key)
                        setMenuOpen(false)
                      }}
                    >
                      <FileText size={15} /> {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button className="btn btn-secondary" onClick={handlePrint} disabled={!type || !selectedCustomer || !selectedLoan || savingRecord}>
              <Printer size={16} /> {savingRecord ? 'Saving...' : 'Print'}
            </button>
          </div>

          {error && <div className="login-error">{error}</div>}
          {loading && <div className="text-muted">Searching clients...</div>}

          <div className="demand-letter-stage">
            <div className="card demand-letter-results demand-letter-generated-list">
              <div className="demand-generated-title">Generated</div>
              {results.length > 0 ? (
                results.map(row => (
                  <button
                    key={row.id}
                    className={`demand-client-row${selectedCustomer?.id === row.id ? ' active' : ''}`}
                    onClick={() => handleSelectCustomer(row)}
                  >
                    <span className="mono">{row.customer_code}</span>
                    <strong>{row.full_name}</strong>
                    <span>{row.display_status || row.status || '-'}</span>
                  </button>
                ))
              ) : (
                <div className="empty-state demand-generated-empty">
                  {search.trim() ? 'No generated client found.' : 'Search and generate a demand letter.'}
                </div>
              )}
            </div>

            <div className="demand-letter-preview-wrap">
              {type ? (
                <DemandLetterSheet
                  type={type}
                  customer={selectedCustomer}
                  loan={selectedLoan}
                  computation={computation}
                  previousDemand={previousDemand}
                />
              ) : (
                <div className="demand-letter-empty">Click Generate and choose a demand letter format.</div>
              )}
            </div>

            <div className="demand-letter-side">
              {type ? (
                <div className="card">
                  <div className="card-header">
                    <div>
                      <div className="card-title">{DEMAND_TYPES[type].label}</div>
                      <div className="card-subtitle">Printable 8.5 x 13 demand letter</div>
                    </div>
                  </div>
                  <div className="demand-detail-list">
                    <div className="demand-detail-item"><span>Client</span><strong>{selectedCustomer ? formatClientName(selectedCustomer) : '-'}</strong></div>
                    <div className="demand-detail-item"><span>Collector</span><strong>{selectedLoan?.collector_name || selectedCustomer?.collector_name || '-'}</strong></div>
                    <div className="demand-detail-item"><span>Loan Account No.</span><strong>{selectedLoan?.loan_code || '-'}</strong></div>
                    <div className="demand-detail-item"><span>Maturity Date</span><strong>{formatDateLong(selectedLoan?.date_maturity)}</strong></div>
                    <div className="demand-detail-item demand-asof-field">
                      <span>As of Date</span>
                      <input
                        type="date"
                        className="form-control"
                        value={asOfDate}
                        onChange={e => setAsOfDate(e.target.value)}
                      />
                    </div>
                    <div className="demand-detail-item"><span>Running Balance</span><strong>{formatPhp(computation.runningBalance)}</strong></div>
                    <div className="demand-detail-item"><span>Penalty Charges</span><strong>{formatPhp(computation.totalPenalty)}</strong></div>
                    <div className="demand-detail-item"><span>Total Amount Due</span><strong>{formatPhp(computation.updatedAmountDue)}</strong></div>
                    <div className="demand-detail-item demand-courier-field">
                      <span>Courrier</span>
                      <select
                        className="form-control"
                        value={courier}
                        onChange={e => setCourier(e.target.value)}
                      >
                        <option value="Field Personnel">Field Personnel</option>
                        <option value="Mailed">Mailed</option>
                      </select>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary demand-save-btn"
                    onClick={handleSaveDemand}
                    disabled={!type || !selectedCustomer || !selectedLoan || savingRecord}
                  >
                    <Send size={16} /> {savingRecord ? 'Saving...' : 'Mark as Sent & Add to Monitoring'}
                  </button>
                </div>
              ) : (
                <div className="card">
                  <div className="empty-state">
                    <div className="empty-icon"><FileText size={36} /></div>
                    <p>Select 1st Demand or 2nd Demand from Generate.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="card demand-monitoring-card">
          <div className="demand-monitoring-tabs">
            {MONITORING_TYPES.map(item => (
              <button
                key={item.key}
                className={monitoringType === item.key ? 'active' : ''}
                onClick={() => setMonitoringType(item.key)}
              >
                {item.label}
              </button>
            ))}
            <button className="demand-refresh-btn" onClick={() => loadMonitoring(monitoringType)} disabled={monitoringLoading}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {monitoringError && <div className="login-error" style={{ marginBottom: 12 }}>{monitoringError}</div>}


          <div className="demand-monitoring-filter-bar">
            <div className="filter-group demand-monitoring-search-group">
              <label><Search size={13} style={{ display: 'inline', marginRight: 4 }} /> Search:</label>
              <div className="demand-monitoring-search-wrap">
                <Search className="search-icon" size={14} />
                <input
                  className="form-control demand-monitoring-search-input"
                  value={monitoringSearch}
                  onChange={e => setMonitoringSearch(e.target.value)}
                  placeholder="Client name, loan code, collector..."
                />
              </div>
            </div>

            <MultiSelectFilter
              label="Courrier"
              icon={<Filter size={13} style={{ display: 'inline', marginRight: 4 }} />}
              allLabel="All Courriers"
              options={uniqueCouriers}
              selectedValues={courierFilter}
              onChange={setCourierFilter}
            />

            <MultiSelectFilter
              label="Collector"
              allLabel="All Collectors"
              options={uniqueCollectors}
              selectedValues={collectorFilter}
              onChange={setCollectorFilter}
            />

            <MultiSelectFilter
              label="Status"
              allLabel="All Statuses"
              options={uniqueStatuses}
              selectedValues={statusFilter}
              onChange={setStatusFilter}
            />

            {(monitoringSearch || courierFilter.length > 0 || collectorFilter.length > 0 || statusFilter.length > 0) && (
              <button
                className="btn btn-secondary clear-filter-btn"
                onClick={() => {
                  setMonitoringSearch('')
                  setCourierFilter([])
                  setCollectorFilter([])
                  setStatusFilter([])
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {monitoringError && <div className="login-error" style={{ margin: '12px 24px' }}>{monitoringError}</div>}

          <div className="table-wrapper">
            <table className="data-table demand-monitoring-table">
              <thead>
                <tr>
                  <th>Courrier</th>
                  <th>Collector</th>
                  <th className="sortable-th" onClick={() => handleSort('client_name')} title="Click to sort by Client Name">
                    <div className="th-sort-content">
                      Client Name
                      {sortField === 'client_name' ? (
                        sortOrder === 'asc' ? <ArrowUp size={13} color="#2563eb" /> : <ArrowDown size={13} color="#2563eb" />
                      ) : (
                        <ArrowUpDown size={12} className="sort-icon-muted" />
                      )}
                    </div>
                  </th>
                  <th>Loan Code</th>
                  <th>Penalty Charges</th>
                  <th className="sortable-th" onClick={() => handleSort('date_generated')} title="Click to sort by Date Generated">
                    <div className="th-sort-content">
                      Date Generated
                      {sortField === 'date_generated' ? (
                        sortOrder === 'asc' ? <ArrowUp size={13} color="#2563eb" /> : <ArrowDown size={13} color="#2563eb" />
                      ) : (
                        <ArrowUpDown size={12} className="sort-icon-muted" />
                      )}
                    </div>
                  </th>
                  {monitoringType === 'second' && <th>1st Demand Date</th>}
                  {monitoringType === 'third' && (
                    <>
                      <th>1st Demand Date</th>
                      <th>2nd Demand Date</th>
                    </>
                  )}
                  <th className="sortable-th" onClick={() => handleSort('date_received')} title="Click to sort by Date Received">
                    <div className="th-sort-content">
                      Date Received
                      {sortField === 'date_received' ? (
                        sortOrder === 'asc' ? <ArrowUp size={13} color="#2563eb" /> : <ArrowDown size={13} color="#2563eb" />
                      ) : (
                        <ArrowUpDown size={12} className="sort-icon-muted" />
                      )}
                    </div>
                  </th>
                  <th className="sortable-th" onClick={() => handleSort('follow_up_date')} title="Click to sort by Follow-up Date">
                    <div className="th-sort-content">
                      Follow-up Date
                      {sortField === 'follow_up_date' ? (
                        sortOrder === 'asc' ? <ArrowUp size={13} color="#2563eb" /> : <ArrowDown size={13} color="#2563eb" />
                      ) : (
                        <ArrowUpDown size={12} className="sort-icon-muted" />
                      )}
                    </div>
                  </th>
                  <th>Remarks</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {monitoringLoading ? (
                  <tr className="loading-row"><td colSpan={monitoringColumnCount}>Loading monitoring records...</td></tr>
                ) : filteredAndSortedRows.length === 0 ? (
                  <tr><td colSpan={monitoringColumnCount} className="empty-state">No demand letter transactions found matching the filter.</td></tr>
                ) : filteredAndSortedRows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <input
                        key={`${row.id}-${row.courier || ''}`}
                        className="form-control"
                        defaultValue={row.courier || ''}
                        onBlur={e => updateMonitoringRow(row.id, { courier: e.target.value })}
                      />
                    </td>
                    <td>{row.collector_name || '-'}</td>
                    <td className="fw-600">{row.client_name}</td>
                    <td><span className="demand-loan-code">{row.loan_code || '-'}</span></td>
                    <td><span className="demand-penalty-amount">{formatPhp(row.penalty_charges)}</span></td>
                    <td>{formatDateLong(row.date_generated)}</td>
                    {monitoringType === 'second' && (
                      <td>{row.first_demand_received_date ? formatDateLong(row.first_demand_received_date) : '-'}</td>
                    )}
                    {monitoringType === 'third' && (
                      <>
                        <td>{row.first_demand_received_date ? formatDateLong(row.first_demand_received_date) : '-'}</td>
                        <td>{row.second_demand_received_date ? formatDateLong(row.second_demand_received_date) : '-'}</td>
                      </>
                    )}
                    <td>{row.date_received ? formatDateLong(row.date_received) : '-'}</td>
                    <td>{row.follow_up_date ? formatDateLong(row.follow_up_date) : '-'}</td>
                    <td className="demand-remarks-cell">{row.remarks || '-'}</td>
                    <td>
                      <span className={`demand-status-badge ${getStatusClassName(getDemandStatus(row))}`}>
                        {getDemandStatus(row)}
                      </span>
                    </td>
                    <td>
                      <div className="demand-action-group">
                        <button className="btn btn-secondary demand-received-btn" onClick={() => openReceivedModal(row)}>
                          {row.date_received ? 'Update' : 'Receive'}
                        </button>
                        {getNextDemandType(row.demand_type) && !['Superseded', 'Awaiting Receipt', 'Sent'].includes(getDemandStatus(row)) && (
                          <button className="btn btn-primary demand-advance-btn" onClick={() => openProgressionModal(row)}>
                            <ArrowRightCircle size={13} /> Proceed
                          </button>
                        )}
                        <button className="demand-delete-btn" title="Delete record" onClick={() => openDeleteModal(row)}>
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="modal-overlay demand-modal-overlay" onMouseDown={e => e.target === e.currentTarget && !deleteModal.deleting && setDeleteModal(null)}>
          <div className="modal demand-received-modal demand-delete-modal">
            <div className="modal-header">
              <span className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626' }}>
                <AlertTriangle size={20} color="#dc2626" /> Confirm Deletion
              </span>
              <button className="modal-close" onClick={() => setDeleteModal(null)} disabled={deleteModal.deleting}>x</button>
            </div>
            <div className="modal-body">
              {deleteModal.error && <div className="login-error" style={{ marginBottom: 14 }}>{deleteModal.error}</div>}
              <div className="demand-delete-confirm-box">
                <p>Are you sure you want to delete this demand letter record?</p>
                <div className="demand-delete-details">
                  <div><span>Client Name:</span> <strong>{deleteModal.client_name}</strong></div>
                  <div><span>Demand Type:</span> <strong>{DEMAND_TYPES[deleteModal.demand_type]?.label || deleteModal.demand_type}</strong></div>
                  <div><span>Date Generated:</span> <strong>{formatDateLong(deleteModal.date_generated)}</strong></div>
                  {deleteModal.collector_name && <div><span>Collector:</span> <strong>{deleteModal.collector_name}</strong></div>}
                </div>
                <div className="demand-delete-warning">
                  ⚠️ This action cannot be undone.
                </div>
              </div>
              <div className="demand-modal-actions">
                <button className="btn btn-secondary" onClick={() => setDeleteModal(null)} disabled={deleteModal.deleting}>
                  Cancel
                </button>
                <button className="btn demand-modal-danger-btn" onClick={handleDeleteDemand} disabled={deleteModal.deleting}>
                  {deleteModal.deleting ? 'Deleting...' : 'Yes, Delete Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {successModal && (
        <div className="modal-overlay demand-modal-overlay" onMouseDown={e => e.target === e.currentTarget && setSuccessModal(null)}>
          <div className="modal demand-feedback-modal">
            <div className="modal-header">
              <span className="modal-title">{successModal.title}</span>
              <button className="modal-close" onClick={() => setSuccessModal(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className="demand-success-message">{successModal.message}</div>
              <button className="btn btn-primary demand-modal-primary" onClick={() => setSuccessModal(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {errorModal && (
        <div className="modal-overlay demand-modal-overlay" onMouseDown={e => e.target === e.currentTarget && setErrorModal(null)}>
          <div className={`modal demand-feedback-modal demand-error-modal${errorModal.variant === 'warning' ? ' demand-warning-modal' : ''}`}>
            <div className="modal-header">
              <span className="modal-title">
                {errorModal.variant === 'warning' && <AlertTriangle size={20} />}
                {errorModal.title}
              </span>
              <button className="modal-close" onClick={() => setErrorModal(null)}>x</button>
            </div>
            <div className="modal-body">
              <div className={errorModal.variant === 'warning' ? 'demand-warning-message' : 'demand-error-message'}>{errorModal.message}</div>
              <button className="btn btn-primary demand-modal-primary" onClick={() => setErrorModal(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {progressionModal && (
        <div className="modal-overlay demand-modal-overlay" onMouseDown={e => e.target === e.currentTarget && !progressionModal.saving && setProgressionModal(null)}>
          <div className="modal demand-received-modal demand-progression-modal">
            <div className="modal-header">
              <span className="modal-title">
                Advance to {DEMAND_TYPES[progressionModal.next_demand_type]?.label} — {progressionModal.client_name}
              </span>
              <button className="modal-close" onClick={() => setProgressionModal(null)} disabled={progressionModal.saving}>x</button>
            </div>
            <div className="modal-body">
              {progressionModal.error && <div className="login-error" style={{ marginBottom: 14 }}>{progressionModal.error}</div>}
              <div className="demand-progression-summary">
                <span>{DEMAND_TYPES[progressionModal.demand_type]?.label}</span>
                <ArrowRightCircle size={20} />
                <strong>{DEMAND_TYPES[progressionModal.next_demand_type]?.label}</strong>
                <em>Awaiting Receipt</em>
              </div>
              <div className="demand-received-grid">
                <div className="form-group">
                  <label className="form-label">Date Sent</label>
                  <input
                    type="date"
                    className="form-control"
                    value={progressionModal.date_sent || ''}
                    onChange={e => setProgressionModal(prev => ({ ...prev, date_sent: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery Method</label>
                  <select
                    className="form-control"
                    value={progressionModal.courier || ''}
                    onChange={e => setProgressionModal(prev => ({ ...prev, courier: e.target.value }))}
                  >
                    <option value="Field Personnel">Field Personnel</option>
                    <option value="Mailed">Mailed</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Remarks</label>
                <textarea
                  className="form-control demand-received-remarks"
                  value={progressionModal.remarks || ''}
                  onChange={e => setProgressionModal(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Example: Second demand sent through field personnel."
                />
              </div>
              <div className="demand-progression-note">
                The current demand will be marked Superseded. The next demand will appear in Monitoring as Awaiting Receipt.
              </div>
              <div className="demand-modal-actions">
                <button className="btn btn-secondary" onClick={() => setProgressionModal(null)} disabled={progressionModal.saving}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={saveDemandProgression} disabled={!progressionModal.date_sent || progressionModal.saving}>
                  <Send size={15} /> {progressionModal.saving ? 'Updating...' : `Confirm ${DEMAND_TYPES[progressionModal.next_demand_type]?.label}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {receivedModal && (
        <div className="modal-overlay demand-modal-overlay" onMouseDown={e => e.target === e.currentTarget && !receivedModal.saving && setReceivedModal(null)}>
          <div className="modal demand-received-modal">
            <div className="modal-header">
              <span className="modal-title">Received Demand - {receivedModal.client_name}</span>
              <button className="modal-close" onClick={() => setReceivedModal(null)} disabled={receivedModal.saving}>x</button>
            </div>
            <div className="modal-body">
              {receivedModal.error && <div className="login-error" style={{ marginBottom: 14 }}>{receivedModal.error}</div>}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Courrier</label>
                <select
                  className="form-control"
                  value={receivedModal.courier || 'Field Personnel'}
                  onChange={e => updateReceivedForm({ courier: e.target.value })}
                >
                  <option value="Field Personnel">Field Personnel</option>
                  <option value="Mailed">Mailed</option>
                  {receivedModal.courier && receivedModal.courier !== 'Field Personnel' && receivedModal.courier !== 'Mailed' && (
                    <option value={receivedModal.courier}>{receivedModal.courier}</option>
                  )}
                </select>
              </div>
              <div className="demand-received-grid">
                <div className="form-group">
                  <label className="form-label">Date Received</label>
                  <input
                    type="date"
                    className="form-control"
                    value={receivedModal.date_received || ''}
                    onChange={e => updateReceivedForm({ date_received: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Follow-up Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={receivedModal.follow_up_date || ''}
                    readOnly
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Remarks</label>
                <textarea
                  className="form-control demand-received-remarks"
                  value={receivedModal.remarks || ''}
                  onChange={e => updateReceivedForm({ remarks: e.target.value })}
                  placeholder="Input client remarks..."
                />
              </div>
              <div className="demand-modal-actions">
                <button className="btn btn-secondary" onClick={() => setReceivedModal(null)} disabled={receivedModal.saving}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={saveReceivedDetails} disabled={!receivedModal.date_received || receivedModal.saving}>
                  {receivedModal.saving ? 'Saving...' : 'Save Received'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
