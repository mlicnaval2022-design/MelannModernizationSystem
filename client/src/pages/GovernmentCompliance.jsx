import { useEffect, useMemo, useRef, useState } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import { hasModuleAccess } from '../access';
import './GovernmentCompliance.css';

const apiOrigin = API.defaults.baseURL.replace('/api', '');

const AGENCIES = {
  CIC: {
    label: 'FOR CIC',
    filters: ['month', 'year', 'status'],
    statuses: ['Pending', 'For Review', 'Submitted', 'Accepted', 'Rejected', 'Needs Correction'],
    attachments: ['CIC Data File', 'Transmittal', 'Confirmation Receipt', 'Supporting Documents'],
    columns: [
      ['submission_month', 'Submission Month'], ['reporting_period', 'Reporting Period'], ['due_date', 'Due Date'],
      ['date_submitted', 'Date Submitted'], ['status', 'Status'], ['remarks', 'Remarks'], ['prepared_by', 'Prepared By'],
      ['verified_by', 'Verified By'], ['file_uploaded', 'File Uploaded'], ['date_uploaded', 'Date Uploaded']
    ]
  },
  SEC: {
    label: 'FOR SEC',
    filters: ['filing_type', 'year', 'status'],
    statuses: ['Not Started', 'Ongoing', 'Ready for Submission', 'Submitted', 'Approved', 'Returned', 'Completed'],
    filingTypes: ['GIS', 'AFS', 'General Information Sheet', 'Articles of Amendment', 'Increase of Capital', 'Business Plan', 'Certificate Under Oath', 'Comparative Matrix', 'Other SEC Filings'],
    attachments: ['GIS', 'AFS', 'Articles of Amendment', 'Business Plan', 'Certificate Under Oath', 'Comparative Matrix', 'Other SEC Filing'],
    columns: [
      ['compliance_name', 'Compliance Name'], ['filing_type', 'Filing Type'], ['due_date', 'Due Date'],
      ['date_submitted', 'Date Submitted'], ['status', 'Status'], ['assigned_personnel', 'Assigned Personnel'],
      ['remarks', 'Remarks'], ['uploaded_documents', 'Uploaded Documents']
    ]
  },
  BIR: {
    label: 'FOR BIR',
    filters: ['tax_type', 'date_range', 'month', 'year', 'status'],
    statuses: ['Pending', 'Filed', 'Paid', 'Overdue'],
    taxTypes: ['Percentage Tax', 'Withholding Tax', 'Expanded Withholding Tax', 'Income Tax', 'Annual Registration Fee', 'Books of Accounts', 'ATP', 'Other BIR Requirements'],
    attachments: ['Tax Return', 'Official Receipt', 'Payment Confirmation', 'Supporting Documents'],
    columns: [
      ['tax_type', 'Tax Type'], ['filing_period', 'Filing Period'], ['due_date', 'Due Date'], ['date_filed', 'Date Filed'],
      ['date_paid', 'Date Paid'], ['or_number', 'OR Number'], ['amount', 'Amount'], ['status', 'Status'], ['remarks', 'Remarks']
    ]
  }
};

const CIC_HEADERS = {
  HD: ["Record Type","Provider Code","File Reference Date\n(End Day of the Reporting Month)\nddmmyyy","Version","Submission Type","Provider Comments"],
  ID: ["Record Type","Provider Code","Subject Reference Date\n(End Day of the Reporting Month)\nddmmyyy","Provider Subject No","Title","First Name","Last Name","Middle Name","Gender","Date of Birth","Place of Birth","Country of Birth (Code)","Nationality","Resident","Civil Status","Mother's Maiden First Name","Mother's Maiden FULL NAME","Mother's Maiden Middle Name","Father First Name","Father Last Name","Address 1: Address Type","Address 1: FullAddress","Address 1: House Owner/Lessee","Address 2: Address Type","Address 2: FullAddress","Address 2: StreetNo","Identification 1: Type","ID 1: Type","ID 1: Number","ID 1: IssueDate","ID 1: IssueCountry","ID 1: ExpiryDate","ID 1: Issued By","ID 2: Type","Contact 1: Type","Contact 1: Value"],
  CI: ["Record Type","Provider Code","Branch Code","Contract Reference Date\n(End Day of the Reporting Month)\nddmmyyy","Provider Subject No","Role","Provider Contract No","Contract Type","Contract Phase","Contract Status","Currency","Original Currency","Contract Start Date","Contract Request Date","Contract End Planned Date","Contract End Actual Date","Last Payment Date","Reorganized Credit Code","Board Resolution flag","Financed Amount","Installments Number","Transaction Type / Sub-facility","Purpose of credit","Payment Periodicity","Payment Method","Monthly Payment Amount","First Payment Date","Last payment amount","Next Payment Date","Next Payment","Outstanding Payments Number","Outstanding Balance","Overdue Payments Number","Overdue Payments Amount","Overdue Days","Good Type","Good Value","New/Used Code","Good Brand","Manufacturing Date","Registration number","Provider Guarantee No 1","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 2","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 3","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 4","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 5","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 6","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Subject No (Linked Subject 1)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 2)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 3)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 4)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 5)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 6)","Role","Name of the Linked Subject"],
  FT: ["Record Type","Provider Code","File Reference Date\n(End Day of the Reporting Month)\nddmmyyy","No. of records"]
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2026, i, 1).toLocaleString('en-US', { month: 'long' }) }));
const currentYear = new Date().getFullYear();
const emptyFilters = { search: '', startDate: '', endDate: '', month: '', year: currentYear, status: '', filing_type: '', tax_type: '', page: 1, limit: 10, sort: 'due_date', dir: 'ASC' };
const emptyForm = { due_date: '', status: '', amount: 0 };
const EMPTY_BIR_CLIENT_SUMMARY = {
  totals: { loans: 0, clients: 0, loanAmount: 0, interest: 0, loanWithInterest: 0 },
  demographics: { gender: [], civilStatus: [], education: [], employment: [] },
  financial: { loanRanges: [], incomeRanges: [], interestBreakdown: [] },
};

function badgeClass(status) {
  const key = String(status || '').toLowerCase().replace(/\s+/g, '-');
  if (['accepted', 'approved', 'completed', 'paid', 'submitted', 'filed'].includes(key)) return 'gc-badge good';
  if (['rejected', 'returned', 'overdue', 'needs-correction'].includes(key)) return 'gc-badge bad';
  if (['for-review', 'ready-for-submission', 'ongoing'].includes(key)) return 'gc-badge warn';
  return 'gc-badge';
}

function firstAttachment(row) {
  return row.attachments?.[0] || null;
}

export default function GovernmentCompliance() {
  const { user } = useAuth();
  // Role Configuration is the single authority for this module.  Agency-specific
  // role lists used to bypass it and rejected custom roles such as IT/Accounting Clerk.
  const canOpen = hasModuleAccess(user, 'government-compliance');
  const canCreate = hasModuleAccess(user, 'government-compliance', 'create');
  const canEdit = hasModuleAccess(user, 'government-compliance', 'edit');
  const canDelete = hasModuleAccess(user, 'government-compliance', 'delete');
  const visibleAgencies = canOpen ? Object.keys(AGENCIES) : [];
  const [active, setActive] = useState(visibleAgencies[0] || 'CIC');
  const [rows, setRows] = useState([]);
  const [viewMode, setViewMode] = useState('company');
  const [clientRows, setClientRows] = useState([]);
  const [clientFilters, setClientFilters] = useState({ search: '', loanType: '', status: '', startDate: '', endDate: '' });
  const [summary, setSummary] = useState({ cards: {}, notifications: [] });
  const [birClientSummary, setBirClientSummary] = useState(EMPTY_BIR_CLIENT_SUMMARY);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [history, setHistory] = useState([]);
  const [uploadTarget, setUploadTarget] = useState(null);
  const fileRef = useRef(null);

  const config = AGENCIES[active];
  const loadSummary = async () => {
    const { data } = await API.get('/government-compliance/summary');
    setSummary(data);
  };

  const loadRows = async () => {
    if (!visibleAgencies.includes(active)) return;
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
      const { data } = await API.get(`/government-compliance/${active}`, { params });
      setRows(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  };

  const loadClientRows = async () => {
    if (!visibleAgencies.includes(active)) return;
    setLoading(true);
    try {
      const params = {};
      if (clientFilters.startDate) params.startDate = clientFilters.startDate;
      if (clientFilters.endDate) params.endDate = clientFilters.endDate;
      const { data } = await API.get(`/government-compliance/client-reports/${active}`, { params });
      setClientRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadBirClientSummary = async (coveredOnly = false) => {
    setLoading(true);
    try {
      const { data } = await API.get('/government-compliance/bir-client-summary', { params: coveredOnly ? { covered_only: true } : {} });
      setBirClientSummary(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSummary().catch(() => {}); }, []);
  useEffect(() => {
    if (viewMode === 'summary' || viewMode === 'covered-loans') loadBirClientSummary(viewMode === 'covered-loans');
    else if (viewMode === 'company') loadRows();
    else loadClientRows();
  }, [active, filters.page, filters.sort, filters.dir, filters.startDate, filters.endDate, clientFilters.startDate, clientFilters.endDate, viewMode]);

  const pageCount = Math.max(Math.ceil(total / filters.limit), 1);
  const money = value => Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
  const clientLoanTypes = useMemo(() => [...new Set(clientRows.map(row => row.loan_type).filter(Boolean))].sort(), [clientRows]);
  const clientStatuses = useMemo(() => [...new Set(clientRows.map(row => row.status).filter(Boolean))].sort(), [clientRows]);
  const filteredClientRows = useMemo(() => {
    const search = clientFilters.search.trim().toLowerCase();
    return clientRows.filter(row => {
      const matchesSearch = !search || [row.customer_code, row.customer_name, row.collector_name, row.branch_name].some(value => String(value || '').toLowerCase().includes(search));
      const matchesType = !clientFilters.loanType || row.loan_type === clientFilters.loanType;
      const matchesStatus = !clientFilters.status || row.status === clientFilters.status;
      const rowDate = row.release_date || (row.created_at ? row.created_at.slice(0, 10) : '');
      const matchesStart = !clientFilters.startDate || (rowDate && rowDate >= clientFilters.startDate);
      const matchesEnd = !clientFilters.endDate || (rowDate && rowDate <= clientFilters.endDate);
      return matchesSearch && matchesType && matchesStatus && matchesStart && matchesEnd;
    });
  }, [clientRows, clientFilters]);
  const clientTotals = useMemo(() => filteredClientRows.reduce((totals, row) => ({
    count: totals.count + 1,
    principal: totals.principal + Number(row.principal_loan ?? row.loan_amount ?? 0),
    interest: totals.interest + Number(row.interest_amount || 0),
    totalLoan: totals.totalLoan + Number(row.total_loan ?? row.loan_amount ?? 0)
  }), { count: 0, principal: 0, interest: 0, totalLoan: 0 }), [filteredClientRows]);
  const kpis = useMemo(() => {
    const cards = summary.cards?.[active] || {};
    return [
      ['Total', cards.total || 0, 'blue'],
      ['Due Soon', cards.due_soon || cards.dueSoon || 0, 'yellow'],
      ['Overdue', cards.overdue || 0, 'red'],
      ['Completed', cards.completed || cards.accepted || cards.approved || 0, 'green']
    ];
  }, [summary, active]);

  const renderValue = (row, key) => {
    const value = row[key];
    if (key === 'status') return <span className={badgeClass(value)}>{value || '-'}</span>;
    if (key === 'amount') return money(value);
    if (key === 'file_uploaded') return firstAttachment(row) ? 'Yes' : 'No';
    if (key === 'date_uploaded') return firstAttachment(row)?.uploaded_at || '-';
    if (key === 'uploaded_documents') return row.attachments?.length ? `${row.attachments.length} file(s)` : '-';
    return value || '-';
  };

  const sortBy = key => {
    setFilters(f => ({ ...f, sort: key, dir: f.sort === key && f.dir === 'ASC' ? 'DESC' : 'ASC', page: 1 }));
  };

  const openForm = row => {
    setForm(row ? { ...emptyForm, ...row } : { ...emptyForm, status: config.statuses[0] || '' });
    setModal('form');
  };

  const saveForm = async e => {
    e.preventDefault();
    if (form.id) await API.put(`/government-compliance/${active}/${form.id}`, form);
    else await API.post(`/government-compliance/${active}`, form);
    setModal(null);
    await loadRows();
    await loadSummary().catch(() => {});
  };

  const archiveRow = async row => {
    if (!window.confirm('Archive this compliance record?')) return;
    await API.delete(`/government-compliance/${active}/${row.id}`);
    await loadRows();
    await loadSummary().catch(() => {});
  };

  const uploadFile = async e => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadTarget?.row) return;
    const body = new FormData();
    body.append('file', file);
    body.append('document_type', uploadTarget.document_type || config.attachments[0]);
    body.append('replace', uploadTarget.replace ? '1' : '0');
    await API.post(`/government-compliance/${active}/${uploadTarget.row.id}/attachments`, body);
    setUploadTarget(null);
    await loadRows();
  };

  const openHistory = async row => {
    const { data } = await API.get(`/government-compliance/${active}/${row.id}/history`);
    setHistory(data);
    setModal('history');
  };

  if (!canOpen) return <div className="gc-page"><div className="empty-state">You do not have access to Government Compliance.</div></div>;

  return (
    <div className="gc-page">
      <div className="payments-header">
        <div>
          <h2 className="payments-title">Government Compliance</h2>
          <p className="payments-subtitle">Track CIC, SEC, and BIR compliance submissions.</p>
        </div>
        {canCreate && viewMode === 'company' && <button className="btn btn-primary" onClick={() => openForm(null)}>Add Record</button>}
      </div>

      <div className="gc-kpis">
        {kpis.map(([label, value, tone]) => <div className={`gc-kpi ${tone}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      {summary.notifications?.length > 0 && (
        <div className="gc-notifications">
          <strong>Notifications</strong>
          <div className="gc-notification-list">
            {summary.notifications.map((note, idx) => <div className={`gc-note ${note.level || ''}`} key={idx}><strong>{note.title || note.agency || 'Reminder'}</strong><span>{note.message || note.description || ''}</span></div>)}
          </div>
        </div>
      )}

      <div className="gc-tabs">
        {visibleAgencies.map(agency => <button key={agency} className={active === agency ? 'active' : ''} onClick={() => { setActive(agency); setViewMode('company'); setFilters(emptyFilters); }}>{AGENCIES[agency].label}</button>)}
        {active === 'CIC' && canCreate && <button className={viewMode === 'generator' ? 'active' : ''} onClick={() => setViewMode('generator')}>CIC Generator</button>}
      </div>

      {viewMode !== 'generator' && (
        <div className="gc-tabs">
          <button className={viewMode === 'company' ? 'active' : ''} onClick={() => setViewMode('company')}>Company Compliance</button>
          {active === 'SEC'
            ? <><button className={viewMode === 'summary' ? 'active' : ''} onClick={() => setViewMode('summary')}>Summary</button><button className={viewMode === 'covered-loans' ? 'active' : ''} onClick={() => setViewMode('covered-loans')}>Covered Loans</button></>
            : <button className={viewMode === 'clients' ? 'active' : ''} onClick={() => setViewMode('clients')}>Client Reports</button>}
        </div>
      )}

      {viewMode === 'generator' ? <CICGenerator /> : (
        <div>
          {viewMode === 'summary' || viewMode === 'covered-loans' ? (
            <BirClientSummary data={birClientSummary} loading={loading} money={money} coveredOnly={viewMode === 'covered-loans'} />
          ) : viewMode === 'company' ? (
            <>
              <div className="gc-toolbar">
                <input className="form-control gc-filter" placeholder="Search" value={filters.search || ''} onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))} />
                <input className="form-control gc-filter" type="date" value={filters.startDate || ''} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value, page: 1 }))} />
                <input className="form-control gc-filter" type="date" value={filters.endDate || ''} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value, page: 1 }))} />
                <select className="form-control gc-filter" value={filters.status || ''} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
                  <option value="">All Status</option>
                  {config.statuses.map(status => <option key={status}>{status}</option>)}
                </select>
                <button className="btn btn-secondary" onClick={() => setFilters(emptyFilters)}>Clear</button>
              </div>
              <div className="table-wrapper gc-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>{config.columns.map(([key, label]) => <th key={key} onClick={() => sortBy(key)}>{label} {filters.sort === key ? (filters.dir === 'ASC' ? '^' : 'v') : ''}</th>)}<th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {loading ? <tr className="loading-row"><td colSpan={config.columns.length + 1}>Loading compliance records...</td></tr>
                      : rows.length === 0 ? <tr><td colSpan={config.columns.length + 1} className="empty-state">No compliance records found.</td></tr>
                      : rows.map(row => (
                        <tr key={row.id}>
                          {config.columns.map(([key]) => <td key={key}>{renderValue(row, key)}</td>)}
                          <td><div className="gc-actions">
                            {canEdit && <button className="btn btn-sm btn-secondary" onClick={() => openForm(row)}>Edit</button>}
                            {canCreate && <button className="btn btn-sm btn-secondary" onClick={() => setUploadTarget({ row, document_type: config.attachments[0], replace: false })}>Upload</button>}
                            {firstAttachment(row) && <a className="btn btn-sm btn-secondary" href={`${apiOrigin}${firstAttachment(row).file_url}`} target="_blank" rel="noreferrer">View</a>}
                            {firstAttachment(row) && <a className="btn btn-sm btn-secondary" href={`${apiOrigin}${firstAttachment(row).file_url}`} download>Download</a>}
                            {canCreate && firstAttachment(row) && <button className="btn btn-sm btn-secondary" onClick={() => setUploadTarget({ row, document_type: firstAttachment(row).document_type, replace: true })}>Replace</button>}
                            <button className="btn btn-sm btn-secondary" onClick={() => window.print()}>Print</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => openHistory(row)}>{active === 'SEC' ? 'Timeline' : 'History'}</button>
                            {canDelete && <button className="btn btn-sm btn-danger" onClick={() => archiveRow(row)}>Archive</button>}
                          </div></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="gc-pagination">
                <span>{total} record(s)</span>
                <button className="btn btn-sm btn-secondary" disabled={filters.page <= 1} onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}>Previous</button>
                <span>Page {filters.page} of {pageCount}</span>
                <button className="btn btn-sm btn-secondary" disabled={filters.page >= pageCount} onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}>Next</button>
              </div>
            </>
          ) : (
            <div className="table-wrapper gc-table-wrap" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Search</label><input className="form-control" placeholder="Client, collector, branch" value={clientFilters.search} onChange={e => setClientFilters(f => ({ ...f, search: e.target.value }))} style={{ minWidth: 200 }} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">From Date</label><input className="form-control" type="date" value={clientFilters.startDate || ''} onChange={e => setClientFilters(f => ({ ...f, startDate: e.target.value }))} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">To Date</label><input className="form-control" type="date" value={clientFilters.endDate || ''} onChange={e => setClientFilters(f => ({ ...f, endDate: e.target.value }))} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Loan Type</label><select className="form-control" value={clientFilters.loanType} onChange={e => setClientFilters(f => ({ ...f, loanType: e.target.value }))}><option value="">All Types</option>{clientLoanTypes.map(type => <option key={type}>{type}</option>)}</select></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Status</label><select className="form-control" value={clientFilters.status} onChange={e => setClientFilters(f => ({ ...f, status: e.target.value }))}><option value="">All Status</option>{clientStatuses.map(status => <option key={status}>{status}</option>)}</select></div>
                  <button className="btn btn-secondary" onClick={() => setClientFilters({ search: '', loanType: '', status: '', startDate: '', endDate: '' })}>Clear</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10, minWidth: 520 }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Records</div><div style={{ fontWeight: 800 }}>{clientTotals.count}</div></div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Principal</div><div style={{ fontWeight: 800 }}>{money(clientTotals.principal)}</div></div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>Interest</div><div style={{ fontWeight: 800 }}>{money(clientTotals.interest)}</div></div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 12px' }}><div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>Total Loan</div><div style={{ fontWeight: 800, color: '#166534' }}>{money(clientTotals.totalLoan)}</div></div>
                </div>
              </div>
              <table className="data-table">
                <thead><tr><th>Date Sent</th><th>Client Code</th><th>Client Name</th><th>Principal Loan</th><th>Interest</th><th>Total Loan</th><th>Type</th><th>Release Date</th><th>Collector</th><th>Branch</th><th>Status</th></tr></thead>
                <tbody>
                  {loading ? <tr className="loading-row"><td colSpan={11}>Loading client reports...</td></tr>
                    : filteredClientRows.length === 0 ? <tr><td colSpan={11} className="empty-state">No clients sent to {active} yet.</td></tr>
                    : filteredClientRows.map(row => (
                      <tr key={row.id}>
                        <td style={{ color: '#64748b' }}>{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</td>
                        <td style={{ fontWeight: 'bold', color: '#1d4ed8' }}>{row.customer_code}</td>
                        <td style={{ fontWeight: 'bold' }}>{row.customer_name}</td>
                        <td>{money(row.principal_loan ?? row.loan_amount)}</td>
                        <td>{money(row.interest_amount)}</td>
                        <td style={{ fontWeight: 800, color: '#166534' }}>{money(row.total_loan ?? row.loan_amount)}</td>
                        <td><span style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: '4px', fontSize: '12px' }}>{row.loan_type}</span></td>
                        <td>{row.release_date}</td>
                        <td>{row.collector_name || 'N/A'}</td>
                        <td>{row.branch_name || 'N/A'}</td>
                        <td><span className="gc-badge good">{row.status}</span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modal && modal !== 'history' && (
        <div className="modal-overlay"><div className="modal gc-modal"><div className="modal-header"><span className="modal-title">{form.id ? 'Edit' : 'Add'} {AGENCIES[active].label}</span><button className="modal-close" onClick={() => setModal(null)}>x</button></div>
          <form className="modal-body" onSubmit={saveForm}><div className="form-grid">
            {active === 'CIC' && <><div className="form-group"><label className="form-label">Submission Month</label><select className="form-control" value={form.submission_month || ''} onChange={e => setForm(f => ({ ...f, submission_month: e.target.value }))}><option value="">Select</option>{months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div><Field label="Reporting Period" name="reporting_period" form={form} setForm={setForm} /><Field label="Prepared By" name="prepared_by" form={form} setForm={setForm} /><Field label="Verified By" name="verified_by" form={form} setForm={setForm} /></>}
            {active === 'SEC' && <><Field label="Compliance Name" name="compliance_name" form={form} setForm={setForm} required /><SelectField label="Filing Type" name="filing_type" options={config.filingTypes} form={form} setForm={setForm} /><Field label="Assigned Personnel" name="assigned_personnel" form={form} setForm={setForm} /></>}
            {active === 'BIR' && <><SelectField label="Tax Type" name="tax_type" options={config.taxTypes} form={form} setForm={setForm} /><Field label="Filing Period" name="filing_period" form={form} setForm={setForm} /><Field label="Date Filed" name="date_filed" type="date" form={form} setForm={setForm} /><Field label="Date Paid" name="date_paid" type="date" form={form} setForm={setForm} /><Field label="OR Number" name="or_number" form={form} setForm={setForm} /><Field label="Amount" name="amount" type="number" form={form} setForm={setForm} /></>}
            <Field label="Due Date" name="due_date" type="date" form={form} setForm={setForm} required />
            {(active === 'CIC' || active === 'SEC') && <Field label="Date Submitted" name="date_submitted" type="date" form={form} setForm={setForm} />}
            <SelectField label="Status" name="status" options={config.statuses} form={form} setForm={setForm} required />
            <div className="form-group span-full"><label className="form-label">Remarks</label><textarea className="form-control" value={form.remarks || ''} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} /></div>
          </div><div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" type="submit">Save</button></div></form>
        </div></div>
      )}

      {uploadTarget && (
        <div className="modal-overlay"><div className="modal" style={{ maxWidth: 460 }}><div className="modal-header"><span className="modal-title">{uploadTarget.replace ? 'Replace' : 'Upload'} Document</span><button className="modal-close" onClick={() => setUploadTarget(null)}>x</button></div>
          <form className="modal-body" onSubmit={uploadFile}>
            <SelectField label="Document Type" name="document_type" options={config.attachments} form={uploadTarget} setForm={setUploadTarget} />
            <div className="form-group" style={{ marginTop: 12 }}><label className="form-label">File</label><input className="form-control" type="file" ref={fileRef} required /></div>
            <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setUploadTarget(null)}>Cancel</button><button className="btn btn-primary" type="submit">Upload</button></div>
          </form>
        </div></div>
      )}

      {modal === 'history' && (
        <div className="modal-overlay"><div className="modal gc-modal"><div className="modal-header"><span className="modal-title">Submission History</span><button className="modal-close" onClick={() => setModal(null)}>x</button></div>
          <div className="modal-body"><table className="data-table"><thead><tr><th>Date & Time</th><th>User</th><th>Action</th><th>Previous / New Value</th><th>IP Address</th></tr></thead><tbody>{history.map(h => <tr key={h.id}><td>{h.created_at}</td><td>{h.user_full_name || h.username}</td><td><span className="tag">{h.action}</span></td><td className="gc-history-detail">{h.details}</td><td>{h.ip_address || '-'}</td></tr>)}</tbody></table></div>
        </div></div>
      )}
    </div>
  );
}

function BirClientSummary({ data, loading, money, coveredOnly = false }) {
  const totals = data?.totals || EMPTY_BIR_CLIENT_SUMMARY.totals;
  const demographics = data?.demographics || EMPTY_BIR_CLIENT_SUMMARY.demographics;
  const financial = data?.financial || EMPTY_BIR_CLIENT_SUMMARY.financial;
  if (loading) return <div className="empty-state">Loading BIR client-report summary...</div>;
  return <section className="gc-summary" aria-label={coveredOnly ? 'Covered BIR client loans summary' : 'BIR client reports summary'}>
    <p className="gc-summary-note">{coveredOnly ? <>Totals below are calculated from <strong>For BIR → Client Reports</strong>, limited to loans of <strong>₱10,000 and below</strong>.</> : <>Totals below are calculated from the records in <strong>For BIR → Client Reports</strong>.</>}</p>
    <div className="gc-summary-metrics">
      <SummaryMetric label="Total Number of Loans" value={totals.loans} />
      <SummaryMetric label="Total Number of Clients" value={totals.clients} />
      <SummaryMetric label="Total Loan Amount" value={money(totals.loanAmount)} />
      <SummaryMetric label="Total Interest" value={money(totals.interest)} />
      <SummaryMetric label="Total Loan w/ Interest" value={money(totals.loanWithInterest)} />
    </div>
    <div className="gc-summary-columns">
      <div>
        <h3>Demographics</h3>
        <SummaryList title="Gender" items={demographics.gender} />
        <SummaryList title="Civil Status" items={demographics.civilStatus} />
      </div>
      <div>
        <h3>Status Background</h3>
        <SummaryList title="Educational Status" items={demographics.education} />
        <SummaryList title="Employment Status" items={demographics.employment} />
      </div>
    </div>
    <div className="gc-summary-columns gc-summary-financial">
      <div>
        <h3>Financial Breakdown</h3>
        <SummaryList title="Range of Loan" items={financial.loanRanges} />
        <SummaryList title="Monthly Income" items={financial.incomeRanges} />
      </div>
      <div>
        <h3>Interest Percentages</h3>
        {financial.interestBreakdown?.length ? (
          <div className="gc-interest-table">
            <div className="gc-interest-row gc-interest-heading"><span>Percentage</span><span>Total Clients</span><span>Total Amount</span></div>
            {financial.interestBreakdown.map(item => <div className="gc-interest-row" key={item.percentage}><strong>{item.percentage}</strong><span>{item.clients}</span><strong>{money(item.amount)}</strong></div>)}
          </div>
        ) : <div className="empty-state">No BIR client-report records available.</div>}
      </div>
    </div>
  </section>;
}

function SummaryMetric({ label, value }) {
  return <article className="gc-summary-metric"><span>{label}</span><strong>{value}</strong></article>;
}

function SummaryList({ title, items = [] }) {
  return <section className="gc-summary-list"><h4>{title}</h4>{items.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.count}</strong></div>)}</section>;
}

function Field({ label, name, form, setForm, type = 'text', required = false }) {
  return <div className="form-group"><label className="form-label">{label}{required ? ' *' : ''}</label><input className="form-control" type={type} value={form[name] || ''} required={required} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} /></div>;
}

function SelectField({ label, name, options, form, setForm, required = false }) {
  return <div className="form-group"><label className="form-label">{label}{required ? ' *' : ''}</label><select className="form-control" value={form[name] || ''} required={required} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}><option value="">Select</option>{options.map(o => <option key={o}>{o}</option>)}</select></div>;
}

function CICGenerator() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [fileReferenceNumber, setFileReferenceNumber] = useState('');
  const [submission, setSubmission] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('submission');
  const [loading, setLoading] = useState(false);
  const [previewFilter, setPreviewFilter] = useState('ID');
  const [candidateRows, setCandidateRows] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [legacyCicServer, setLegacyCicServer] = useState(false);
  const [candidateFilters, setCandidateFilters] = useState({ search: '', collector: '', branch: '' });
  const [candidateError, setCandidateError] = useState('');
  
  useEffect(() => {
    API.get('/branches').then(res => setBranches(res.data)).catch(console.error);
    loadHistory();
  }, []);

  const loadHistory = () => {
    API.get('/cic/history').then(res => setHistory(res.data)).catch(console.error);
  };

  const requestPayload = () => ({
    year,
    month,
    branch_id: branchId,
    file_reference_number: fileReferenceNumber,
  });

  const loadCandidates = async () => {
    setCandidatesLoading(true);
    try {
      const { data } = await API.get('/cic/candidates', { params: { year, month, branch_id: branchId } });
      const birClientReports = data.clients || [];
      setCandidateRows(birClientReports);
      setSubmission(null);
      setLegacyCicServer(false);
      setCandidateError('');
    } catch (err) {
      // Older deployed servers support CIC preview/generation but not the newer
      // client-selection endpoint. Keep that workflow usable instead of blocking
      // the entire generator with an error modal.
      if (err.response?.status === 404) {
        setLegacyCicServer(true);
        setCandidateRows([]);
        setSubmission(null);
        setCandidateError('');
        return;
      }
      setLegacyCicServer(false);
      setCandidateError(err.response?.data?.error || 'Could not load Client Reports assigned to you.');
      setCandidateRows([]);
    } finally {
      setCandidatesLoading(false);
    }
  };

  useEffect(() => { loadCandidates(); }, [year, month, branchId]);

  const candidateCollectors = useMemo(() => [...new Set(candidateRows.map(row => row.collector_name).filter(Boolean))].sort(), [candidateRows]);
  const candidateBranches = useMemo(() => [...new Set(candidateRows.map(row => row.branch_name).filter(Boolean))].sort(), [candidateRows]);
  const filteredCandidateRows = useMemo(() => {
    const search = candidateFilters.search.trim().toLowerCase();
    return candidateRows.filter(row => {
      const matchesSearch = !search || [row.customer_code, row.customer_name, row.loan_code].some(value => String(value || '').toLowerCase().includes(search));
      return matchesSearch
        && (!candidateFilters.collector || row.collector_name === candidateFilters.collector)
        && (!candidateFilters.branch || row.branch_name === candidateFilters.branch);
    });
  }, [candidateRows, candidateFilters]);

  const previewSubmission = async () => {
    setLoading(true);
    try {
      const { data } = await API.post('/cic/preview', requestPayload());
      setSubmission(data);
      setActiveTab('submission');
    } catch (err) {
      alert(err.response?.data?.error || 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = async () => {
    if (!submission || !hasValidRecords) return;
    setLoading(true);
    try {
      const { data } = await API.post('/cic/generate', requestPayload());
      const blob = new Blob([data.csv_data], { type: 'text/plain;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.file_name || submission.fileName || 'PF022370_CSDF.txt';
      a.click();
      window.URL.revokeObjectURL(url);
      loadHistory();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not generate CIC CSV.');
    } finally {
      setLoading(false);
    }
  };

  const hasValidRecords = submission && (submission.counts.totalIdRecords + submission.counts.totalCiRecords) > 0;

  return (
    <div className="cic-generator-container">
      <h3 style={{ marginTop: 0 }}>CIC Submission</h3>
      <div className="gc-toolbar" style={{ marginBottom: 14, alignItems: 'end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Reporting Year</label>
          <input className="form-control" type="number" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Reporting Month</label>
          <select className="form-control" value={month} onChange={e => setMonth(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => (<option key={i + 1} value={i + 1}>{new Date(2026, i, 1).toLocaleString('en-US', { month: 'long' })}</option>))}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Branch</label>
          <select className="form-control" value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">File Reference Number</label>
          <input className="form-control" value={fileReferenceNumber} onChange={e => setFileReferenceNumber(e.target.value)} placeholder="Optional reference" />
        </div>
        <button className="btn btn-secondary" onClick={previewSubmission} disabled={loading || candidatesLoading || (!legacyCicServer && candidateRows.length === 0)}>{loading ? 'Loading...' : 'Validate BIR clients'}</button>
        <button className="btn btn-success" onClick={downloadCsv} disabled={loading || !hasValidRecords}>Download CIC TXT</button>
      </div>
      <div style={{ marginTop: -10, marginBottom: 20, color: '#64748b', fontSize: 13 }}>
        CIC gets records only from the BIR Client Reports tab. The selected reporting month matches the BIR report Release Date; all matching BIR clients are then checked for the required client information.
      </div>

      {legacyCicServer ? (
        <div className="forty-five-info" style={{ marginBottom: 20 }}>
          Client selection is unavailable on this server version. Preview and download will include the BIR Client Reports whose Release Date is in the selected month and branch.
        </div>
      ) : <section className="table-wrapper" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <div><h4 style={{ margin: 0 }}>BIR Client Reports for CIC</h4><div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Every BIR Client Report assigned to your account, with a Release Date in the selected month, is validated using only the blue required fields in the CIC template.</div></div>
          <strong style={{ color: '#0f766e' }}>{candidateRows.length} BIR report{candidateRows.length === 1 ? '' : 's'} to validate</strong>
        </div>
        <div className="gc-toolbar" style={{ marginBottom: 14 }}>
          <input className="form-control gc-filter" placeholder="Search client or loan" value={candidateFilters.search} onChange={e => setCandidateFilters(filters => ({ ...filters, search: e.target.value }))} />
          <select className="form-control gc-filter" value={candidateFilters.collector} onChange={e => setCandidateFilters(filters => ({ ...filters, collector: e.target.value }))}><option value="">All Collectors</option>{candidateCollectors.map(collector => <option key={collector} value={collector}>{collector}</option>)}</select>
          <select className="form-control gc-filter" value={candidateFilters.branch} onChange={e => setCandidateFilters(filters => ({ ...filters, branch: e.target.value }))}><option value="">All Branches</option>{candidateBranches.map(branch => <option key={branch} value={branch}>{branch}</option>)}</select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Client Code</th><th>Client Name</th><th>Collector</th><th>Loan No.</th><th>Release Date</th><th>Due Date</th><th>Balance</th><th>CIC ID Validation</th></tr></thead>
            <tbody>{candidatesLoading ? <tr><td colSpan={8} className="empty-state">Loading BIR Client Reports assigned to you...</td></tr>
              : filteredCandidateRows.length === 0 ? <tr><td colSpan={8} className="empty-state">No BIR Client Reports have a Release Date in this reporting month.</td></tr>
                : filteredCandidateRows.map(row => <tr key={row.loan_id}>
                  <td>{row.customer_code}</td><td>{row.customer_name}</td><td>{row.collector_name || '-'}</td><td>{row.loan_code}</td><td>{row.date_released || '-'}</td><td>{row.date_maturity || '-'}</td><td>{Number(row.balance || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</td><td>{row.cic_eligibility}</td>
                </tr>)}</tbody>
          </table>
        </div>
      </section>}

      <div className="gc-tabs" style={{ borderBottom: '1px solid #ddd', marginBottom: 20 }}>
        <button className={activeTab === 'submission' ? 'active' : ''} onClick={() => setActiveTab('submission')}>CIC Submission</button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>Submission History</button>
      </div>

      {activeTab === 'submission' && (
        <div>
          {submission ? (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                <div className="gc-kpi blue"><span>Client Reports Available</span><strong>{submission.counts.availableClientReports}</strong></div>
                <div className="gc-kpi blue"><span>Clients Selected</span><strong>{submission.counts.selectedClients}</strong></div>
                <div className="gc-kpi green"><span>Valid CIC Clients / ID</span><strong>{submission.counts.validCicClients}</strong></div>
                <div className="gc-kpi green"><span>Valid CI Records</span><strong>{submission.counts.totalCiRecords}</strong></div>
                <div className="gc-kpi red"><span>Excluded — Incomplete ID</span><strong>{submission.counts.excludedClients}</strong></div>
                <div className="gc-kpi blue"><span>Total Exportable / FT</span><strong>{submission.counts.totalRecordsForFt}</strong></div>
              </div>

              {!hasValidRecords && (
                <div className="empty-state" style={{ marginBottom: 20 }}>No valid CIC records found for the selected reporting month.</div>
              )}

              <div className="table-wrapper" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ margin: 0 }}>Preview Records</h4>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <select className="form-control" value={previewFilter} onChange={e => setPreviewFilter(e.target.value)} style={{ width: 'auto' }}>
                      <option value="HD">HD Records</option>
                      <option value="ID">ID Records</option>
                      <option value="CI">CI Records</option>
                      <option value="FT">FT Records</option>
                    </select>
                  </div>
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  {submission.previewRecords.filter(r => r.recordType === previewFilter).length === 0 ? (
                    <div className="empty-state" style={{ margin: '20px', border: 'none' }}>
                      No {previewFilter} records to preview.
                    </div>
                  ) : (
                    <table className="data-table" style={{ minWidth: '100%' }}>
                      <thead>
                        <tr>
                          {CIC_HEADERS[previewFilter].map((h, i) => <th key={i} style={{ whiteSpace: 'nowrap' }}>{h.split('\n')[0]}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {submission.previewRecords.filter(r => r.recordType === previewFilter).slice(0, 100).map((record, idx) => (
                          <tr key={`${record.recordType}-${idx}`}>
                            {Array(CIC_HEADERS[previewFilter].length).fill('').map((_, valueIndex) => <td key={valueIndex} style={{ whiteSpace: 'nowrap' }}>{record.values[valueIndex] || '-'}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', textAlign: 'right' }}>
                  Showing up to 100 {previewFilter} records.
                </div>
              </div>

              <div className="table-wrapper">
                <h4 style={{ marginBottom: 10 }}>Validation Results</h4>
                <table className="data-table">
                  <thead><tr><th>Client Code</th><th>Client Name</th><th>Loan Number</th><th>Reason</th><th>Missing Fields</th><th>Status</th></tr></thead>
                  <tbody>
                    {submission.validationErrors.length === 0 ? (
                      <tr><td colSpan="6" className="empty-state">No validation exclusions.</td></tr>
                    ) : submission.validationErrors.map((err, idx) => (
                      <tr key={idx}>
                        <td>{err.clientCode || '-'}</td>
                        <td>{err.clientName || '-'}</td>
                        <td>{err.loanNumber || '-'}</td>
                        <td>{err.reason}</td>
                        <td style={{ color: '#b91c1c' }}>{err.missingFields.join(', ')}</td>
                        <td>{err.status || 'Excluded'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">Select a reporting month, enter the file reference number, then click Preview or Generate CIC CSV.</div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead><tr><th>Batch Number</th><th>Period</th><th>Records</th><th>Generated By</th><th>Date Generated</th></tr></thead>
            <tbody>
              {history.length === 0 ? <tr><td colSpan="5" className="empty-state">No submissions generated yet.</td></tr> :
                history.map(h => (
                <tr key={h.id}>
                  <td>{h.batch_number}</td>
                  <td>{h.year}-{String(h.month).padStart(2, '0')}</td>
                  <td>{h.total_records}</td>
                  <td>{h.generated_by}</td>
                  <td>{new Date(h.generated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {candidateError && (
        <div className="gc-error-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && setCandidateError('')}>
          <section className="gc-error-modal" role="alertdialog" aria-modal="true" aria-labelledby="cic-load-error-title" aria-describedby="cic-load-error-message">
            <div className="gc-error-modal-icon" aria-hidden="true">!</div>
            <div className="gc-error-modal-content">
              <span className="gc-error-modal-eyebrow">Unable to load</span>
              <h3 id="cic-load-error-title">Client Reports</h3>
              <p id="cic-load-error-message">{candidateError}</p>
            </div>
            <button className="gc-error-modal-close" type="button" onClick={() => setCandidateError('')} aria-label="Close error message">×</button>
            <div className="gc-error-modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setCandidateError('')}>Close</button>
              <button className="btn btn-primary" type="button" onClick={() => { setCandidateError(''); loadCandidates(); }}>Try again</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

