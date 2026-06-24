import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import '../soa.css'
import '../customers.css'
import CustomerWizard from '../components/CustomerWizard'
import ReloanModal from '../components/ReloanModal'

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
  
  const [reloanModalOpen, setReloanModalOpen] = useState(false)
  const [reloanCustomer, setReloanCustomer] = useState(null)
  const [loanActionType, setLoanActionType] = useState('Reloan')

  const [soaModal, setSoaModal] = useState(false)
  const [soaData, setSoaData] = useState(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [soaLoading, setSoaLoading] = useState(false)
  const [soaTab, setSoaTab] = useState('summary')
  const [viewAllLoans, setViewAllLoans] = useState(false)
  const [viewAllPayments, setViewAllPayments] = useState(false)
  const [confirmModal, setConfirmModal] = useState({ open: false, type: '', customer: null, message: '' })

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
    setViewAllLoans(false);
    setViewAllPayments(false);
    try {
      const r = await API.get(`/customers/${id}`);
      setSoaData(r.data);
    } catch {
      alert('Failed to load SOA data');
      setSoaModal(false);
    } finally {
      setSoaLoading(false);
    }
  }

  const triggerReloan = (customer) => {
    setReloanCustomer(customer);
    setLoanActionType('Reloan');
    setReloanModalOpen(true);
  }

  const triggerRecon = (customer) => {
    setReloanCustomer(customer);
    setLoanActionType('Recon');
    setReloanModalOpen(true);
  }

  const triggerReCI = (customer) => {
    setConfirmModal({
      open: true, type: 'reci', customer,
      message: 'Are you sure you want to send this client for a new Credit Investigation?'
    })
  }

  const handleRelax = async (customer) => {
    if (!window.confirm('Are you sure you want to relax this client?')) return
    try {
      await API.put(`/customers/${customer.id}/relax`)
      load()
      alert('Customer successfully relaxed.')
    } catch (err) {
      alert(err.response?.data?.error || 'An error occurred while relaxing.')
    }
  }

  const confirmAction = async () => {
    const { type, customer } = confirmModal;
    setConfirmModal({ open: false, type: '', customer: null, message: '' });
    try {
      if (type === 'reloan') {
        await API.post(`/customers/${customer.id}/reloan`);
        alert('Re-Loan application created and sent to For Approval queue.');
      } else if (type === 'reci') {
        await API.post(`/customers/${customer.id}/reci`);
        alert('Re-CI application created and sent to For CI queue.');
      }
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'An error occurred');
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

  const handlePrint = () => {
    window.print();
  };

  const isFullyPaidCustomer = (customer) => String(customer.status || '').toUpperCase() === 'FULLY PAID';
  const hasOpenReloan = (customer) => Number(customer.has_open_reloan) === 1 || customer.has_open_reloan === true;

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
                      <div>{[r.address, r.sitio, r.purok, r.brgy].filter(Boolean).join(', ') || '—'}</div>
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
                    ) : (
                      <span className="status-badge status-inactive"><div className="status-dot"></div> {r.status}</span>
                    )}
                  </td>
                  <td className="table-actions-col">
                    <div className="table-actions">
                      <button className="action-btn action-soa" onClick={() => openSoa(r.id)}>SOA</button>
                      {hasRole('admin', 'manager') && hasOpenReloan(r) ? (
                        <>
                          <button className="action-btn" style={{color: '#f59e0b', borderColor: '#fef3c7'}} onClick={() => handleRelax(r)}>Relax</button>
                          <button className="action-btn" style={{color: '#0369a1', borderColor: '#bae6fd'}} onClick={() => triggerRecon(r)}>Recon</button>
                        </>
                      ) : hasRole('admin', 'manager') && isFullyPaidCustomer(r) ? (
                        <>
                          <button className="action-btn" style={{color: '#3b82f6', borderColor: '#dbeafe'}} onClick={() => triggerReloan(r)}>Re-Loan</button>
                          <button className="action-btn" style={{color: '#10b981', borderColor: '#d1fae5'}} onClick={() => triggerReCI(r)}>Re-CI</button>
                          <button className="action-btn" style={{color: '#f59e0b', borderColor: '#fef3c7'}} onClick={() => handleRelax(r)}>Relax</button>
                        </>
                      ) : (
                        <button className="action-btn" onClick={() => openEdit(r)}>Edit</button>
                      )}
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
        <CustomerWizard 
          initialData={editing} 
          onClose={closeModal} 
          onSaved={() => { closeModal(); load(); }} 
          collectors={collectors} 
          branches={branches} 
        />
      )}
      
      {reloanModalOpen && reloanCustomer && (
        <ReloanModal
          isOpen={reloanModalOpen}
          onClose={() => setReloanModalOpen(false)}
          customerId={reloanCustomer.id}
          customer={reloanCustomer}
          loanType={loanActionType}
          onReloanSubmitted={() => {
            setReloanModalOpen(false);
            setReloanCustomer(null);
            load();
          }}
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
                const profileSections = [
                  { title: 'Personal Information', fields: [['Customer Code', soaData.customer_code], ['Classification', soaData.customer_classification], ['Full Name', soaData.full_name], ['Gender', soaData.gender], ['Birth Date', soaData.birth_date], ['Civil Status', soaData.civil_status], ['Nationality', soaData.nationality], ['Status', soaData.status]] },
                  { title: 'Address Information', fields: [['Address', [soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ')], ['Province', soaData.province], ['Zip Code', soaData.zip_code], ['Home Status', soaData.home_status]] },
                  { title: 'Contact Information', fields: [['Main Contact', soaData.contact], ['Secondary Contact', soaData.secondary_contact], ['Email', soaData.email], ['Facebook', soaData.fb_account]] },
                  { title: 'Business Information', fields: [['Business Type', soaData.business_type], ['Occupation', soaData.occupation], ['Business Name', soaData.business_name], ['Monthly Income', soaData.income_per_month ? `PHP ${Number(soaData.income_per_month).toLocaleString(undefined, {minimumFractionDigits:2})}` : ''], ['Branch', soaData.branch_name], ['Collector', soaData.collector_name]] },
                ];

                return (
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
                              <div className="soa-info-item"><div><div className="soa-info-label">Customer Name</div><div className="soa-info-val" style={{ textTransform: 'uppercase' }}>{soaData.full_name}</div><div className="soa-info-label" style={{ marginTop: 10 }}>Contact</div><div className="soa-info-val">{soaData.contact || '-'}</div></div></div>
                              <div className="soa-info-item"><div><div className="soa-info-label">Customer Code</div><div className="soa-info-val">{soaData.customer_code}</div><div className="soa-info-label" style={{ marginTop: 10 }}>Customer Status</div><div className={soaData.status === 'inactive' ? 'soa-badge-inactive' : 'soa-badge-active'}>{soaData.status || '-'}</div></div></div>
                              <div className="soa-info-item"><div><div className="soa-info-label">Address</div><div className="soa-info-val">{[soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ') || '-'}</div><div className="soa-info-label" style={{ marginTop: 10 }}>Member Since</div><div className="soa-info-val">{memberSince}</div></div></div>
                              {soaData.photo_business_proof && (
                                <div className="soa-info-item"><div><div className="soa-info-label">Store / Business Photo</div><div style={{ cursor: 'pointer' }} onClick={() => setPreviewImage(getImageUrl(soaData.photo_business_proof))}><img src={getImageUrl(soaData.photo_business_proof)} alt="Store" style={{ height: 60, borderRadius: 6, marginTop: 4, border: '1px solid #e2e8f0', objectFit: 'cover' }} /></div></div></div>
                              )}
                            </div>
                          </div>
                          <div className="soa-gauge-wrapper"><div className="soa-gauge"><div className="soa-gauge-label">Outstanding<br/>Balance</div><div className="soa-gauge-val">PHP {Number(outstandingBal).toLocaleString(undefined, {minimumFractionDigits:2})}</div><div className="soa-gauge-sub">As of {new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div></div></div>
                        </div>

                        <div className="soa-summary-row">
                          <div className="soa-card soa-summary-card print-card"><div className="print-tab print-tab-green">LOAN SUMMARY</div><div className="soa-summary-grid"><div><div className="soa-summary-label">Total Loan Amount</div><div className="soa-summary-val">PHP {Number(totalLoanAmt).toLocaleString(undefined, {minimumFractionDigits:2})}</div></div><div><div className="soa-summary-label">Total Paid</div><div className="soa-summary-val green">PHP {Number(totalPaid).toLocaleString(undefined, {minimumFractionDigits:2})}</div></div><div><div className="soa-summary-label">Outstanding Balance</div><div className="soa-summary-val blue">PHP {Number(outstandingBal).toLocaleString(undefined, {minimumFractionDigits:2})}</div></div></div></div>
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
                        {loans.length > 0 ? (<table className="data-table" style={{ fontSize: 13 }}><thead><tr><th>Loan Code</th><th>Type</th><th>Date Released</th><th>Maturity</th><th>Principal</th><th>Interest</th><th>Total Loan</th><th>Amortization</th><th>Balance</th><th>Status</th></tr></thead><tbody>{loans.map(l => (<tr key={l.id}><td className="mono">{l.loan_code}</td><td>{l.loan_type || '-'}</td><td>{l.date_released || '-'}</td><td>{l.date_maturity || '-'}</td><td>PHP {Number(l.principal || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td>PHP {Number(l.interest_amount || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td>PHP {Number(l.total_amortization || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td>PHP {Number(l.amortization || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td>PHP {Number(l.balance || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td><span className={`badge badge-${getLoanStatusClass(l)}`}>{getLoanStatusLabel(l)}</span></td></tr>))}</tbody></table>) : (<div className="soa-empty-state"><div className="soa-empty-title">No loans found.</div><div className="soa-empty-sub">There are no loan records associated with this account.</div></div>)}
                        <div className="soa-list-card-header" style={{ marginTop: 24 }}><div className="soa-list-title">Payment Ledger</div></div>
                        {sortedPayments.length > 0 ? (<table className="data-table" style={{ fontSize: 13 }}><thead><tr><th>Date Paid</th><th>Loan Ref</th><th>OR No.</th><th>Amount Paid</th><th>Balance After</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{sortedPayments.map(p => (<tr key={p.id}><td>{p.date_paid || '-'}</td><td className="mono">{p.loan_code || '-'}</td><td>{p.or_number || '-'}</td><td className="fw-600 text-success">PHP {Number(p.amount_paid || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td>PHP {Number(p.balance_after || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td><td><span className={`badge badge-${p.status}`}>{p.status || '-'}</span></td><td>{p.remarks || '-'}</td></tr>))}</tbody></table>) : (<div className="soa-empty-state"><div className="soa-empty-title">No payments found.</div><div className="soa-empty-sub">There are no payment records associated with this account.</div></div>)}
                      </div>
                    )}

                    <div className="print-footer print-only"><div className="print-footer-col"><p>We are committed to provide reliable and responsible lending solutions for your financial growth.</p></div><div className="print-footer-col center-col"><div>09171131000</div><div>melann.lic2016@gmail.com</div><div>facebook.com/MelannLendingInvestorCorp</div></div><div className="print-footer-col right-col"><div style={{ color: '#1e3a8a', fontStyle: 'italic', fontSize: 16 }}>Thank you for choosing</div><div className="print-footer-brand">MELANN LENDING!</div></div><div className="print-footer-wave"></div></div>
                  </div>
                );
              })() : <div className="text-danger text-center">Failed to load data.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setConfirmModal({ ...confirmModal, open: false })}>
          <div className="modal" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <span className="modal-title">{confirmModal.type === 'reloan' ? 'Confirm Re-Loan' : 'Confirm Re-CI'}</span>
              <button className="modal-close" onClick={() => setConfirmModal({ ...confirmModal, open: false })}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0, marginBottom: '20px', lineHeight: '1.5' }}>{confirmModal.message}</p>
              <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmModal({ ...confirmModal, open: false })}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmAction}>Yes, Continue</button>
              </div>
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

    </div>
  )
}
