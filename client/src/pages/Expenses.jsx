import { useEffect, useState } from 'react'
import API from '../services/api'
const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
const CATS = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Transportation', 'Miscellaneous', 'Meals', 'Gasoline', 'Short Overages', 'Cash Advance']

export default function Expenses() {
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ id: null, branch_id: '', expense_date: today(), amount: '', category: '', description: '', payee: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState(today())

  const load = () => { 
    setLoading(true); 
    API.get('/expenses').then(r => setRows(r.data)).finally(() => setLoading(false)) 
  }
  
  useEffect(() => { 
    load(); 
    API.get('/branches').then(r => setBranches(r.data)) 
  }, [])

  const handleClear = () => {
    setForm({ id: null, branch_id: '', expense_date: today(), amount: '', category: '', description: '', payee: '' });
    setError('');
  }

  const handleSave = async () => {
    if (!form.amount || !form.expense_date || !form.category || !form.description) {
      setError('Please fill in all required fields (*)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (form.id) {
        await API.put(`/expenses/${form.id}`, form);
      } else {
        await API.post('/expenses', form);
      }
      handleClear();
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error saving expense');
    } finally {
      setSaving(false);
    }
  }

  const handleDelete = async () => {
    if (!form.id) {
      setError('Please select an expense from the table first to delete.');
      return;
    }
    if (!confirm('Are you sure you want to delete (void) this expense?')) return;
    try {
      await API.delete(`/expenses/${form.id}`);
      handleClear();
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Error deleting expense');
    }
  }

  const selectRow = (r) => {
    setForm({ 
      id: r.id, 
      branch_id: r.branch_id || '', 
      expense_date: r.expense_date, 
      amount: r.amount, 
      category: r.category || '', 
      description: r.description || '', 
      payee: r.payee || '' 
    });
    setError('');
  };

  const filteredRows = rows.filter(r => {
    const matchSearch = search ? (
      (r.category || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.payee || '').toLowerCase().includes(search.toLowerCase())
    ) : true;
    
    const matchFrom = fromDate ? r.expense_date >= fromDate : true;
    const matchTo = toDate ? r.expense_date <= toDate : true;
    
    return matchSearch && matchFrom && matchTo;
  });

  const totalYTD = rows.reduce((s, r) => s + Number(r.amount), 0);
  const totalDateRange = filteredRows.reduce((s, r) => s + Number(r.amount), 0);
  const totalSelectedDate = rows.filter(r => r.expense_date === form.expense_date).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '15px 25px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: '#1d4ed8', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '45px', height: '45px' }}>🧾</div>
          <div>
            <h2 style={{ margin: 0, color: '#1e293b', fontSize: '22px', fontWeight: 'bold' }}>Expense Entry</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Record and manage company expenses.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span style={{color: '#3b82f6'}}>👤</span> <strong style={{color: '#334155'}}>User:</strong> <span style={{color: '#0f172a'}}>Admin</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '8px 16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span style={{color: '#3b82f6'}}>📅</span> <strong style={{color: '#334155'}}>Date:</strong> <span style={{color: '#0f172a'}}>{today()}</span>
          </div>
        </div>
      </div>

      {/* Form Section */}
      <div style={{ background: '#fff', padding: '20px 25px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
        {error && <div style={{ color: 'white', background: '#ef4444', padding: '10px', borderRadius: '4px', marginBottom: '15px' }}>⚠️ {error}</div>}
        
        <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Date <span style={{color: 'red'}}>*</span></label>
            <input type="date" className="form-control" style={{ background: '#fff' }} value={form.expense_date} onChange={e=>setForm({...form, expense_date: e.target.value})} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Branch</label>
            <select className="form-control" style={{ background: '#fff' }} value={form.branch_id} onChange={e=>setForm({...form, branch_id: e.target.value})}>
               <option value="">Select Branch...</option>
               {branches.map(b => <option value={b.id} key={b.id}>{b.branch_name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Category <span style={{color: 'red'}}>*</span></label>
            <select className="form-control" style={{ background: '#fff' }} value={form.category} onChange={e=>setForm({...form, category: e.target.value})}>
               <option value="">Select Category...</option>
               {CATS.map(c => <option value={c} key={c}>{c}</option>)}
            </select>
          </div>
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
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Payee / Reference</label>
            <input type="text" className="form-control" style={{ background: '#fff' }} value={form.payee} onChange={e=>setForm({...form, payee: e.target.value})} placeholder="Optional" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '5px', color: '#334155' }}>Payment Method</label>
            <select className="form-control" style={{ background: '#fff' }}><option>Cash</option></select>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn" style={{ background: '#1d4ed8', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleClear}>
            <span>➕</span> Add Expense <span style={{ opacity: 0.7, fontSize: '11px', marginLeft: '5px', background: 'rgba(255,255,255,0.2)', padding: '2px 4px', borderRadius: '4px' }}>F2</span>
          </button>
          <button className="btn" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleClear}>
            <span>🔄</span> Clear
          </button>
          <button className="btn" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleSave} disabled={saving}>
            <span>💾</span> Save <span style={{ opacity: 0.7, fontSize: '11px', marginLeft: '5px', background: 'rgba(4,120,87,0.1)', padding: '2px 4px', borderRadius: '4px' }}>F5</span>
          </button>
          <button className="btn" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleSave}>
            <span>✏️</span> Edit <span style={{ opacity: 0.7, fontSize: '11px', marginLeft: '5px', background: 'rgba(180,83,9,0.1)', padding: '2px 4px', borderRadius: '4px' }}>F6</span>
          </button>
          <button className="btn" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: 'bold' }} onClick={handleDelete}>
            <span>🗑️</span> Delete <span style={{ opacity: 0.7, fontSize: '11px', marginLeft: '5px', background: 'rgba(185,28,28,0.1)', padding: '2px 4px', borderRadius: '4px' }}>F7</span>
          </button>
          <button className="btn" style={{ background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', padding: '8px 16px', fontWeight: 'bold' }}>
            <span>✕</span> Close
          </button>
        </div>
      </div>

      {/* Table and Filters */}
      <div style={{ background: '#fff', padding: '20px 25px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>Search By</span>
            <select className="form-control" style={{ width: '120px', background: '#fff' }}><option>All Fields</option></select>
            <div style={{ display: 'flex' }}>
              <input type="text" className="form-control" placeholder="Search by Category, Particulars, Payee..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width: '300px', borderRight: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0, background: '#fff' }} />
              <button className="btn" style={{ background: '#1d4ed8', color: 'white', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, padding: '8px 12px' }}>🔍</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>From Date</span>
            <input type="date" className="form-control" style={{ background: '#fff' }} value={fromDate} onChange={e=>setFromDate(e.target.value)} />
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>To Date</span>
            <input type="date" className="form-control" style={{ background: '#fff' }} value={toDate} onChange={e=>setToDate(e.target.value)} />
            <button className="btn" style={{ background: '#1d4ed8', color: 'white', display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', fontWeight: 'bold' }} onClick={load}>
              🔄 Refresh
            </button>
          </div>
        </div>

        <div className="table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
          <table className="data-table" style={{ fontSize: '13px', width: '100%', borderCollapse: 'collapse', margin: 0 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr style={{ background: '#f8fafc', color: '#334155', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>ID ↕</th>
                <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Category ↕</th>
                <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Particulars ↕</th>
                <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Date Encoded ↕</th>
                <th style={{ padding: '10px', textAlign: 'right', background: '#f8fafc' }}>Amount ↕</th>
                <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Payee ↕</th>
                <th style={{ padding: '10px', textAlign: 'left', background: '#f8fafc' }}>Branch ↕</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} style={{textAlign: 'center', padding: '20px'}}>⏳ Loading...</td></tr> :
               filteredRows.length === 0 ? <tr><td colSpan={7} style={{textAlign: 'center', padding: '20px', color: '#94a3b8'}}>No expenses match your filters.</td></tr> :
               filteredRows.map(r => (
                <tr key={r.id} onClick={() => selectRow(r)} style={{ cursor: 'pointer', background: form.id === r.id ? '#eff6ff' : 'transparent', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px', color: '#3b82f6' }}>
                    {form.id === r.id ? <span style={{display:'inline-block', width: '15px'}}>▶</span> : <span style={{display:'inline-block', width: '15px'}}></span>}
                    {r.id}
                  </td>
                  <td style={{ padding: '10px', color: '#047857', fontWeight: '600' }}>{r.category || '—'}</td>
                  <td style={{ padding: '10px', color: '#334155' }}>{r.description}</td>
                  <td style={{ padding: '10px', color: '#64748b' }}>{r.expense_date}</td>
                  <td style={{ padding: '10px', color: '#2563eb', fontWeight: 'bold', textAlign: 'right' }}>₱{fmt(r.amount)}</td>
                  <td style={{ padding: '10px', color: '#64748b' }}>{r.payee || '—'}</td>
                  <td style={{ padding: '10px', color: '#64748b' }}>{r.branch_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', alignItems: 'center', fontSize: '13px', color: '#64748b' }}>
          <strong style={{ color: '#1d4ed8' }}>Total Records: {filteredRows.length}</strong>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className="btn btn-sm" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>«</button>
            <button className="btn btn-sm" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>‹</button>
            <button className="btn btn-sm" style={{ background: '#1d4ed8', color: 'white', border: '1px solid #1d4ed8' }}>1</button>
            <button className="btn btn-sm" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>2</button>
            <button className="btn btn-sm" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>3</button>
            <button className="btn btn-sm" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>›</button>
            <button className="btn btn-sm" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>»</button>
          </div>
          <div>
            Show <select className="form-control" style={{ display: 'inline-block', width: 'auto', padding: '2px 8px', background: '#fff' }}><option>10</option></select> per page
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ fontSize: '36px', color: '#0ea5e9' }}>👝</div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '5px' }}>Total Expenses (Selected Date)</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#16a34a' }}>₱{fmt(totalSelectedDate)}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ fontSize: '36px', color: '#9333ea' }}>📋</div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '5px' }}>Total Expenses (Date Range)</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#9333ea' }}>₱{fmt(totalDateRange)}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ fontSize: '36px', color: '#f59e0b' }}>📊</div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '5px' }}>Total YTD</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ea580c' }}>₱{fmt(totalYTD)}</div>
          </div>
        </div>
        <div style={{ flex: 1, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ fontSize: '36px', color: '#0ea5e9' }}>📄</div>
          <div>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold', marginBottom: '5px' }}>Total Transactions</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7' }}>{filteredRows.length}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
