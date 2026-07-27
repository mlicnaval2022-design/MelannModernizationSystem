import { useEffect, useMemo, useState } from 'react'
import API from '../services/api'
import letterHeadImg from '../assets/new-letter-head-logo.jpg'
import './DemandLetter.css'
import { ChevronDown, FileText, Printer, RefreshCw, Search } from 'lucide-react'

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

const DEMAND_STATUSES = ['Generated', 'Delivered', 'Received', 'For Follow-up', 'Closed']

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

const buildAddressParts = (customer) => [
  customer?.address,
  customer?.sitio,
  customer?.purok,
  customer?.brgy,
  customer?.city,
  customer?.province,
  customer?.zip_code,
].map(part => String(part || '').trim()).filter(Boolean)

const isGoodPayment = (payment) => {
  const statusText = String(payment.status || payment.payment_status || 'active').toLowerCase()
  return !['cancelled', 'canceled', 'void', 'reversed', 'bad', 'bounced', 'penalty'].includes(statusText)
}

const getLoanPayments = (loan, payments) => (payments || [])
  .filter(p => (p.loan_id === loan?.id || p.loan_code === loan?.loan_code) && isGoodPayment(p))
  .map(p => ({ ...p, paidDate: parseLocalDate(p.date_paid), amount: Number(p.amount_paid || 0) }))
  .filter(p => p.paidDate)
  .sort((a, b) => a.paidDate - b.paidDate)

const getPenaltyComputation = (loan, payments) => {
  const dueDate = parseLocalDate(loan?.date_maturity)
  const datePrepared = new Date()
  const principal = Number(loan?.principal || 0)
  const interestAmount = Number(loan?.interest_amount || 0)
  const registeredOutstanding = Number(loan?.total_amortization || 0) || principal + interestAmount || Number(loan?.balance || 0)
  const loanPayments = getLoanPayments(loan, payments)

  if (!dueDate) {
    return {
      datePrepared,
      registeredOutstanding,
      paymentsBeforeDue: 0,
      beginningOverdueBalance: registeredOutstanding,
      remainingOverdueBalance: registeredOutstanding,
      totalPenalty: 0,
      updatedAmountDue: registeredOutstanding,
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
        .filter(p => p.paidDate > periodStart && p.paidDate <= periodEnd)
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
    paymentsBeforeDue,
    beginningOverdueBalance: Math.max(0, registeredOutstanding - paymentsBeforeDue),
    remainingOverdueBalance: beginningBalance,
    totalPenalty,
    updatedAmountDue: beginningBalance + totalPenalty,
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

function DemandLetterSheet({ type, customer, loan, computation }) {
  const fullName = formatClientName(customer)
  const addressParts = buildAddressParts(customer)
  const today = computation?.datePrepared || new Date()
  const salutation = `${customer?.sex === 'Male' ? 'MR.' : 'MR./MS.'} ${getLastName(customer)}`.trim()
  const principalBalance = computation?.beginningOverdueBalance || 0
  const penaltyCharges = computation?.totalPenalty || 0
  const totalDue = computation?.updatedAmountDue || 0

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
              demand letter dated <u>{formatDateLong(today)}</u>.
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
              <th>Beginning Overdue</th>
              <td>:</td>
              <td>PHP</td>
              <td>{formatPhpNumber(principalBalance)}</td>
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
  const [activeTab, setActiveTab] = useState('generate')
  const [type, setType] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [courier, setCourier] = useState('Field Personnel')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [payments, setPayments] = useState([])
  const [error, setError] = useState('')
  const [monitoringType, setMonitoringType] = useState('first')
  const [monitoringRows, setMonitoringRows] = useState([])
  const [monitoringLoading, setMonitoringLoading] = useState(false)
  const [monitoringError, setMonitoringError] = useState('')
  const [savingRecord, setSavingRecord] = useState(false)

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

  useEffect(() => {
    document.body.classList.add('demand-letter-printing')
    return () => document.body.classList.remove('demand-letter-printing')
  }, [])

  const computation = useMemo(() => getPenaltyComputation(selectedLoan, payments), [selectedLoan, payments])

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
  }, [activeTab, monitoringType])

  const handleSelectCustomer = async (row) => {
    setError('')
    setSelectedCustomer(null)
    setSelectedLoan(null)
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
      courier,
      status: 'Generated',
    })
    return res.data
  }

  const handleSaveDemand = async () => {
    if (!type || !selectedCustomer || !selectedLoan) return
    setSavingRecord(true)
    setError('')
    try {
      await saveDemandRecord()
      await loadMonitoring(type)
      setMonitoringType(type)
      setActiveTab('monitoring')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save demand letter transaction')
    } finally {
      setSavingRecord(false)
    }
  }

  const handlePrint = async () => {
    if (!type || !selectedCustomer || !selectedLoan) return
    setSavingRecord(true)
    setError('')
    try {
      await saveDemandRecord()
      if (activeTab === 'monitoring') loadMonitoring(type)
      setTimeout(() => window.print(), 100)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save demand letter transaction')
    } finally {
      setSavingRecord(false)
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

  return (
    <div className="demand-letter-page">
      <div className="demand-module-tabs">
        <button className={activeTab === 'generate' ? 'active' : ''} onClick={() => setActiveTab('generate')}>Generate Demand</button>
        <button className={activeTab === 'monitoring' ? 'active' : ''} onClick={() => setActiveTab('monitoring')}>Monitoring</button>
      </div>

      {activeTab === 'generate' ? (
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

          {results.length > 0 && (
            <div className="card demand-letter-results">
              {results.map(row => (
                <button
                  key={row.id}
                  className={`demand-client-row${selectedCustomer?.id === row.id ? ' active' : ''}`}
                  onClick={() => handleSelectCustomer(row)}
                >
                  <span className="mono">{row.customer_code}</span>
                  <strong>{row.full_name}</strong>
                  <span>{row.display_status || row.status || '-'}</span>
                </button>
              ))}
            </div>
          )}

          <div className="demand-letter-stage">
            <div className="demand-letter-preview-wrap">
              {type ? (
                <DemandLetterSheet
                  type={type}
                  customer={selectedCustomer}
                  loan={selectedLoan}
                  computation={computation}
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
                    <div className="demand-detail-item"><span>As of Date</span><strong>{formatDateLong(computation.datePrepared)}</strong></div>
                    <div className="demand-detail-item"><span>Beginning Overdue</span><strong>{formatPhp(computation.beginningOverdueBalance)}</strong></div>
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
                    <FileText size={16} /> {savingRecord ? 'Saving...' : 'Save'}
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

          <div className="table-wrapper">
            <table className="data-table demand-monitoring-table">
              <thead>
                <tr>
                  <th>Courrier</th>
                  <th>Collector</th>
                  <th>Client Name</th>
                  <th>Date Generated</th>
                  <th>Date Received</th>
                  <th>Follow-up Date</th>
                  <th>Remarks</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {monitoringLoading ? (
                  <tr className="loading-row"><td colSpan={8}>Loading monitoring records...</td></tr>
                ) : monitoringRows.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">No demand letter transactions found.</td></tr>
                ) : monitoringRows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <input
                        className="form-control"
                        defaultValue={row.courier || ''}
                        onBlur={e => updateMonitoringRow(row.id, { courier: e.target.value })}
                      />
                    </td>
                    <td>{row.collector_name || '-'}</td>
                    <td className="fw-600">{row.client_name}</td>
                    <td>{formatDateLong(row.date_generated)}</td>
                    <td>
                      <input
                        type="date"
                        className="form-control"
                        value={row.date_received || ''}
                        onChange={e => updateMonitoringRow(row.id, { date_received: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-control"
                        value={row.follow_up_date || ''}
                        onChange={e => updateMonitoringRow(row.id, { follow_up_date: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="form-control"
                        defaultValue={row.remarks || ''}
                        onBlur={e => updateMonitoringRow(row.id, { remarks: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="form-control"
                        value={row.status || 'Generated'}
                        onChange={e => updateMonitoringRow(row.id, { status: e.target.value })}
                      >
                        {DEMAND_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
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
