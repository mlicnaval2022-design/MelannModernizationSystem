import { useEffect, useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const EMPTY = { customer_id: '', collector_id: '', branch_id: '', loan_type: 'New', principal: '', interest_rate: '15', loan_period: '45', date_released: new Date().toISOString().split('T')[0], or_number: '', remarks: '' }

export default function CreditScoring() {
  const { hasRole } = useAuth()
  const [rows, setRows] = useState([])
  const [customers, setCustomers] = useState([])
  const [collectors, setCollectors] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('pending') // Default to pending CI
  const [loading, setLoading] = useState(true)
  
  const [appModal, setAppModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientCodeInput, setClientCodeInput] = useState('')

  const [ciModal, setCiModal] = useState(false)
  const [ciLoan, setCiLoan] = useState(null)
  const [ciForm, setCiForm] = useState({})
  
  const hc = (f) => (e) => setCiForm(prev => ({...prev, [f]: e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value}))

  const load = () => { setLoading(true); API.get('/loans', { params: { search, status } }).then(r => setRows(r.data)).finally(() => setLoading(false)) }
  useEffect(() => { load() }, [search, status])
  useEffect(() => {
    API.get('/customers', { params: { status: 'active' } }).then(r => setCustomers(r.data))
    API.get('/collectors').then(r => setCollectors(r.data))
  }, [])

  const handleClientCodeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!clientCodeInput.trim()) return
      const c = customers.find(x => String(x.customer_code).toLowerCase() === String(clientCodeInput).trim().toLowerCase())
      if (c) {
        setForm(f => ({ ...f, customer_id: c.id, collector_id: c.collector_id || '' }))
        setError('')
      } else {
        setError('Client code not found. Please verify and try again.')
      }
    }
  }

  const handleCustomerSelect = (e) => {
    const c_id = e.target.value
    const c = customers.find(x => String(x.id) === String(c_id))
    setForm(f => ({ ...f, customer_id: c_id, collector_id: c ? (c.collector_id || '') : '' }))
    setClientCodeInput(c ? c.customer_code : '')
    setError('')
  }

  const handleAppSave = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await API.post('/loans', form)
      setAppModal(false)
      setForm(EMPTY)
      setClientCodeInput('')
      load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving application') }
    finally { setSaving(false) }
  }

  const getCreditAssessment = () => {
    if (!ciLoan) return { score: 0, level: '🔴 Very High Risk', recommendation: 'DECLINE', redFlags: 0, disposableIncome: 0, color: 'var(--accent-danger)' };
    
    let score = 0;
    let redFlags = 0;

    const netIncome = (Number(ciForm.daily_sales||0) + Number(ciForm.other_income||0)) - (Number(ciForm.daily_expenses||0) + Number(ciForm.other_loans||0));
    const householdExpenses = ['electricity','water','internet','transport','rental','food','appliances','allowance','tuition','misc'].reduce((s, f) => s + Number(ciForm[`exp_${f}`] || 0), 0);
    const disposableIncome = netIncome - householdExpenses;
    const proposed = ciLoan.amortization;

    if (disposableIncome < 0) redFlags++;

    if (proposed > 0) {
      const ratio = disposableIncome / proposed;
      if (ratio >= 3) score += 20;
      else if (ratio >= 2) score += 15;
      else if (ratio >= 1.5) score += 10;
    }

    if (ciForm.no_hardship === 'yes' || (!ciForm.no_hardship && disposableIncome >= proposed)) score += 10;

    if (ciForm.business_years === '> 3 years') score += 10;
    else if (ciForm.business_years === '1-3 years') score += 5;

    if (ciForm.check_location) score += 5;
    if (ciForm.check_activity) score += 5;
    if (ciForm.check_residency) score += 5;
    if (ciForm.check_borrowing) score += 5;
    if (ciForm.check_permit) score += 5;
    if (ciForm.check_purpose) score += 5;
    if (ciForm.check_source) score += 3;
    if (ciForm.check_consent) score += 2;

    if (ciForm.loan_history === 'No past due history') score += 15;
    else if (ciForm.loan_history === 'Minor past due history') score += 10;
    else if (ciForm.loan_history === 'Multiple past due accounts') score += 5;
    else if (ciForm.loan_history === 'Active delinquent account') redFlags++;

    if (ciForm.flag_false_info) redFlags++;
    if (ciForm.flag_no_business) redFlags++;
    if (ciForm.flag_no_residence) redFlags++;
    if (ciForm.flag_excessive_borrowing) redFlags++;

    if (ciForm.endorsement === 'approve') score += 10;
    else if (ciForm.endorsement === 'reduce') score += 7;
    else if (ciForm.endorsement === 'defer') score += 3;

    let level = '';
    let recommendation = '';
    let color = '';

    if (score >= 90) { level = '🟢 Excellent Borrower'; recommendation = 'APPROVE'; color = 'var(--accent-success)'; }
    else if (score >= 80) { level = '🟢 Low Risk'; recommendation = 'APPROVE'; color = 'var(--accent-success)'; }
    else if (score >= 70) { level = '🟡 Moderate Risk'; recommendation = 'MANAGER REVIEW'; color = 'var(--accent-warning)'; }
    else if (score >= 60) { level = '🟠 High Risk'; recommendation = 'REDUCE OR GUARANTOR'; color = 'orange'; }
    else { level = '🔴 Very High Risk'; recommendation = 'DECLINE'; color = 'var(--accent-danger)'; }

    if (redFlags > 0 && recommendation === 'APPROVE') {
      recommendation = 'MANAGER REVIEW (RED FLAGS)';
      color = 'var(--accent-warning)';
    }

    return { score, level, recommendation, redFlags, disposableIncome, color };
  }

  const openCI = async (loan) => {
    setCiLoan(loan);
    setCiForm({});
    setCiModal(true);
    try {
      const res = await API.get(`/loans/${loan.id}/ci`);
      if (res.data && res.data.id) setCiForm(res.data);
    } catch (e) { console.error(e); }
  }

  const handleCISave = async (endorsement) => {
    if (!confirm(`Are you sure you want to ${endorsement.toUpperCase()} this application?`)) return;
    try {
      await API.post(`/loans/${ciLoan.id}/ci`, { ...ciForm, endorsement });
      setCiModal(false);
      load();
    } catch (err) { alert(err.response?.data?.error || 'Error saving CI'); }
  }

  return (
    <div>
      <div className="page-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input id="ci-search" className="form-control" placeholder="Search name, code..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select id="ci-status-filter" className="form-control" style={{ width: 150 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Applications</option>
          <option value="pending">Pending CI</option>
          <option value="approved">Approved CI</option>
          <option value="rejected">Rejected</option>
        </select>
        <button id="btn-new-ci" className="btn btn-primary" onClick={() => { setForm(EMPTY); setError(''); setAppModal(true) }}>+ New CI Application</button>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>App #</th><th>Customer</th><th>Type</th><th>Proposed Amount</th><th>Applied Date</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={7}>⏳ Loading...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">No applications found</td></tr>
                : rows.map(r => (
                  <tr key={r.id}>
                    <td><span className="mono">{r.loan_code}</span></td>
                    <td className="fw-600">{r.customer_name}</td>
                    <td><span className="tag">{r.loan_type}</span></td>
                    <td className="text-right fw-bold text-primary">₱ {fmt(r.principal)}</td>
                    <td>{r.date_released}</td>
                    <td>
                      {r.status === 'approved' ? <span className="badge badge-active">Approved</span> :
                       r.status === 'rejected' ? <span className="badge badge-danger">Rejected</span> :
                       <span className="badge badge-warning">Pending CI</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => openCI(r)}>
                          {r.status === 'pending' ? 'Conduct CI' : 'View CI'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== New Application Modal ===================== */}
      {appModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAppModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <span className="modal-title">📋 New CI Application</span>
              <button className="modal-close" onClick={() => setAppModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              
              <div className="form-group mb-3" style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <label className="form-label text-primary fw-bold">🔍 Fast Entry by Client Code</label>
                <input 
                  className="form-control" 
                  placeholder="Enter client code (e.g. 0001) and press Enter..." 
                  value={clientCodeInput}
                  onChange={e => setClientCodeInput(e.target.value)}
                  onKeyDown={handleClientCodeKeyDown}
                />
              </div>

              <form onSubmit={handleAppSave}>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group span-2">
                    <label className="form-label">Customer *</label>
                    <select className="form-control" value={form.customer_id} onChange={handleCustomerSelect} required>
                      <option value="">Select Customer...</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.customer_code})</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Loan Type</label>
                    <select className="form-control" value={form.loan_type} onChange={e => setForm(f => ({ ...f, loan_type: e.target.value }))}>
                      <option value="New">New</option>
                      <option value="Reloan">Reloan</option>
                      <option value="Recon">Recon</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Proposed Principal *</label>
                    <input type="number" className="form-control" placeholder="0.00" value={form.principal} onChange={e => setForm(f => ({ ...f, principal: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Proposed Date *</label>
                    <input type="date" className="form-control" value={form.date_released} onChange={e => setForm(f => ({ ...f, date_released: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Assigned Collector</label>
                    <select className="form-control" value={form.collector_id} onChange={e => setForm(f => ({ ...f, collector_id: e.target.value }))}>
                      <option value="">Select...</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group span-2">
                    <label className="form-label">Purpose/Remarks</label>
                    <input className="form-control" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
                  </div>
                </div>

                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setAppModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : '💾 Start Application'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ===================== CI Modal ===================== */}
      {ciModal && ciLoan && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCiModal(false)}>
          <div className="modal" style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <span className="modal-title">CREDIT INVESTIGATION - {ciLoan.customer_name}</span>
              <button className="modal-close" onClick={() => setCiModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ background: '#fff' }}>
              {(() => {
                const assessment = getCreditAssessment();
                return (
                  <div style={{ marginBottom: 20, padding: 15, borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', gap: 20 }}>
                    <div style={{ flex: 1 }}>
                      <div className="text-muted fw-bold" style={{ fontSize: 12 }}>CREDIT SCORE</div>
                      <div style={{ fontSize: 42, fontWeight: 800, color: assessment.color, lineHeight: 1 }}>{assessment.score}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: assessment.color }}>{assessment.level}</div>
                    </div>
                    <div style={{ flex: 2 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div className="text-muted" style={{ fontSize: 12 }}>Recommended Action</div>
                          <div className="fw-bold" style={{ color: assessment.color }}>{assessment.recommendation}</div>
                        </div>
                        <div>
                          <div className="text-muted" style={{ fontSize: 12 }}>Red Flags Detected</div>
                          <div className="fw-bold text-danger">{assessment.redFlags}</div>
                        </div>
                        <div>
                          <div className="text-muted" style={{ fontSize: 12 }}>Disposable Income</div>
                          <div className="fw-bold">₱ {fmt(assessment.disposableIncome)}</div>
                        </div>
                        <div>
                          <div className="text-muted" style={{ fontSize: 12 }}>Proposed Daily Payment</div>
                          <div className="fw-bold">₱ {fmt(ciLoan.amortization)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <h5 style={{ background: '#dce8f5', padding: '8px 12px', border: '1px solid #123A63', margin: 0, color: '#123A63', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>D. INCOME / CASH-FLOW INFORMATION</span>
              </h5>
              <div style={{ border: '1px solid #123A63', borderTop: 'none', padding: 15, marginBottom: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 15 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span>Average Daily Sales</span><input type="number" style={{ width: 120 }} className="form-control" value={ciForm.daily_sales || ''} onChange={hc('daily_sales')} disabled={ciLoan.status !== 'pending'} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span>Daily Expenses</span><input type="number" style={{ width: 120 }} className="form-control" value={ciForm.daily_expenses || ''} onChange={hc('daily_expenses')} disabled={ciLoan.status !== 'pending'} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontWeight: 'bold' }}>
                      <span>Daily Net Income</span>
                      <span>₱ {fmt((Number(ciForm.daily_sales||0) + Number(ciForm.other_income||0)) - (Number(ciForm.daily_expenses||0) + Number(ciForm.other_loans||0)))}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span>Other Income</span><input type="number" style={{ width: 120 }} className="form-control" value={ciForm.other_income || ''} onChange={hc('other_income')} disabled={ciLoan.status !== 'pending'} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span>Other Loans</span><input type="number" style={{ width: 120 }} className="form-control" value={ciForm.other_loans || ''} onChange={hc('other_loans')} disabled={ciLoan.status !== 'pending'} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontWeight: 'bold' }}>
                      <span>Proposed Payment</span>
                      <span>₱ {fmt(ciLoan.amortization)} (Daily)</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 15 }}>
                  <div>
                    <span style={{ fontWeight: 'bold', marginRight: 15 }}>Can Pay Without Hardship?</span>
                    <select className="form-control" style={{ display: 'inline-block', width: '120px' }} value={ciForm.no_hardship || ''} onChange={hc('no_hardship')} disabled={ciLoan.status !== 'pending'}>
                      <option value="">Auto-Detect</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <span style={{ fontWeight: 'bold', marginRight: 15 }}>Business Operating Years:</span>
                    <select className="form-control" style={{ display: 'inline-block', width: '140px' }} value={ciForm.business_years || ''} onChange={hc('business_years')} disabled={ciLoan.status !== 'pending'}>
                      <option value="">Select...</option>
                      <option value="> 3 years">&gt; 3 years</option>
                      <option value="1-3 years">1-3 years</option>
                      <option value="< 1 year">&lt; 1 year</option>
                    </select>
                  </div>
                </div>

                <div style={{ fontWeight: 'bold', marginBottom: 10 }}>Breakdown of Business Expenses:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontSize: 11 }}>Monthly</div>
                    {['electricity', 'water', 'internet', 'rental', 'appliances', 'tuition'].map(f => (
                      <div key={f} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                        <span style={{ textTransform: 'capitalize' }}>{f === 'tuition' ? 'School Tuition' : f}</span>
                        <input type="number" style={{ width: 100, padding: 4 }} className="form-control" value={ciForm[`exp_${f}`] || ''} onChange={hc(`exp_${f}`)} disabled={ciLoan.status !== 'pending'} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontSize: 11 }}>Daily</div>
                    {['food', 'transport', 'allowance', 'misc'].map(f => (
                      <div key={f} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                        <span style={{ textTransform: 'capitalize' }}>{f === 'allowance' ? 'Students Allowance' : f}</span>
                        <input type="number" style={{ width: 100, padding: 4 }} className="form-control" value={ciForm[`exp_${f}`] || ''} onChange={hc(`exp_${f}`)} disabled={ciLoan.status !== 'pending'} />
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 15, fontWeight: 'bold', alignItems: 'center' }}>
                      <span>Total Expenses</span>
                      <span>₱ {fmt(['electricity','water','internet','transport','rental','food','appliances','allowance','tuition','misc'].reduce((s, f) => s + Number(ciForm[`exp_${f}`] || 0), 0))}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginTop: 20, paddingTop: 15, borderTop: '1px dashed #ccc' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span>Proposed Loan Amount:</span> <span className="fw-bold">₱ {fmt(ciLoan.principal)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span>Proposed Loan Term:</span> <span className="fw-bold">45 days</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span>Proposed Payment (Daily):</span> <span className="fw-bold">₱ {fmt(ciLoan.amortization)}</span></div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}><span>Purpose/Remarks:</span> <span className="fw-bold">{ciLoan.remarks || 'N/A'}</span></div>
                  </div>
                </div>
              </div>

              <h5 style={{ background: '#dce8f5', padding: '8px 12px', border: '1px solid #123A63', margin: 0, color: '#123A63' }}>E. VERIFICATION CHECKS / RED FLAGS</h5>
              <div style={{ border: '1px solid #123A63', borderTop: 'none', padding: 15 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 15 }}>
                  {[
                    { f: 'check_location', l: 'Stable business location verified' },
                    { f: 'check_activity', l: 'Business activity/products observed' },
                    { f: 'check_residency', l: 'Owner/residency information verified' },
                    { f: 'check_borrowing', l: 'No signs of excessive borrowing' },
                    { f: 'check_understanding', l: 'Client understanding application is not approval' },
                    { f: 'check_permit', l: 'Permit/ID checked when available' },
                    { f: 'check_purpose', l: 'Loan purpose appears productive' },
                    { f: 'check_source', l: 'Payment source appears realistic' },
                    { f: 'check_consent', l: 'Data collected with consent' }
                  ].map(c => (
                    <label key={c.f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!ciForm[c.f]} onChange={hc(c.f)} style={{ width: 16, height: 16 }} disabled={ciLoan.status !== 'pending'} />
                      {c.l}
                    </label>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 15, borderTop: '1px dashed #ccc', paddingTop: 15 }}>
                  <div>
                    <label className="fw-bold mb-2 d-block text-danger">🚩 Explicit Red Flags</label>
                    {[
                      { f: 'flag_false_info', l: 'False information detected' },
                      { f: 'flag_no_business', l: 'Business not found during verification' },
                      { f: 'flag_no_residence', l: 'Residence cannot be verified' },
                      { f: 'flag_excessive_borrowing', l: 'Excessive borrowing observed' }
                    ].map(c => (
                      <label key={c.f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--accent-danger)' }}>
                        <input type="checkbox" checked={!!ciForm[c.f]} onChange={hc(c.f)} style={{ width: 16, height: 16 }} disabled={ciLoan.status !== 'pending'} />
                        {c.l}
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="fw-bold mb-2 d-block">Existing Loan History</label>
                    <select className="form-control" value={ciForm.loan_history || ''} onChange={hc('loan_history')} disabled={ciLoan.status !== 'pending'}>
                      <option value="">Select...</option>
                      <option value="No past due history">No past due history</option>
                      <option value="Minor past due history">Minor past due history</option>
                      <option value="Multiple past due accounts">Multiple past due accounts</option>
                      <option value="Active delinquent account">Active delinquent account</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 15 }}>
                  <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>CI Supervisor's Notes:</span>
                  <input className="form-control" style={{ flex: 1, border: 'none', borderBottom: '1px solid #000', borderRadius: 0, background: 'transparent' }} value={ciForm.ci_notes || ''} onChange={hc('ci_notes')} disabled={ciLoan.status !== 'pending'} />
                </div>

                {ciLoan.status === 'pending' && hasRole('admin', 'manager') && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 15, marginTop: 25, borderTop: '1px solid #eee', paddingTop: 20 }}>
                    <button className="btn btn-danger" onClick={() => handleCISave('reject')} style={{ width: 150 }}>Declined</button>

                    <button className="btn btn-secondary" onClick={() => handleCISave('reduce')} style={{ width: 150 }}>Reduce Loan</button>
                    <button className="btn btn-success" onClick={() => handleCISave('approve')} style={{ width: 150 }}>Approved</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
