import { useState, useEffect } from 'react';
import API from '../services/api';
import ConfirmModal from '../components/ConfirmModal';

export default function MonitoringSettings() {
  const [settings, setSettings] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', desc: '' });
  const [loading, setLoading] = useState(true);
  const [runningManual, setRunningManual] = useState(false);
  const [manualResult, setManualResult] = useState('');
  const [saveSuccessOpen, setSaveSuccessOpen] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await API.get('/settings');
      const setObj = {};
      res.data.settings.forEach(s => setObj[s.setting_key] = s.setting_value);
      setSettings(setObj);
      setHolidays(res.data.holidays);
    } catch (err) {
      alert('Error fetching settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      await API.post('/settings', { settings });
      setSaveSuccessOpen(true);
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const addHoliday = async (e) => {
    e.preventDefault();
    try {
      await API.post('/settings/holiday', { holiday_date: newHoliday.date, description: newHoliday.desc });
      setNewHoliday({ date: '', desc: '' });
      fetchSettings();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  const deleteHoliday = async (id) => {
    if (!window.confirm('Delete this holiday?')) return;
    try {
      await API.delete(`/settings/holiday/${id}`);
      fetchSettings();
    } catch (err) {
      alert(err.response?.data?.error || err.message);
    }
  };

  if (loading) return <div>Loading settings...</div>;

  return (
    <div className="card" style={{ padding: '20px', maxWidth: 800, margin: '0 auto' }}>
      <ConfirmModal
        isOpen={saveSuccessOpen}
        type="success"
        title="Settings saved"
        message="Your monitoring configuration has been saved successfully."
        confirmText="Done"
        cancelText={null}
        onConfirm={() => setSaveSuccessOpen(false)}
      />
      <h2>⚙️ Monitoring System Settings</h2>
      
      <div style={{ marginTop: 20 }}>
        <h3>Background Service Configuration</h3>
        <form onSubmit={saveSettings}>
          <div className="form-group">
            <label className="form-label">Daily Evaluation Cut-off Time</label>
            <input type="time" className="form-control" value={settings.daily_cutoff || '20:00'} onChange={e => setSettings({...settings, daily_cutoff: e.target.value})} required />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>The time when the background job runs to check 3-day missed payments.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Escalation Threshold (Days)</label>
            <input type="number" className="form-control" value={settings.escalation_threshold || '4'} onChange={e => setSettings({...settings, escalation_threshold: e.target.value})} required />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Days consecutive missed before moving to critical escalation.</span>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={settings.exclude_sundays === 'true'} onChange={e => setSettings({...settings, exclude_sundays: e.target.checked ? 'true' : 'false'})} id="chkSun" />
            <label htmlFor="chkSun" style={{ margin: 0 }}>Exclude Sundays from Schedule</label>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={settings.treat_positive_as_paid === 'true'} onChange={e => setSettings({...settings, treat_positive_as_paid: e.target.checked ? 'true' : 'false'})} id="chkPos" />
            <label htmlFor="chkPos" style={{ margin: 0 }}>Treat ANY partial payment amount &gt; 0 as Paid for the day</label>
          </div>

          <button className="btn btn-primary" type="submit" style={{ marginTop: 15 }}>💾 Save Settings</button>
        </form>

        <div style={{ marginTop: 20, padding: 15, background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#92400e' }}>🔄 Manual Daily Scan</h4>
          <p style={{ fontSize: 12, color: '#78716c', margin: '0 0 12px 0' }}>
            Run the daily 3-day monitoring evaluation now. This will scan all active loans and create/update alerts for clients who have missed 3+ consecutive scheduled payment days.
          </p>
          <button 
            className="btn btn-danger" 
            disabled={runningManual}
            onClick={async () => {
              if (!window.confirm('Run the daily monitoring scan now? This will evaluate all active loans.')) return;
              setRunningManual(true);
              setManualResult('');
              try {
                const res = await API.post('/monitoring/run-daily');
                setManualResult(`✅ ${res.data.message}. Active alerts: ${res.data.active_alerts}`);
              } catch (err) {
                setManualResult(`❌ Error: ${err.response?.data?.error || err.message}`);
              } finally {
                setRunningManual(false);
              }
            }}
          >
            {runningManual ? '⏳ Scanning all loans...' : '🔄 Run Daily Scan Now'}
          </button>
          {manualResult && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 'bold', color: manualResult.startsWith('✅') ? '#15803d' : '#dc2626' }}>{manualResult}</div>}
        </div>
      </div>

      <hr style={{ margin: '30px 0', border: '1px solid #e2e8f0' }} />

      <div>
        <h3>🗓️ Holiday Exclusions</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Dates listed here will not be counted as a missed day for the schedule.</p>
        
        <form onSubmit={addHoliday} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 20 }}>
          <div className="form-group" style={{ margin: 0, flex: 1 }}>
            <label className="form-label">Date</label>
            <input type="date" className="form-control" value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} required />
          </div>
          <div className="form-group" style={{ margin: 0, flex: 2 }}>
            <label className="form-label">Description</label>
            <input type="text" className="form-control" placeholder="e.g. Christmas Day" value={newHoliday.desc} onChange={e => setNewHoliday({...newHoliday, desc: e.target.value})} required />
          </div>
          <button className="btn btn-primary" type="submit">Add Holiday</button>
        </form>

        <table className="data-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th style={{ width: 80 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 ? (
              <tr><td colSpan="3" style={{ textAlign: 'center' }}>No holidays configured.</td></tr>
            ) : holidays.map(h => (
              <tr key={h.id}>
                <td><strong>{new Date(h.holiday_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric'})}</strong></td>
                <td>{h.description}</td>
                <td><button className="btn btn-sm btn-danger" onClick={() => deleteHoliday(h.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
