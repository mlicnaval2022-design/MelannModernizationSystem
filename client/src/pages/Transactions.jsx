import { useEffect, useState } from 'react'
import API from '../services/api'
const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const CATS = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Transportation', 'Miscellaneous', 'Meals', 'Gasoline', 'Short Overages', 'Cash Advance']

const TABS = [
  { id: 'Expense', label: 'Expenses', icon: '🧾' },
  { id: 'Collectors Over', label: 'Collectors Over', icon: '💰' },
  { id: 'Penalty', label: 'Penalty', icon: '⚠️' }
]

export default function Transactions() {
  const [activeTab, setActiveTab] = useState('Expense')
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ id: null, branch_id: '', transaction_date: today(), amount: '', category: '', description: '', payee: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState(today())

  const load = () => { 
    setLoading(true); 
    API.get('/transactions').then(r => setRows(r.data)).finally(() => setLoading(false)) 
  }
  
  useEffect(() => { 
    load(); 
    API.get('/branches').then(r => setBranches(r.data)) 
  }, [])

  const handleClear = () => {
    setForm({ id: null, branch_id: '', transaction_date: today(), amount: '', category: '', description: '', payee: '' });
    setError('');
  }

  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    handleClear()
  }

  const handleSave = async () => {
    if (!form.amount || !form.transaction_date || !form.description || (activeTab === 'Expense' && !form.category)) {
      setError('Please fill in all required fields (*)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, transaction_type: activeTab };
      if (form.id) {
        await API.put(`/transactions/${form.id}`, payload);
      } else {
        await API.post('/transactions', payload);
      }
      handleClear();
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error saving transaction');
    } finally {
      setSaving(false);
    }
  }

  const handleDelete = async () => {
    if (!form.id) {
      setError('Please select a transaction from the table first to delete.');
      return;
    }
    if (!confirm('Are you sure you want to delete (void) this transaction?')) return;
    try {
      await API.delete(`/transactions/${form.id}`);
      handleClear();
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error deleting transaction');
    }
  }

  const selectRow = (r) => {
    setForm({ 
      id: r.id, 
      branch_id: r.branch_id || '', 
      transaction_date: r.transaction_date, 
      amount: r.amount, 
      category: r.category || '', 
      description: r.description || '', 
      payee: r.payee || '' 
    });
    setError('');
  };

  const filteredRows = rows.filter(r => {
    if (r.transaction_type !== activeTab) return false;

    const matchSearch = search ? (
      (r.category || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.payee || '').toLowerCase().includes(search.toLowerCase())
    ) : true;
    
    const matchFrom = fromDate ? r.transaction_date >= fromDate : true;
    const matchTo = toDate ? r.transaction_date <= toDate : true;
    
    return matchSearch && matchFrom && matchTo;
  });

  const totalSelectedDate = rows.filter(r => r.transaction_date === form.transaction_date && r.transaction_type === activeTab).reduce((s, r) => s + Number(r.amount), 0);
  const totalDateRange = filteredRows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: activeTab === tab.id ? '#1d4ed8' : '#e2e8f0',
              color: activeTab === tab.id ? '#fff' : '#475569',
              borderRadius: '8px 8px 0 0',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderTop: '4px solid #1d4ed8', borderRadius: '0 8px 8px 8px', border: '1px solid #e2e8f0', borderTopColor: '#1d4ed8' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 25px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div>
              <h2 style={{ margin: 0, color: '#1e293b', fontSize: '22px', fontWeight: 'bold' }}>{TABS.find(t => t.id === activeTab)?.label} Entry</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Record and manage {TABS.find(t => t.id === activeTab)?.label.toLowerCase()}.</p>
            </div>
          </div>
        </div>

        {/* Form Section */}
        <div style={{ padding: '20px 25px' }}>
          {error && <div style={{ color: 'white', background: '#ef4444', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>⚠️ {error}</div>}
          
          <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Date <span style={{color: 'red'}}>*</span></label>
              <input type="date" className="form-control" style={{ background: '#fff' }} value={form.transaction_date} onChange={e=>setForm({...form, transaction_date: e.target.value})} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Branch</label>
              <select className="form-control" style={{ background: '#fff' }} value={form.branch_id} onChange={e=>setForm({...form, branch_id: e.target.value})}>
                 <option value="">Select Branch...</option>
                 {branches.map(b => <option value={b.id} key={b.id}>{b.branch_name}</option>)}
              </select>
            </div>
            {activeTab === 'Expense' && (
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Category <span style={{color: 'red'}}>*</span></label>
                <select className="form-control" style={{ background: '#fff' }} value={form.category} onChange={e=>setForm({...form, category: e.target.value})}>
                   <option value="">Select Category...</option>
                   {CATS.map(c => <option value={c} key={c}>{c}</option>)}
                </select>
              </div>
            )}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Amount <span style={{color: 'red'}}>*</span></label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '8px', color: '#64748b', fontWeight: 'bold' }}>₱</span>
                <input type="number" className="form-control" style={{ paddingLeft: '25px', textAlign: 'right', background: '#fff', fontWeight: 'bold' }} value={form.amount} onChange={e=>setForm({...form, amount: e.target.value})} placeholder="0.00" />
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '20px', marginBottom: '25px' }}>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Particulars / Description <span style={{color: 'red'}}>*</span></label>
              <input type="text" className="form-control" style={{ background: '#fff' }} value={form.description} onChange={e=>setForm({...form, description: e.target.value})} placeholder="Enter particulars / description" />
            </div>
            {activeTab === 'Expense' && (
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Payee / Reference</label>
                <input type="text" className="form-control" style={{ background: '#fff' }} value={form.payee} onChange={e=>setForm({...form, payee: e.target.value})} placeholder="Optional" />
              </div>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px' }}>
            <button className="btn" style={{ background: '#1d4ed8', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleClear}>
              <span>➕</span> Add New
            </button>
            <button className="btn" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleClear}>
              <span>🔄</span> Clear
            </button>
            <button className="btn" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleSave} disabled={saving}>
              <span>{saving ? '⏳' : '💾'}</span> Save
            </button>
            <button className="btn" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleSave}>
              <span>✏️</span> Edit
            </button>
            <button className="btn" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleDelete}>
              <span>🗑️</span> Delete
            </button>
          </div>
        </div>

        {/* Table and Filters */}
        <div style={{ padding: '20px 25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>Search</span>
              <input type="text" className="form-control" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width: '250px', background: '#fff' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>From Date</span>
              <input type="date" className="form-control" style={{ background: '#fff' }} value={fromDate} onChange={e=>setFromDate(e.target.value)} />
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>To Date</span>
              <input type="date" className="form-control" style={{ background: '#fff' }} value={toDate} onChange={e=>setToDate(e.target.value)} />
            </div>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <table className="data-table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse', margin: 0 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#f8fafc', color: '#334155', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>ID ↕</th>
                  {activeTab === 'Expense' && <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Category ↕</th>}
                  <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Particulars ↕</th>
                  <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Date ↕</th>
                  <th style={{ padding: '10px', textAlign: 'right', background: '#f8fafc' }}>Amount ↕</th>
                  {activeTab === 'Expense' && <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Payee ↕</th>}
                  <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Branch ↕</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={7} style={{textAlign: 'center', padding: '20px'}}>⏳ Loading...</td></tr> :
                 filteredRows.length === 0 ? <tr><td colSpan={7} style={{textAlign: 'center', padding: '20px', color: '#94a3b8'}}>No {activeTab.toLowerCase()} records found.</td></tr> :
                 filteredRows.map(r => (
                  <tr key={r.id} onClick={() => selectRow(r)} style={{ cursor: 'pointer', background: form.id === r.id ? '#eff6ff' : 'transparent', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px', color: '#3b82f6' }}>
                      {form.id === r.id ? <span style={{display:'inline-block', width: '15px'}}>▶</span> : <span style={{display:'inline-block', width: '15px'}}></span>}
                      {r.id}
                    </td>
                    {activeTab === 'Expense' && <td style={{ padding: '10px', color: '#047857', fontWeight: '600' }}>{r.category || '—'}</td>}
                    <td style={{ padding: '10px', color: '#334155' }}>{r.description}</td>
                    <td style={{ padding: '10px', color: '#64748b' }}>{r.transaction_date}</td>
                    <td style={{ padding: '10px', color: '#2563eb', fontWeight: 'bold', textAlign: 'right' }}>₱{fmt(r.amount)}</td>
                    {activeTab === 'Expense' && <td style={{ padding: '10px', color: '#64748b' }}>{r.payee || '—'}</td>}
                    <td style={{ padding: '10px', color: '#64748b' }}>{r.branch_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', alignItems: 'center', fontSize: '13px', color: '#64748b' }}>
            <strong style={{ color: '#1d4ed8' }}>Total Records: {filteredRows.length}</strong>
            <strong style={{ color: '#0f172a', fontSize: '15px' }}>
              Total Amount: ₱{fmt(totalDateRange)}
            </strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total for Date ({form.transaction_date})</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563eb' }}>₱{fmt(totalSelectedDate)}</div>
            </div>
            <div style={{ width: '1px', background: '#cbd5e1' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Amount (Date Range)</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#059669' }}>₱{fmt(totalDateRange)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
