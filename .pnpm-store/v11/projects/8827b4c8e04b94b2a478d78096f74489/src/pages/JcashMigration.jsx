import { Fragment, useMemo, useState } from 'react'
import { CheckSquare, Database, Download, FileText, RefreshCw, Square, Trash2, X } from 'lucide-react'
import API from '../services/api'
import './JcashMigration.css'

const money = value => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const valueOrDash = value => value || '-'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function JcashMigration() {
  const [from, setFrom] = useState('2017-01-01')
  const [to, setTo] = useState('2017-12-31')
  const [password, setPassword] = useState('')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [provider, setProvider] = useState('')
  const [source, setSource] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [scanning, setScanning] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [soaRow, setSoaRow] = useState(null)

  const selectedRows = useMemo(() => rows.filter(row => selected.has(row.loan.loan_code)), [rows, selected])
  const allSelected = rows.length > 0 && selected.size === rows.length
  const amountTotals = useMemo(() => rows.reduce((totals, row) => {
    totals.principal += Number(row.loan.principal || 0)
    totals.loan += Number(row.loan.total_amortization || 0)
    totals.balance += Number(row.loan.balance || 0)
    return totals
  }, { principal: 0, loan: 0, balance: 0 }), [rows])
  const collectorGroups = useMemo(() => {
    const grouped = new Map()
    for (const row of rows) {
      const collector = row.loan.collector_name || row.customer.collector_name || 'Unassigned Collector'
      if (!grouped.has(collector)) grouped.set(collector, {
        collector,
        rows: [],
        principal: 0,
        loan: 0,
        balance: 0,
        payments: 0,
      })
      const group = grouped.get(collector)
      group.rows.push(row)
      group.principal += Number(row.loan.principal || 0)
      group.loan += Number(row.loan.total_amortization || 0)
      group.balance += Number(row.loan.balance || 0)
      group.payments += Number(row.payment_count || 0)
    }
    return Array.from(grouped.values()).sort((a, b) => a.collector.localeCompare(b.collector))
  }, [rows])

  const scan = async () => {
    setError('')
    setNotice('')
    setScanning(true)
    try {
      const { data } = await API.post('/jcash-migration/scan', { from, to, password })
      setRows(data.rows || [])
      setSummary(data.summary || null)
      setProvider(data.provider || '')
      setSource(data.source || '')
      setSelected(new Set((data.rows || []).map(row => row.loan.loan_code)))
      setNotice(`Scan complete as of ${todayIso()}. Review the rows before migration.`)
    } catch (err) {
      setRows([])
      setSummary(null)
      setSelected(new Set())
      setError(err.response?.data?.error || 'Failed to scan jcashdb.mdb.')
    } finally {
      setScanning(false)
    }
  }

  const toggleAll = () => {
    setSelected(prev => prev.size === rows.length ? new Set() : new Set(rows.map(row => row.loan.loan_code)))
  }

  const toggleOne = loanCode => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(loanCode)) next.delete(loanCode)
      else next.add(loanCode)
      return next
    })
  }

  const removePreviewRow = loanCode => {
    setRows(prev => prev.filter(row => row.loan.loan_code !== loanCode))
    setSelected(prev => {
      const next = new Set(prev)
      next.delete(loanCode)
      return next
    })
  }

  const migrate = async () => {
    if (selectedRows.length === 0) {
      setError('Select at least one loan to migrate.')
      return
    }
    setError('')
    setNotice('')
    setMigrating(true)
    try {
      const { data } = await API.post('/jcash-migration/migrate', {
        from,
        to,
        password,
        loan_codes: selectedRows.map(row => row.loan.loan_code),
      })
      setNotice(`Migration complete. Loans inserted: ${data.loans_inserted}, loans updated: ${data.loans_updated}, payments inserted: ${data.payments_inserted}.`)
      setRows(prev => prev.map(row => selected.has(row.loan.loan_code) ? { ...row, exists: true } : row))
      setSummary(prev => prev ? { ...prev, existing_loans: Math.max(prev.existing_loans || 0, selected.size) } : prev)
    } catch (err) {
      setError(err.response?.data?.error || 'Migration failed.')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="jcash-page">
      <div className="jcash-hero">
        <div>
          <div className="jcash-eyebrow">Read-only Access database migration</div>
          <h1>JCash Migration</h1>
          <p>Scan Good status loans by Date Release, review the rows, then migrate only the selected clients and payments.</p>
        </div>
        <div className="jcash-hero-mark">
          <Database size={34} />
        </div>
      </div>

      <div className="jcash-toolbar">
        <div className="form-group jcash-field">
          <label className="form-label">From Date Release</label>
          <input type="date" className="form-control" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="form-group jcash-field">
          <label className="form-label">To Date Release</label>
          <input type="date" className="form-control" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="form-group jcash-field jcash-password-field">
          <label className="form-label">JCash DB Password</label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Required if jcashdb.mdb is protected"
            autoComplete="off"
          />
        </div>
        <button className="btn btn-primary jcash-scan-btn" onClick={scan} disabled={scanning || migrating}>
          <Database size={15} /> {scanning ? 'Scanning...' : 'Scan JCash Database'}
        </button>
        <button className="btn btn-success jcash-migrate-btn" onClick={migrate} disabled={migrating || scanning || selectedRows.length === 0}>
          <Download size={15} /> {migrating ? 'Migrating...' : `Migrate Selected (${selectedRows.length})`}
        </button>
      </div>

      {error && <div className="login-error jcash-alert jcash-alert-error">{error}</div>}
      {notice && (
        <div className="jcash-alert jcash-alert-success">
          {notice}
        </div>
      )}

      <div className="jcash-metrics">
        <div className="jcash-metric jcash-metric-ink"><div className="jcash-metric-label">Loans Found</div><div className="jcash-metric-value">{summary?.loans || 0}</div><div className="jcash-metric-sub">Good status only</div></div>
        <div className="jcash-metric jcash-metric-green"><div className="jcash-metric-label">Clients</div><div className="jcash-metric-value">{summary?.customers || 0}</div><div className="jcash-metric-sub">Matched personal info</div></div>
        <div className="jcash-metric jcash-metric-gold"><div className="jcash-metric-label">Payments</div><div className="jcash-metric-value">{summary?.payments || 0}</div><div className="jcash-metric-sub">Good payment status only</div></div>
        <div className="jcash-metric jcash-metric-violet"><div className="jcash-metric-label">Existing Loans</div><div className="jcash-metric-value">{summary?.existing_loans || 0}</div><div className="jcash-metric-sub">Will update, not duplicate</div></div>
        <div className="jcash-metric jcash-metric-blue"><div className="jcash-metric-label">Total Principal</div><div className="jcash-metric-value jcash-money-value">{money(amountTotals.principal)}</div><div className="jcash-metric-sub">Visible preview rows</div></div>
        <div className="jcash-metric jcash-metric-cyan"><div className="jcash-metric-label">Total Loan</div><div className="jcash-metric-value jcash-money-value">{money(amountTotals.loan)}</div><div className="jcash-metric-sub">Visible preview rows</div></div>
        <div className="jcash-metric jcash-metric-red"><div className="jcash-metric-label">Total Balance</div><div className="jcash-metric-value jcash-money-value">{money(amountTotals.balance)}</div><div className="jcash-metric-sub">Visible preview rows</div></div>
      </div>

      <div className="card jcash-preview-card">
        <div className="card-header jcash-preview-header">
          <div>
            <div className="card-title">JCash Migration Preview</div>
            <div className="card-subtitle">{provider ? `Read-only provider: ${provider}` : 'Select a date range then scan.'}{source ? ` Source: ${source}` : ''}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={scan} disabled={scanning || migrating || !rows.length}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className="table-wrapper jcash-table-wrap">
          <table className="data-table jcash-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}>
                  <button className="btn btn-secondary btn-sm" onClick={toggleAll} disabled={!rows.length} title={allSelected ? 'Unselect all' : 'Select all'} style={{ padding: 5 }}>
                    {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                </th>
                <th>Loan Code</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Date Release</th>
                <th>Maturity</th>
                <th>Period</th>
                <th className="text-right">Principal</th>
                <th className="text-right">Total Loan</th>
                <th className="text-right">Amortization</th>
                <th className="text-right">Balance</th>
                <th className="text-right">Payments</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {scanning ? (
                <tr className="loading-row"><td colSpan={13}>Scanning jcashdb.mdb in read-only mode...</td></tr>
              ) : rows.length === 0 ? (
                <tr className="loading-row"><td colSpan={13}>No scanned rows yet.</td></tr>
              ) : collectorGroups.map(group => (
                <Fragment key={group.collector}>
                  <tr key={`${group.collector}-group`} className="jcash-collector-row">
                    <td colSpan={13}>
                      <div className="jcash-collector-heading">
                        <div>
                          <span className="jcash-collector-name">{group.collector}</span>
                          <span className="jcash-collector-count">{group.rows.length} loans</span>
                        </div>
                        <div className="jcash-collector-totals">
                          <span>Principal: {money(group.principal)}</span>
                          <span>Total Loan: {money(group.loan)}</span>
                          <span>Balance: {money(group.balance)}</span>
                          <span>Payments: {group.payments}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {group.rows.map(row => {
                    const loan = row.loan
                    const customer = row.customer
                    const loanCode = loan.loan_code
                    return (
                      <tr key={loanCode}>
                        <td>
                          <input type="checkbox" checked={selected.has(loanCode)} onChange={() => toggleOne(loanCode)} />
                        </td>
                        <td><span className="mono">{loanCode}</span>{row.exists && <span className="tag" style={{ marginLeft: 6 }}>Existing</span>}</td>
                        <td>
                          <div className="fw-600">{customer.full_name}</div>
                          <div className="text-muted mono">{customer.customer_code}</div>
                        </td>
                        <td>{loan.loan_type}</td>
                        <td>{loan.date_released}</td>
                        <td>{loan.date_maturity || '-'}</td>
                        <td>{loan.loan_period || '-'}</td>
                        <td className="text-right">{money(loan.principal)}</td>
                        <td className="text-right">{money(loan.total_amortization)}</td>
                        <td className="text-right">{money(loan.amortization)}</td>
                        <td className="text-right fw-600">{money(loan.balance)}</td>
                        <td className="text-right">
                          <div className="fw-600">{row.payment_count}</div>
                          <div className="text-muted">{money(row.payment_total)}</div>
                        </td>
                        <td>
                          <div className="jcash-row-actions">
                            <button className="btn btn-secondary btn-sm jcash-soa-btn" onClick={() => setSoaRow(row)} title="View scanned SOA">
                              <FileText size={14} /> SOA
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => removePreviewRow(loanCode)} title="Remove from preview">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {soaRow && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setSoaRow(null)}>
          <div className="modal jcash-soa-modal">
            <div className="modal-header">
              <span className="modal-title"><FileText size={18} /> Scanned SOA - {soaRow.loan.loan_code}</span>
              <button className="modal-close" onClick={() => setSoaRow(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="jcash-soa-summary">
                <div>
                  <div className="jcash-soa-label">Client</div>
                  <div className="jcash-soa-main">{soaRow.customer.full_name}</div>
                  <div className="text-muted mono">{soaRow.customer.customer_code}</div>
                </div>
                <div>
                  <div className="jcash-soa-label">Collector</div>
                  <div className="jcash-soa-main">{soaRow.loan.collector_name || soaRow.customer.collector_name || '-'}</div>
                </div>
                <div>
                  <div className="jcash-soa-label">Balance</div>
                  <div className="jcash-soa-main">{money(soaRow.loan.balance)}</div>
                </div>
              </div>

              <div className="jcash-soa-grid">
                <div className="jcash-soa-section">
                  <h3>Personal Information</h3>
                  <dl>
                    <div><dt>Last Name</dt><dd>{valueOrDash(soaRow.customer.last_name)}</dd></div>
                    <div><dt>First Name</dt><dd>{valueOrDash(soaRow.customer.first_name)}</dd></div>
                    <div><dt>Middle Name</dt><dd>{valueOrDash(soaRow.customer.middle_name)}</dd></div>
                    <div><dt>Gender</dt><dd>{valueOrDash(soaRow.customer.gender)}</dd></div>
                    <div><dt>Birthdate</dt><dd>{valueOrDash(soaRow.customer.birth_date)}</dd></div>
                    <div><dt>Civil Status</dt><dd>{valueOrDash(soaRow.customer.civil_status)}</dd></div>
                    <div><dt>Nationality</dt><dd>{valueOrDash(soaRow.customer.nationality)}</dd></div>
                    <div><dt>Contact Number</dt><dd>{valueOrDash(soaRow.customer.contact)}</dd></div>
                    <div><dt>Email Address</dt><dd>{valueOrDash(soaRow.customer.email)}</dd></div>
                    <div><dt>Business</dt><dd>{valueOrDash(soaRow.customer.business_name || soaRow.customer.occupation)}</dd></div>
                    <div><dt>Monthly Income</dt><dd>{money(soaRow.customer.income_per_month)}</dd></div>
                    <div><dt>Monthly Expenses</dt><dd>{money(soaRow.customer.expenses_per_month)}</dd></div>
                    <div><dt>Purpose</dt><dd>{valueOrDash(soaRow.customer.loan_purpose)}</dd></div>
                    <div><dt>ID Information</dt><dd>{valueOrDash([soaRow.customer.id_type, soaRow.customer.id_number].filter(Boolean).join(' - '))}</dd></div>
                    <div><dt>Facebook Account</dt><dd>{valueOrDash(soaRow.customer.fb_account)}</dd></div>
                  </dl>
                </div>

                <div className="jcash-soa-section">
                  <h3>Loan Information</h3>
                  <dl>
                    <div><dt>Loan Code</dt><dd>{soaRow.loan.loan_code}</dd></div>
                    <div><dt>Type</dt><dd>{valueOrDash(soaRow.loan.loan_type)}</dd></div>
                    <div><dt>Date Release</dt><dd>{valueOrDash(soaRow.loan.date_released)}</dd></div>
                    <div><dt>Maturity</dt><dd>{valueOrDash(soaRow.loan.date_maturity)}</dd></div>
                    <div><dt>Period</dt><dd>{valueOrDash(soaRow.loan.loan_period)}</dd></div>
                    <div><dt>Principal</dt><dd>{money(soaRow.loan.principal)}</dd></div>
                    <div><dt>Interest Rate</dt><dd>{money(soaRow.loan.interest_rate)}</dd></div>
                    <div><dt>Total Loan</dt><dd>{money(soaRow.loan.total_amortization)}</dd></div>
                    <div><dt>Payment per Day</dt><dd>{money(soaRow.loan.amortization)}</dd></div>
                    <div><dt>Balance</dt><dd>{money(soaRow.loan.balance)}</dd></div>
                    <div><dt>Payment Count</dt><dd>{soaRow.payment_count}</dd></div>
                    <div><dt>Payment Total</dt><dd>{money(soaRow.payment_total)}</dd></div>
                  </dl>
                </div>
              </div>

              <div className="jcash-soa-section jcash-payment-section">
                <h3>Payment Information</h3>
                <div className="table-wrapper">
                  <table className="data-table jcash-payments-table">
                    <thead>
                      <tr>
                        <th>OR Number</th>
                        <th>Date Paid</th>
                        <th className="text-right">Amount</th>
                        <th className="text-right">Balance Before</th>
                        <th className="text-right">Balance After</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {soaRow.payments.length === 0 ? (
                        <tr className="loading-row"><td colSpan={6}>No Good status payments found for this loan.</td></tr>
                      ) : soaRow.payments.map(payment => (
                        <tr key={`${payment.source_id || payment.or_number}-${payment.date_paid}-${payment.amount_paid}`}>
                          <td>{valueOrDash(payment.or_number)}</td>
                          <td>{valueOrDash(payment.date_paid)}</td>
                          <td className="text-right">{money(payment.amount_paid)}</td>
                          <td className="text-right">{money(payment.balance_before)}</td>
                          <td className="text-right">{money(payment.balance_after)}</td>
                          <td><span className="tag">Good</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
