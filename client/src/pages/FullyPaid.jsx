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


  const getScoreColor = (score) => {
    if (score >= 90) return { bg: '#dcfce7', text: '#166534', label: '🟢 Excellent' };
    if (score >= 80) return { bg: '#e0f2fe', text: '#075985', label: '🔵 Good' };
    if (score >= 70) return { bg: '#fef9c3', text: '#854d0e', label: '🟡 Fair' };
    if (score >= 60) return { bg: '#ffedd5', text: '#9a3412', label: '🟠 Risky' };
    return { bg: '#fee2e2', text: '#991b1b', label: '🔴 Poor' };
  };

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
                            <select 
                              className="form-control" 
                              style={{ width: '130px', padding: '5px 10px', height: '32px', fontSize: '13px' }} 
                              onChange={(e) => {
                                if (e.target.value) handleActionDirect(r, e.target.value);
                                e.target.value = "";
                              }}
                            >
                              <option value="">Quick Action</option>
                              <option value="RELOAN">Reloan</option>
                              <option value="RECON">Recon</option>
                              <option value="RELAX">Relax</option>
                              <option value="HOLD">Hold</option>
                              <option value="RECI">Re-CI</option>
                            </select>
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
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>Credit Evaluation: {evalCustomer.client_name}</h3>
              <button className="btn-close" onClick={() => setEvalModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              {evalLoading ? <div style={{textAlign: 'center', padding: '40px'}}>Calculating Credit Score...</div> : evalData && (
                <div>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
                    <div style={{ flex: 1, background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 15px 0', color: '#334155' }}>Loan History Summary</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
                        <div><span style={{color: '#64748b'}}>Total Loans Availed:</span> <b>{evalData.total_loans}</b></div>
                        <div><span style={{color: '#64748b'}}>Total Amount Borrowed:</span> <b>₱{fmt(evalData.total_amount_borrowed)}</b></div>
                        <div><span style={{color: '#64748b'}}>On-Time Payments:</span> <b style={{color: '#10b981'}}>{evalData.on_time_payments}</b></div>
                        <div><span style={{color: '#64748b'}}>Late Payments:</span> <b style={{color: '#ef4444'}}>{evalData.late_payments}</b></div>
                        <div><span style={{color: '#64748b'}}>Past Due Occurrences:</span> <b style={{color: '#f59e0b'}}>{evalData.past_due_occurrences}</b></div>
                        <div><span style={{color: '#64748b'}}>Recon History:</span> <b>{evalData.recon_history}</b></div>
                        <div><span style={{color: '#64748b'}}>Last Loan Amount:</span> <b>₱{fmt(evalData.last_loan_amount)}</b></div>
                        <div><span style={{color: '#64748b'}}>Last Fully Paid:</span> <b>{evalCustomer.date_fully_paid}</b></div>
                      </div>
                    </div>
                    
                    <div style={{ width: '200px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#334155' }}>Credit Score</h4>
                      <div style={{ fontSize: '48px', fontWeight: 'bold', color: getScoreColor(evalData.credit_score).text }}>
                        {evalData.credit_score}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: getScoreColor(evalData.credit_score).text }}>
                        {getScoreColor(evalData.credit_score).label}
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                    <h4 style={{ margin: '0 0 15px 0', color: '#334155' }}>Manager Action</h4>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn btn-primary" style={{flex: 1, padding: '15px'}} onClick={() => handleAction('RELOAN')}>
                        <div style={{fontSize: '18px', marginBottom: '5px'}}>🔄 RELOAN</div>
                        <div style={{fontSize: '12px', opacity: 0.8, fontWeight: 'normal'}}>Open Reloan Application</div>
                      </button>
                      <button className="btn" style={{flex: 1, padding: '15px', background: '#e0f2fe', color: '#0369a1', borderColor: '#bae6fd'}} onClick={() => handleAction('RECON')}>
                        <div style={{fontSize: '18px', marginBottom: '5px'}}>🔍 RECON</div>
                        <div style={{fontSize: '12px', opacity: 0.8, fontWeight: 'normal'}}>Requires additional review</div>
                      </button>
                      <button className="btn" style={{flex: 1, padding: '15px', background: '#fef3c7', color: '#b45309', borderColor: '#fde68a'}} onClick={() => handleAction('RELAX')}>
                        <div style={{fontSize: '18px', marginBottom: '5px'}}>☕ RELAX</div>
                        <div style={{fontSize: '12px', opacity: 0.8, fontWeight: 'normal'}}>Temporarily resting</div>
                      </button>
                      <button className="btn" style={{flex: 1, padding: '15px', background: '#fee2e2', color: '#b91c1c', borderColor: '#fecaca'}} onClick={() => handleAction('HOLD')}>
                        <div style={{fontSize: '18px', marginBottom: '5px'}}>🛑 HOLD</div>
                        <div style={{fontSize: '12px', opacity: 0.8, fontWeight: 'normal'}}>Block new applications</div>
                      </button>
                      <button className="btn" style={{flex: 1, padding: '15px', background: '#f3e8ff', color: '#7e22ce', borderColor: '#e9d5ff'}} onClick={() => handleAction('RECI')}>
                        <div style={{fontSize: '18px', marginBottom: '5px'}}>📋 RE-CI</div>
                        <div style={{fontSize: '12px', opacity: 0.8, fontWeight: 'normal'}}>Requires credit investigation</div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
