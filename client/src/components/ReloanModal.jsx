import { useCallback, useEffect, useMemo, useState } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import './ReloanModal.css';

const peso = n => Number(n || 0).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const toInputDate = date => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const normalizeLoanType = type => {
  const value = String(type || '').toUpperCase().replace(/[-\s]/g, '');
  if (value === 'NEW') return 'NEW';
  if (value === 'RECON') return 'RECON';
  if (value === 'RELOAN') return 'RELOAN';
  return '';
};

const addCalendarDays = (dateValue, days) => {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return toInputDate(date);
};

const findLatestLoan = loans => [...(loans || [])].sort((a, b) => {
  const byDate = String(b.date_released || b.created_at || '').localeCompare(String(a.date_released || a.created_at || ''));
  return byDate || Number(b.id || 0) - Number(a.id || 0);
})[0] || null;

const activeStatuses = ['active', 'pastdue', 'pending', 'approved', 'for_approval', 'reloan_pending'];

export default function ReloanModal({ isOpen, onClose, customerId, customer, loanType = 'RELOAN', onReloanSubmitted, onViewSoa }) {
  const { user, hasRole } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(customer || null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    loanType: normalizeLoanType(loanType) || 'RELOAN',
    loanDate: toInputDate(new Date()),
    principal: '',
    days: '45',
    interestRate: '15',
    balance: '0',
    penalty: '0',
    passbook: '0',
    paymentFrequency: 'Daily',
    remarks: ''
  });

  const activeCustomerId = customerId || selectedCustomerId;
  const activeCustomer = customer || selectedCustomer;

  const loadAccount = useCallback(async () => {
    if (!activeCustomerId) return;
    setLoading(true);
    setError('');
    try {
      const [profile, evalRes] = await Promise.all([
        API.get(`/customers/${activeCustomerId}`),
        API.get(`/customers/${activeCustomerId}/reloan-eval`)
      ]);
      setAccount({ ...profile.data, eval: evalRes.data });
      setForm(current => ({
        ...current,
        principal: current.principal || (normalizeLoanType(current.loanType) === 'RECON' ? evalRes.data.active_balance || '' : ''),
        passbook: normalizeLoanType(current.loanType) === 'NEW' ? '50' : current.passbook
      }));
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load client loan information.');
    } finally {
      setLoading(false);
    }
  }, [activeCustomerId]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCustomer(customer || null);
    setSelectedCustomerId(customerId || null);
    setPreview(false);
    setSuccess(null);
    setSubmitting(false);
    setError('');
    setForm(current => ({
      ...current,
      loanType: normalizeLoanType(loanType) || current.loanType || 'RELOAN',
      loanDate: toInputDate(new Date())
    }));
  }, [isOpen, customerId, customer, loanType]);

  useEffect(() => {
    if (isOpen && activeCustomerId) loadAccount();
  }, [isOpen, activeCustomerId, loadAccount]);

  const latestLoan = findLatestLoan(account?.loans);
  const activeLoan = (account?.loans || []).find(l => activeStatuses.includes(String(l.status || '').toLowerCase()) && Number(l.balance || 0) > 0);
  const status = String(account?.status || activeCustomer?.status || '').toUpperCase();
  const collectorName = account?.collector_name || activeCustomer?.collector_name || 'Unassigned';
  const branchName = account?.branch_name || activeCustomer?.branch_name || 'Unassigned';
  const clientName = account?.full_name || activeCustomer?.full_name || activeCustomer?.client_name || '';
  const clientCode = account?.customer_code || activeCustomer?.customer_code || '';
  const canOverride = hasRole?.('admin', 'manager') || ['admin', 'manager'].includes(String(user?.role || '').toLowerCase());
  const dayOptions = ['30', '45', '60'];
  const isCustomDays = form.days && !dayOptions.includes(String(form.days));

  const computed = useMemo(() => {
    const principal = Number(form.principal || 0);
    const interestRate = Number(form.interestRate || 0);
    const interestAmount = principal * (interestRate / 100);
    const totalLoanAmount = Math.ceil(principal + interestAmount);
    const balance = Number(form.balance || 0);
    const penalty = Number(form.penalty || 0);
    const passbook = Number(form.passbook || 0);
    const releaseCharges = balance + penalty + passbook;
    
    const days = Number(form.days || 0);
    const dailyPayment = days > 0 ? Math.ceil(totalLoanAmount / days) : 0;

    return {
      principal,
      interestAmount,
      totalLoanAmount,
      balance,
      penalty,
      passbook,
      releaseCharges,
      netRelease: principal,
      dailyPayment,
      dueDate: form.loanDate ? addCalendarDays(form.loanDate, form.days) : ''
    };
  }, [form]);

  const eligibility = useMemo(() => {
    const type = normalizeLoanType(form.loanType);
    if (!activeCustomerId) return { ok: false, message: 'Select a client before saving.' };
    if (!type) return { ok: false, message: 'Loan Type is required.' };
    if (['HOLD', 'RELAX'].includes(status)) return { ok: false, message: `This client is not eligible for ${type}. Client is on ${status} status.` };
    if (type === 'NEW' && activeLoan) return { ok: false, message: 'This client already has an active loan and cannot be processed as NEW.' };
    if (type === 'RELOAN' && !latestLoan) return { ok: false, message: 'This client is not eligible for RELOAN. Please review the client SOA and approval status.' };
    if (type === 'RECON' && !latestLoan) return { ok: false, message: 'This client is not eligible for RECON. Please review the account status and required approval.' };
    return { ok: true, message: 'Eligible for loan encoding subject to approval controls.' };
  }, [activeCustomerId, activeLoan, form.loanType, latestLoan, status]);

  if (!isOpen) return null;

  const searchCustomers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError('');
    try {
      const res = await API.get('/customers', { params: { search: searchQuery.trim() } });
      setSearchResults(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Client search failed.');
    } finally {
      setSearching(false);
    }
  };

  const selectCustomer = c => {
    setSelectedCustomer(c);
    setSelectedCustomerId(c.id);
    setSearchResults([]);
    setSearchQuery(c.customer_code || '');
  };

  const updateForm = (key, value) => {
    setPreview(false);
    setForm(current => ({ ...current, [key]: value }));
  };

  const validate = () => {
    if (!eligibility.ok) return eligibility.message;
    if (!computed.principal || computed.principal <= 0) return 'Principal Amount is required.';
    if (!form.loanDate) return 'Loan Date is required.';
    if (!form.days) return 'Number of Days is required.';
    if (Number(form.days) <= 0) return 'Number of Days must be greater than zero.';
    if (computed.balance < 0 || computed.penalty < 0 || computed.passbook < 0) return 'Balance, Penalty, and Passbook cannot be negative.';
    return '';
  };

  const submit = async () => {
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await API.post(`/customers/${activeCustomerId}/reloan`, {
        principal: computed.principal,
        loan_period: Number(form.days),
        interest_rate: Number(form.interestRate || 0),
        date_released: form.loanDate,
        loan_type: form.loanType,
        source_loan_id: latestLoan?.id || activeCustomer?.source_loan_id || null,
        previous_balance: normalizeLoanType(form.loanType) === 'NEW' ? 0 : computed.balance,
        penalty: computed.penalty,
        passbook: computed.passbook,
        remarks: form.remarks
      });
      setSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save loan.');
    } finally {
      setSubmitting(false);
    }
  };

  const openSoa = () => {
    if (activeCustomerId) {
      if (onViewSoa) onViewSoa(activeCustomerId);
      else window.location.href = `/customers?search=${encodeURIComponent(clientCode || clientName)}`;
    }
  };

  const openLoanDocument = (tab) => {
    const params = new URLSearchParams();
    if (success?.loan_code) params.set('loan', success.loan_code);
    params.set('tab', tab);
    window.location.href = `/promissory-disclosure?${params.toString()}`;
  };

  if (success) {
    return (
      <div className="reloan-overlay">
        <div className="loan-entry-success">
          <h2>Loan successfully recorded.</h2>
          <p>{success.loan_code}</p>
          <div className="loan-entry-success-actions">
            <button type="button" className="reloan-secondary" onClick={() => openLoanDocument('promissory')}>Print Promissory Note</button>
            <button type="button" className="reloan-secondary" onClick={() => openLoanDocument('disclosure')}>View Disclosure Statement</button>
            <button type="button" className="reloan-secondary" onClick={openSoa}>View SOA</button>
            <button type="button" className="reloan-primary" onClick={() => { setSuccess(null); setSelectedCustomer(null); setSelectedCustomerId(null); setAccount(null); }}>Input Another Loan</button>
            <button type="button" className="reloan-secondary" onClick={() => { onReloanSubmitted?.(); onClose(); }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reloan-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="reloan-modal loan-entry-modal">
        <div className="reloan-header">
          <div className="reloan-title-block">
            <div className="reloan-bell" aria-hidden="true"><span /></div>
            <div>
              <h2>Input Loan</h2>
              <p>Encode NEW, RELOAN, and RECON loans in one controlled form</p>
            </div>
          </div>
          <div className="reloan-id-panel">
            <label>Loan Reference</label>
            <input value="LN-YYYYMMDD-0001" readOnly />
            <button type="button" className="reloan-icon-button" onClick={onClose} aria-label="Close loan input modal">x</button>
          </div>
        </div>

        <div className="reloan-body">
          {error && <div className="reloan-error">{error}</div>}
          <section className="loan-entry-search">
            <label className="reloan-field">
              <span>Client Code <b>*</b></span>
              <input value={searchQuery || clientCode} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchCustomers()} placeholder="Enter client code or name" />
            </label>
            <button type="button" className="reloan-primary" onClick={searchCustomers} disabled={searching}>{searching ? 'Searching...' : 'Search Client'}</button>
            {activeCustomerId && <button type="button" className="reloan-secondary" onClick={openSoa}>View SOA</button>}
          </section>

          {searchResults.length > 0 && (
            <div className="loan-entry-results">
              {searchResults.map(c => (
                <button type="button" key={c.id} onClick={() => selectCustomer(c)}>
                  <strong>{c.customer_code}</strong>
                  <span>{c.full_name}</span>
                  <em>{c.status || 'ACTIVE'}</em>
                </button>
              ))}
            </div>
          )}

          {loading ? <div className="reloan-state"><div className="reloan-spinner" /><span>Loading client information...</span></div> : activeCustomerId && (
            <>
              <div className="loan-entry-summary-grid">
                <section className="reloan-card loan-entry-card">
                  <div className="reloan-section-title">Client Information</div>
                  <dl>
                    <div><dt>Client Code</dt><dd>{clientCode}</dd></div>
                    <div><dt>Client Name</dt><dd>{clientName}</dd></div>
                    <div><dt>Assigned Collector</dt><dd>{collectorName}</dd></div>
                    <div><dt>Branch</dt><dd>{branchName}</dd></div>
                    <div><dt>Client Status</dt><dd><span className={`loan-status-badge ${status.toLowerCase()}`}>{status || 'ACTIVE'}</span></dd></div>
                  </dl>
                </section>
                <section className="reloan-card loan-entry-card">
                  <div className="reloan-section-title">Current Account Status</div>
                  <dl>
                    <div><dt>Current Outstanding Balance</dt><dd>{peso(account?.eval?.active_balance || 0)}</dd></div>
                    <div><dt>Previous Loan Type</dt><dd>{latestLoan?.loan_type || '-'}</dd></div>
                    <div><dt>Previous Loan Date</dt><dd>{latestLoan?.date_released || '-'}</dd></div>
                    <div><dt>Previous Loan Due Date</dt><dd>{latestLoan?.date_maturity || '-'}</dd></div>
                    <div><dt>Validation</dt><dd>{eligibility.message}</dd></div>
                  </dl>
                </section>
              </div>

              <div className="reloan-grid loan-entry-form-grid">
                <section className="reloan-card reloan-left-card">
                  <div className="reloan-section-title">Loan Details</div>
                  <label className="reloan-field"><span>Loan Type <b>*</b></span><select value={form.loanType} onChange={e => updateForm('loanType', e.target.value)}><option value="">Select Loan Type</option><option value="NEW">NEW</option><option value="RELOAN">RELOAN</option><option value="RECON">RECON</option></select></label>
                  <label className="reloan-field"><span>Loan Date <b>*</b></span><input type="date" value={form.loanDate} onChange={e => updateForm('loanDate', e.target.value)} /></label>
                  <label className="reloan-field"><span>Principal Amount <b>*</b></span><input type="number" min="1" step="0.01" value={form.principal} onChange={e => updateForm('principal', e.target.value)} /></label>
                  <label className="reloan-field"><span>Number of Days <b>*</b></span><select value={isCustomDays ? 'OTHER' : form.days} onChange={e => updateForm('days', e.target.value === 'OTHER' ? '' : e.target.value)}><option value="30">30 Days</option><option value="45">45 Days</option><option value="60">60 Days</option><option value="OTHER">Others</option></select></label>
                  {(isCustomDays || form.days === '') && <label className="reloan-field"><span>Custom Days <b>*</b></span><input type="number" min="1" step="1" placeholder="Enter number of days" value={form.days} onChange={e => updateForm('days', e.target.value)} /></label>}
                  <label className="reloan-field"><span>Interest Rate</span><input type="number" min="0" step="0.01" value={form.interestRate} onChange={e => updateForm('interestRate', e.target.value)} readOnly={!canOverride && false} /></label>
                  <label className="reloan-field"><span>Payment Frequency</span><select value={form.paymentFrequency} onChange={e => updateForm('paymentFrequency', e.target.value)}><option>Daily</option><option>Weekly</option><option>Monthly</option></select></label>
                </section>
                <section className="reloan-card reloan-middle-card">
                  <div className="reloan-section-title">Computed Amounts</div>
                  <label className="reloan-field"><span>Amount of Interest</span><input value={peso(computed.interestAmount)} readOnly /></label>
                  <label className="reloan-field"><span>Total Loan Amount</span><input value={peso(computed.totalLoanAmount)} readOnly /></label>
                  <label className="reloan-field"><span>Daily Payment</span><input value={peso(computed.dailyPayment)} readOnly /></label>
                  <label className="reloan-field"><span>Balance</span><input type="number" min="0" step="0.01" value={form.balance} onChange={e => updateForm('balance', e.target.value)} /></label>
                  <label className="reloan-field"><span>Penalty</span><input type="number" min="0" step="0.01" value={form.penalty} onChange={e => updateForm('penalty', e.target.value)} /></label>
                  <label className="reloan-field"><span>Passbook</span><input type="number" min="0" step="0.01" value={form.passbook} onChange={e => updateForm('passbook', e.target.value)} /></label>
                  <label className="reloan-field"><span>Net Release Amount</span><input value={peso(computed.netRelease)} readOnly /></label>
                  <label className="reloan-field"><span>Due Date</span><input type="date" value={computed.dueDate} readOnly /></label>
                </section>
                <aside className="reloan-side">
                  <section className="reloan-side-card breakdown">
                    <div className="reloan-side-heading"><strong>Processing</strong></div>
                    <label className="reloan-field"><span>Processed By</span><input value={user?.full_name || user?.username || ''} readOnly /></label>
                    <label className="reloan-field remarks"><span>Remarks</span><textarea value={form.remarks} onChange={e => updateForm('remarks', e.target.value)} rows="6" /></label>
                  </section>
                </aside>
              </div>

              {preview && (
                <section className="loan-preview">
                  <h3>Loan Preview</h3>
                  {[
                    ['Client Code', clientCode], ['Client Name', clientName], ['Collector', collectorName],
                    ['Loan Type', form.loanType], ['Loan Date', form.loanDate], ['Principal Amount', peso(computed.principal)],
                    ['Interest Rate', `${form.interestRate || 0}%`], ['Amount of Interest', peso(computed.interestAmount)],
                    ['Total Loan Amount', peso(computed.totalLoanAmount)], ['Daily Payment', peso(computed.dailyPayment)],
                    ['Balance', peso(computed.balance)], ['Penalty', peso(computed.penalty)],
                    ['Passbook', peso(computed.passbook)], ['Net Release Amount', peso(computed.netRelease)],
                    ['Number of Days', form.days], ['Due Date', computed.dueDate]
                  ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}
                </section>
              )}
            </>
          )}
        </div>

        <div className="reloan-footer">
          <button type="button" className="reloan-secondary" onClick={onClose}>Cancel</button>
          {preview && <button type="button" className="reloan-secondary" onClick={() => setPreview(false)}>Back to Edit</button>}
          {!preview ? (
            <button type="button" className="reloan-primary" onClick={() => {
              const validation = validate();
              if (validation) setError(validation);
              else { setError(''); setPreview(true); }
            }}>Preview Loan</button>
          ) : (
            <button type="button" className="reloan-primary" onClick={submit} disabled={submitting}>{submitting ? 'Saving...' : 'Confirm and Save'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
