import { useEffect, useMemo, useRef, useState } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import './GovernmentCompliance.css';

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
    filters: ['tax_type', 'month', 'year', 'status'],
    statuses: ['Pending', 'Filed', 'Paid', 'Overdue'],
    taxTypes: ['Percentage Tax', 'Withholding Tax', 'Expanded Withholding Tax', 'Income Tax', 'Annual Registration Fee', 'Books of Accounts', 'ATP', 'Other BIR Requirements'],
    attachments: ['Tax Return', 'Official Receipt', 'Payment Confirmation', 'Supporting Documents'],
    columns: [
      ['tax_type', 'Tax Type'], ['filing_period', 'Filing Period'], ['due_date', 'Due Date'], ['date_filed', 'Date Filed'],
      ['date_paid', 'Date Paid'], ['or_number', 'OR Number'], ['amount', 'Amount'], ['status', 'Status'], ['remarks', 'Remarks']
    ]
  }
};

const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2026, i, 1).toLocaleString('en-US', { month: 'long' }) }));
const currentYear = new Date().getFullYear();
const emptyFilters = { search: '', month: '', year: currentYear, status: '', filing_type: '', tax_type: '', page: 1, limit: 10, sort: 'due_date', dir: 'ASC' };
const emptyForm = { due_date: '', status: '', amount: 0 };

function badgeClass(status) {
  const key = String(status || '').toLowerCase().replace(/\s+/g, '-');
  if (['accepted', 'approved', 'completed', 'paid', 'submitted', 'filed'].includes(key)) return 'gc-badge good';
  if (['rejected', 'returned', 'overdue', 'needs-correction'].includes(key)) return 'gc-badge bad';
  if (['for-review', 'ready-for-submission', 'ongoing'].includes(key)) return 'gc-badge warn';
  return 'gc-badge';
}

function canOpenModule(user) {
  return ['admin', 'compliance', 'compliance_officer', 'accounting', 'corporate_secretary', 'management', 'manager', 'it'].includes(user?.role);
}

function canSeeAgency(user, agency) {
  if (['admin', 'compliance', 'compliance_officer'].includes(user?.role)) return true;
  if (agency === 'BIR') return user?.role === 'accounting';
  if (agency === 'SEC') return ['corporate_secretary', 'management', 'manager'].includes(user?.role);
  return false;
}

function canWriteAgency(user, agency) {
  if (['admin', 'compliance', 'compliance_officer'].includes(user?.role)) return true;
  return agency === 'BIR' && user?.role === 'accounting';
}

function firstAttachment(row) {
  return row.attachments?.[0] || null;
}

export default function GovernmentCompliance() {
  const { user } = useAuth();
  const visibleAgencies = Object.keys(AGENCIES).filter(agency => canSeeAgency(user, agency));
  const [active, setActive] = useState(visibleAgencies[0] || 'CIC');
  const [rows, setRows] = useState([]);
  const [viewMode, setViewMode] = useState('clients');
  const [clientRows, setClientRows] = useState([]);
  const [summary, setSummary] = useState({ cards: {}, notifications: [] });
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [history, setHistory] = useState([]);
  const [uploadTarget, setUploadTarget] = useState(null);
  const fileRef = useRef(null);

  const config = AGENCIES[active];
  const canWrite = canWriteAgency(user, active);

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
      const { data } = await API.get(`/government-compliance/client-reports/${active}`);
      setClientRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSummary().catch(() => {}); }, []);
  useEffect(() => { if (viewMode === 'company') loadRows(); else loadClientRows(); }, [active, filters.page, filters.sort, filters.dir, viewMode]);

  const pageCount = Math.max(Math.ceil(total / filters.limit), 1);
  const kpis = useMemo(() => [
    ['Total CIC Compliance', summary.cards?.cic || 0, 'blue'],
    ['Total SEC Compliance', summary.cards?.sec || 0, 'green'],
    ['Total BIR Compliance', summary.cards?.bir || 0, 'yellow'],
    ['Due This Month', summary.cards?.dueThisMonth || 0, 'orange'],
    ['Overdue Compliance', summary.cards?.overdue || 0, 'red'],
    ['Completed Compliance', summary.cards?.completed || 0, 'check']
  ], [summary]);

  if (!canOpenModule(user)) return <div className="empty-state"><div className="empty-icon">Access</div><p>No Government Compliance access has been granted for this account.</p></div>;

  const resetForAgency = (agency) => {
    setActive(agency);
    setFilters({ ...emptyFilters, page: 1 });
  };

  const openForm = (row = null) => {
    setForm(row ? { ...row, status: row.status || config.statuses[0] } : { ...emptyForm, status: config.statuses[0] });
    setModal(row ? 'edit' : 'add');
  };

  const saveForm = async (e) => {
    e.preventDefault();
    if (form.id) await API.put(`/government-compliance/${active}/${form.id}`, form);
    else await API.post(`/government-compliance/${active}`, form);
    setModal(null);
    await Promise.all([loadRows(), loadSummary()]);
  };

  const archiveRow = async (row) => {
    await API.delete(`/government-compliance/${active}/${row.id}`);
    await Promise.all([loadRows(), loadSummary()]);
  };

  const uploadFile = async (e) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadTarget) return;
    const data = new FormData();
    data.append('file', file);
    data.append('document_type', uploadTarget.document_type);
    data.append('replace', uploadTarget.replace ? 'true' : 'false');
    await API.post(`/government-compliance/${active}/${uploadTarget.row.id}/attachments`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
    setUploadTarget(null);
    await Promise.all([loadRows(), loadSummary()]);
  };

  const sortBy = (key) => {
    setFilters(f => ({ ...f, sort: key, dir: f.sort === key && f.dir === 'ASC' ? 'DESC' : 'ASC', page: 1 }));
  };

  const exportCsv = () => {
    const headers = config.columns.map(([, label]) => label);
    const csvRows = rows.map(row => config.columns.map(([key]) => `"${String(renderValue(row, key, true) || '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[headers.join(','), ...csvRows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active}-government-compliance.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderValue = (row, key, plain = false) => {
    if (key === 'status') return plain ? row.status : <span className={badgeClass(row.status)}>{row.status}</span>;
    if (key === 'submission_month') return months.find(m => m.value === Number(row.submission_month))?.label || row.submission_month || '-';
    if (key === 'amount') return Number(row.amount || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
    if (key === 'file_uploaded') return row.attachments?.length ? `${row.attachments.length} file(s)` : 'None';
    if (key === 'uploaded_documents') return row.attachments?.length ? row.attachments.map(a => a.document_type).join(', ') : 'None';
    if (key === 'date_uploaded') return firstAttachment(row)?.uploaded_at?.slice(0, 10) || '-';
    return row[key] || '-';
  };

  const openHistory = async (row) => {
    const { data } = await API.get(`/government-compliance/${active}/${row.id}/history`);
    setHistory(data);
    setModal('history');
  };

  return (
    <div className="gc-page">
      <div className="gc-kpis">
        {kpis.map(([label, value, tone]) => <div key={label} className={`gc-kpi ${tone}`}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      <div className="gc-notifications">
        <div className="card-title">Government Compliance Notifications</div>
        <div className="gc-notification-list">
          {summary.notifications?.length ? summary.notifications.map(n => (
            <div className={`gc-note ${n.severity}`} key={n.id}><strong>{n.title}</strong><span>{n.message}</span></div>
          )) : <span className="text-muted">No due-date notifications.</span>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #e2e8f0', marginBottom: '20px' }}>
        <div className="gc-tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
          {visibleAgencies.map(agency => <button key={agency} className={active === agency ? 'active' : ''} onClick={() => resetForAgency(agency)}>{AGENCIES[agency].label}</button>)}
        </div>
      </div>

      <div className="card">
        {viewMode === 'company' ? (
          <>
        <div className="gc-toolbar">
          <div className="search-input-wrap"><span className="search-icon">Search</span><input className="form-control" placeholder="Search compliance records" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} onKeyDown={e => e.key === 'Enter' && loadRows()} /></div>
          {config.filters.includes('month') && <select className="form-control gc-filter" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: e.target.value, page: 1 }))}><option value="">All Months</option>{months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select>}
          {config.filters.includes('year') && <input className="form-control gc-filter" type="number" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: e.target.value, page: 1 }))} />}
          {config.filters.includes('status') && <select className="form-control gc-filter" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}><option value="">All Status</option>{config.statuses.map(s => <option key={s}>{s}</option>)}</select>}
          {config.filters.includes('filing_type') && <select className="form-control gc-filter" value={filters.filing_type} onChange={e => setFilters(f => ({ ...f, filing_type: e.target.value, page: 1 }))}><option value="">All Filing Types</option>{config.filingTypes.map(s => <option key={s}>{s}</option>)}</select>}
          {config.filters.includes('tax_type') && <select className="form-control gc-filter" value={filters.tax_type} onChange={e => setFilters(f => ({ ...f, tax_type: e.target.value, page: 1 }))}><option value="">All Tax Types</option>{config.taxTypes.map(s => <option key={s}>{s}</option>)}</select>}
          <button className="btn btn-secondary" onClick={loadRows}>Refresh</button>
          <button className="btn btn-secondary" onClick={exportCsv}>Export Excel</button>
          <button className="btn btn-secondary" onClick={() => window.print()}>Export PDF / Print</button>
          {canWrite && <button className="btn btn-primary" onClick={() => openForm()}>{active === 'SEC' ? 'Add Filing' : 'Add Record'}</button>}
        </div>

        <div className="table-wrapper gc-table-wrap" id="printable-area">
          <table className="data-table">
            <thead><tr>{config.columns.map(([key, label]) => <th key={key} onClick={() => sortBy(key)}>{label} {filters.sort === key ? (filters.dir === 'ASC' ? '^' : 'v') : ''}</th>)}<th>Actions</th></tr></thead>
            <tbody>
              {loading ? <tr className="loading-row"><td colSpan={config.columns.length + 1}>Loading compliance records...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={config.columns.length + 1} className="empty-state">No compliance records found.</td></tr>
                : rows.map(row => (
                  <tr key={row.id}>
                    {config.columns.map(([key]) => <td key={key}>{renderValue(row, key)}</td>)}
                    <td><div className="gc-actions">
                      {canWrite && <button className="btn btn-sm btn-secondary" onClick={() => openForm(row)}>Edit</button>}
                      {canWrite && <button className="btn btn-sm btn-secondary" onClick={() => setUploadTarget({ row, document_type: config.attachments[0], replace: false })}>Upload</button>}
                      {firstAttachment(row) && <a className="btn btn-sm btn-secondary" href={`http://localhost:5001${firstAttachment(row).file_url}`} target="_blank" rel="noreferrer">View</a>}
                      {firstAttachment(row) && <a className="btn btn-sm btn-secondary" href={`http://localhost:5001${firstAttachment(row).file_url}`} download>Download</a>}
                      {canWrite && firstAttachment(row) && <button className="btn btn-sm btn-secondary" onClick={() => setUploadTarget({ row, document_type: firstAttachment(row).document_type, replace: true })}>Replace</button>}
                      <button className="btn btn-sm btn-secondary" onClick={() => window.print()}>Print</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => openHistory(row)}>{active === 'SEC' ? 'Timeline' : 'History'}</button>
                      {canWrite && <button className="btn btn-sm btn-danger" onClick={() => archiveRow(row)}>Archive</button>}
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
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date Sent</th>
                  <th>Client Code</th>
                  <th>Client Name</th>
                  <th>Loan Amount</th>
                  <th>Type</th>
                  <th>Release Date</th>
                  <th>Collector</th>
                  <th>Branch</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr className="loading-row"><td colSpan={9}>Loading client reports...</td></tr>
                  : clientRows.length === 0 ? <tr><td colSpan={9} className="empty-state">No clients sent to {active} yet.</td></tr>
                  : clientRows.map(row => (
                    <tr key={row.id}>
                      <td style={{ color: '#64748b' }}>{new Date(row.created_at).toLocaleString()}</td>
                      <td style={{ fontWeight: 'bold', color: '#1d4ed8' }}>{row.customer_code}</td>
                      <td style={{ fontWeight: 'bold' }}>{row.customer_name}</td>
                      <td>₱{Number(row.loan_amount).toLocaleString()}</td>
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

function Field({ label, name, form, setForm, type = 'text', required = false }) {
  return <div className="form-group"><label className="form-label">{label}{required ? ' *' : ''}</label><input className="form-control" type={type} value={form[name] || ''} required={required} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} /></div>;
}

function SelectField({ label, name, options, form, setForm, required = false }) {
  return <div className="form-group"><label className="form-label">{label}{required ? ' *' : ''}</label><select className="form-control" value={form[name] || ''} required={required} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}><option value="">Select</option>{options.map(o => <option key={o}>{o}</option>)}</select></div>;
}
