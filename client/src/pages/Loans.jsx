import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import FullyPaid from './FullyPaid'
import ReloanModal from '../components/ReloanModal'
import ConfirmModal from '../components/ConfirmModal'
import { FilePlus, RefreshCw, Wrench, FileText } from 'lucide-react'
import './Loans.css'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })

const printDate = value => {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
};

const calculateMaturityDate = (releaseDate, termDays) => {
  if (!releaseDate || !Number.isInteger(Number(termDays)) || Number(termDays) <= 0) return '';
  const date = new Date(`${releaseDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + Number(termDays));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function Loans() {
  const { hasRole } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('input')
  const [loading, setLoading] = useState(true)

  // Date & Collector Filters
  const [filterCollector, setFilterCollector] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterReleasedFrom, setFilterReleasedFrom] = useState('');
  const [filterReleasedTo, setFilterReleasedTo] = useState('');
  const [filterPaidFrom, setFilterPaidFrom] = useState('');
  const [filterPaidTo, setFilterPaidTo] = useState('');
  
  const [detailModal, setDetailModal] = useState(false)
  const [detailLoan, setDetailLoan] = useState(null)
  const [detailTab, setDetailTab] = useState('payments')

  const [reloanCustomer, setReloanCustomer] = useState(null)
  const [loanActionType, setLoanActionType] = useState('')
  const [reloanModalOpen, setReloanModalOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [editModal, setEditModal] = useState(null)
  const [cancelConfirmModal, setCancelConfirmModal] = useState(null)
  const [noteModal, setNoteModal] = useState(null)
  const [maturityReleaseDate, setMaturityReleaseDate] = useState('')
  const [maturityTermDays, setMaturityTermDays] = useState('45')

  const maturityDate = calculateMaturityDate(maturityReleaseDate, maturityTermDays)

  const triggerRecon = (r) => {
    setReloanCustomer({
      id: r.customer_id,
      source_loan_id: r.id,
      customer_code: r.customer_code,
      client_name: r.customer_name,
      collector_name: r.collector_name
    });
    setLoanActionType('RECON');
    setReloanModalOpen(true);
  }

  const triggerAddLoan = (r) => {
    setReloanCustomer({
      id: r.customer_id,
      customer_code: r.customer_code,
      client_name: r.customer_name,
      collector_name: r.collector_name
    });
    setLoanActionType('RELOAN');
    setReloanModalOpen(true);
  }


  const handleEditNote = (loan) => {
    setNoteModal({
      customerId: loan.customer_id,
      customerName: loan.customer_name,
      status: loan.customer_status,
      note: loan.status_note || '',
      saving: false,
      error: ''
    });
  }

  const handleNoteSubmit = async (e) => {
    e.preventDefault();
    if (!noteModal) return;
    try {
      setNoteModal(m => ({ ...m, saving: true, error: '' }));
      await API.put(`/customers/${noteModal.customerId}/status-note`, {
        note: noteModal.note,
        status: noteModal.status
      });
      setNoteModal(null);
      load();
    } catch (err) {
      setNoteModal(m => ({
        ...m,
        saving: false,
        error: err.response?.data?.error || err.message || 'Failed to update note.'
      }));
    }
  }

  const handleEditLoanSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.put(`/loans/${editModal.id}/edit`, editModal);
      setEditModal(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Error editing loan');
    }
  };

  const initiateCancelLoan = () => {
    if (!editModal?.id) return;
    setCancelConfirmModal({
      loan: editModal,
      processing: false
    });
  };

  const confirmCancelLoan = async () => {
    if (!cancelConfirmModal?.loan?.id) return;
    const targetLoan = cancelConfirmModal.loan;
    try {
      setCancelConfirmModal(prev => prev ? ({ ...prev, processing: true }) : null);
      await API.put(`/loans/${targetLoan.id}/status`, { status: 'cancelled' });
      setCancelConfirmModal(null);
      setEditModal(null);
      load();
    } catch (err) {
      setCancelConfirmModal({ loan: targetLoan, processing: false, error: err.response?.data?.error || 'Failed to cancel loan' });
      alert(err.response?.data?.error || 'Failed to cancel loan');
    }
  };

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    API.get(`/loans?${params.toString()}`)
       .then(r => setRows(r.data))
       .catch(err => console.error(err))
       .finally(() => setLoading(false)) 
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [search, status])

  const openInputLoan = (type = 'RELOAN', selectedCustomer = null) => {
    setLoanActionType(type);
    setReloanCustomer(selectedCustomer);
    setReloanModalOpen(true);
  };

  const viewSoa = (customerId, codeOrName = '') => {
    const params = new URLSearchParams();
    if (codeOrName) params.set('search', codeOrName);
    if (customerId) params.set('openSoa', customerId);
    navigate(`/customers${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const filteredRows = rows.filter(r => {
    if (filterCollector && (r.collector_name || 'Unassigned') !== filterCollector) return false;
    if (filterType && r.loan_type !== filterType) return false;
    if (filterReleasedFrom && (r.date_released || '') < filterReleasedFrom) return false;
    if (filterReleasedTo && (r.date_released || '') > filterReleasedTo) return false;
    if (filterPaidFrom && (r.date_fully_paid || '') < filterPaidFrom) return false;
    if (filterPaidTo && (r.date_fully_paid || '') > filterPaidTo) return false;
    return true;
  }).sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || ''));

  const totalPrincipal = filteredRows.reduce((sum, r) => sum + Number(r.principal || 0), 0);
  const totalInterest = filteredRows.reduce((sum, r) => sum + Number(r.interest_amount || (Number(r.total_amortization || 0) - Number(r.principal || 0)) || 0), 0);
  const totalLoan = filteredRows.reduce((sum, r) => sum + Number(r.total_amortization || (Number(r.principal || 0) + Number(r.interest_amount || 0)) || 0), 0);
  const totalBalance = filteredRows.reduce((sum, r) => sum + (r.status === 'fullpaid' ? 0 : Number(r.balance || 0)), 0);

  const uniqueCollectors = [...new Set(rows.map(r => r.collector_name || 'Unassigned'))].sort();
  const uniqueTypes = [...new Set(rows.map(r => r.loan_type))].sort();

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = API.defaults.baseURL.replace('/api', '');
    return `${baseUrl}${path}`;
  };

  const handleReverse = (id) => {
    setConfirmModal({
      message: 'Reverse this loan and all its payments?',
      subMessage: 'This action cannot be undone and will mark the loan and all associated payments as reversed.',
      onConfirm: async () => {
        setConfirmModal(null)
        try { 
          await API.post(`/reversals/loan/${id}`); 
          load();
        } catch (err) { 
          alert(err.response?.data?.error || 'Error reversing loan');
        }
      },
      onCancel: () => setConfirmModal(null)
    })
  }

  const handleApproveReloan = async (id) => {
    if (!confirm('Are you sure you want to approve this Reloan Application?')) return;
    try {
      await API.post(`/loans/${id}/approve-reloan`);
      alert('Reloan approved successfully!');
      load();
    } catch (err) { alert(err.response?.data?.error || 'Error approving reloan') }
  }

  const handleRejectReloan = async (id) => {
    const remarks = prompt('Please enter the reason for rejection:');
    if (!remarks) return;
    try {
      await API.post(`/loans/${id}/reject-reloan`, { remarks });
      alert('Reloan rejected successfully!');
      load();
    } catch (err) { alert(err.response?.data?.error || 'Error rejecting reloan') }
  }

  const viewDetail = (id) => {
    setDetailTab('payments')
    setDetailModal(true)
    API.get(`/loans/${id}`).then(r => setDetailLoan(r.data))
  }

  const schColor = (s) => ({ paid: 'badge-active', unpaid: 'badge-inactive', overdue: 'badge-pastdue' }[s] || 'badge-inactive')

  return (
    <div className="loans-modern">
      <div className="page-toolbar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input id="loan-search" className="form-control" placeholder="Search name, code, loan#..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="custom-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
        {[
          { value: 'input', label: 'Input Loans' },
          { value: '', label: 'All Status' },
          { value: 'relax', label: 'Relax' },
          { value: 'hold', label: 'Hold' },
          { value: 'active', label: 'Active' },
          { value: 'pastdue', label: 'Past Due' },
          { value: 'fullpaid', label: 'Fully Paid' }
        ].map(tab => (
          <div 
            key={tab.value}
            className={status === tab.value ? 'active' : ''}
            onClick={() => setStatus(tab.value)}
            style={{ 
              padding: '6px 14px', 
              cursor: 'pointer', 
              fontWeight: '600', 
              fontSize: '13px',
              borderRadius: '20px',
              background: status === tab.value ? '#3b82f6' : '#f1f5f9',
              color: status === tab.value ? 'white' : '#475569',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease'
            }}>
            {tab.label}
          </div>
        ))}
      </div>

      {status === 'input' ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}>
            <section className="card loans-entry-card" style={{ padding: 20 }}>
              <h4 style={{ margin: '0 0 12px', color: '#1e293b' }}>Loan Entry Actions</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-dark" onClick={() => openInputLoan('NEW')}>
                  <FilePlus size={24} style={{ position: 'absolute', top: '26px', left: '50%', transform: 'translateX(-50%)', zIndex: 1, strokeWidth: 2 }} />
                  NEW
                </button>
                <button className="btn btn-dark" onClick={() => openInputLoan('RELOAN')}>
                  <RefreshCw size={24} style={{ position: 'absolute', top: '26px', left: '50%', transform: 'translateX(-50%)', zIndex: 1, strokeWidth: 2 }} />
                  RELOAN
                </button>
                <button className="btn btn-dark" onClick={() => openInputLoan('RECON')}>
                  <Wrench size={24} style={{ position: 'absolute', top: '26px', left: '50%', transform: 'translateX(-50%)', zIndex: 1, strokeWidth: 2 }} />
                  RECON
                </button>
                <button className="btn btn-light" style={{ border: '1px solid #cbd5e1' }} onClick={() => navigate(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`)}>
                  <FileText size={24} style={{ position: 'absolute', top: '26px', left: '50%', transform: 'translateX(-50%)', zIndex: 1, strokeWidth: 2 }} />
                  View SOA
                </button>
              </div>
            </section>

            <section className="card loans-overview-card" style={{ padding: 20 }}>
              <h4 style={{ margin: '0 0 12px', color: '#1e293b' }}>Loan Input Overview</h4>
              <div className="loans-overview-list">
                {[
                  ['NEW', 'Use for first-time loans.'],
                  ['RELOAN', 'Use for clients with existing loan history.'],
                  ['RECON', 'Use to reconstruct or adjust loan records.'],
                  ['View SOA', 'View detailed loan history and balances.']
                ].map(([label, text]) => (
                  <div className={`loans-overview-row ${label.toLowerCase().replace(/\s+/g, '-')}`} key={label}>
                    <span>{label}</span>
                    <p>{text}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="card loans-recent-activity" style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 12px', color: '#1e293b' }}>Recent Loan-Entry Activity</h4>
            <p style={{ margin: 0, color: '#64748b' }}>Recently processed transactions appear in the status tabs. Use SOA for previous loans, payments, penalties, adjustments, and running balances.</p>
          </section>

          <section className="card maturity-calculator-card">
            <div className="maturity-calculator-heading">
              <div>
                <h4>Maturity Date Calculator</h4>
                <p>View only — enter a release date and term to check the expected maturity date.</p>
              </div>
              <output className="maturity-calculator-result" aria-live="polite">
                <span>Maturity Date</span>
                <strong>{maturityDate || '—'}</strong>
              </output>
            </div>
            <div className="maturity-calculator-controls">
              <label>
                <span>Release Date</span>
                <input type="date" value={maturityReleaseDate} onChange={e => setMaturityReleaseDate(e.target.value)} />
              </label>
              <div className="maturity-calculator-terms" role="group" aria-label="Loan term in days">
                <span>Loan Term</span>
                <div>
                  {['30', '45', '60'].map(days => (
                    <button type="button" key={days} className={maturityTermDays === days ? 'active' : ''} onClick={() => setMaturityTermDays(days)}>{days} days</button>
                  ))}
                </div>
              </div>
              <label>
                <span>Long Due / Custom Days</span>
                <input type="number" min="1" step="1" placeholder="e.g. 120" value={['30', '45', '60'].includes(maturityTermDays) ? '' : maturityTermDays} onChange={e => setMaturityTermDays(e.target.value)} />
              </label>
            </div>
          </section>
        </div>
      ) : status === 'fullpaid' ? (
        <FullyPaid search={search} />
      ) : (
        <>
          {/* Toolbar & Filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end', marginBottom: '15px', padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Collector</label>
                <select className="form-control" style={{ width: 170, padding: '6px 10px' }} value={filterCollector} onChange={e => setFilterCollector(e.target.value)}>
                  <option value="">All Collectors</option>
                  {uniqueCollectors.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</label>
                <select className="form-control" style={{ width: 140, padding: '6px 10px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="">All Types</option>
                  {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Released From</label>
                <input type="date" className="form-control" style={{ width: 145, padding: '6px 10px' }} value={filterReleasedFrom} onChange={e => setFilterReleasedFrom(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Released To</label>
                <input type="date" className="form-control" style={{ width: 145, padding: '6px 10px' }} value={filterReleasedTo} onChange={e => setFilterReleasedTo(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fully Paid From</label>
                <input type="date" className="form-control" style={{ width: 145, padding: '6px 10px' }} value={filterPaidFrom} onChange={e => setFilterPaidFrom(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fully Paid To</label>
                <input type="date" className="form-control" style={{ width: 145, padding: '6px 10px' }} value={filterPaidTo} onChange={e => setFilterPaidTo(e.target.value)} />
              </div>
              {(filterCollector || filterType || filterReleasedFrom || filterReleasedTo || filterPaidFrom || filterPaidTo) && (
                <button className="btn btn-secondary btn-sm" onClick={() => { setFilterCollector(''); setFilterType(''); setFilterReleasedFrom(''); setFilterReleasedTo(''); setFilterPaidFrom(''); setFilterPaidTo(''); }} style={{ alignSelf: 'flex-end' }}>✕ Clear</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={load}>🔄 Refresh</button>
              <button type="button" className="btn btn-dark" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>🖨️ Print</button>
            </div>
          </div>

          <div style={{ marginBottom: 10, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
            Showing {filteredRows.length} of {rows.length} records
          </div>

          <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Loan #</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th className="text-right">Principal</th>
                  <th className="text-right">Interest</th>
                  <th className="text-right">Total Loan</th>
                  <th className="text-right">Balance</th>
                  <th>Released</th>
                  <th>Fully Paid</th>
                  <th>Maturity</th>
                  <th>Collector</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
                {filteredRows.length > 0 && (
                  <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderBottom: '2px solid #cbd5e1' }}>
                    <td colSpan={3} style={{ textAlign: 'right', padding: '12px 14px', color: '#475569', fontSize: '12px' }}>
                      TOTALS ({filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'}):
                    </td>
                    <td className="text-right" style={{ padding: '12px 14px', color: '#0f172a', fontSize: '13px' }}>₱ {fmt(totalPrincipal)}</td>
                    <td className="text-right" style={{ padding: '12px 14px', color: '#2563eb', fontSize: '13px' }}>₱ {fmt(totalInterest)}</td>
                    <td className="text-right" style={{ padding: '12px 14px', color: '#059669', fontSize: '13px' }}>₱ {fmt(totalLoan)}</td>
                    <td className="text-right" style={{ padding: '12px 14px', color: totalBalance > 0 ? '#dc2626' : '#059669', fontSize: '13px' }}>₱ {fmt(totalBalance)}</td>
                    <td colSpan={6}></td>
                  </tr>
                )}
              </thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={13}>⏳ Loading...</td></tr>
                : filteredRows.length === 0 ? <tr><td colSpan={13} className="empty-state">No loans found</td></tr>
                : filteredRows.map(r => {
                  const interestAmt = Number(r.interest_amount || (Number(r.total_amortization || 0) - Number(r.principal || 0)) || 0);
                  const totalLoanAmt = Number(r.total_amortization || (Number(r.principal || 0) + interestAmt) || 0);
                  return (
                    <tr key={r.id}>
                      <td><span className="mono">{r.loan_code}</span></td>
                      <td>
                        <div className="fw-600">{r.customer_name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>{r.customer_code}</div>
                      </td>
                      <td><span className="tag">{r.loan_type}</span></td>
                      <td className="text-right">₱ {fmt(r.principal)}</td>
                      <td className="text-right" style={{ color: '#2563eb' }}>₱ {fmt(interestAmt)}</td>
                      <td className="text-right fw-bold" style={{ color: '#059669' }}>₱ {fmt(totalLoanAmt)}</td>
                      <td className="text-right fw-bold">
                        {r.status === 'fullpaid' || Number(r.balance || 0) <= 0 ? <span className="text-success">PAID</span> : <span>₱ {fmt(r.balance)}</span>}
                      </td>
                      <td>{r.date_released || '—'}</td>
                      <td>{r.date_fully_paid || '—'}</td>
                      <td>{r.date_maturity || '—'}</td>
                      <td>{r.collector_name || '—'}</td>
                      <td>
                        {(() => {
                          const isContext = ['relax', 'hold'].includes(r.customer_status?.toLowerCase());
                          const badgeText = isContext ? r.customer_status.toUpperCase() : (r.status === 'approved' ? 'Approved (Not Released)' : r.status);
                          const badgeClass = isContext ? r.customer_status.toLowerCase() : r.status;
                          return (
                            <>
                              <span className={`badge badge-${badgeClass}`}>{badgeText}</span>
                              {isContext && (
                                <div
                                  onClick={() => handleEditNote(r)}
                                  style={{
                                    marginTop: '6px',
                                    fontSize: '11px',
                                    color: '#475569',
                                    maxWidth: '180px',
                                    background: '#f8fafc',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '8px',
                                    padding: '6px 9px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '3px'
                                  }}
                                  title="Click to view or edit full note"
                                  onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = '#3b82f6';
                                    e.currentTarget.style.background = '#eff6ff';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = '#cbd5e1';
                                    e.currentTarget.style.background = '#f8fafc';
                                  }}
                                >
                                  <div style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    lineHeight: '1.35',
                                    fontWeight: 500
                                  }}>
                                    <i>Note: {r.status_note || '(Click to add note)'}</i>
                                  </div>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justify: 'space-between',
                                    fontSize: '10px',
                                    color: '#2563eb',
                                    fontWeight: 700,
                                    marginTop: '2px',
                                    paddingTop: '2px',
                                    borderTop: '1px dashed #cbd5e1'
                                  }}>
                                    <span>🔍 View / Edit</span>
                                    <span>✏️</span>
                                  </div>
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" className="btn btn-sm btn-light" onClick={() => viewDetail(r.id)}>View</button>
                          <button type="button" className="btn btn-sm btn-light" onClick={() => triggerAddLoan(r)}>Reloan</button>
                          <button type="button" className="btn btn-sm btn-light" onClick={() => triggerRecon(r)}>Recon</button>
                          {hasRole('admin', 'manager') && (
                            <>
                              <button type="button" className="btn btn-sm btn-light" onClick={() => setEditModal(r)}>Edit</button>
                              <button type="button" className="btn btn-sm btn-light" onClick={() => handleReverse(r.id)}>Reverse</button>
                              {r.status === 'reloan_pending' && (
                                <>
                                  <button type="button" className="btn btn-sm btn-light" onClick={() => handleApproveReloan(r.id)}>Approve</button>
                                  <button type="button" className="btn btn-sm btn-light" onClick={() => handleRejectReloan(r.id)}>Reject</button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
            </table>
          </div>
          </div>

          {status === 'relax' && (
            <section id="printable-area" className="loans-relax-print-report" aria-label="Relax clients printable report">
              <style>{'@media print { @page { size: landscape; margin: 12mm; } }'}</style>
              <header className="loans-relax-print-header">
                <div>
                  <p>Melann Lending Corporation</p>
                  <h1>Relax Clients Report</h1>
                </div>
                <div className="loans-relax-print-meta">
                  <span>Print Date</span>
                  <strong>{new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                </div>
              </header>

              <div className="loans-relax-print-summary">
                <span><strong>{filteredRows.length}</strong> {filteredRows.length === 1 ? 'client' : 'clients'}</span>
                {filterCollector && <span>Collector: <strong>{filterCollector}</strong></span>}
                {filterType && <span>Loan Type: <strong>{filterType}</strong></span>}
                {search && <span>Search: <strong>{search}</strong></span>}
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Client Code</th>
                    <th>Name of Client</th>
                    <th>Release Date</th>
                    <th>Due Date</th>
                    <th className="amount-column">Total Loan</th>
                    <th>Collector</th>
                    <th className="reason-column">Reason for Relax</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="loans-relax-print-empty">No Relax clients found for the selected filters.</td>
                    </tr>
                  ) : filteredRows.map(row => {
                    const interest = Number(row.interest_amount || (Number(row.total_amortization || 0) - Number(row.principal || 0)) || 0);
                    const loanTotal = Number(row.total_amortization || (Number(row.principal || 0) + interest) || 0);
                    return (
                      <tr key={`relax-print-${row.id}`}>
                        <td>{row.customer_code || '—'}</td>
                        <td>{row.customer_name || '—'}</td>
                        <td>{printDate(row.date_released)}</td>
                        <td>{printDate(row.date_maturity)}</td>
                        <td className="amount-column">₱ {fmt(loanTotal)}</td>
                        <td>{row.collector_name || 'Unassigned'}</td>
                        <td className="reason-column">{row.status_note || 'No reason provided'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4}>TOTAL ({filteredRows.length} {filteredRows.length === 1 ? 'client' : 'clients'})</td>
                      <td className="amount-column">₱ {fmt(totalLoan)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </section>
          )}

      {/* ===================== Loan Detail Modal ===================== */}
      {detailModal && detailLoan && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.4)', padding: 20 }} onMouseDown={e => e.target === e.currentTarget && setDetailModal(false)}>
          <div className="modal" style={{ maxWidth: 950, borderRadius: 16, padding: '30px', background: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  📄
                </div>
                <h2 style={{ margin: 0, fontSize: 22, color: '#0f172a', fontWeight: 700 }}>
                  {detailLoan.loan_code} — {detailLoan.customer_name}
                </h2>
              </div>
              <button onClick={() => setDetailModal(false)} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                ✕
              </button>
            </div>

            {/* Grid Details */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 25px', marginBottom: 25 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px 20px', borderBottom: '1px solid #f1f5f9', paddingBottom: 20, marginBottom: 20 }}>
                {/* Customer */}
                <div style={{ display: 'flex', gap: 15 }}>
                  {detailLoan.photo_client || detailLoan.photo_id_front ? (
                    <img src={getImageUrl(detailLoan.photo_client || detailLoan.photo_id_front)} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'contain', background: '#f8fafc', border: '1px solid #e2e8f0', flexShrink: 0 }} alt="Avatar" />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👤</div>
                  )}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>CUSTOMER</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a', marginTop: 4, lineHeight: 1.2 }}>{detailLoan.customer_name}</div>
                  </div>
                </div>
                {/* Type */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✔️</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>TYPE</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>{detailLoan.loan_type}</div>
                  </div>
                </div>
                {/* Principal */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f3e8ff', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👝</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>PRINCIPAL</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>₱ {fmt(detailLoan.principal)}</div>
                  </div>
                </div>
                {/* Balance */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👝</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>BALANCE</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>₱ {fmt(detailLoan.balance)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '25px 20px' }}>
                {/* Released */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📅</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>RELEASED</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>{detailLoan.date_released}</div>
                  </div>
                </div>
                {/* Maturity */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f3e8ff', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📅</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>MATURITY</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>{detailLoan.date_maturity}</div>
                  </div>
                </div>
                {/* Daily Amort */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🪙</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>DAILY AMORT.</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginTop: 4 }}>₱ {fmt(detailLoan.amortization)}</div>
                  </div>
                </div>
                {/* Status */}
                <div style={{ display: 'flex', gap: 15 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>✔️</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: 0.5 }}>STATUS</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ display: 'inline-block', padding: '4px 10px', background: '#dcfce7', color: '#16a34a', borderRadius: 4, fontSize: 12, fontWeight: 800 }}>
                        {detailLoan.status.charAt(0).toUpperCase() + detailLoan.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setDetailTab('payments')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 8, border: detailTab === 'payments' ? 'none' : '1px solid #e2e8f0', background: detailTab === 'payments' ? '#0f172a' : '#fff', color: detailTab === 'payments' ? '#fff' : '#3b82f6', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                <span style={{ fontSize: 16 }}>💳</span> Payments
              </button>
              <button onClick={() => setDetailTab('schedule')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 8, border: detailTab === 'schedule' ? 'none' : '1px solid #e2e8f0', background: detailTab === 'schedule' ? '#0f172a' : '#fff', color: detailTab === 'schedule' ? '#fff' : '#3b82f6', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                <span style={{ fontSize: 16 }}>📅</span> Amortization Schedule
              </button>
            </div>

            {/* Tables Container */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              {/* Payments Tab */}
              {detailTab === 'payments' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>PAYMENT CODE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>DATE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>AMOUNT</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>RUNNING BALANCE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>NOTES / REMARKS</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailLoan.payments || []).length === 0
                      ? <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No payments yet</td></tr>
                      : detailLoan.payments.map(p => (
                        <tr key={p.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 20px', color: '#3b82f6', fontWeight: 700, fontFamily: 'monospace' }}>{p.or_number || p.payment_code || '---'}</td>
                          <td style={{ padding: '16px 20px', color: '#334155' }}>{p.date_paid}</td>
                          <td style={{ padding: '16px 20px', color: '#0f172a', fontWeight: 800 }}>₱ {fmt(p.amount_paid)}</td>
                          <td style={{ padding: '16px 20px', color: '#475569' }}>₱ {fmt(p.balance_after)}</td>
                          <td style={{ padding: '16px 20px', color: '#475569', fontSize: 13, maxWidth: '220px', wordBreak: 'break-word' }}>
                            {p.remarks ? (
                              <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: '6px' }}>
                                <i className="bi bi-chat-left-text" style={{ color: '#2563eb', fontSize: 12, marginTop: 3, flexShrink: 0 }}></i>
                                <span>{p.remarks}</span>
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <span style={{ 
                              padding: '4px 10px', 
                              borderRadius: 12, 
                              fontSize: 12, 
                              fontWeight: 700, 
                              background: p.status === 'active' ? '#dcfce7' : p.status === 'recon' ? '#ede9fe' : p.status === 'penalty' ? '#fef3c7' : '#fee2e2',
                              color: p.status === 'active' ? '#16a34a' : p.status === 'recon' ? '#7c3aed' : p.status === 'penalty' ? '#b45309' : '#ef4444'
                            }}>
                              {p.status === 'active' ? 'Good' : p.status === 'recon' ? 'Recon' : p.status === 'penalty' ? 'Penalty' : 'Reversed'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {(detailLoan.payments || []).length > 0 && (
                    <tfoot style={{ background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
                      <tr>
                        <td colSpan={2} style={{ padding: '20px', color: '#1d4ed8', fontSize: 14, fontWeight: 800, textAlign: 'right' }}>TOTAL PAID</td>
                        <td style={{ padding: '20px', color: '#1d4ed8', fontSize: 15, fontWeight: 800 }}>₱ {fmt(detailLoan.payments.filter(p => p.status === 'active' || p.status === 'recon').reduce((s, p) => s + p.amount_paid, 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {/* Amortization Schedule Tab */}
              {detailTab === 'schedule' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800, textAlign: 'center' }}>#</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>DUE DATE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800, textAlign: 'right' }}>AMOUNT DUE</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800, textAlign: 'right' }}>AMOUNT PAID</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>DATE PAID</th>
                      <th style={{ padding: '16px 20px', color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detailLoan.schedule || []).length === 0
                      ? <tr><td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>No schedule generated</td></tr>
                      : detailLoan.schedule.map(s => (
                        <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 800, color: '#64748b' }}>{s.period_number}</td>
                          <td style={{ padding: '16px 20px', color: '#334155' }}>{s.due_date}</td>
                          <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>₱ {fmt(s.amount_due)}</td>
                          <td style={{ padding: '16px 20px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{s.amount_paid > 0 ? '₱ ' + fmt(s.amount_paid) : '—'}</td>
                          <td style={{ padding: '16px 20px', color: '#475569' }}>{s.date_paid || '—'}</td>
                          <td style={{ padding: '16px 20px' }}><span className={`badge ${schColor(s.status)}`}>{s.status}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      </>
    )}
      {/* ===================== Reloan / Recon Modal ===================== */}
      <ReloanModal
        isOpen={reloanModalOpen}
        onClose={() => setReloanModalOpen(false)}
        customerId={reloanCustomer?.id}
        customer={reloanCustomer}
        loanType={loanActionType}
        onViewSoa={(customerId) => viewSoa(customerId, reloanCustomer?.customer_code || reloanCustomer?.client_name || search)}
        onReloanSubmitted={() => {
          setReloanModalOpen(false);
          load();
        }}
      />
      {/* Custom Confirm Modal */}
      {confirmModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onMouseDown={e => e.target === e.currentTarget && confirmModal.onCancel && confirmModal.onCancel()}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '36px 32px 28px',
            maxWidth: '460px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
            animation: 'paymentConfirmIn 0.2s ease-out'
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#fffbeb',
              color: '#f59e0b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', margin: '0 auto 18px auto',
              border: '2px solid #fde68a'
            }}>
              ⚠
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              Confirm Reversal
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, margin: '0 0 6px 0' }}>
              {confirmModal.message}
            </p>
            {confirmModal.subMessage && (
              <p style={{ color: '#475569', fontSize: '14px', fontWeight: 600, margin: '0 0 28px 0' }}>
                {confirmModal.subMessage}
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={confirmModal.onCancel}
                style={{
                  padding: '10px 28px', borderRadius: '8px', border: '1px solid #e2e8f0',
                  background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '14px',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}
                onMouseEnter={e => { e.target.style.background = '#f8fafc'; e.target.style.borderColor = '#cbd5e1' }}
                onMouseLeave={e => { e.target.style.background = '#fff'; e.target.style.borderColor = '#e2e8f0' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                style={{
                  padding: '10px 28px', borderRadius: '8px', border: 'none',
                  background: '#f59e0b',
                  color: '#fff', fontWeight: 600, fontSize: '14px',
                  cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: '0 2px 8px rgba(245,158,11,0.3)'
                }}
                onMouseEnter={e => { e.target.style.background = '#d97706' }}
                onMouseLeave={e => { e.target.style.background = '#f59e0b' }}
              >
                Confirm Reverse
              </button>
            </div>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="note-modal-overlay" onMouseDown={e => e.target === e.currentTarget && !noteModal.saving && setNoteModal(null)}>
          <div className="note-modal">
            <div className="note-modal-header">
              <div>
                <span className="note-modal-eyebrow">Manager Note</span>
                <h3>Edit note</h3>
                <p>{noteModal.customerName}</p>
              </div>
              <button type="button" className="note-modal-close" onClick={() => setNoteModal(null)} disabled={noteModal.saving} aria-label="Close note editor">
                ×
              </button>
            </div>
            <form onSubmit={handleNoteSubmit}>
              <label className="note-modal-label" htmlFor="loan-status-note">Note / reason</label>
              <textarea
                id="loan-status-note"
                className="note-modal-textarea"
                rows="5"
                value={noteModal.note}
                onChange={e => setNoteModal(m => ({ ...m, note: e.target.value }))}
                autoFocus
              />
              {noteModal.error && <div className="note-modal-error">{noteModal.error}</div>}
              <div className="note-modal-actions">
                <button type="button" className="btn btn-light" onClick={() => setNoteModal(null)} disabled={noteModal.saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={noteModal.saving}>
                  {noteModal.saving ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ background: '#fff', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#0f172a', fontSize: '20px', fontWeight: 700 }}>Edit Loan</h3>
            <form onSubmit={handleEditLoanSubmit}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Principal Amount</label>
                <input type="number" step="0.01" className="form-control" value={editModal.principal || ''} onChange={e => setEditModal({...editModal, principal: e.target.value})} required />
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Interest Rate (%)</label>
                <input type="number" step="0.01" className="form-control" value={editModal.interest_rate || 0} onChange={e => setEditModal({...editModal, interest_rate: e.target.value})} required />
              </div>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Loan Period (Days)</label>
                <input type="number" className="form-control" value={editModal.loan_period || ''} onChange={e => setEditModal({...editModal, loan_period: e.target.value})} required />
              </div>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Date Released</label>
                <input type="date" className="form-control" value={editModal.date_released || ''} onChange={e => setEditModal({...editModal, date_released: e.target.value})} required />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                {!['cancelled', 'canceled'].includes(String(editModal.status || '').toLowerCase()) && (
                  <button type="button" onClick={initiateCancelLoan} className="btn btn-danger" style={{ marginRight: 'auto' }}>
                    Cancel Loan
                  </button>
                )}
                <button type="button" onClick={() => setEditModal(null)} className="btn btn-light" style={{ border: '1px solid #cbd5e1' }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cancelConfirmModal && (
        <ConfirmModal
          isOpen={Boolean(cancelConfirmModal)}
          title="Cancel Loan"
          message="Are you sure you want to cancel this loan?"
          badgeText={cancelConfirmModal.loan?.loan_code}
          subMessage={cancelConfirmModal.error || 'This will mark the loan as cancelled.'}
          type={cancelConfirmModal.error ? 'warning' : 'danger'}
          confirmText="Cancel Loan"
          cancelText="Back"
          loading={cancelConfirmModal.processing}
          onConfirm={confirmCancelLoan}
          onCancel={() => setCancelConfirmModal(null)}
        />
      )}
    </div>
  )
}
