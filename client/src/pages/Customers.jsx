import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import '../soa.css'
import '../customers.css'
import CustomerWizard from '../components/CustomerWizard'
import logoImg from '../assets/logo.png'

export default function Customers() {
  const { user } = useAuth()
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
  
  const [soaModal, setSoaModal] = useState(false)
  const [soaData, setSoaData] = useState(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [soaLoading, setSoaLoading] = useState(false)
  const [soaTab, setSoaTab] = useState('summary')
  const [selectedLoanForPayments, setSelectedLoanForPayments] = useState(null)

  useEffect(() => {
    if (soaModal) {
      document.body.classList.add('soa-print-mode');
    } else {
      document.body.classList.remove('soa-print-mode');
    }
    document.body.classList.toggle('soa-print-profile', soaModal && soaTab === 'profile');
    document.body.classList.toggle('soa-print-statement', soaModal && soaTab !== 'profile');

    return () => {
      document.body.classList.remove('soa-print-mode', 'soa-print-profile', 'soa-print-statement');
    };
  }, [soaModal, soaTab]);
  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = API.defaults.baseURL.replace('/api', '');
    return `${baseUrl}${path}`;
  };

  const getLoanStatusLabel = (loan) => {
    if (loan?.loan_type === 'Re-Loan' || loan?.loan_type === 'Reloan' || loan?.status === 'reloan_pending') return 'Reloan';
    if (!loan?.status) return '—';
    return loan.status.replace(/_/g, ' ');
  };

  const getLoanStatusClass = (loan) => {
    if (loan?.loan_type === 'Re-Loan' || loan?.loan_type === 'Reloan' || loan?.status === 'reloan_pending') return 'reloan';
    return loan?.status || 'unknown';
  };

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

  useEffect(() => { load() }, [search, status])
  useEffect(() => {
    API.get('/branches').then(r => setBranches(r.data))
    API.get('/collectors').then(r => setCollectors(r.data))
  }, [])

  const openNew = () => { setEditing(null); setModal(true) }
  const openEdit = (row) => { setEditing(row); setModal(true) }
  const closeModal = () => { setModal(false); setEditing(null) }

  const openSoa = async (id) => {
    setSoaModal(true);
    setSoaLoading(true);
    setSoaData(null);
    setSoaTab('summary');
    try {
      const r = await API.get(`/customers/${id}`);
      let cicStatus = null;
      try {
        const cicReq = await API.get(`/cic/readiness/${id}`);
        cicStatus = cicReq.data;
      } catch (err) {}
      setSoaData({ ...r.data, cicStatus });
    } catch {
      alert('Failed to load SOA data');
      setSoaModal(false);
    } finally {
      setSoaLoading(false);
    }
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

  const getPaginationPages = () => {
    if (totalPages <= 7) return [...Array(totalPages)].map((_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
    if (page >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', page - 1, page, page + 1, '...', totalPages];
  };

  const handlePrint = () => {
    window.print();
  };

  const formatMoney = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
  const formatPhp = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
  const formatDateLong = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
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
            <option value="hold">Hold</option>
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
                      <div>{r.contact || '—'}</div>
                      <div style={{fontSize: 11, marginTop: 4}}>{r.email || '—'}</div>
                    </div>
                  </td>
                  <td>
                    <div className="address-cell">
                      <div>{[r.address, r.sitio, r.purok, r.brgy].filter(v => v && v.toUpperCase() !== 'N/A').join(', ') || '—'}</div>
                      <div style={{fontSize: 11, marginTop: 4}}>{r.city || '—'}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      {r.collector_name || 'Unassigned'}
                    </div>
                  </td>
                  <td>
                    {r.status === 'active' ? (
                      <span className="status-badge status-active"><div className="status-dot"></div> Active</span>
                    ) : r.status === 'hold' ? (
                      <span className="status-badge" style={{ background: '#fef2f2', color: '#ef4444', borderColor: '#fca5a5' }}><div className="status-dot" style={{ background: '#ef4444' }}></div> Hold</span>
                    ) : r.status === 'FULLY PAID' || r.status === 'fully paid' ? (
                      <span className="status-badge" style={{ background: '#f0fdf4', color: '#10b981', borderColor: '#a7f3d0' }}><div className="status-dot" style={{ background: '#10b981' }}></div> FULLY PAID</span>
                    ) : (
                      <span className="status-badge status-inactive"><div className="status-dot"></div> {r.status}</span>
                    )}
                  </td>
                  <td className="table-actions-col">
                    <div className="table-actions">
                      <button className="action-btn action-soa" onClick={() => openSoa(r.id)}>SOA</button>
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
              {getPaginationPages().map((p, i) => (
                <button 
                  key={i} 
                  className={`page-btn ${page === p ? 'active' : ''} ${p === '...' ? 'ellipsis' : ''}`} 
                  onClick={() => p !== '...' && setPage(p)}
                  disabled={p === '...'}
                  style={p === '...' ? { cursor: 'default', background: 'transparent', border: 'none' } : {}}
                >
                  {p}
                </button>
              ))}
              <button className="page-btn" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>→</button>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <CustomerWizard 
          initialData={editing} 
          onClose={closeModal} 
          onSaved={() => { closeModal(); load(); }} 
          collectors={collectors} 
          branches={branches} 
        />
      )}
      
      {soaModal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setSoaModal(false)}>
          <div className="soa-modal">
            <div className="soa-modal-header">
              <div className="soa-modal-title-wrapper">
                <div className="soa-icon-box">SOA</div>
                Statement of Account
              </div>
              <button className="modal-close" onClick={() => setSoaModal(false)}>x</button>
            </div>
            <div className="modal-body" style={{ padding: '30px', background: '#f8fafc' }} id="printable-area">
              {soaLoading ? <div className="text-center" style={{ padding: 40 }}>Loading SOA Data...</div> : soaData ? (() => {
                const loans = soaData.loans || [];
                const validLoans = loans.filter(l => ['active', 'pastdue', 'fullpaid'].includes(l.status));
                const activeLoans = loans.filter(l => ['active', 'pastdue'].includes(l.status));
                const sortedPayments = soaData.payments ? [...soaData.payments].sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid)) : [];
                const totalLoanAmt = validLoans.reduce((sum, l) => sum + Number(l.total_amortization || l.principal || 0), 0);
                const outstandingBal = activeLoans.reduce((sum, l) => sum + Number(l.balance || 0), 0);
                const totalPaid = sortedPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
                const lastPayment = sortedPayments.length > 0 ? new Date(sortedPayments[0].date_paid).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '-';
                const nextDueDate = activeLoans.length > 0 && activeLoans[0].date_maturity ? new Date(activeLoans[0].date_maturity).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '-';
                const memberSince = soaData.created_at ? new Date(soaData.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '-';
                const currentLoan = activeLoans[0] || validLoans[0] || loans[0] || {};
                const accountStatus = (currentLoan.id ? getLoanStatusLabel(currentLoan) : soaData.status) || '-';
                const soaNumber = `SOA-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${soaData.customer_code || soaData.id}`;
                const customerAddress = [soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city, soaData.province, soaData.zip_code].filter(Boolean).join(', ');
                const serviceFee = Number(currentLoan.service_fee || 0);
                const insurance = Number(currentLoan.insurance || 0);
                const notarialFee = Number(currentLoan.notarial_fee || 0);
                const filingFee = Number(currentLoan.filing_fee || 0);
                const totalDeductions = Number(currentLoan.total_deductions || 0);
                const otherCharges = Math.max(totalDeductions - serviceFee - insurance - notarialFee - filingFee, 0);
                const profileSections = [
                  { title: 'Personal Information', fields: [['Customer Code', soaData.customer_code], ['Classification', soaData.customer_classification], ['Full Name', soaData.full_name], ['Gender', soaData.gender], ['Birth Date', soaData.birth_date], ['Civil Status', soaData.civil_status], ['Nationality', soaData.nationality], ['Status', soaData.status]] },
                  { title: 'Address Information', fields: [['Address', [soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ')], ['Province', soaData.province], ['Zip Code', soaData.zip_code], ['Home Status', soaData.home_status]] },
                  { title: 'Contact Information', fields: [['Main Contact', soaData.contact], ['Secondary Contact', soaData.secondary_contact], ['Email', soaData.email], ['Facebook', soaData.fb_account]] },
                  { title: 'Business Information', fields: [['Business Type', soaData.business_type], ['Occupation', soaData.occupation], ['Business Name', soaData.business_name], ['Monthly Income', soaData.income_per_month ? formatPhp(soaData.income_per_month) : ''], ['Monthly Expense', soaData.expenses_per_month ? formatPhp(soaData.expenses_per_month) : ''], ['Loan Purpose', soaData.loan_purpose], ['Collateral', soaData.collateral], ['Branch', soaData.branch_name], ['Collector', soaData.collector_name]] },
                  { title: 'ID Information', fields: [['ID Type', soaData.id_type], ['ID Number', soaData.id_number], ['Issue Date', soaData.id_issue_date], ['Expiry Date', soaData.id_expiry_date], ['Issued By', soaData.id_issued_by], ['Place of Issue', soaData.id_place_of_issue]] },
                ];

                return (
                  <>
                  <style media="print">{`@page { size: ${soaTab === 'profile' ? '13in 8.5in' : '8.5in 13in'}; margin: ${soaTab === 'profile' ? '0.25in 0.12in 0.25in 0.35in' : '0.3in 0.3in 0.3in 0.45in'}; }`}</style>
                  <div className="printable-soa-wrapper">
                    <div className="soa-top-header">
                      <div className="print-brand-container">
                        <div>
                          <h2 className="soa-brand-name">MELANN LENDING</h2>
                          <p className="soa-subtitle">STATEMENT OF ACCOUNT</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="soa-date screen-only">Date: <span>{new Date().toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'})}</span></div>
                        <div className="soa-print-preview-note screen-only">
                          Print preview: {soaTab === 'profile' ? 'Legal landscape, 1 page' : `Legal portrait, ${sortedPayments.length > 20 ? 'may continue to page 2' : '1 page expected'}`}
                        </div>
                        <div className="screen-only" style={{ display: 'flex', gap: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                          <button className="soa-print-btn" style={{ background: '#64748b' }} onClick={() => setSoaModal(false)}>Close</button>
                          <button className="soa-print-btn" onClick={() => window.print()}>Print</button>
                        </div>
                      </div>
                    </div>

                    <div className="soa-tabs screen-only">
                      {[['summary', 'Summary'], ['profile', 'Profile'], ['history', 'Loans & Payments History']].map(([id, label]) => (
                        <button key={id} type="button" className={`soa-tab ${soaTab === id ? 'active' : ''}`} onClick={() => setSoaTab(id)}>{label}</button>
                      ))}
                    </div>

                    {soaTab === 'summary' && (
                      <>
                        <div className="soa-card soa-info-wrapper print-card">
                          <div className="print-tab print-tab-dark">CUSTOMER INFORMATION</div>
                          <div className="soa-info-left">
                            {soaData.photo_client || soaData.photo_id_front ? (
                              <img src={getImageUrl(soaData.photo_client || soaData.photo_id_front)} className="soa-avatar" alt="Customer Avatar" style={{ objectFit: 'contain', background: '#f8fafc', border: '1px solid #e2e8f0' }} />
                            ) : (
                              <div className="soa-avatar">{getInitials(soaData.full_name)}</div>
                            )}
                            <div className="soa-info-grid" style={{ gridTemplateColumns: soaData.photo_business_proof ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
                              <div className="soa-info-item"><div><div className="soa-info-label" style={{display:'flex', alignItems:'center', gap:5}}>Customer Name {soaData.cicStatus && <span title={soaData.cicStatus.status === 'Ready' ? 'CIC Ready' : `CIC Incomplete: ${soaData.cicStatus.missingFields?.join(', ')}`} style={{fontSize: 12, cursor:'help'}}>{soaData.cicStatus.status === 'Ready' ? '🟢' : '🟡'}</span>}</div><div className="soa-info-val" style={{ textTransform: 'uppercase' }}>{soaData.full_name}</div><div className="soa-info-label" style={{ marginTop: 10 }}>Contact</div><div className="soa-info-val">{soaData.contact || '-'}</div></div></div>
                              <div className="soa-info-item"><div><div className="soa-info-label">Customer Code</div><div className="soa-info-val">{soaData.customer_code}</div><div className="soa-info-label" style={{ marginTop: 10 }}>Customer Status</div><div className={soaData.status === 'inactive' ? 'soa-badge-inactive' : 'soa-badge-active'}>{soaData.status || '-'}</div></div></div>
                              <div className="soa-info-item"><div><div className="soa-info-label">Address</div><div className="soa-info-val">{[soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ') || '-'}</div><div className="soa-info-label" style={{ marginTop: 10 }}>Member Since</div><div className="soa-info-val">{memberSince}</div></div></div>
                              {soaData.photo_business_proof && (
                                <div className="soa-info-item"><div><div className="soa-info-label">Store / Business Photo</div><div style={{ cursor: 'pointer' }} onClick={() => setPreviewImage(getImageUrl(soaData.photo_business_proof))}><img src={getImageUrl(soaData.photo_business_proof)} alt="Store" style={{ height: 60, borderRadius: 6, marginTop: 4, border: '1px solid #e2e8f0', objectFit: 'cover' }} /></div></div></div>
                              )}
                            </div>
                          </div>
                          <div className="soa-gauge-wrapper"><div className="soa-gauge"><div className="soa-gauge-label">Outstanding<br/>Balance</div><div className="soa-gauge-val">{formatPhp(outstandingBal)}</div><div className="soa-gauge-sub">As of {new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div></div></div>
                        </div>

                        <div className="soa-summary-row">
                          <div className="soa-card soa-summary-card print-card"><div className="print-tab print-tab-green">LOAN SUMMARY</div><div className="soa-summary-grid"><div><div className="soa-summary-label">Total Loan Amount</div><div className="soa-summary-val">{formatPhp(totalLoanAmt)}</div></div><div><div className="soa-summary-label">Total Paid</div><div className="soa-summary-val green">{formatPhp(totalPaid)}</div></div><div><div className="soa-summary-label">Outstanding Balance</div><div className="soa-summary-val blue">{formatPhp(outstandingBal)}</div></div></div></div>
                          <div className="soa-card soa-summary-card print-card"><div className="print-tab print-tab-blue">PAYMENT SUMMARY</div><div className="soa-summary-grid"><div><div className="soa-summary-label">Total Payments</div><div className="soa-summary-val green">{sortedPayments.length}</div></div><div><div className="soa-summary-label">Last Payment</div><div className="soa-summary-val" style={{ fontSize: 16 }}>{lastPayment}</div></div><div><div className="soa-summary-label">Next Due Date</div><div className="soa-summary-val" style={{ fontSize: 16 }}>{nextDueDate}</div></div></div></div>
                        </div>
                      </>
                    )}

                    {soaTab === 'profile' && (
                      <div className="soa-card">
                        <div className="soa-list-card-header">
                          <div className="soa-list-title">Profile</div>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => {
                              setSoaModal(false);
                              openEdit(soaData);
                            }}
                          >
                            Edit
                          </button>
                        </div>
                        <div className="soa-profile-grid">
                          {profileSections.map(section => (
                            <section className="soa-profile-section" key={section.title}>
                              <h4>{section.title}</h4>
                              <div className="soa-profile-fields">
                                {section.fields.map(([label, value]) => (
                                  <div className="soa-profile-field" key={label}>
                                    <span>{label}</span>
                                    <strong>{value || '-'}</strong>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      </div>
                    )}

                    {soaTab === 'history' && (
                      <div className="soa-card">
                        <div className="soa-list-card-header"><div className="soa-list-title">Loans & Payments History</div></div>
                        {loans.length > 0 ? (<table className="data-table" style={{ fontSize: 13 }}><thead><tr><th>Loan Code</th><th>Type</th><th>Date Released</th><th>Maturity</th><th>Period</th><th>Principal</th><th>Interest Rate</th><th>Interest Amount</th><th>Total Loan</th><th>Amortization</th><th>Balance</th><th>Status</th></tr></thead><tbody>{loans.map(l => (<tr key={l.id} onClick={() => setSelectedLoanForPayments(l)} style={{ cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><td className="mono" style={{color: '#2563eb', fontWeight: '600'}} title="View payment history for this loan">{l.loan_code}</td><td>{l.loan_type || '-'}</td><td>{l.date_released || '-'}</td><td>{l.date_maturity || '-'}</td><td>{l.loan_period || 0} Days</td><td>{formatPhp(l.principal)}</td><td>{l.interest_rate || 0}%</td><td>{formatPhp(l.interest_amount)}</td><td>{formatPhp(l.total_amortization)}</td><td>{formatPhp(l.amortization)}</td><td>{formatPhp(l.balance)}</td><td><span className={`badge badge-${getLoanStatusClass(l)}`}>{getLoanStatusLabel(l)}</span></td></tr>))}</tbody></table>) : (<div className="soa-empty-state"><div className="soa-empty-title">No loans found.</div><div className="soa-empty-sub">There are no loan records associated with this account.</div></div>)}
                      </div>
                    )}

                    <div className="print-footer print-only"><div className="print-footer-col"><p>We are committed to provide reliable and responsible lending solutions for your financial growth.</p></div><div className="print-footer-col center-col"><div>09171131000</div><div>melann.lic2016@gmail.com</div><div>facebook.com/MelannLendingInvestorCorp</div></div><div className="print-footer-col right-col"><div style={{ color: '#1e3a8a', fontStyle: 'italic', fontSize: 16 }}>Thank you for choosing</div><div className="print-footer-brand">MELANN LENDING!</div></div><div className="print-footer-wave"></div></div>
                  </div>
                  
                  {/* FORMAL CUSTOMER PROFILE PRINT LAYOUT */}
                  <div className="formal-profile-print">
                    <div className="fp-header">
                      <div className="fp-brand">
                        <img src={logoImg} className="fp-logo" alt="Melann Lending logo" />
                        <div>
                          <h2>MELANN LENDING</h2>
                          <h3>INVESTOR CORPORATION</h3>
                          <p>Lot 3, Blk 2, Brgy. San Isidro,</p>
                          <p>Ormoc City</p>
                          <p>Leyte 6541</p>
                          <p>Tel. No.: (053) 555-1234</p>
                        </div>
                      </div>
                      <h1>CUSTOMER PROFILE</h1>
                      <table className="fp-meta"><tbody>
                        <tr><td>Print Date</td><td>:</td><td>{new Date().toLocaleDateString('en-US')} {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td></tr>
                        <tr><td>Printed By</td><td>:</td><td>{user?.username || user?.full_name || '-'}</td></tr>
                        <tr><td>Page</td><td>:</td><td>1 of 1</td></tr>
                      </tbody></table>
                    </div>

                    <section className="fp-section fp-photo-section">
                      <h3>ID AND PHOTO ATTACHMENTS</h3>
                      <div className="fp-image-grid">
                        {[
                          ['Client Photo', soaData.photo_client],
                          ['ID Front', soaData.photo_id_front],
                          ['ID Back', soaData.photo_id_back],
                          ['Business Proof', soaData.photo_business_proof],
                        ].map(([label, path]) => (
                          <div className="fp-image-tile" key={label}>
                            <span>{label}</span>
                            {path ? (
                              <img src={getImageUrl(path)} alt={label} />
                            ) : (
                              <div className="fp-image-placeholder">No image</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="fp-grid">
                      <div className="fp-col">
                        <section className="fp-section">
                          <h3>PERSONAL INFORMATION</h3>
                          <div className="fp-fields">
                            {[
                              ['Customer Code', soaData.customer_code],
                              ['Classification', soaData.customer_classification],
                              ['Full Name', soaData.full_name],
                              ['First Name', soaData.first_name],
                              ['Middle Name', soaData.middle_name],
                              ['Last Name', soaData.last_name],
                              ['Gender', soaData.gender],
                              ['Birth Date', soaData.birth_date],
                              ['Civil Status', soaData.civil_status],
                              ['Nationality', soaData.nationality],
                              ['Status', soaData.status],
                              ['Risk Category', soaData.risk_category],
                            ].map(([label, value]) => <div className="fp-field" key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}
                          </div>
                        </section>

                        <section className="fp-section">
                          <h3>ADDRESS INFORMATION</h3>
                          <div className="fp-fields">
                            {[
                              ['Address', soaData.address],
                              ['Sitio', soaData.sitio],
                              ['Purok', soaData.purok],
                              ['Barangay', soaData.brgy],
                              ['City', soaData.city],
                              ['Province', soaData.province],
                              ['Zip Code', soaData.zip_code],
                              ['Home Status', soaData.home_status],
                              ['Length of Stay', soaData.length_of_stay],
                              ['Previous Address', soaData.previous_address],
                            ].map(([label, value]) => <div className="fp-field" key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}
                          </div>
                        </section>

                        <section className="fp-section">
                          <h3>CONTACT INFORMATION</h3>
                          <div className="fp-fields">
                            {[
                              ['Main Contact', soaData.contact],
                              ['Secondary Contact', soaData.secondary_contact],
                              ['Email', soaData.email],
                              ['Facebook', soaData.fb_account],
                              ['Messenger', soaData.messenger_account],
                              ['Preferred Method', soaData.preferred_contact_method],
                              ['Preferred Time From', soaData.preferred_contact_time_from],
                              ['Preferred Time To', soaData.preferred_contact_time_to],
                              ['Contact Notes', soaData.contact_notes],
                            ].map(([label, value]) => <div className="fp-field" key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}
                          </div>
                        </section>
                      </div>

                      <div className="fp-col">
                        <section className="fp-section">
                          <h3>BUSINESS INFORMATION</h3>
                          <div className="fp-fields">
                            {[
                              ['Business Type', soaData.business_type],
                              ['Occupation', soaData.occupation],
                              ['Business Name', soaData.business_name],
                              ['Business Address', soaData.business_address],
                              ['Business Location', soaData.business_location],
                              ['Business Years', soaData.business_years],
                              ['Business Months', soaData.business_months],
                              ['Monthly Income', soaData.income_per_month ? formatPhp(soaData.income_per_month) : ''],
                              ['Monthly Expenses', soaData.expenses_per_month ? formatPhp(soaData.expenses_per_month) : ''],
                              ['Employees', soaData.business_employees],
                              ['Ownership', soaData.business_ownership],
                              ['Business Permit', soaData.business_permit],
                              ['Permit No.', soaData.permit_no],
                              ['Permit Date Issued', soaData.permit_date_issued],
                              ['Permit Place Issued', soaData.permit_place_issued],
                            ].map(([label, value]) => <div className="fp-field" key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}
                          </div>
                        </section>

                        <section className="fp-section">
                          <h3>IDENTIFICATION AND LOAN ASSIGNMENT</h3>
                          <div className="fp-fields">
                            {[
                              ['ID Type', soaData.id_type],
                              ['ID Number', soaData.id_number],
                              ['ID Issue Date', soaData.id_issue_date],
                              ['ID Expiry Date', soaData.id_expiry_date],
                              ['ID Issued By', soaData.id_issued_by],
                              ['ID Place of Issue', soaData.id_place_of_issue],
                              ['TIN', soaData.tin_number],
                              ['SSS', soaData.sss_number],
                              ['ID Notes', soaData.id_notes],
                              ['Loan Purpose', soaData.loan_purpose],
                              ['Collateral', soaData.collateral],
                              ['Branch', soaData.branch_name],
                              ['Collector', soaData.collector_name],
                              ['CIC Verification', soaData.cic_verification],
                            ].map(([label, value]) => <div className="fp-field" key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}
                          </div>
                        </section>
                      </div>
                    </div>

                    <div className="fp-footer">This is a system generated report. No signature is required.</div>
                  </div>
                  {/* END FORMAL CUSTOMER PROFILE PRINT LAYOUT */}

                  {/* FORMAL SOA PRINT LAYOUT */}
                  <div className="formal-soa-print">
                    <div className="f-soa-header">
                      <div className="f-soa-header-left">
                        <img src={logoImg} className="f-soa-logo" alt="Melann Lending logo" />
                        <div className="f-soa-company">
                          <h2>MELANN LENDING</h2>
                          <h3>INVESTOR CORPORATION</h3>
                          <p>Lot 3 Blk 2, Brgy. San Isidro</p>
                          <p>Ormoc City</p>
                          <br />
                          <p>Contact No.: 09171131000</p>
                        </div>
                      </div>
                      <div className="f-soa-header-right">
                        <table>
                          <tbody>
                            <tr><td>SOA No.</td><td>:</td><td>{soaNumber}</td></tr>
                            <tr><td>Print Date</td><td>:</td><td>{new Date().toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'})}</td></tr>
                            <tr><td>Customer Code</td><td>:</td><td>{soaData.customer_code}</td></tr>
                            <tr><td>Collector</td><td>:</td><td>{soaData.collector_name || '-'}</td></tr>
                            <tr><td>Status</td><td>:</td><td style={{ color: '#0b297a', fontWeight: 'bold', textTransform: 'uppercase' }}>{accountStatus}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <h1 className="f-soa-title">STATEMENT OF ACCOUNT</h1>

                    {loans.length > 0 && (
                      <div className="f-soa-section">
                        <div className="f-soa-sec-header">
                          <i className="bi bi-file-earmark-text"></i> LOAN INFORMATION
                        </div>
                        <div className="f-soa-sec-body">
                          <div className="f-soa-grid-3">
                            <table>
                              <tbody>
                                <tr><td>Customer Code</td><td>:</td><td>{soaData.customer_code}</td></tr>
                                <tr><td>Customer Name</td><td>:</td><td className="fw-bold">{soaData.full_name}</td></tr>
                                <tr><td>Loan Code</td><td>:</td><td>{currentLoan.loan_code}</td></tr>
                                <tr><td>Loan Type</td><td>:</td><td style={{textTransform:'uppercase'}}>{currentLoan.loan_type}</td></tr>
                                <tr><td>Date Released</td><td>:</td><td>{formatDateLong(currentLoan.date_released)}</td></tr>
                              </tbody>
                            </table>
                            <table>
                              <tbody>
                                <tr><td>Principal Amount</td><td>:</td><td>{formatMoney(currentLoan.principal)}</td></tr>
                                <tr><td>Interest Rate</td><td>:</td><td>{currentLoan.interest_rate || 0}%</td></tr>
                                <tr><td>Loan Term</td><td>:</td><td>{currentLoan.loan_period || 0} Days</td></tr>
                              </tbody>
                            </table>
                            <table>
                              <tbody>
                                <tr><td>Maturity Date</td><td>:</td><td>{formatDateLong(currentLoan.date_maturity)}</td></tr>
                                <tr><td>Payment Frequency</td><td>:</td><td>Daily</td></tr>
                                <tr><td>Purpose</td><td>:</td><td>{currentLoan.purpose || soaData.loan_purpose || '-'}</td></tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="f-soa-split">
                      <div className="f-soa-section f-soa-flex-1">
                        <div className="f-soa-sec-header">
                          <i className="bi bi-calculator"></i> LOAN COMPUTATION
                        </div>
                        <div className="f-soa-sec-body">
                          <table className="f-soa-comp-table">
                            <tbody>
                              <tr><td>Principal Amount</td><td>{formatMoney(currentLoan.principal)}</td></tr>
                              <tr><td>Interest Amount</td><td>{formatMoney(currentLoan.interest_amount)}</td></tr>
                              <tr><td>Insurance</td><td>{formatMoney(insurance)}</td></tr>
                              <tr><td>Notarial Fee</td><td>{formatMoney(notarialFee)}</td></tr>
                              <tr><td>Processing Fee</td><td>{formatMoney(serviceFee)}</td></tr>
                              <tr><td>Other Charges</td><td>{formatMoney(otherCharges + filingFee)}</td></tr>
                              <tr><td colSpan="2"><br/></td></tr>
                              <tr className="f-soa-bold" style={{color: '#0b297a'}}><td>TOTAL LOAN</td><td>{formatMoney(currentLoan.total_amortization || currentLoan.principal)}</td></tr>
                              <tr><td>Daily Amortization</td><td>{formatMoney(currentLoan.amortization)}</td></tr>
                              <tr><td colSpan="2"><br/></td></tr>
                              <tr className="f-soa-bold"><td>Outstanding Balance</td><td>{formatMoney(outstandingBal)}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="f-soa-section f-soa-flex-2">
                        <div className="f-soa-sec-header">
                          <i className="bi bi-cash-stack"></i> PAYMENT HISTORY (LEDGER)
                        </div>
                        <div className="f-soa-sec-body f-soa-no-pad">
                          <table className="f-soa-ledger-table">
                            <thead>
                              <tr>
                                <th>DATE</th>
                                <th>OR NO.</th>
                                <th>PARTICULARS</th>
                                <th>AMOUNT</th>
                                <th>BALANCE</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedPayments.length > 0 ? sortedPayments.map(p => (
                                <tr key={p.id}>
                                  <td>{formatDateLong(p.date_paid)}</td>
                                  <td>{p.or_number || '-'}</td>
                                  <td>{p.remarks || p.loan_code || 'Payment'}</td>
                                  <td>{formatMoney(p.amount_paid)}</td>
                                  <td>{formatMoney(p.balance_after)}</td>
                                </tr>
                              )) : (
                                <tr>
                                  <td colSpan="5" className="f-soa-empty">
                                    <i className="bi bi-file-earmark-text" style={{fontSize: 32, color: '#94a3b8'}}></i><br/>
                                    <strong style={{color: '#0f172a', fontSize: 12}}>No payments recorded.</strong><br/>
                                    <span style={{color: '#64748b', fontSize: 10}}>There are no payment records<br/>associated with this account.</span>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="3" style={{color: '#0b297a', fontWeight: 'bold'}}>TOTAL PAYMENTS RECEIVED</td>
                                <td colSpan="2" style={{textAlign: 'right', fontWeight: 'bold'}}>{formatMoney(totalPaid)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </div>

                    <div className="f-soa-section">
                      <div className="f-soa-sec-header">
                        <i className="bi bi-clipboard-data"></i> ACCOUNT SUMMARY
                      </div>
                      <div className="f-soa-sec-body f-soa-summary-box">
                        <div className="f-soa-summary-left">
                          <table>
                            <tbody>
                              <tr><td>Total Loan Amount</td><td>:</td><td>{formatMoney(totalLoanAmt)}</td></tr>
                              <tr><td>Total Payments Received</td><td>:</td><td>{formatMoney(totalPaid)}</td></tr>
                              <tr className="f-soa-bold" style={{color: '#0b297a'}}><td style={{fontSize: 12}}>Outstanding Balance</td><td>:</td><td style={{fontSize: 12}}>{formatMoney(outstandingBal)}</td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="f-soa-summary-right">
                          <div className="f-soa-status-box">
                            <div className="lbl">ACCOUNT STATUS</div>
                            <div className="val">{accountStatus}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="f-soa-signatures">
                      <div className="f-soa-sig-box">
                        <div className="f-soa-sig-lbl">Prepared By:</div>
                        <div className="f-soa-sig-line">
                          <strong>{user?.full_name?.toUpperCase() || user?.username?.toUpperCase() || 'IT OFFICER'}</strong>
                          <span>IT Officer</span>
                        </div>
                      </div>
                      <div className="f-soa-sig-box">
                        <div className="f-soa-sig-lbl">Checked By:</div>
                        <div className="f-soa-sig-line">
                          <strong>VICTORIO L. RELOBA JR.</strong>
                          <span>Operations Manager</span>
                        </div>
                      </div>
                      <div className="f-soa-sig-box">
                        <div className="f-soa-sig-lbl">Approved By:</div>
                        <div className="f-soa-sig-line">
                          <strong>ANNA LIZA R. RODRIGUEZ</strong>
                          <span>Executive Vice President</span>
                        </div>
                      </div>
                    </div>

                    <div className="f-soa-footer">
                      This is a system-generated Statement of Account.<br/>
                      No signature is required.
                    </div>
                  </div>
                  {/* END FORMAL SOA PRINT LAYOUT */}
                  </>
                );
              })() : <div className="text-danger text-center">Failed to load data.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="modal-overlay" style={{ zIndex: 100000, background: 'rgba(0,0,0,0.85)' }} onClick={() => setPreviewImage(null)}>
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <button 
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,0.2)', 
                border: 'none', color: '#fff', fontSize: '16px', padding: '10px 20px', 
                borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                fontWeight: 600
              }}
            >
              <span>←</span> Back
            </button>
            <img 
              src={previewImage} 
              alt="Preview" 
              style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '8px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} 
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="modal-overlay" style={{ zIndex: 100000, background: 'rgba(0,0,0,0.85)' }} onClick={() => setPreviewImage(null)}>
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <button 
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,0.2)', 
                border: 'none', color: '#fff', fontSize: '16px', padding: '10px 20px', 
                borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                fontWeight: 600
              }}
            >
              <span>←</span> Back
            </button>
            <img 
              src={previewImage} 
              alt="Preview" 
              style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '8px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }} 
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Payment Ledger Modal - Redesigned to match reference exactly */}
      {selectedLoanForPayments && (
        <div className="modal-overlay" style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '20px' }} onClick={() => setSelectedLoanForPayments(null)}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '1000px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontSize: '28px' }}>
                  <i className="bi bi-receipt"></i>
                </div>
                <div>
                  <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>Payment History</h2>
                  <div style={{ color: '#64748b', fontSize: '14px' }}>View payment history for the selected loan</div>
                </div>
              </div>
              <button onClick={() => setSelectedLoanForPayments(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '24px', cursor: 'pointer', padding: '4px' }}>&times;</button>
            </div>
            
            {/* Body */}
            <div style={{ padding: '32px', overflowY: 'auto', backgroundColor: '#fdfdfd' }}>
              
              {(() => {
                const principal = Number(selectedLoanForPayments.principal) || 0;
                const interestRate = Number(selectedLoanForPayments.interest_rate) || 0;
                // If interest_amount is 0 or missing, calculate it
                let interestAmount = Number(selectedLoanForPayments.interest_amount) || 0;
                if (interestAmount === 0 && interestRate > 0) {
                  interestAmount = principal * (interestRate / 100);
                }
                
                // If total_amortization is 0, missing, or weirdly smaller than principal, calculate it
                let totalLoan = Number(selectedLoanForPayments.total_amortization) || 0;
                if (totalLoan <= principal) {
                  totalLoan = principal + interestAmount;
                }

                // True Remaining Balance computation
                let remainingBalance = Number(selectedLoanForPayments.balance) || 0;
                const isPaid = selectedLoanForPayments.status?.toLowerCase() === 'paid';
                
                if (remainingBalance === 0 && !isPaid) {
                  const pForLoan = (soaData?.payments || []).filter(p => p.loan_code === selectedLoanForPayments.loan_code).sort((a,b) => new Date(b.date_paid) - new Date(a.date_paid));
                  if (pForLoan.length > 0) {
                    remainingBalance = Number(pForLoan[0].balance_after) || 0;
                  } else {
                    // No payments yet? Then remaining balance is the total loan, unless DB's total_amortization held the true balance.
                    remainingBalance = Number(selectedLoanForPayments.total_amortization) > 0 ? Number(selectedLoanForPayments.total_amortization) : totalLoan;
                  }
                }

                return (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', marginBottom: '32px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px 32px', backgroundColor: '#ffffff' }}>
                    {/* Row 1 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-file-earmark-text"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>LOAN REFERENCE</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#2563eb' }}>{selectedLoanForPayments.loan_code}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-person"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>CLIENT CODE</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{soaData?.customer_code || '-'}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-person-badge"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>CLIENT NAME</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{soaData?.full_name?.toUpperCase() || '-'}</div>
                      </div>
                    </div>
                    
                    {/* Row 2 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-calendar3"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>LOAN DATE</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{selectedLoanForPayments.date_released || '-'}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-calendar-event"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>DUE DATE</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#ef4444' }}>{selectedLoanForPayments.date_maturity || '-'}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-clock"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>TERM / PERIOD</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{selectedLoanForPayments.loan_period || 0} Days</div>
                      </div>
                    </div>
                    
                    {/* Row 3 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-cash-stack"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>PRINCIPAL LOAN</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(principal)}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-piggy-bank"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>INTEREST AMOUNT</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(interestAmount)} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>({interestRate}%)</span></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-arrow-repeat"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>AMORTIZATION</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(selectedLoanForPayments.amortization)}</div>
                      </div>
                    </div>

                    {/* Row 4 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-wallet2"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>TOTAL LOAN</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(totalLoan)}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-wallet"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>REMAINING BALANCE</div>
                        <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>{formatPhp(remainingBalance)}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', opacity: 0 }}>
                      {/* Empty placeholder for grid balance */}
                    </div>
                  </div>
                );
              })()}

              {/* Payment History Section Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <i className="bi bi-file-text" style={{ color: '#2563eb', fontSize: '20px' }}></i>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENT HISTORY</h3>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
              </div>

              {/* Payment History Logic */}
              {(() => {
                const loanPayments = (soaData?.payments || []).filter(p => p.loan_code === selectedLoanForPayments.loan_code).sort((a,b) => new Date(b.date_paid) - new Date(a.date_paid));
                const totalPaid = loanPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
                const totalPayable = Number(selectedLoanForPayments.total_amortization || selectedLoanForPayments.principal);
                const paymentRate = totalPayable > 0 ? Math.min(100, (totalPaid / totalPayable) * 100).toFixed(2) : 0;
                const lastPaymentDate = loanPayments.length > 0 ? loanPayments[0].date_paid : '-';

                return (
                  <>
                    {/* Table */}
                    {loanPayments.length > 0 ? (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px', backgroundColor: '#ffffff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead style={{ backgroundColor: '#0d6efd', color: '#ffffff' }}>
                            <tr>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>DATE</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENT CODE</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENTS</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>RUNNING BALANCE</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>STATUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {loanPayments.map((p, idx) => { 
                              const isFullyPaid = p.status === 'active' && Number(p.balance_after) <= 0; 
                              const isPartial = p.status === 'active' && Number(p.balance_after) > 0;
                              
                              // Pill styles
                              let pillBg = '#f1f5f9', pillColor = '#64748b', pillIcon = 'bi-circle';
                              if (isFullyPaid) { pillBg = '#f3e8ff'; pillColor = '#9333ea'; pillIcon = 'bi-check-circle'; }
                              else if (isPartial) { pillBg = '#dcfce7'; pillColor = '#16a34a'; pillIcon = 'bi-check-circle'; }
                              
                              return (
                                <tr key={p.id} style={{ borderBottom: idx === loanPayments.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '16px 24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      <i className="bi bi-calendar" style={{ color: '#94a3b8', fontSize: '18px' }}></i>
                                      <div>
                                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>{p.date_paid || '-'}</div>
                                        <div style={{ fontSize: '12px', color: '#64748b' }}>12:00 PM</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '500', color: '#2563eb' }}>{p.or_number || p.loan_code}</td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(p.amount_paid)}</td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(p.balance_after)}</td>
                                  <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '9999px', backgroundColor: pillBg, color: pillColor, fontSize: '12px', fontWeight: '600' }}>
                                      <i className={`bi ${pillIcon}`}></i> {isFullyPaid ? 'Fully Paid' : 'Active'}
                                    </span>
                                  </td>
                                </tr>
                              ); 
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '60px 0', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', textAlign: 'center', marginBottom: '24px' }}>
                        <i className="bi bi-receipt" style={{ fontSize: '32px', color: '#94a3b8', marginBottom: '16px', display: 'block' }}></i>
                        <div style={{ fontSize: '15px', color: '#475569', fontWeight: '500' }}>No payment history found for this loan.</div>
                      </div>
                    )}

                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                      
                      <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '24px', flexShrink: 0 }}>
                          <i className="bi bi-coin"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.5px' }}>TOTAL PAYMENTS</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#2563eb' }}>{loanPayments.length}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Transactions</div>
                        </div>
                      </div>
                      
                      <div style={{ padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', fontSize: '24px', flexShrink: 0 }}>
                          <i className="bi bi-wallet2"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.5px' }}>TOTAL PAID</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#16a34a' }}>{formatPhp(totalPaid)}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>Amount Paid</div>
                        </div>
                      </div>
                      
                      <div style={{ padding: '16px', backgroundColor: '#fff7ed', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c', fontSize: '24px', flexShrink: 0 }}>
                          <i className="bi bi-percent"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.5px' }}>PAYMENT RATE</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#ea580c' }}>{paymentRate}%</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>of Total Payable</div>
                        </div>
                      </div>
                      
                      <div style={{ padding: '16px', backgroundColor: '#faf5ff', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea', fontSize: '24px', flexShrink: 0 }}>
                          <i className="bi bi-calendar-event"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.5px' }}>LAST PAYMENT</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#9333ea' }}>{lastPaymentDate}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>12:00 PM</div>
                        </div>
                      </div>

                    </div>
                  </>
                );
              })()}
            </div>
            
            {/* Footer */}
            <div style={{ padding: '16px 32px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                onClick={() => setSelectedLoanForPayments(null)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: '#334155', transition: 'all 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                <i className="bi bi-x-lg"></i> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
