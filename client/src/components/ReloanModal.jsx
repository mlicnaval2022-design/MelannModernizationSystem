import { useState, useEffect, useCallback, useMemo } from 'react';
import API from '../services/api';
import './ReloanModal.css';

const peso = n => Number(n || 0).toLocaleString('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const numberText = n => Number(n || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const formatDate = date => date.toLocaleDateString('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric'
});

const toInputDate = date => date.toISOString().split('T')[0];

const formatDateTime = date => `${formatDate(date)} ${date.toLocaleTimeString('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit'
})}`;

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

const getDefaultReleaseDate = type => toInputDate(addDays(new Date(), type === 'Recon' ? 1 : 0));

const getRecommendedAmount = data => {
  if (!data) return '';
  return data.recommendations?.standard || data.last_loan_amount || '';
};

const isNewLoanType = type => {
  const normalized = String(type || '').toLowerCase();
  return normalized === 'new' || normalized === 'new loan';
};

const ReloanModal = ({ isOpen, onClose, customerId, customer, loanType = 'Reloan', onReloanSubmitted }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [desiredAmount, setDesiredAmount] = useState('');
  const [dateRelease, setDateRelease] = useState(() => getDefaultReleaseDate(loanType));
  const [loanTerm, setLoanTerm] = useState('45');
  const [interestRate, setInterestRate] = useState('15');
  const [submitting, setSubmitting] = useState(false);
  const [internalLoanType, setInternalLoanType] = useState(loanType);

  useEffect(() => {
    setInternalLoanType(loanType);
    setPassbook(isNewLoanType(loanType) ? '50' : '');
    setDateRelease(getDefaultReleaseDate(loanType));
  }, [loanType]);

  const [internalCustomerId, setInternalCustomerId] = useState(null);
  const [internalCustomer, setInternalCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [previousBalance, setPreviousBalance] = useState('');
  const [penalty, setPenalty] = useState('');
  const [passbook, setPassbook] = useState(isNewLoanType(loanType) ? '50' : '');

  const activeCustomerId = customerId || internalCustomerId;
  const activeCustomer = customer || internalCustomer;

  const fetchReloanData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get(`/customers/${activeCustomerId}/reloan-eval`);
      setData(res.data);
      if (loanType === 'Recon') {
        setDesiredAmount(current => current || res.data.active_balance || '');
      } else {
        setDesiredAmount(current => current || getRecommendedAmount(res.data));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch reloan evaluation data');
    } finally {
      setLoading(false);
    }
  }, [activeCustomerId, loanType]);

  useEffect(() => {
    if (isOpen) {
      setShowSuccess(false);
      if (activeCustomerId) {
        fetchReloanData();
      } else {
        setLoading(false);
      }
    } else {
      setError('');
      setShowSuccess(false);
      setSubmitting(false);
      setLoanTerm('45');
      setInterestRate('15');
      setDateRelease(getDefaultReleaseDate(loanType));
      setDesiredAmount('');
      setInternalCustomerId(null);
      setInternalCustomer(null);
      setSearchQuery('');
      setSearchResults([]);
      setPreviousBalance('');
      setPenalty('');
      setPassbook(isNewLoanType(loanType) ? '50' : '');
      setLoading(true); // Reset loading state for next open
    }
  }, [isOpen, activeCustomerId, fetchReloanData, loanType]);

  const computed = useMemo(() => {
    const today = new Date();
    const releaseDate = dateRelease ? new Date(`${dateRelease}T00:00:00`) : today;
    const principal = Number(desiredAmount || 0);
    const terms = Number(loanTerm || 45);
    const interest = Number(interestRate || 0);
    const oldBalance = Number(previousBalance || 0);
    const penaltyAmount = Number(penalty || 0);
    const passbookAmount = Number(passbook || 0);
    const charges = oldBalance + penaltyAmount + passbookAmount;
    const interestAmount = principal * (interest / 100);
    const totalAmount = principal + interestAmount;
    const totalForRelease = Math.max(totalAmount - charges, 0);
    const paymentPerDay = terms > 0 ? Math.ceil(totalAmount / terms) : 0;

    return {
      today,
      releaseDate,
      principal,
      interest,
      interestAmount,
      terms,
      charges,
      oldBalance,
      penaltyAmount,
      passbookAmount,
      totalForRelease,
      totalAmount,
      paymentPerDay,
      maturity: addDays(releaseDate, terms)
    };
  }, [desiredAmount, loanTerm, interestRate, dateRelease, previousBalance, passbook]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (submitting) return;
    if (!desiredAmount || isNaN(desiredAmount) || Number(desiredAmount) <= 0) {
      setError('Please enter a valid loan amount.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await API.post(`/customers/${activeCustomerId}/reloan`, {
        principal: Number(desiredAmount),
        loan_period: Number(loanTerm),
        interest_rate: Number(interestRate || 0),
        date_released: dateRelease,
        loan_type: internalLoanType,
        source_loan_id: activeCustomer?.source_loan_id || null,
        previous_balance: Number(previousBalance || 0),
        penalty: Number(penalty || 0),
        passbook: Number(passbook || 0)
      });
      setShowSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit reloan application');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const handleCustomerSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await API.get('/customers', { params: { search: searchQuery } });
      let results = res.data || [];
      const exactMatch = results.find(c => c.customer_code === searchQuery.trim());
      if (exactMatch) {
        results = [exactMatch];
      }
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const selectCustomer = (c) => {
    setInternalCustomer(c);
    setInternalCustomerId(c.id);
  };

  const clientName = activeCustomer?.client_name || activeCustomer?.full_name || 'Selected customer';
  const customerCode = activeCustomer?.customer_code || activeCustomerId || '';
  const collectorName = activeCustomer?.collector_name || 'Select collector';
  const isManualBalanceLoan = loanType === 'Reloan' || loanType === 'Recon';
  const isEligible = isManualBalanceLoan ? true : (data?.can_proceed !== false && data?.can_proceed !== undefined) || data?.is_eligible !== false;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleLoanTypeChange = (e) => {
    const nextType = e.target.value;
    setInternalLoanType(nextType);
    setPassbook(isNewLoanType(nextType) ? '50' : '');
    setDateRelease(getDefaultReleaseDate(nextType));
  };

  const handleSuccessOk = () => {
    setShowSuccess(false);
    setSubmitting(false);
    if (onReloanSubmitted) onReloanSubmitted();
    else onClose();
  };

  if (showSuccess) {
    return (
      <div className="reloan-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
        <div className="reloan-modal" style={{ width: '400px', textAlign: 'center', padding: '50px 30px' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', margin: '0 auto 20px auto' }}>✓</div>
          <h2 style={{ margin: '0 0 10px 0', color: '#047857', fontSize: '24px' }}>Saved Loan</h2>
          <p style={{ color: '#64748b', marginBottom: '30px' }}>The loan application has been saved successfully and sent for approval.</p>
          <button className="reloan-primary" style={{ width: '100%', padding: '12px', justifyContent: 'center' }} onClick={handleSuccessOk}>OK</button>
        </div>
      </div>
    );
  }

  return (
    <div className="reloan-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="reloan-modal" onSubmit={handleSubmit}>
        <div className="reloan-header">
          <div className="reloan-title-block">
            <div className="reloan-bell" aria-hidden="true">
              <span>●</span>
            </div>
            <div>
              <h2>LOAN</h2>
              <p>Create and manage regular loan records</p>
            </div>
          </div>
          <div className="reloan-id-panel">
            <label>Loan ID</label>
            <input value="(Auto-Generate)" readOnly />
            <button type="button" className="reloan-icon-button" onClick={onClose} aria-label="Close reloan modal">
              ✕
            </button>
          </div>
        </div>

        <div className="reloan-body">
          {!activeCustomerId ? (
            <div className="reloan-customer-search" style={{ padding: '20px' }}>
              <h3 style={{ marginBottom: '15px' }}>Select Customer</h3>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCustomerSearch()}
                  placeholder="Search by name, code..."
                  style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                />
                <button type="button" onClick={handleCustomerSearch} className="reloan-primary" style={{ padding: '0 20px', minWidth: 'auto' }}>
                  {searching ? '...' : 'Search'}
                </button>
              </div>
              
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {searchResults.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #cbd5e1' }}>
                        <th style={{ padding: '10px' }}>Code</th>
                        <th style={{ padding: '10px' }}>Name</th>
                        <th style={{ padding: '10px' }}>Status</th>
                        <th style={{ padding: '10px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map(c => (
                        <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px' }}>{c.customer_code}</td>
                          <td style={{ padding: '10px', fontWeight: 'bold' }}>{c.full_name}</td>
                          <td style={{ padding: '10px' }}>{c.status}</td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            <button type="button" onClick={() => selectCustomer(c)} className="btn btn-sm btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }}>Select</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  searchQuery && !searching && <p style={{ color: '#64748b' }}>No customers found.</p>
                )}
              </div>
            </div>
          ) : loading ? (
            <div className="reloan-state">
              <div className="reloan-spinner" />
              <span>Loading reloan file...</span>
            </div>
          ) : !isEligible ? (
            <div style={{ padding: '60px 40px', textAlign: 'center', background: '#fef2f2', borderRadius: '8px', margin: '20px', border: '1px solid #fecaca' }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>⚠️</div>
              <h2 style={{ margin: '0 0 10px 0', color: '#991b1b', fontSize: '24px' }}>Cannot Proceed</h2>
              <p style={{ color: '#7f1d1d', fontSize: '18px', fontWeight: '500', marginBottom: '30px' }}>
                Remaining balance: {peso(data?.active_balance || 0)}
              </p>
              <button type="button" onClick={() => { if (!customerId) { setInternalCustomerId(null); setInternalCustomer(null); } else { onClose(); } }} className="btn btn-primary" style={{ padding: '10px 30px', margin: '0 auto', display: 'inline-flex', background: '#ef4444', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                {customerId ? 'Close' : 'Go Back'}
              </button>
            </div>
          ) : (
            <>
              {error && <div className="reloan-error">{error}</div>}

              <div className="reloan-grid">
                <section className="reloan-card reloan-left-card">
                  <div className="reloan-section-title">
                    <span>LOAN INFORMATION</span>
                    <small>ⓘ ⓘ</small>
                  </div>
                  <p className="reloan-help">Code must be numbers only. Then press ENTER.</p>
                  <p className="reloan-required">* Required Field</p>

                  <label className="reloan-field">
                    <span>Code <b>*</b></span>
                    <div className="reloan-input-with-icon">
                      <input value={customerCode} readOnly />
                      <i>▦</i>
                    </div>
                  </label>

                  <label className="reloan-field">
                    <span>Loan Type <b>*</b></span>
                    <select value={internalLoanType} onChange={handleLoanTypeChange} style={{ width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px', color: '#1e293b', background: '#f8fafc', fontWeight: '500', outline: 'none' }}>
                      <option value="New">New</option>
                      <option value="Reloan">Reloan</option>
                      <option value="Recon">Recon</option>
                    </select>
                  </label>

                  <label className="reloan-field">
                    <span>Principal <b>*</b></span>
                    <div className="reloan-money-input">
                      <i>₱</i>
                      <input
                        type="number"
                        min="1"
                        value={desiredAmount}
                        onChange={e => setDesiredAmount(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter principal amount"
                        required
                      />
                    </div>
                  </label>

                  <label className="reloan-field">
                    <span>Date Release <b>*</b></span>
                    <div className="reloan-input-with-icon">
                      <input
                        type="date"
                        value={dateRelease}
                        onChange={e => setDateRelease(e.target.value)}
                        onKeyDown={handleKeyDown}
                        required
                      />
                    </div>
                  </label>

                  <div className="reloan-split">
                    <div>
                      <div className="reloan-section-title compact">LOAN TYPE</div>
                      <label className="reloan-radio">
                        <input type="radio" checked readOnly />
                        {loanType}
                      </label>
                    </div>
                    <label className="reloan-field">
                      <span>INTEREST RATE (%)</span>
                      <div className="reloan-percent">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={interestRate}
                          onChange={e => setInterestRate(e.target.value)}
                          onKeyDown={handleKeyDown}
                        />
                        <i>%</i>
                      </div>
                    </label>
                  </div>

                  <label className="reloan-field">
                    <span>PERIOD (DAYS) <b>*</b></span>
                    <input
                      type="number"
                      min="1"
                      value={loanTerm}
                      onChange={e => setLoanTerm(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter number of days"
                    />
                  </label>
                  <p className="reloan-note">Manual input only. System terms available: 45 days</p>
                </section>

                <section className="reloan-card reloan-middle-card">
                  <div className="reloan-today-row">
                    <div className="reloan-soft-icon blue">▣</div>
                    <div>
                      <span>DATE TODAY</span>
                      <strong>{formatDateTime(computed.today)}</strong>
                    </div>
                  </div>

                  <div className="reloan-select-row">
                    <div className="reloan-soft-icon">♙</div>
                    <label>Collector</label>
                    <select value={collectorName} disabled>
                      <option>{collectorName}</option>
                    </select>
                  </div>

                  <div className="reloan-select-row">
                    <div className="reloan-soft-icon">♙</div>
                    <label>Customer</label>
                    <select value={clientName} disabled>
                      <option>{clientName}</option>
                    </select>
                  </div>

                  <div className="reloan-metric-grid">
                    <div className="reloan-metric">
                      <div className="reloan-soft-icon violet">▣</div>
                      <span>MATURITY DATE</span>
                      <strong>{formatDate(computed.maturity)}</strong>
                    </div>
                    <div className="reloan-metric">
                      <div className="reloan-soft-icon green">▣</div>
                      <span>PAYMENT / DAY</span>
                      <strong>{peso(computed.paymentPerDay)}</strong>
                    </div>
                  </div>

                  <div className="reloan-balance-row">
                    <div className="reloan-soft-icon violet">⟲</div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155', letterSpacing: '0.5px' }}>SYSTEM BALANCE</span>
                      <strong>{peso(data?.active_balance || 0)}</strong>
                    </div>
                  </div>

                  <div className="reloan-charges-row">
                    <div className="reloan-charges">
                      <div className="reloan-section-title compact">CHARGES INFORMATION</div>
                      {['Balance', 'Penalty', 'Passbook'].map(label => (
                        <label key={label} className="reloan-charge-field">
                          <span>{label}</span>
                          <div>
                            <i>₱</i>
                            {label === 'Balance' ? (
                              <input type="number" min="0" step="0.01" value={previousBalance} onChange={e => setPreviousBalance(e.target.value)} placeholder="0.00" />
                            ) : label === 'Penalty' ? (
                              <input type="number" min="0" step="0.01" value={penalty} onChange={e => setPenalty(e.target.value)} placeholder="0.00" />
                            ) : label === 'Passbook' ? (
                              <input type="number" min="0" step="0.01" value={passbook} onChange={e => setPassbook(e.target.value)} placeholder="0.00" />
                            ) : (
                              <input value={numberText(0)} readOnly />
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="reloan-terms">
                      <span>TERMS</span>
                      <strong>{computed.terms}</strong>
                      <em>days</em>
                    </div>
                  </div>
                </section>

                <aside className="reloan-side">
                  <div className="reloan-side-card collector">
                    <div className="reloan-side-heading">
                      <div className="reloan-soft-icon violet">▤</div>
                      <strong>COLLECTOR CHARGES</strong>
                    </div>
                    <div className="reloan-two-col">
                      <div>
                        <span>Deducted to<br />Total Charges</span>
                        <strong>{peso(0)}</strong>
                      </div>
                      <div>
                        <span>Not Posted</span>
                        <strong>{peso(0)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="reloan-side-card customer">
                    <div className="reloan-side-heading">
                      <div className="reloan-soft-icon green">●</div>
                      <strong>OVER TO CUSTOMER</strong>
                    </div>
                    <div className="reloan-inline-total">
                      <span>Added to Total Charges</span>
                      <strong>{peso(0)}</strong>
                    </div>
                  </div>

                  <div className="reloan-side-card breakdown">
                    <div className="reloan-side-heading">
                      <div className="reloan-soft-icon blue">◔</div>
                      <strong>LOAN BREAKDOWN INFORMATION</strong>
                    </div>
                    <dl>
                      <div><dt>Principal</dt><dd>{peso(computed.principal)}</dd></div>
                      <div><dt>Interest ({computed.interest}%)</dt><dd>{peso(computed.interestAmount)}</dd></div>
                      <div><dt>Less: Balance</dt><dd>{peso(computed.oldBalance)}</dd></div>
                      <div><dt>Less: Penalty</dt><dd>{peso(computed.penaltyAmount)}</dd></div>
                      <div><dt>Less: Passbook</dt><dd>{peso(computed.passbookAmount)}</dd></div>
                      <div><dt>Less: Total Charges</dt><dd>{peso(computed.charges)}</dd></div>
                      <div className="total"><dt>Total for Release</dt><dd>{peso(computed.totalForRelease)}</dd></div>
                    </dl>
                  </div>

                  <div className="reloan-side-card amortization">
                    <div className="reloan-side-heading">
                      <div className="reloan-soft-icon gold">▣</div>
                      <strong>TOTAL AMORTIZATION</strong>
                    </div>
                    <strong>{peso(computed.paymentPerDay)}</strong>
                  </div>
                </aside>
              </div>

              <section className="reloan-table-panel">
                <div className="reloan-search-row">
                  <button type="button" className="reloan-search-button">⌕</button>
                  <strong>Search</strong>
                  <input value={`${customerCode} ${clientName}`} readOnly />
                  <span>×</span>
                </div>
                <div className="reloan-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Loan ID</th>
                        <th>Code</th>
                        <th>Principal</th>
                        <th>Date Release</th>
                        <th>Loan Type</th>
                        <th>Interest %</th>
                        <th>Period (Days)</th>
                        <th>Customer</th>
                        <th>Maturity</th>
                        <th>Total Amount</th>
                        <th>Total Charges</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Auto</td>
                        <td>{customerCode}</td>
                        <td>{peso(computed.principal)}</td>
                        <td>{formatDate(computed.releaseDate)}</td>
                        <td>{loanType}</td>
                        <td>{computed.interest}</td>
                        <td>{computed.terms}</td>
                        <td>{clientName}</td>
                        <td>{formatDate(computed.maturity)}</td>
                        <td>{peso(computed.totalAmount)}</td>
                        <td>{peso(computed.charges)}</td>
                        <td><span className={isEligible ? 'reloan-good' : 'reloan-hold'}>{isEligible ? 'Good' : 'Hold'}</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="reloan-table-footer">Showing 1 to 1 of 1 entries</div>
              </section>

              <div className="reloan-footer">
                <button type="submit" className="reloan-primary" disabled={submitting}>
                  <span>＋</span>{submitting ? 'Submitting...' : 'Add'}
                </button>
                <button type="button" className="reloan-secondary" onClick={onClose}>× Close</button>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
};

export default ReloanModal;
