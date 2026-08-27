import { useEffect, useState } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import ReloanModal from '../components/ReloanModal';

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FullyPaid({ search = '' }) {
  const { hasRole, hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Date filters
  const [filterReleasedFrom, setFilterReleasedFrom] = useState('');
  const [filterReleasedTo,   setFilterReleasedTo]   = useState('');
  const [filterPaidFrom,     setFilterPaidFrom]     = useState('');
  const [filterPaidTo,       setFilterPaidTo]       = useState('');

  // Credit Eval Modal State
  const [evalModal, setEvalModal] = useState(false);
  const [evalData, setEvalData] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalCustomer, setEvalCustomer] = useState(null);
  const [penaltyApproved, setPenaltyApproved] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [reasonModal, setReasonModal] = useState(null);
  const [reasonText, setReasonText] = useState('');
  const [reasonSaving, setReasonSaving] = useState(false);

  // Reloan Modal State
  const [reloanModalOpen, setReloanModalOpen] = useState(false);
  const [reloanCustomerId, setReloanCustomerId] = useState(null);
  const [reloanCustomer, setReloanCustomer] = useState(null);
  const [loanActionType, setLoanActionType] = useState('Reloan');

  const load = () => {
    setLoading(true);
    API.get('/customers/list/fully-paid')
      .then(r => setRows(r.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredRows = rows.filter(r => {
    const custStatus = String(r.status || '').toUpperCase();
    if (['RELAX', 'HOLD', 'RECON', 'HOLD/PASTDUE'].includes(custStatus)) return false;
    const nameMatch = (
      (r.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.customer_code || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.collector_name || '').toLowerCase().includes(search.toLowerCase())
    );
    const released = r.date_released || '';
    const paid     = r.date_fully_paid || '';
    if (filterReleasedFrom && released < filterReleasedFrom) return false;
    if (filterReleasedTo   && released > filterReleasedTo)   return false;
    if (filterPaidFrom     && paid     < filterPaidFrom)     return false;
    if (filterPaidTo       && paid     > filterPaidTo)       return false;
    return nameMatch;
  }).sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''));

  const clearFilters = () => {
    setFilterReleasedFrom(''); setFilterReleasedTo('');
    setFilterPaidFrom('');     setFilterPaidTo('');
  };

  const handlePrint = () => window.print();

  const openEval = async (customer) => {
    setEvalCustomer(customer);
    setEvalModal(true);
    setEvalLoading(true);
    setPenaltyApproved(false);
    setShowPaymentHistory(false);
    try {
      const res = await API.get(`/customers/${customer.id}/credit-eval`);
      setEvalData(res.data);
    } catch (e) {
      console.error(e);
      alert('Error loading credit evaluation');
      setEvalModal(false);
    } finally {
      setEvalLoading(false);
    }
  };

  const handleActionDirect = async (customer, action) => {
    if (action === 'RELOAN' || action === 'RECON') {
      setReloanCustomerId(customer.id);
      setReloanCustomer(customer);
      setLoanActionType(action === 'RECON' ? 'Recon' : 'Reloan');
      setReloanModalOpen(true);
      return;
    }
    if (action === 'RELAX' || action === 'HOLD') {
      const existingNote = action === 'RELAX' ? customer.relax_note : customer.hold_note;
      setReasonModal({ customer, action });
      setReasonText(existingNote || '');
      return;
    }
    if (!confirm(`Are you sure you want to set status to ${action}?`)) return;
    try {
      await API.post(`/customers/${customer.id}/status`, { status: action, remarks: `Manager decided to ${action}` });
      load();
    } catch (err) {
      alert(err.response?.data?.error || `Error setting status to ${action}`);
    }
  };

  const handleAction = async (action) => {
    if (!evalCustomer) return;
    if (action === 'RELOAN' || action === 'RECON') {
      setEvalModal(false);
      setReloanCustomerId(evalCustomer.id);
      setReloanCustomer(evalCustomer);
      setLoanActionType(action === 'RECON' ? 'Recon' : 'Reloan');
      setReloanModalOpen(true);
      return;
    }
    if (action === 'RELAX' || action === 'HOLD') {
      const existingNote = action === 'RELAX' ? evalCustomer.relax_note : evalCustomer.hold_note;
      setReasonModal({ customer: evalCustomer, action });
      setReasonText(existingNote || '');
      return;
    }
    await handleActionDirect(evalCustomer, action);
    setEvalModal(false);
  };

  const submitReasonAction = async () => {
    if (!reasonModal || !reasonModal.customer) return;
    const note = reasonText.trim();
    if (!note) { alert('Please enter a manager note / reason.'); return; }
    setReasonSaving(true);
    try {
      await API.post(`/customers/${reasonModal.customer.id}/status`, {
        status: reasonModal.action,
        remarks: note
      });
      await API.put(`/customers/${reasonModal.customer.id}/status-note`, {
        note: note,
        status: reasonModal.action
      }).catch(() => {});

      setReasonModal(null);
      setReasonText('');
      setEvalModal(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || `Error setting status to ${reasonModal.action}`);
    } finally {
      setReasonSaving(false);
    }
  };

  const handleApprovePenalty = async () => {
    if (!evalCustomer || !penaltyApproved) return;
    try {
      await API.post(`/customers/${evalCustomer.id}/penalty`);
      const res = await API.get(`/customers/${evalCustomer.id}/credit-eval`);
      setEvalData(res.data);
      setPenaltyApproved(false);
      alert('Penalty approved and added to loan balance.');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve penalty');
    }
  };

  const getScoreColor = (score) => {
    if (score >= 90) return { bg: '#dcfce7', text: '#166534', label: '🟢 Excellent' };
    if (score >= 80) return { bg: '#e0f2fe', text: '#075985', label: '🔵 Good' };
    if (score >= 70) return { bg: '#fef9c3', text: '#854d0e', label: '🟡 Fair' };
    if (score >= 60) return { bg: '#ffedd5', text: '#9a3412', label: '🟠 Risky' };
    return { bg: '#fee2e2', text: '#991b1b', label: '🔴 Poor' };
  };

  const getScoreMeta = (score) => {
    if (score >= 90) return { label: 'EXCELLENT', color: '#059669', bg: '#ecfdf5', note: 'The borrower shows strong and consistent payment behavior.' };
    if (score >= 80) return { label: 'GOOD', color: '#0369a1', bg: '#e0f2fe', note: 'The borrower shows good payment behavior with low risk.' };
    if (score >= 70) return { label: 'FAIR', color: '#ca8a04', bg: '#fef9c3', note: 'The borrower is acceptable but should be reviewed carefully.' };
    if (score >= 60) return { label: 'RISKY', color: '#ea580c', bg: '#fff7ed', note: 'The borrower shows acceptable payment behavior but has risk factors that need monitoring.' };
    return { label: 'POOR', color: '#dc2626', bg: '#fef2f2', note: 'The borrower has significant risk factors that require manager review.' };
  };

  const evalTimestamp = new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const hasDateFilters = filterReleasedFrom || filterReleasedTo || filterPaidFrom || filterPaidTo;

  return (
    <div>
      {/* ── Toolbar: date filters + print ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginBottom: '15px', padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Released From</label>
            <input type="date" className="form-control" style={{ width: 150, padding: '6px 10px' }} value={filterReleasedFrom} onChange={e => setFilterReleasedFrom(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Released To</label>
            <input type="date" className="form-control" style={{ width: 150, padding: '6px 10px' }} value={filterReleasedTo} onChange={e => setFilterReleasedTo(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fully Paid From</label>
            <input type="date" className="form-control" style={{ width: 150, padding: '6px 10px' }} value={filterPaidFrom} onChange={e => setFilterPaidFrom(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fully Paid To</label>
            <input type="date" className="form-control" style={{ width: 150, padding: '6px 10px' }} value={filterPaidTo} onChange={e => setFilterPaidTo(e.target.value)} />
          </div>
          {hasDateFilters && (
            <button className="btn btn-secondary btn-sm" onClick={clearFilters} style={{ alignSelf: 'flex-end' }}>✕ Clear</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={load}>🔄 Refresh</button>
          <button className="btn btn-dark" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>🖨️ Print</button>
        </div>
      </div>

      {/* ── Result count ── */}
      <div style={{ marginBottom: 10, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
        Showing {filteredRows.length} of {rows.length} clients
        {hasDateFilters && <span style={{ marginLeft: 8, color: '#3b82f6' }}>(filtered)</span>}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Client Name</th>
                <th>Collector</th>
                <th>Last Loan Amount</th>
                <th>Date Released</th>
                <th>Date Fully Paid</th>
                <th>Loan Cycles</th>
                <th>Credit Score</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={9} style={{ textAlign: 'center', padding: '30px' }}>⏳ Loading...</td></tr>
                : filteredRows.length === 0
                  ? <tr><td colSpan={9} className="empty-state">No fully paid clients found</td></tr>
                  : filteredRows.map(r => {
                    const scoreInfo = getScoreColor(r.credit_score);
                    return (
                      <tr key={r.id}>
                        <td>{r.customer_code}</td>
                        <td style={{ fontWeight: 'bold' }}>{r.client_name}</td>
                        <td>{r.collector_name || 'Unassigned'}</td>
                        <td>₱{fmt(r.last_loan_amount)}</td>
                        <td>{r.date_released || '—'}</td>
                        <td>{r.date_fully_paid || '—'}</td>
                        <td>{r.loan_cycles}</td>
                        <td>
                          <span style={{ background: scoreInfo.bg, color: scoreInfo.text, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                            {scoreInfo.label} ({r.credit_score})
                          </span>
                        </td>
                        <td>
                          {(hasRole('admin', 'manager') || hasPermission('reports', 'edit') || hasPermission('reports', 'crud') || hasPermission('report:full-paid', 'edit') || hasPermission('report:full-paid', 'crud') || hasPermission('customers', 'edit') || hasPermission('customers', 'crud')) ? (
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-dark btn-sm"
                                onClick={() => openEval(r)}
                                title="Open full credit evaluation"
                              >
                                Evaluate
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', fontWeight: 700 }}
                                onClick={() => handleActionDirect(r, 'RELAX')}
                                title="Mark client as Relax — cleared for reloan"
                              >
                                ✅ Relax
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 700 }}
                                onClick={() => handleActionDirect(r, 'HOLD')}
                                title="Put client on Hold — requires manager note"
                              >
                                ⏸ Hold
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>Manager Only</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Credit Evaluation Modal ── */}
      {evalModal && evalCustomer && (
        <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.42)', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="modal" style={{ width: 'min(1180px, 96vw)', maxWidth: '1180px', maxHeight: '92vh', overflow: 'auto', borderRadius: '14px', border: '1px solid #dbe7f6', boxShadow: '0 24px 70px rgba(15, 23, 42, 0.25)', padding: 0, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px', padding: '22px 28px', borderBottom: '1px solid #d7e3f2', background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)' }}>
              <div style={{ width: 54, height: 54, borderRadius: 8, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, boxShadow: '0 8px 18px rgba(37, 99, 235, 0.22)' }}>U</div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, color: '#0b1f44', fontSize: 28, lineHeight: 1.1, fontWeight: 800 }}>Credit Evaluation: {evalCustomer.client_name}</h2>
                <div style={{ marginTop: 6, color: '#64748b', fontSize: 18 }}>Evaluation Date: {evalTimestamp}</div>
              </div>
              <button className="btn-close" onClick={() => setEvalModal(false)} style={{ fontSize: 32, color: '#475569', background: 'transparent', border: 'none', cursor: 'pointer' }}>x</button>
            </div>

            <div style={{ padding: '30px 34px 0' }}>
              {evalLoading ? <div style={{ textAlign: 'center', padding: '60px', color: '#334155', fontSize: 18 }}>Calculating Credit Score...</div> : evalData && (() => {
                const scoreMeta = getScoreMeta(evalData.credit_score);
                let gapText = '';
                if (evalCustomer.date_fully_paid && evalData.last_loan?.date_maturity) {
                  const fp = new Date(evalCustomer.date_fully_paid);
                  const mat = new Date(evalData.last_loan.date_maturity);
                  const diff = Math.floor((mat - fp) / 86400000);
                  if (diff > 0) gapText = ` (${diff}d adv)`;
                  else if (diff < 0) gapText = ` (${Math.abs(diff)}d late)`;
                }

                const statLeft = [
                  ['L', '#dbeafe', '#2563eb', 'Total Loans Availed', evalData.total_loans],
                  ['OK', '#dcfce7', '#059669', 'On-Time Payments', evalData.on_time_payments],
                  ['P', '#ede9fe', '#7c3aed', 'Payments Paid', evalData.total_payment_count || 0],
                  ['R', '#ffedd5', '#f59e0b', 'Recon History', evalData.recon_history],
                  ['M', '#ccfbf1', '#0f766e', 'Maturity Date', evalData.last_loan?.date_maturity || '-'],
                  ['D', '#dbeafe', '#2563eb', 'Last Fully Paid', (evalCustomer.date_fully_paid || '-') + gapText],
                  ['%', '#dcfce7', '#059669', 'Paid Before Final', (evalData.payment_consistency?.paid_before_final_percent || 0) + '%'],
                ];
                const statRight = [
                  ['P', '#dcfce7', '#059669', 'Total Amount Borrowed', 'PHP ' + fmt(evalData.total_amount_borrowed)],
                  ['T', '#fee2e2', '#dc2626', 'Late Payments', evalData.late_payments],
                  ['!', '#ffedd5', '#ea580c', 'Past Due Occurrences', evalData.past_due_occurrences],
                  ['W', '#dbeafe', '#2563eb', 'Last Loan Amount', 'PHP ' + fmt(evalData.last_loan_amount)],
                  ['C', '#ccfbf1', '#0f766e', 'Daily Payment Coverage', (evalData.payment_consistency?.daily_payment_percent || 0) + '%'],
                  ['F', '#dbeafe', '#2563eb', 'Final Payoff', 'PHP ' + fmt(evalData.payment_consistency?.final_payment_amount) + ' (' + (evalData.payment_consistency?.final_payment_percent || 0) + '%)'],
                ];
                const StatRow = ({ item }) => (
                  <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr auto', alignItems: 'center', gap: 16, padding: '14px 14px', borderBottom: '1px solid #dbe7f6' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 10, background: item[1], color: item[2], display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>{item[0]}</div>
                    <div style={{ color: '#1e3158', fontSize: 17 }}>{item[3]}</div>
                    <div style={{ color: item[3].includes('Late') || item[3].includes('Past Due') ? '#dc2626' : item[3].includes('On-Time') ? '#059669' : '#071a3d', fontSize: 20, fontWeight: 800, textAlign: 'right' }}>{item[4]}</div>
                  </div>
                );
                const actionCard = (label, sub, icon, color, bg, border, action, dark = false) => (
                  <button type="button" onClick={() => handleAction(action)} style={{ flex: 1, minHeight: 176, borderRadius: 10, border: '1px solid ' + border, background: dark ? 'linear-gradient(135deg, #07152d 0%, #102a55 100%)' : bg, color: dark ? '#fff' : '#12264b', display: 'grid', gridTemplateColumns: '96px 1fr', alignItems: 'center', gap: 18, padding: '26px', cursor: 'pointer', boxShadow: dark ? '0 12px 24px rgba(15, 23, 42, 0.22)' : 'none' }}>
                    <div style={{ width: 84, height: 84, borderRadius: 42, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, boxShadow: '0 10px 24px rgba(15, 23, 42, 0.18)' }}>{icon}</div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ color: dark ? '#fff' : color, fontSize: 22, fontWeight: 800 }}>{label}</div>
                      <div style={{ marginTop: 8, color: dark ? '#dbeafe' : '#475569', fontSize: 17, lineHeight: 1.35 }}>{sub}</div>
                      <div style={{ marginTop: 22, color: dark ? '#fff' : color, fontSize: 28 }}>&rarr;</div>
                    </div>
                  </button>
                );

                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 28 }}>
                      <section style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 18, background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '4px 8px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#0f4fbf', fontSize: 22, fontWeight: 800 }}>
                            <span style={{ width: 40, height: 40, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>*</span>
                            Payment Statistics
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                          <div>{statLeft.map((item, i) => <StatRow key={i} item={item} />)}</div>
                          <div>{statRight.map((item, i) => <StatRow key={i} item={item} />)}</div>
                        </div>
                      </section>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <section style={{ border: `2px solid ${scoreMeta.color}`, borderRadius: 12, padding: 20, background: scoreMeta.bg, textAlign: 'center' }}>
                          <div style={{ fontSize: 72, fontWeight: 900, color: scoreMeta.color, lineHeight: 1 }}>{evalData.credit_score}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: scoreMeta.color, marginTop: 4 }}>{scoreMeta.label}</div>
                          <div style={{ marginTop: 10, color: '#475569', fontSize: 14, lineHeight: 1.4 }}>{scoreMeta.note}</div>
                        </section>
                        {evalData.penalty_amount > 0 && (
                          <section style={{ border: '1px solid #fca5a5', borderRadius: 12, padding: 16, background: '#fef2f2' }}>
                            <div style={{ fontWeight: 800, color: '#dc2626', fontSize: 16, marginBottom: 8 }}>⚠ Penalty Due</div>
                            <div style={{ color: '#7f1d1d', fontSize: 14 }}>Amount: <strong>PHP {fmt(evalData.penalty_amount)}</strong></div>
                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input type="checkbox" id="penaltyApprove" checked={penaltyApproved} onChange={e => setPenaltyApproved(e.target.checked)} />
                              <label htmlFor="penaltyApprove" style={{ fontSize: 13, color: '#7f1d1d', cursor: 'pointer' }}>I confirm penalty approval</label>
                            </div>
                            <button className="btn btn-sm" style={{ marginTop: 10, background: '#dc2626', color: '#fff', width: '100%' }} disabled={!penaltyApproved} onClick={handleApprovePenalty}>Approve Penalty</button>
                          </section>
                        )}
                      </div>
                    </div>

                    {/* Payment History toggle */}
                    {evalData.payment_history?.length > 0 && (
                      <div style={{ marginTop: 20 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowPaymentHistory(v => !v)}>
                          {showPaymentHistory ? '▲ Hide' : '▼ Show'} Payment History ({evalData.payment_history.length})
                        </button>
                        {showPaymentHistory && (
                          <div style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            <table className="data-table" style={{ margin: 0 }}>
                              <thead>
                                <tr><th>Date</th><th>Amount</th><th>Type</th><th>Notes</th><th>Status</th></tr>
                              </thead>
                              <tbody>
                                {evalData.payment_history.map((p, i) => (
                                  <tr key={i}>
                                    <td>{p.date_paid}</td>
                                    <td>₱{fmt(p.amount_paid)}</td>
                                    <td>{p.payment_type}</td>
                                    <td style={{ fontSize: '12px', color: '#475569', maxWidth: '180px', wordBreak: 'break-word' }}>
                                      {p.remarks || '—'}
                                    </td>
                                    <td>
                                      <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        background: (p.status === 'paid' || p.status === 'active') ? '#dcfce7' : '#fee2e2',
                                        color: (p.status === 'paid' || p.status === 'active') ? '#166534' : '#991b1b'
                                      }}>
                                        {p.status.toUpperCase()}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action cards */}
                    <div style={{ display: 'flex', gap: 16, marginTop: 28, paddingBottom: 28, flexWrap: 'wrap' }}>
                      {actionCard('RELOAN', 'Client is eligible and cleared for a new loan.', '🔄', '#2563eb', '#eff6ff', '#bfdbfe', 'RELOAN')}
                      {actionCard('RECON', 'Reconstruct or adjust existing loan records.', '🔧', '#7c3aed', '#f5f3ff', '#ddd6fe', 'RECON')}
                      {actionCard('✅ RELAX', 'Mark as cleared — eligible for reloan. Appears in Relax tab.', '✅', '#059669', '#ecfdf5', '#6ee7b7', 'RELAX')}
                      {actionCard('⏸ HOLD', 'Restrict from reloaning. Appears in Hold tab.', '⏸', '#d97706', '#fffbeb', '#fcd34d', 'HOLD')}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Hold / Relax Reason Modal ── */}
      {reasonModal && (() => {
        const isRelax = reasonModal.action === 'RELAX';
        const accentColor  = isRelax ? '#059669' : '#d97706';
        const accentBg     = isRelax ? '#ecfdf5'  : '#fffbeb';
        const accentBorder = isRelax ? '#6ee7b7'  : '#fcd34d';
        const icon         = isRelax ? '✅' : '⏸';
        return (
          <div className="modal-overlay" style={{ background: 'rgba(15, 23, 42, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 10000 }}>
            <div className="modal" style={{ width: 'min(520px, 94vw)', borderRadius: 16, border: `1px solid ${accentBorder}`, boxShadow: '0 32px 80px rgba(15, 23, 42, 0.30)', padding: 0, background: '#fff', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '20px 26px', borderBottom: `1px solid ${accentBorder}`, background: accentBg, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fff', border: `2px solid ${accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{icon}</div>
                <div>
                  <h3 style={{ margin: 0, color: accentColor, fontSize: 20, fontWeight: 900 }}>
                    {isRelax ? 'Mark as Relax' : 'Put on Hold'}
                  </h3>
                  <div style={{ marginTop: 3, color: '#64748b', fontSize: 13, fontWeight: 600 }}>{reasonModal.customer.client_name}</div>
                </div>
              </div>
              {/* Body */}
              <div style={{ padding: 26 }}>
                <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                  {isRelax
                    ? '✅ Marking this client as Relax means they are cleared and eligible for a reloan. This status will reflect in the Relax tab under Loans.'
                    : '⏸ Putting this client on Hold means they are temporarily restricted from reloaning. This status will reflect in the Hold tab under Loans.'}
                </div>
                <label style={{ display: 'block', color: '#071a3d', fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                  Manager Note / Reason <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  value={reasonText}
                  onChange={e => setReasonText(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder={isRelax
                    ? 'e.g. Client has good payment history, cleared for reloan...'
                    : 'e.g. Client has pending obligations, hold until further notice...'}
                  style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: `1.5px solid ${accentBorder}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, lineHeight: 1.5, outlineColor: accentColor }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={reasonSaving}
                    onClick={() => { setReasonModal(null); setReasonText(''); }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={reasonSaving}
                    onClick={submitReasonAction}
                    style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {reasonSaving ? 'Saving...' : `${icon} Confirm ${reasonModal.action}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <ReloanModal
        isOpen={reloanModalOpen}
        onClose={() => setReloanModalOpen(false)}
        customerId={reloanCustomerId}
        customer={reloanCustomer}
        loanType={loanActionType}
        onReloanSubmitted={() => {
          setReloanModalOpen(false);
          setReloanCustomer(null);
          load();
        }}
      />
    </div>
  );
}
