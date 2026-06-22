import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import '../soa.css'
import '../customers.css'

const EMPTY = { 
  first_name: '', last_name: '', middle_name: '', address: '', contact: '', birth_date: '', civil_status: '', occupation: '', branch_id: '', collector_id: '', status: 'active',
  sitio: '', purok: '', brgy: '', city: '', gender: '', secondary_contact: '', email: '', income_per_month: '', expenses_per_month: '',
  loan_purpose: '', collateral: '', id_type: '', id_number: '', id_issue_date: '', id_expiry_date: '', id_issued_by: '', fb_account: '', nationality: '',
  home_status: '', business_address: '', business_location: '', business_years: '', business_months: '', business_ownership: '', business_permit: ''
}

export default function Customers() {
  const { hasRole } = useAuth()
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [collectors, setCollectors] = useState([])
  const [search, setSearch] = useState(searchParams.get('search') || '')

  useEffect(() => {
    const q = searchParams.get('search')
    if (q !== null && q !== search) setSearch(q)
  }, [searchParams])

  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState(null)
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [soaModal, setSoaModal] = useState(false)
  const [soaData, setSoaData] = useState(null)
  const [soaLoading, setSoaLoading] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      API.get('/customers', { params: { search, status } }),
      API.get('/reports/customers-metrics')
    ]).then(([rCust, rMet]) => {
      setRows(rCust.data)
      setMetrics(rMet.data)
    }).finally(() => setLoading(false))
  }

  const calculateAge = (birthDate) => {
    if (!birthDate) return '';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleUpper = (field) => (e) => {
    const val = e.target.value.toUpperCase();
    setForm(f => ({ ...f, [field]: val }));
  };

  useEffect(() => { load() }, [search, status])
  useEffect(() => {
    API.get('/branches').then(r => setBranches(r.data))
    API.get('/collectors').then(r => setCollectors(r.data))
  }, [])

  const openNew = () => { setEditing(null); setForm(EMPTY); setError(''); setModal(true) }
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setError(''); setModal(true) }
  const closeModal = () => { setModal(false); setEditing(null) }

  const openSoa = async (id) => {
    setSoaModal(true);
    setSoaLoading(true);
    setSoaData(null);
    try {
      const r = await API.get(`/customers/${id}`);
      setSoaData(r.data);
    } catch (err) {
      alert('Failed to load SOA data');
      setSoaModal(false);
    } finally {
      setSoaLoading(false);
    }
  }

  const handleSave = async (e) => {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      if (editing) await API.put(`/customers/${editing.id}`, form)
      else await API.post('/customers', form)
      closeModal(); load()
    } catch (err) { setError(err.response?.data?.error || 'Error saving') }
    finally { setSaving(false) }
  }

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this customer?')) return
    await API.delete(`/customers/${id}`); load()
  }

  const itemsPerPage = 10;
  const totalPages = Math.ceil(rows.length / itemsPerPage);
  const currentRows = rows.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="customers-container">
      
      {/* Top Metrics Row */}
      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>👥</div>
          <div className="metric-info">
            <h4>Total Customers</h4>
            <h2>{metrics ? metrics.total_customers : 0}</h2>
            <p style={{ color: '#10b981' }}>+{metrics ? metrics.new_this_month : 0} this month</p>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#f0fdf4', color: '#10b981' }}>✓</div>
          <div className="metric-info">
            <h4>Active Customers</h4>
            <h2>{metrics ? metrics.active_customers : 0}</h2>
            <p style={{ color: 'var(--text-muted)' }}>{metrics && metrics.total_customers > 0 ? Math.round((metrics.active_customers/metrics.total_customers)*100) : 0}% of total</p>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>✕</div>
          <div className="metric-info">
            <h4>Inactive Customers</h4>
            <h2>{metrics ? metrics.inactive_customers : 0}</h2>
            <p style={{ color: 'var(--text-muted)' }}>{metrics && metrics.total_customers > 0 ? Math.round((metrics.inactive_customers/metrics.total_customers)*100) : 0}% of total</p>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon" style={{ background: '#fefce8', color: '#eab308' }}>📅</div>
          <div className="metric-info">
            <h4>New This Month</h4>
            <h2>{metrics ? metrics.new_this_month : 0}</h2>
            {(() => {
              const diff = metrics ? (metrics.new_this_month - metrics.new_last_month) : 0;
              return <p style={{ color: diff >= 0 ? '#10b981' : '#ef4444' }}>{diff >= 0 ? `+${diff}` : diff} vs last month</p>;
            })()}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="customers-toolbar table-actions">
        <div className="toolbar-left">
          <div className="search-box">
            <span>🔍</span>
            <input placeholder="Search customers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="toolbar-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Status: All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="reversed">Reversed</option>
          </select>
          <button className="toolbar-btn-secondary">⚙️ More Filters</button>
        </div>
        <div className="toolbar-right">
          <button className="toolbar-btn-secondary" onClick={handlePrint}>🖨️ Export PDF</button>
          <button className="toolbar-btn-primary" onClick={openNew}>+ New Customer</button>
        </div>
      </div>

      {/* Data Table */}
      <div className="customers-table-container">
        <table className="customers-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact Info</th>
              <th>Location</th>
              <th>Collector</th>
              <th>Status</th>
              <th className="table-actions-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{textAlign:'center', padding: '40px'}}>⏳ Loading...</td></tr>
              : currentRows.length === 0 ? <tr><td colSpan={6} style={{textAlign:'center', padding: '40px', color: 'var(--text-muted)'}}>No customers found</td></tr>
              : currentRows.map(r => (
                <tr key={r.id}>
                  <td>
                    <div className="customer-cell">
                      <div className="customer-avatar">{getInitials(r.full_name)}</div>
                      <div>
                        <div className="customer-name">{r.full_name}</div>
                        <div className="customer-id">{r.customer_code}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="contact-cell">
                      <div>📞 {r.contact || '—'}</div>
                      <div style={{fontSize: 11, marginTop: 4}}>✉️ {r.email || '—'}</div>
                    </div>
                  </td>
                  <td>
                    <div className="address-cell">
                      <div>📍 {[r.address, r.sitio, r.purok, r.brgy].filter(Boolean).join(', ') || '—'}</div>
                      <div style={{fontSize: 11, marginTop: 4}}>{r.city || '—'}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      🚶 {r.collector_name || 'Unassigned'}
                    </div>
                  </td>
                  <td>
                    {r.status === 'active' ? (
                      <span className="status-badge status-active"><div className="status-dot"></div> Active</span>
                    ) : (
                      <span className="status-badge status-inactive"><div className="status-dot"></div> {r.status}</span>
                    )}
                  </td>
                  <td className="table-actions-col">
                    <div className="table-actions">
                      <button className="action-btn action-soa" onClick={() => openSoa(r.id)}>SOA</button>
                      <button className="action-btn" onClick={() => openEdit(r)}>Edit</button>
                      {hasRole('admin', 'manager') && r.status === 'active' &&
                        <button className="action-btn" style={{color: '#ef4444', borderColor: '#fee2e2'}} onClick={() => handleDeactivate(r.id)}>...</button>
                      }
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && rows.length > 0 && (
          <div className="pagination table-actions">
            <div className="pagination-info">
              Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, rows.length)} of {rows.length} customers
            </div>
            <div className="pagination-controls">
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>←</button>
              {[...Array(totalPages)].map((_, i) => (
                <button key={i} className={`page-btn ${page === i + 1 ? 'active' : ''}`} onClick={() => setPage(i + 1)}>
                  {i + 1}
                </button>
              ))}
              <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>→</button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Customer' : 'New Customer'}</span>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
              <form onSubmit={handleSave}>
                <h4 style={{marginTop: 0, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 5}}>Personal Information</h4>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Last Name *</label><input className="form-control" value={form.last_name} onChange={handleUpper('last_name')} required /></div>
                  <div className="form-group"><label className="form-label">First Name *</label><input className="form-control" value={form.first_name} onChange={handleUpper('first_name')} required /></div>
                  <div className="form-group"><label className="form-label">Middle Name</label><input className="form-control" value={form.middle_name || ''} onChange={handleUpper('middle_name')} /></div>
                  <div className="form-group"><label className="form-label">Gender</label>
                    <select className="form-control" value={form.gender || ''} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="">Select...</option>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Birth Date</label><input type="date" className="form-control" value={form.birth_date || ''} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Age</label><input className="form-control" value={calculateAge(form.birth_date)} disabled /></div>
                  <div className="form-group"><label className="form-label">Nationality</label><input className="form-control" value={form.nationality || ''} onChange={handleUpper('nationality')} /></div>
                  <div className="form-group"><label className="form-label">Civil Status</label>
                    <select className="form-control" value={form.civil_status || ''} onChange={e => setForm(f => ({ ...f, civil_status: e.target.value }))}>
                      <option value="">Select...</option>
                      <option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option>
                    </select>
                  </div>
                </div>

                <h4 style={{marginTop: 15, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 5}}>Address</h4>
                <div className="form-grid">
                  <div className="form-group span-2"><label className="form-label">Address / Street</label><input className="form-control" value={form.address || ''} onChange={handleUpper('address')} /></div>
                  <div className="form-group"><label className="form-label">Sitio</label><input className="form-control" value={form.sitio || ''} onChange={handleUpper('sitio')} /></div>
                  <div className="form-group"><label className="form-label">Purok</label><input className="form-control" value={form.purok || ''} onChange={handleUpper('purok')} /></div>
                  <div className="form-group"><label className="form-label">Brgy.</label><input className="form-control" value={form.brgy || ''} onChange={handleUpper('brgy')} /></div>
                  <div className="form-group"><label className="form-label">Municipality/City</label><input className="form-control" value={form.city || ''} onChange={handleUpper('city')} /></div>
                  <div className="form-group"><label className="form-label">Home Status</label>
                    <select className="form-control" value={form.home_status || ''} onChange={e => setForm(f => ({ ...f, home_status: e.target.value }))}>
                      <option value="">Select...</option>
                      <option value="Owned">Owned</option>
                      <option value="Rented">Rented</option>
                      <option value="Family/Relatives">Family/Relatives</option>
                    </select>
                  </div>
                </div>

                <h4 style={{marginTop: 15, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 5}}>Contact & Business</h4>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Main Number</label><input className="form-control" value={form.contact || ''} onChange={handleUpper('contact')} /></div>
                  <div className="form-group"><label className="form-label">Secondary Number</label><input className="form-control" value={form.secondary_contact || ''} onChange={handleUpper('secondary_contact')} /></div>
                  <div className="form-group"><label className="form-label">Email Address</label><input type="email" className="form-control" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">FB Account</label><input className="form-control" value={form.fb_account || ''} onChange={handleUpper('fb_account')} /></div>
                  <div className="form-group span-2"><label className="form-label">Business</label>
                    <select className="form-control" value={form.occupation || ''} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))}>
                      <option value="">Select Business...</option>
                      <option value="Sari-sari Store">Sari-sari Store</option>
                      <option value="Eatery/Carenderia">Eatery/Carenderia</option>
                      <option value="Market Vendor">Market Vendor</option>
                      <option value="Online Seller">Online Seller</option>
                      <option value="Tricycle Driver">Tricycle Driver</option>
                      <option value="Salary/Employed">Salary/Employed</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                  <div className="form-group span-2"><label className="form-label">Complete Business Address</label><input className="form-control" value={form.business_address || ''} onChange={handleUpper('business_address')} /></div>

                  <div className="form-group"><label className="form-label">Years in Business</label><input type="number" className="form-control" value={form.business_years || ''} onChange={e => setForm(f => ({ ...f, business_years: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Months in Business</label><input type="number" className="form-control" value={form.business_months || ''} onChange={e => setForm(f => ({ ...f, business_months: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Business Ownership</label>
                    <select className="form-control" value={form.business_ownership || ''} onChange={e => setForm(f => ({ ...f, business_ownership: e.target.value }))}>
                      <option value="">Select...</option>
                      <option value="Sole">Sole</option>
                      <option value="Family">Family</option>
                      <option value="Partners">Partners</option>
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Business Permit Issued</label>
                    <select className="form-control" value={form.business_permit || ''} onChange={e => setForm(f => ({ ...f, business_permit: e.target.value }))}>
                      <option value="">Select...</option>
                      <option value="LGU">LGU</option>
                      <option value="Brgy.">Brgy.</option>
                      <option value="None">None</option>
                    </select>
                  </div>
                </div>

                <h4 style={{marginTop: 15, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 5}}>ID Information</h4>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Type of ID</label>
                    <select className="form-control" value={form.id_type || ''} onChange={e => setForm(f => ({ ...f, id_type: e.target.value }))}>
                      <option value="">Select ID...</option>
                      <option value="UMID">UMID</option>
                      <option value="Driver's License">Driver's License</option>
                      <option value="Passport">Passport</option>
                      <option value="SSS ID">SSS ID</option>
                      <option value="GSIS ID">GSIS ID</option>
                      <option value="PhilHealth ID">PhilHealth ID</option>
                      <option value="TIN ID">TIN ID</option>
                      <option value="Postal ID">Postal ID</option>
                      <option value="Voter's ID">Voter's ID</option>
                      <option value="National ID (Philsys)">National ID (Philsys)</option>
                      <option value="PRC ID">PRC ID</option>
                      <option value="Senior Citizen ID">Senior Citizen ID</option>
                      <option value="Others">Others</option>
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">ID Number</label><input className="form-control" value={form.id_number || ''} onChange={handleUpper('id_number')} /></div>
                  <div className="form-group"><label className="form-label">Issue Date</label><input type="date" className="form-control" value={form.id_issue_date || ''} onChange={e => setForm(f => ({ ...f, id_issue_date: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Expiry Date</label><input type="date" className="form-control" value={form.id_expiry_date || ''} onChange={e => setForm(f => ({ ...f, id_expiry_date: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Issued By</label><input className="form-control" value={form.id_issued_by || ''} onChange={handleUpper('id_issued_by')} /></div>
                </div>

                <h4 style={{marginTop: 15, marginBottom: 10, borderBottom: '1px solid #334155', paddingBottom: 5}}>Financial Details & Assignment</h4>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Income per month</label><input type="number" className="form-control" value={form.income_per_month || ''} onChange={e => setForm(f => ({ ...f, income_per_month: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Expenses per month</label><input type="number" className="form-control" value={form.expenses_per_month || ''} onChange={e => setForm(f => ({ ...f, expenses_per_month: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Loan Purpose</label><input className="form-control" value={form.loan_purpose || ''} onChange={handleUpper('loan_purpose')} /></div>
                  <div className="form-group"><label className="form-label">Collateral</label><input className="form-control" value={form.collateral || ''} onChange={handleUpper('collateral')} /></div>
                  <div className="form-group"><label className="form-label">Branch</label>
                    <select className="form-control" value={form.branch_id || ''} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}>
                      <option value="">Select Branch...</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Collector</label>
                    <select className="form-control" value={form.collector_id || ''} onChange={e => setForm(f => ({ ...f, collector_id: e.target.value }))}>
                      <option value="">Select Collector...</option>
                      {collectors.map(c => <option key={c.id} value={c.id}>{c.collector_code} - {c.first_name} {c.last_name}</option>)}
                    </select>
                  </div>
                  {editing && <div className="form-group"><label className="form-label">Status</label>
                    <select className="form-control" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="active">Active</option><option value="inactive">Inactive</option>
                    </select>
                  </div>}
                </div>
                <div className="form-actions" style={{marginTop: 20}}>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Customer'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {soaModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSoaModal(false)}>
          <div className="soa-modal">
            <div className="soa-modal-header">
              <div className="soa-modal-title-wrapper">
                <div className="soa-icon-box">📄</div>
                Statement of Account
              </div>
              <button className="modal-close" onClick={() => setSoaModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '30px', background: '#f8fafc' }} id="printable-area">
              {soaLoading ? <div className="text-center" style={{ padding: 40 }}>⏳ Loading SOA Data...</div> : soaData ? (() => {
                const activeLoans = soaData.loans?.filter(l => l.status === 'active') || [];
                const totalLoanAmt = activeLoans.reduce((sum, l) => sum + l.principal, 0);
                const outstandingBal = activeLoans.reduce((sum, l) => sum + l.balance, 0);
                const totalPaid = soaData.payments?.reduce((sum, p) => sum + p.amount_paid, 0) || 0;
                
                const sortedPayments = soaData.payments ? [...soaData.payments].sort((a,b) => new Date(b.date_paid) - new Date(a.date_paid)) : [];
                const lastPayment = sortedPayments.length > 0 ? new Date(sortedPayments[0].date_paid).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '—';
                const nextDueDate = activeLoans.length > 0 && activeLoans[0].date_maturity ? new Date(activeLoans[0].date_maturity).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '—';
                const memberSince = soaData.created_at ? new Date(soaData.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '—';

                return (
                  <div>
                    <div className="soa-top-header">
                      <div>
                        <h2 className="soa-brand-name">MELANN LENDING</h2>
                        <p className="soa-subtitle">Statement of Account</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="soa-date">Date: <span>{new Date().toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'})}</span></div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                          <button className="soa-print-btn" style={{ background: '#64748b' }} onClick={() => setSoaModal(false)}>✕ Close</button>
                          <button className="soa-print-btn" onClick={() => window.print()}>🖨️ Print</button>
                        </div>
                      </div>
                    </div>

                    <div className="soa-card soa-info-wrapper">
                      <div className="soa-info-left">
                        <div className="soa-avatar">👤</div>
                        <div className="soa-info-grid">
                          <div className="soa-info-item">
                            <div className="soa-info-item-icon"></div>
                            <div>
                              <div className="soa-info-label">Customer Name</div>
                              <div className="soa-info-val" style={{ textTransform: 'uppercase' }}>{soaData.full_name}</div>
                              <div className="soa-info-label" style={{ marginTop: 10 }}>Contact</div>
                              <div className="soa-info-val">{soaData.contact || '—'}</div>
                            </div>
                          </div>
                          <div className="soa-info-item">
                            <div className="soa-info-item-icon">🪪</div>
                            <div>
                              <div className="soa-info-label">Customer Code</div>
                              <div className="soa-info-val">{soaData.customer_code}</div>
                              <div className="soa-info-label" style={{ marginTop: 10 }}>Loan Status</div>
                              <div className="soa-badge-active">✓ Active</div>
                            </div>
                          </div>
                          <div className="soa-info-item">
                            <div className="soa-info-item-icon">📍</div>
                            <div>
                              <div className="soa-info-label">Address</div>
                              <div className="soa-info-val">{[soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ') || '—'}</div>
                              <div className="soa-info-label" style={{ marginTop: 10 }}>Member Since</div>
                              <div className="soa-info-val">{memberSince}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="soa-gauge-wrapper">
                        <div className="soa-gauge">
                          <div className="soa-gauge-label">Outstanding<br/>Balance</div>
                          <div className="soa-gauge-val">₱{Number(outstandingBal).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
                          <div className="soa-gauge-sub">As of {new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div>
                        </div>
                      </div>
                    </div>

                    <div className="soa-summary-row">
                      <div className="soa-card soa-summary-card">
                        <div className="soa-summary-header">💳 LOAN SUMMARY</div>
                        <div className="soa-summary-grid">
                          <div>
                            <div className="soa-summary-label">Total Loan Amount</div>
                            <div className="soa-summary-val">₱{Number(totalLoanAmt).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
                          </div>
                          <div>
                            <div className="soa-summary-label">Total Paid</div>
                            <div className="soa-summary-val green">₱{Number(totalPaid).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
                          </div>
                          <div>
                            <div className="soa-summary-label">Outstanding Balance</div>
                            <div className="soa-summary-val blue">₱{Number(outstandingBal).toLocaleString(undefined, {minimumFractionDigits:2})}</div>
                          </div>
                        </div>
                      </div>
                      <div className="soa-card soa-summary-card">
                        <div className="soa-summary-header">📅 PAYMENT SUMMARY</div>
                        <div className="soa-summary-grid">
                          <div>
                            <div className="soa-summary-label">Total Payments</div>
                            <div className="soa-summary-val green">{sortedPayments.length}</div>
                          </div>
                          <div>
                            <div className="soa-summary-label">Last Payment</div>
                            <div className="soa-summary-val" style={{ fontSize: 16 }}>{lastPayment}</div>
                          </div>
                          <div>
                            <div className="soa-summary-label">Next Due Date</div>
                            <div className="soa-summary-val" style={{ fontSize: 16 }}>{nextDueDate}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="soa-card">
                      <div className="soa-list-card-header">
                        <div className="soa-list-title">📚 Loan History</div>
                        <span className="soa-view-all">View All</span>
                      </div>
                      {soaData.loans && soaData.loans.length > 0 ? (
                        <table className="data-table" style={{ fontSize: 13 }}>
                          <thead><tr><th>Loan Code</th><th>Date Released</th><th>Principal</th><th>Balance</th><th>Status</th></tr></thead>
                          <tbody>
                            {soaData.loans.map(l => (
                              <tr key={l.id}>
                                <td className="mono">{l.loan_code}</td>
                                <td>{l.date_released}</td>
                                <td>₱{Number(l.principal).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                                <td>₱{Number(l.balance).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                                <td><span className={`badge badge-${l.status}`}>{l.status}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="soa-empty-state">
                          <div className="soa-empty-icon">📄</div>
                          <div className="soa-empty-title">No loans found.</div>
                          <div className="soa-empty-sub">There are no loan records associated with this account.</div>
                        </div>
                      )}
                    </div>

                    <div className="soa-card">
                      <div className="soa-list-card-header">
                        <div className="soa-list-title">🧾 Payment Ledger</div>
                        <span className="soa-view-all">View All</span>
                      </div>
                      {soaData.payments && soaData.payments.length > 0 ? (
                        <table className="data-table" style={{ fontSize: 13 }}>
                          <thead><tr><th>Date</th><th>OR Number</th><th>Loan Ref</th><th>Amount Paid</th></tr></thead>
                          <tbody>
                            {sortedPayments.map(p => (
                              <tr key={p.id}>
                                <td>{p.date_paid}</td>
                                <td className="mono">{p.or_number}</td>
                                <td className="mono">{p.loan_code}</td>
                                <td className="fw-600 text-success">₱{Number(p.amount_paid).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="soa-empty-state">
                          <div className="soa-empty-icon" style={{ color: '#22c55e' }}>💵</div>
                          <div className="soa-empty-title">No payments found.</div>
                          <div className="soa-empty-sub">There are no payment records associated with this account.</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : <div className="text-danger text-center">Failed to load data.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
