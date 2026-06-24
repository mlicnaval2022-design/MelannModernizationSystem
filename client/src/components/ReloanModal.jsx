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

const getRecommendedAmount = data => {
  if (!data) return '';
  return data.recommendations?.standard || data.last_loan_amount || '';
};

const ReloanModal = ({ isOpen, onClose, customerId, customer, loanType = 'Reloan', onReloanSubmitted }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [desiredAmount, setDesiredAmount] = useState('');
  const [dateRelease, setDateRelease] = useState(() => toInputDate(new Date()));
  const [loanTerm, setLoanTerm] = useState('45');
  const [interestRate, setInterestRate] = useState('15');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchReloanData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get(`/customers/${customerId}/reloan-eval`);
      setData(res.data);
      setDesiredAmount(current => current || getRecommendedAmount(res.data));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch reloan evaluation data');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (isOpen && customerId) {
      fetchReloanData();
    }
  }, [isOpen, customerId, fetchReloanData]);

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setSubmitting(false);
      setRemarks('');
      setLoanTerm('45');
      setInterestRate('15');
      setDateRelease(toInputDate(new Date()));
      setDesiredAmount('');
    }
  }, [isOpen]);

  const computed = useMemo(() => {
    const today = new Date();
    const releaseDate = dateRelease ? new Date(`${dateRelease}T00:00:00`) : today;
    const principal = Number(desiredAmount || 0);
    const terms = Number(loanTerm || 45);
    const interest = Number(interestRate || 0);
    const charges = 0;
    const interestAmount = principal * (interest / 100);
    const totalForRelease = Math.max(principal - charges, 0);
    const totalAmount = principal + interestAmount;
    const paymentPerDay = terms > 0 ? Math.ceil(totalAmount / terms) : 0;

    return {
      today,
      releaseDate,
      principal,
      interest,
      interestAmount,
      terms,
      charges,
      totalForRelease,
      totalAmount,
      paymentPerDay,
      maturity: addDays(releaseDate, terms)
    };
  }, [desiredAmount, loanTerm, interestRate, dateRelease]);

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
      await API.post(`/customers/${customerId}/reloan`, {
        principal: Number(desiredAmount),
        loan_period: Number(loanTerm),
        interest_rate: Number(interestRate || 0),
        date_released: dateRelease,
        loan_type: loanType,
        remarks
      });
      setShowSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit reloan application');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const clientName = customer?.client_name || customer?.full_name || 'Selected customer';
  const customerCode = customer?.customer_code || customerId || '';
  const collectorName = customer?.collector_name || 'Select collector';
  const isEligible = data?.is_eligible !== false;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (showSuccess) {
    return (
      <div className="reloan-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
        <div className="reloan-modal" style={{ width: '400px', textAlign: 'center', padding: '50px 30px' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '40px', margin: '0 auto 20px auto' }}>✓</div>
          <h2 style={{ margin: '0 0 10px 0', color: '#047857', fontSize: '24px' }}>Saved Loan</h2>
          <p style={{ color: '#64748b', marginBottom: '30px' }}>The loan application has been saved successfully and sent for approval.</p>
          <button className="reloan-primary" style={{ width: '100%', padding: '12px', justifyContent: 'center' }} onClick={onReloanSubmitted}>OK</button>
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
              <h2>REGULAR LOAN FILE MAINTENANCE</h2>
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
          {loading ? (
            <div className="reloan-state">
              <div className="reloan-spinner" />
              <span>Loading reloan file...</span>
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
                      <i>▣</i>
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
                    <div>
                      <span>OLD BALANCE</span>
                      <strong>{peso(0)}</strong>
                    </div>
                  </div>

                  <div className="reloan-charges-row">
                    <div className="reloan-charges">
                      <div className="reloan-section-title compact">CHARGES INFORMATION</div>
                      {['Insurance', 'Collection', 'Penalty', 'Passbook', 'Service Fee'].map(label => (
                        <label key={label} className="reloan-charge-field">
                          <span>{label}</span>
                          <div>
                            <i>₱</i>
                            <input value={numberText(0)} readOnly />
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
                <button type="button" className="reloan-secondary muted">▤ SOA (Statement of Account)</button>
                <button type="button" className="reloan-secondary muted">▭ Generate Disclosure</button>
                <label className="reloan-remarks">
                  <span>Remarks</span>
                  <input
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add notes for approval"
                  />
                </label>
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
};

export default ReloanModal;
