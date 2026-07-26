import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  Flame,
  Handshake,
  History,
  Loader2,
  Phone,
  RefreshCw,
  Settings,
  UserRound,
  X
} from 'lucide-react';
import './NoPaymentMonitoring.css';

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
  const [scanning, setScanning] = useState(false);

  const [collectors, setCollectors] = useState([]);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    API.get('/branches').then(r => setBranches(r.data)).catch(console.error);
    API.get('/collectors').then(r => setCollectors(r.data)).catch(console.error);
  }, []);

  const [collectorId, setCollectorId] = useState(user.role === 'collector' ? user.id : '');
  const [branchId, setBranchId] = useState(user.branch_id || '');

  const [followUpModal, setFollowUpModal] = useState({ show: false, alert: null });
  const [ptpModal, setPtpModal] = useState({ show: false, alert: null });
  const [timelineModal, setTimelineModal] = useState({ show: false, alert: null, history: [] });
  const [resolveModal, setResolveModal] = useState({ show: false, alert: null });
  const [escalateModal, setEscalateModal] = useState({ show: false, alert: null });

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await API.get('/monitoring/alerts', { params: { tab: activeTab, branch_id: branchId, collector_id: collectorId } });
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
    { id: 'new', label: 'New (Day 3)', Icon: Bell, tone: 'blue' },
    { id: 'monitoring', label: 'Under Monitoring', Icon: Eye, tone: 'indigo' },
    { id: 'ptp', label: 'Promise to Pay', Icon: Handshake, tone: 'emerald' },
    { id: 'escalated', label: 'Escalated', Icon: Flame, tone: 'red' },
    { id: 'resolved', label: 'Resolved', Icon: CheckCircle2, tone: 'green' },
    { id: 'history', label: 'History', Icon: History, tone: 'slate' }
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

  const openTimeline = async (alertItem) => {
    try {
      const res = await API.get(`/monitoring/timeline/${alertItem.id}`);
      setTimelineModal({ show: true, alert: alertItem, history: res.data });
    } catch (err) {
      alert('Could not load timeline');
    }
  };

  const canFilter = user.role === 'admin' || user.role === 'manager' || user.role === 'teller' || user.role === 'accounting';

  return (
    <div className="card npm-monitoring">
      <div className="npm-hero">
        <div className="npm-title-block">
          <div className="npm-title-icon">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h2>3-Day No-Payment Monitoring</h2>
            <p>{data.length} record{data.length === 1 ? '' : 's'} in current view</p>
          </div>
        </div>
        <div className="npm-toolbar">
          {user.role === 'admin' && (
            <button className="npm-button npm-button-danger" disabled={scanning} onClick={async () => {
              setScanning(true);
              try {
                const res = await API.post('/monitoring/run-daily');
                alert(`Scan complete! Active alerts: ${res.data.active_alerts}`);
                fetchAlerts();
              } catch (err) {
                alert(`Error: ${err.response?.data?.error || err.message}`);
              } finally {
                setScanning(false);
              }
            }}>
              {scanning ? <Loader2 size={16} className="npm-spin" /> : <RefreshCw size={16} />}
              {scanning ? 'Scanning...' : 'Run Scan'}
            </button>
          )}
          {user.role === 'admin' && (
            <button className="npm-button npm-button-secondary" onClick={() => navigate('/monitoring-settings')}>
              <Settings size={16} />
              Settings
            </button>
          )}
        </div>
      </div>

      <div className="npm-tabs">
        {tabs.map(({ id, label, Icon, tone }) => (
          <button
            type="button"
            key={id}
            className={`npm-tab npm-tab-${tone} ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {canFilter && (
        <div className="npm-filters">
          <div className="form-group npm-filter-field">
            <label>Branch</label>
            <select className="form-control" value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.branch_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group npm-filter-field">
            <label>Collector</label>
            <select className="form-control" value={collectorId} onChange={e => setCollectorId(e.target.value)}>
              <option value="">All Collectors</option>
              {collectors.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="npm-state"><Loader2 size={22} className="npm-spin" /> Loading monitoring records...</div>
      ) : error ? (
        <div className="npm-error">{error}</div>
      ) : (
        <div className="npm-table-wrap">
          <table className="data-table npm-table">
            <thead>
              <tr>
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
                <tr>
                  <td colSpan="11">
                    <div className="npm-empty">
                      <CheckCircle2 size={28} />
                      <strong>No alerts found</strong>
                      <span>There are no records for this tab and filter.</span>
                    </div>
                  </td>
                </tr>
              ) : data.map(item => (
                <tr key={item.id} className={item.repeat_risk === 'High Risk' ? 'npm-row-high-risk' : ''}>
                  <td>
                    <div className="npm-client">
                      <div className="npm-avatar"><UserRound size={15} /></div>
                      <div>
                        <strong>{item.customer_name}</strong>
                        <span>{item.customer_code} | {item.contact}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="npm-loan-code">{item.loan_code}</div>
                    <div className="npm-loan-meta">Bal: PHP {fmtAmt(item.balance)} | Amort: PHP {fmtAmt(item.amortization)}</div>
                  </td>
                  <td>{item.collector_name}</td>
                  <td>
                    <span className={`npm-alert-badge ${item.alert_level === 'Day 4+' ? 'danger' : 'warning'}`}>
                      {item.alert_level}
                    </span>
                  </td>
                  <td>
                    <strong className="npm-days">{item.consecutive_days}</strong>
                  </td>
                  <td>{fmtDate(item.first_missed_date)}</td>
                  <td>
                    <span className={`npm-risk ${item.repeat_risk === 'High Risk' ? 'high' : item.repeat_risk === 'Moderate Risk' ? 'moderate' : 'low'}`}>
                      {item.repeat_risk} (Seq: {item.sequence_number})
                    </span>
                  </td>
                  {activeTab === 'ptp' && <td><strong>{fmtDate(item.ptp_date)}</strong></td>}
                  {activeTab === 'ptp' && <td><strong className="npm-money">PHP {fmtAmt(item.ptp_amount)}</strong></td>}
                  <td>
                    {item.last_follow_up_date ? (
                      <div className="npm-followup">
                        <Clock3 size={14} />
                        <div>
                          <div>{fmtDate(item.last_follow_up_date)}</div>
                          <span>{item.last_follow_up_result}</span>
                        </div>
                      </div>
                    ) : <span className="npm-muted">None</span>}
                  </td>
                  <td>
                    <div className="npm-actions">
                      <button className="npm-action npm-action-light" onClick={() => openTimeline(item)}><Clock3 size={14} /> Timeline</button>
                      {activeTab !== 'resolved' && (
                        <>
                          <button className="npm-action npm-action-dark" onClick={() => setFollowUpModal({ show: true, alert: item })}><Phone size={14} /> Log</button>
                          <button className="npm-action npm-action-ptp" onClick={() => setPtpModal({ show: true, alert: item })}><Handshake size={14} /> PTP</button>
                          <button className="npm-action npm-action-resolve" onClick={() => setResolveModal({ show: true, alert: item })}><Check size={14} /> Resolve</button>
                          {item.alert_level !== 'Day 4+' && (
                            <button className="npm-action npm-action-escalate" onClick={() => setEscalateModal({ show: true, alert: item })}><Flame size={14} /> Escalate</button>
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
              <label className="form-label">Promised Amount (PHP)</label>
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
            <p className="npm-modal-note">Note: Alerts are automatically resolved when a valid payment is posted.</p>
            <button className="btn btn-primary" style={{ background: '#10b981' }} type="submit">Confirm Resolution</button>
          </form>
        </Modal>
      )}

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

      {timelineModal.show && (
        <Modal title={`Timeline: ${timelineModal.alert?.customer_name}`} onClose={() => setTimelineModal({ show: false, alert: null, history: [] })}>
          <div className="npm-timeline">
            {timelineModal.history.length === 0 ? <p>No history found.</p> : timelineModal.history.map((h, i) => (
              <div key={i} className="npm-timeline-item">
                <div className={`npm-timeline-dot ${h._type === 'ptp' ? 'ptp' : 'followup'}`}></div>
                <div>
                  <div className="npm-timeline-date">{fmtDate(h.created_at)}</div>
                  {h._type === 'ptp' ? (
                    <div className="npm-timeline-card ptp">
                      <strong>Promise To Pay Logged</strong>
                      <span>Date: {fmtDate(h.promise_date)} | Amount: PHP {fmtAmt(h.promised_amount)}</span>
                      <span>Reason: {h.reason}</span>
                    </div>
                  ) : (
                    <div className="npm-timeline-card">
                      <strong>Follow-up: {h.follow_up_method}</strong>
                      <span>Result: {h.contact_result}</span>
                      <span>Remarks: {h.remarks}</span>
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
    <div className="npm-modal-overlay">
      <div className="npm-modal-content">
        <div className="npm-modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close modal"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
