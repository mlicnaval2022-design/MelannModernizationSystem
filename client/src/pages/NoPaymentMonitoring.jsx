import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtAmt(n) {
  return Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
}

export default function NoPaymentMonitoring() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialTab = params.get('tab') || 'new';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [collectors, setCollectors] = useState([]);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    API.get('/branches').then(r => setBranches(r.data)).catch(console.error);
    API.get('/collectors').then(r => setCollectors(r.data)).catch(console.error);
  }, []);

  // Filters
  const [collectorId, setCollectorId] = useState(user.role === 'collector' || user.role === 'teller' ? user.id : '');
  const [branchId, setBranchId] = useState(user.branch_id || '');

  // Modals
  const [followUpModal, setFollowUpModal] = useState({ show: false, alert: null });
  const [ptpModal, setPtpModal] = useState({ show: false, alert: null });
  const [timelineModal, setTimelineModal] = useState({ show: false, alert: null, history: [] });
  const [resolveModal, setResolveModal] = useState({ show: false, alert: null });
  const [escalateModal, setEscalateModal] = useState({ show: false, alert: null });

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/monitoring/alerts`, { params: { tab: activeTab, branch_id: branchId, collector_id: collectorId } });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    // eslint-disable-next-line
  }, [activeTab, branchId, collectorId]);

  const tabs = [
    { id: 'new', label: 'New (Day 3)', icon: '🆕' },
    { id: 'monitoring', label: 'Under Monitoring', icon: '👀' },
    { id: 'ptp', label: 'Promise to Pay', icon: '🤝' },
    { id: 'escalated', label: 'Escalated', icon: '🔥' },
    { id: 'resolved', label: 'Resolved', icon: '✅' },
    { id: 'history', label: 'History', icon: '🕰️' }
  ];

  const handleAction = async (action, payload) => {
    try {
      if (action === 'follow-up') await API.post('/monitoring/follow-up', payload);
      else if (action === 'ptp') await API.post('/monitoring/ptp', payload);
      else if (action === 'resolve') await API.post('/monitoring/resolve', payload);
      else if (action === 'escalate') await API.post('/monitoring/escalate', payload);
      
      fetchAlerts();
      return true;
    } catch (err) {
      alert(err.response?.data?.error || err.message);
      return false;
    }
  };

  const openTimeline = async (alert) => {
    try {
      const res = await API.get(`/monitoring/timeline/${alert.id}`);
      setTimelineModal({ show: true, alert, history: res.data });
    } catch (err) {
      alert('Could not load timeline');
    }
  };

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>🚨 3-Day No-Payment Monitoring</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {user.role === 'admin' && (
            <button className="btn btn-secondary" onClick={() => navigate('/monitoring-settings')}>⚙️ Settings</button>
          )}
        </div>
      </div>

      <div className="tabs" style={{ display: 'flex', gap: 10, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
        {tabs.map(t => (
          <div 
            key={t.id} 
            style={{ 
              padding: '10px 20px', 
              cursor: 'pointer', 
              fontWeight: activeTab === t.id ? 'bold' : 'normal',
              color: activeTab === t.id ? '#2563eb' : '#64748b',
              borderBottom: activeTab === t.id ? '3px solid #2563eb' : '3px solid transparent',
              transition: 'all 0.2s'
            }}
            onClick={() => setActiveTab(t.id)}
          >
            {t.icon} {t.label}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 15, marginBottom: 20, background: '#f8fafc', padding: 15, borderRadius: 8 }}>
        {(user.role === 'admin' || user.role === 'manager') && (
          <div className="form-group" style={{ margin: 0, width: 200 }}>
            <label style={{ fontSize: 11, fontWeight: 'bold' }}>Branch</label>
            <select className="form-control" value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.branch_name}</option>
              ))}
            </select>
          </div>
        )}
        {(user.role === 'admin' || user.role === 'manager') && (
          <div className="form-group" style={{ margin: 0, width: 200 }}>
            <label style={{ fontSize: 11, fontWeight: 'bold' }}>Collector</label>
            <select className="form-control" value={collectorId} onChange={e => setCollectorId(e.target.value)}>
              <option value="">All Collectors</option>
              {collectors.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div style={{ color: 'red' }}>{error}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ fontSize: 13, minWidth: 1500 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th>Client</th>
                <th>Loan Info</th>
                <th>Collector</th>
                <th>Alert Level</th>
                <th>Consecutive Days</th>
                <th>First Missed</th>
                <th>Repeat Risk</th>
                {activeTab === 'ptp' && <th>PTP Date</th>}
                {activeTab === 'ptp' && <th>PTP Amount</th>}
                <th>Last Follow-up</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr><td colSpan="11" style={{ textAlign: 'center' }}>No alerts found for this tab.</td></tr>
              ) : data.map(item => (
                <tr key={item.id} style={{ background: item.repeat_risk === 'High Risk' ? '#fef2f2' : 'transparent' }}>
                  <td>
                    <strong>{item.customer_name}</strong><br/>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{item.customer_code} | {item.contact}</span>
                  </td>
                  <td>
                    <strong style={{ color: '#0f172a' }}>{item.loan_code}</strong><br/>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Bal: ₱{fmtAmt(item.balance)} | Amort: ₱{fmtAmt(item.amortization)}</span>
                  </td>
                  <td>{item.collector_name}</td>
                  <td>
                    <span className={`badge ${item.alert_level === 'Day 4+' ? 'badge-danger' : 'badge-warning'}`}>
                      {item.alert_level}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <strong style={{ color: '#ef4444', fontSize: 16 }}>{item.consecutive_days}</strong>
                  </td>
                  <td>{fmtDate(item.first_missed_date)}</td>
                  <td>
                    <span style={{ 
                      color: item.repeat_risk === 'High Risk' ? '#ef4444' : item.repeat_risk === 'Moderate Risk' ? '#f59e0b' : '#10b981',
                      fontWeight: 'bold', fontSize: 12
                    }}>
                      {item.repeat_risk} (Seq: {item.sequence_number})
                    </span>
                  </td>
                  {activeTab === 'ptp' && <td><strong>{fmtDate(item.ptp_date)}</strong></td>}
                  {activeTab === 'ptp' && <td><strong style={{ color: '#10b981' }}>₱{fmtAmt(item.ptp_amount)}</strong></td>}
                  <td>
                    {item.last_follow_up_date ? (
                      <>
                        <div style={{ fontSize: 12 }}>{fmtDate(item.last_follow_up_date)}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{item.last_follow_up_result}</div>
                      </>
                    ) : <span style={{ color: '#94a3b8' }}>None</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => openTimeline(item)}>⏱️ Timeline</button>
                      {activeTab !== 'resolved' && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => setFollowUpModal({ show: true, alert: item })}>📞 Log</button>
                          <button className="btn btn-sm" style={{ background: '#10b981', color: 'white' }} onClick={() => setPtpModal({ show: true, alert: item })}>🤝 PTP</button>
                          <button className="btn btn-sm" style={{ background: '#f59e0b', color: 'white' }} onClick={() => setResolveModal({ show: true, alert: item })}>✅ Resolve</button>
                          {item.alert_level !== 'Day 4+' && (
                            <button className="btn btn-sm btn-danger" onClick={() => setEscalateModal({ show: true, alert: item })}>🔥 Escalate</button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Follow Up Modal */}
      {followUpModal.show && (
        <Modal title="Log Follow-up" onClose={() => setFollowUpModal({ show: false, alert: null })}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            const ok = await handleAction('follow-up', {
              alert_id: followUpModal.alert.id,
              customer_id: followUpModal.alert.customer_id,
              follow_up_date: f.get('date'),
              follow_up_method: f.get('method'),
              contact_result: f.get('result'),
              remarks: f.get('remarks'),
              next_follow_up_date: f.get('next_date')
            });
            if (ok) setFollowUpModal({ show: false, alert: null });
          }}>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" name="date" className="form-control" defaultValue={new Date().toISOString().split('T')[0]} required />
            </div>
            <div className="form-group">
              <label className="form-label">Method</label>
              <select name="method" className="form-control" required>
                <option value="Phone Call">Phone Call</option>
                <option value="SMS">SMS</option>
                <option value="Field Visit">Field Visit</option>
                <option value="Social Media">Social Media</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Result</label>
              <select name="result" className="form-control" required>
                <option value="Promised to Pay">Promised to Pay</option>
                <option value="Client Unavailable">Client Unavailable</option>
                <option value="Refused to Pay">Refused to Pay</option>
                <option value="Requested Extension">Requested Extension</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Next Follow-up Date</label>
              <input type="date" name="next_date" className="form-control" />
            </div>
            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea name="remarks" className="form-control" rows="3" required></textarea>
            </div>
            <button className="btn btn-primary" type="submit">Save Follow-up</button>
          </form>
        </Modal>
      )}

      {/* PTP Modal */}
      {ptpModal.show && (
        <Modal title="Log Promise to Pay" onClose={() => setPtpModal({ show: false, alert: null })}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.target);
            const ok = await handleAction('ptp', {
              alert_id: ptpModal.alert.id,
              customer_id: ptpModal.alert.customer_id,
              promise_date: f.get('date'),
              promised_amount: f.get('amount'),
              payment_method: f.get('method'),
              reason: f.get('reason'),
              remarks: f.get('remarks')
            });
            if (ok) setPtpModal({ show: false, alert: null });
          }}>
            <div className="form-group">
              <label className="form-label">Promise Date</label>
              <input type="date" name="date" className="form-control" required />
            </div>
            <div className="form-group">
              <label className="form-label">Promised Amount (₱)</label>
              <input type="number" step="0.01" name="amount" className="form-control" required defaultValue={ptpModal.alert?.amortization} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select name="method" className="form-control" required>
                <option value="Cash at Branch">Cash at Branch</option>
                <option value="Cash to Collector">Cash to Collector</option>
                <option value="Online Transfer">Online Transfer</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reason for Delay</label>
              <select name="reason" className="form-control" required>
                <option value="Financial Hardship">Financial Hardship</option>
                <option value="Medical Emergency">Medical Emergency</option>
                <option value="Forgot to Pay">Forgot to Pay</option>
                <option value="Out of Town">Out of Town</option>
                <option value="Business Slow">Business Slow</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Additional Remarks</label>
              <textarea name="remarks" className="form-control" rows="2"></textarea>
            </div>
            <button className="btn btn-primary" type="submit">Save PTP</button>
          </form>
        </Modal>
      )}

      {/* Resolve Modal */}
      {resolveModal.show && (
        <Modal title="Resolve Alert" onClose={() => setResolveModal({ show: false, alert: null })}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const ok = await handleAction('resolve', {
              alert_id: resolveModal.alert.id,
              reason: new FormData(e.target).get('reason')
            });
            if (ok) setResolveModal({ show: false, alert: null });
          }}>
            <div className="form-group">
              <label className="form-label">Reason for Manual Resolution</label>
              <select name="reason" className="form-control" required>
                <option value="Paid directly to bank">Paid directly to bank</option>
                <option value="Restructured">Restructured Loan</option>
                <option value="System Error">System Error / Duplicate</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Note: Alerts are automatically resolved when a valid payment is posted.</p>
            <button className="btn btn-primary" style={{ background: '#10b981' }} type="submit">Confirm Resolution</button>
          </form>
        </Modal>
      )}

      {/* Escalate Modal */}
      {escalateModal.show && (
        <Modal title="Escalate Alert" onClose={() => setEscalateModal({ show: false, alert: null })}>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const ok = await handleAction('escalate', {
              alert_id: escalateModal.alert.id,
              remarks: new FormData(e.target).get('remarks')
            });
            if (ok) setEscalateModal({ show: false, alert: null });
          }}>
            <p>You are escalating this case to <strong>Day 4+ (Critical)</strong>.</p>
            <div className="form-group">
              <label className="form-label">Escalation Remarks</label>
              <textarea name="remarks" className="form-control" rows="3" required></textarea>
            </div>
            <button className="btn btn-danger" type="submit">Escalate Case</button>
          </form>
        </Modal>
      )}

      {/* Timeline Modal */}
      {timelineModal.show && (
        <Modal title={`Timeline: ${timelineModal.alert?.customer_name}`} onClose={() => setTimelineModal({ show: false, alert: null, history: [] })}>
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: 10 }}>
            {timelineModal.history.length === 0 ? <p>No history found.</p> : timelineModal.history.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 15, marginBottom: 15, borderLeft: '2px solid #e2e8f0', paddingLeft: 15, position: 'relative' }}>
                <div style={{ position: 'absolute', left: -7, top: 0, width: 12, height: 12, borderRadius: '50%', background: h._type === 'ptp' ? '#10b981' : '#3b82f6' }}></div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 'bold' }}>{fmtDate(h.created_at)}</div>
                  {h._type === 'ptp' ? (
                    <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 8, marginTop: 5, border: '1px solid #bbf7d0' }}>
                      <strong style={{ color: '#15803d' }}>Promise To Pay Logged</strong><br/>
                      <span style={{ fontSize: 12 }}>Date: {fmtDate(h.promise_date)} | Amount: ₱{fmtAmt(h.promised_amount)}</span><br/>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Reason: {h.reason}</span>
                    </div>
                  ) : (
                    <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, marginTop: 5, border: '1px solid #e2e8f0' }}>
                      <strong style={{ color: '#0f172a' }}>Follow-up: {h.follow_up_method}</strong><br/>
                      <span style={{ fontSize: 12, color: '#1e293b' }}>Result: {h.contact_result}</span><br/>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Remarks: {h.remarks}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="modal-content" style={{ background: 'white', padding: 25, borderRadius: 12, width: 500, maxWidth: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>✖</button>
        </div>
        {children}
      </div>
    </div>
  );
}
