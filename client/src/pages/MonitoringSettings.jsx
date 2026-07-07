import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function MonitoringSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', desc: '' });
  const [loading, setLoading] = useState(true);

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
      alert('Settings saved successfully');
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
