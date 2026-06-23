import React, { useEffect, useState, useMemo } from 'react';
import API from '../services/api';
import dayjs from 'dayjs';

export default function DueClients() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filters, setFilters] = useState({
    collector: '',
    branch: '',
    date: '',
    status: '',
    client: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await API.get('/reports/due-clients');
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleFilter = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (filters.collector && item.collector_name !== filters.collector) return false;
      if (filters.branch && item.branch_name !== filters.branch) return false;
      if (filters.date && item.date_maturity !== filters.date) return false;
      if (filters.status && item.status !== filters.status) return false;
      if (filters.client && !item.client_name.toLowerCase().includes(filters.client.toLowerCase()) && !item.client_code.toLowerCase().includes(filters.client.toLowerCase())) return false;
      return true;
    });
  }, [data, filters]);

  const groupedData = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      const coll = curr.collector_name || 'Unassigned';
      if (!acc[coll]) acc[coll] = [];
      acc[coll].push(curr);
      return acc;
    }, {});
  }, [filteredData]);

  const triggerReloan = async (loan) => {
    if (!window.confirm(`Create a Re-Loan application for ${loan.client_name}? This will go directly to For Approval.`)) return;
    try {
      const payload = {
        customer_id: loan.customer_id, // we might need customer_id from API, wait, due-clients returns client_code, I'll add customer_id to backend
        collector_id: loan.collector_id,
        branch_id: loan.branch_id,
        loan_type: 'Re-Loan',
        principal: loan.principal, // carrying over original principal as default request
        interest_rate: 15,
        date_released: dayjs().format('YYYY-MM-DD'),
        remarks: 'Re-Loan generated from Due Clients module',
        status: 'for_approval' // bypass CI directly to for_approval
      };
      
      // We need to fetch customer_id by client_code or update backend to return customer_id. 
      // I will update the backend SQL to return customer_id, collector_id, branch_id.
      
      await API.post('/loans', payload);
      alert('Re-Loan application submitted for Approval successfully!');
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to trigger Re-Loan');
    }
  };

  const fmt = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

  return (
    <div style={{ paddingBottom: 50 }}>
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, color: '#1e293b' }}>Due Clients <span style={{ background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 14 }}>{data.length}</span></h2>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
          <input type="text" name="client" className="form-control" placeholder="Search Client Name / Code" value={filters.client} onChange={handleFilter} />
          <input type="text" name="collector" className="form-control" placeholder="Filter Collector" value={filters.collector} onChange={handleFilter} />
          <input type="text" name="branch" className="form-control" placeholder="Filter Branch" value={filters.branch} onChange={handleFilter} />
          <input type="date" name="date" className="form-control" value={filters.date} onChange={handleFilter} />
          <select name="status" className="form-control" value={filters.status} onChange={handleFilter}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pastdue">Past Due</option>
          </select>
          <button className="btn btn-secondary" onClick={() => setFilters({collector:'', branch:'', date:'', status:'', client:''})}>Clear</button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Loading due clients...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(groupedData).map(([collector, clients]) => (
            <div key={collector} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ background: '#f8fafc', padding: '15px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>{collector} <span style={{ color: '#64748b', fontSize: 13, fontWeight: 'normal', marginLeft: 10 }}>({clients.length} clients)</span></h3>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Loan Ref</th>
                    <th>Type</th>
                    <th>Released</th>
                    <th>Due Date</th>
                    <th>Days Due</th>
                    <th>Balance</th>
                    <th>Prev Loans</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{c.client_name}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{c.client_code}</div>
                      </td>
                      <td className="mono">{c.loan_code}</td>
                      <td><span className="badge" style={{ background: '#eff6ff', color: '#2563eb' }}>{c.loan_type}</span></td>
                      <td>{c.date_released}</td>
                      <td style={{ fontWeight: 600, color: '#ef4444' }}>{c.date_maturity}</td>
                      <td>{c.days_due >= 0 ? <span style={{color: '#ef4444'}}>+{c.days_due} Days</span> : <span style={{color: '#f59e0b'}}>{c.days_due} Days</span>}</td>
                      <td style={{ fontWeight: 800 }}>₱{fmt(c.outstanding_balance)}</td>
                      <td>{c.previous_loans_count}</td>
                      <td><span className={`badge badge-${c.status === 'active' ? 'active' : 'inactive'}`}>{c.status}</span></td>
                      <td>
                        <button className="action-btn" style={{ color: '#3b82f6', borderColor: '#bfdbfe' }} onClick={() => triggerReloan(c)}>Trigger Re-Loan</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {Object.keys(groupedData).length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>No due clients found.</div>
          )}
        </div>
      )}
    </div>
  );
}
