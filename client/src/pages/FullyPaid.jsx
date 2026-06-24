import { useEffect, useState } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import ReloanModal from '../components/ReloanModal';

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FullyPaid({ search = '' }) {
  const { hasRole } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Credit Eval Modal State
  const [evalModal, setEvalModal] = useState(false);
  const [evalData, setEvalData] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalCustomer, setEvalCustomer] = useState(null);
  const [penaltyApproved, setPenaltyApproved] = useState(false);

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

  useEffect(() => {
    load();
  }, []);

  const filteredRows = rows.filter(r => 
    (r.client_name || '').toLowerCase().includes(search.toLowerCase()) || 
    (r.customer_code || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.collector_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const openEval = async (customer) => {
    setEvalCustomer(customer);
    setEvalModal(true);
    setEvalLoading(true);
    setPenaltyApproved(false);
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
    await handleActionDirect(evalCustomer, action);
    setEvalModal(false);
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
        <button className="btn btn-secondary" onClick={load}>🔄 Refresh Data</button>
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
              {loading ? <tr><td colSpan={9} style={{textAlign:'center', padding:'30px'}}>⏳ Loading...</td></tr>
                : filteredRows.length === 0 ? <tr><td colSpan={9} className="empty-state">No fully paid clients found</td></tr>
                : filteredRows.map(r => {
                  const scoreInfo = getScoreColor(r.credit_score);
                  return (
                    <tr key={r.id}>
                      <td>{r.customer_code}</td>
                      <td style={{fontWeight: 'bold'}}>{r.client_name}</td>
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
                        {hasRole('admin', 'manager') ? (
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button className="btn btn-dark btn-sm" onClick={() => openEval(r)}>Evaluate</button>
                          </div>
                        ) : (
                          <span style={{color: '#94a3b8', fontSize: '12px'}}>Manager Only</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      </div>

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
              {evalLoading ? <div style={{textAlign: 'center', padding: '60px', color: '#334155', fontSize: 18}}>Calculating Credit Score...</div> : evalData && (() => {
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#0f4fbf', fontSize: 22, fontWeight: 800, margin: '4px 8px 16px' }}>
                          <span style={{ width: 40, height: 40, borderRadius: 8, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>*</span>
                          LOAN HISTORY SUMMARY
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                          <div style={{ border: '1px solid #dbe7f6', borderRadius: 8, padding: '4px 14px' }}>{statLeft.map(item => <StatRow key={item[3]} item={item} />)}</div>
                          <div style={{ border: '1px solid #dbe7f6', borderRadius: 8, padding: '4px 14px' }}>{statRight.map(item => <StatRow key={item[3]} item={item} />)}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, border: '1px solid #fecaca', background: '#fff1f2', color: '#dc2626', borderRadius: 8, padding: '14px 18px', fontSize: 15, fontWeight: 800 }}>
                          <span style={{ width: 34, height: 34, borderRadius: 17, background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</span>
                          Payment Pattern: {evalData.payment_consistency?.label || 'No payment history'}
                        </div>
                      </section>

                      <aside style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 22, background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)', textAlign: 'center' }}>
                        <div style={{ width: 76, height: 76, borderRadius: 38, background: '#dbeafe', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: 34 }}>&rarr;</div>
                        <div style={{ color: '#0f4fbf', fontSize: 22, fontWeight: 800, marginBottom: 22 }}>CREDIT SCORE</div>
                        <div style={{ width: 240, height: 240, margin: '0 auto', borderRadius: '50%', background: 'conic-gradient(#16a34a 0 33%, #f59e0b 33% 66%, #ef4444 66% 100%)', padding: 14 }}>
                          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ fontSize: 76, lineHeight: 1, color: scoreMeta.color, fontWeight: 900 }}>{evalData.credit_score}</div>
                            <div style={{ color: '#475569', fontSize: 22 }}>/100</div>
                          </div>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 18, background: scoreMeta.bg, color: scoreMeta.color, border: '1px solid ' + scoreMeta.color + '33', borderRadius: 999, padding: '12px 34px', fontSize: 20, fontWeight: 800 }}>
                          <span style={{ width: 20, height: 20, borderRadius: 10, background: scoreMeta.color, display: 'inline-block' }} /> {scoreMeta.label}
                        </div>
                        <div style={{ borderTop: '1px solid #dbe7f6', marginTop: 28, paddingTop: 26, textAlign: 'left', color: '#475569', fontSize: 16, lineHeight: 1.45 }}>{scoreMeta.note}</div>
                      </aside>
                    </div>

                    {evalData.overdue && evalData.overdue.days > 0 && (
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '15px', marginTop: '20px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#9a3412' }}>Overdue and Penalty Review</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '14px', marginBottom: '12px' }}>
                          <div><span style={{ color: '#64748b' }}>Status:</span> <b style={{ textTransform: 'uppercase', color: '#dc2626' }}>{evalData.overdue.status}</b></div>
                          <div><span style={{ color: '#64748b' }}>Days Overdue:</span> <b>{evalData.overdue.days}</b></div>
                          <div><span style={{ color: '#64748b' }}>Recommended Penalty:</span> <b>{evalData.overdue.penalty_rate}% / PHP {fmt(evalData.overdue.recommended_penalty)}</b></div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#7c2d12', fontWeight: 600 }}>
                          <input type="checkbox" checked={penaltyApproved} onChange={e => setPenaltyApproved(e.target.checked)} />
                          Manager approves applying this penalty
                        </label>
                        <button className="btn" style={{ marginTop: '12px', background: penaltyApproved ? '#ea580c' : '#e2e8f0', color: penaltyApproved ? '#fff' : '#64748b', borderColor: penaltyApproved ? '#ea580c' : '#cbd5e1' }} disabled={!penaltyApproved} onClick={handleApprovePenalty}>Apply Penalty</button>
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid #dbe7f6', marginTop: 24, paddingTop: 24 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#071a3d', fontSize: 22, fontWeight: 800, marginBottom: 20 }}>
                        <span style={{ width: 38, height: 38, borderRadius: 8, background: '#dbeafe', color: '#0f4fbf', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>*</span>
                        MANAGER ACTION
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
                        {actionCard('RELOAN', 'Open Reloan Application', 'RL', '#2563eb', '#eff6ff', '#bfdbfe', 'RELOAN', true)}
                        {actionCard('RELAX', 'Temporarily resting', 'RX', '#f59e0b', '#fff7ed', '#fed7aa', 'RELAX')}
                        {actionCard('HOLD', 'Block new applications', '!', '#ef4444', '#fff1f2', '#fecaca', 'HOLD')}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{ marginTop: 26, borderTop: '1px solid #dbe7f6', background: '#f8fbff', padding: '20px 100px', display: 'flex', alignItems: 'center', gap: 16, color: '#475569', fontSize: 15 }}>
              <span style={{ width: 28, height: 28, borderRadius: 14, background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>i</span>
              This evaluation is based on the borrower's payment history and account activity. Please review all details before taking action.
            </div>
          </div>
        </div>
      )}

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

