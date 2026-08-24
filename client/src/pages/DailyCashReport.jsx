import { useState, useEffect, useRef, useCallback } from 'react';
import API from '../services/api';
import dayjs from 'dayjs';

const DCR_LOAD_DEBOUNCE_MS = 300;

function isCompleteDcrDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = dayjs(value);
  return parsed.isValid() && parsed.format('YYYY-MM-DD') === value;
}

function getLoadErrorMessage(err) {
  if (err?.response) {
    const detail = err.response.data?.error || err.response.statusText || 'Request failed';
    return `${detail} (HTTP ${err.response.status})`;
  }
  return err?.message || 'Failed to load Daily Cash Report.';
}

export default function DailyCashReport() {
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [checklistRows, setChecklistRows] = useState([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [sendingTo, setSendingTo] = useState(null);
  const [ytdSaving, setYtdSaving] = useState(false);
  const [error, setError] = useState('');
  const [alertModal, setAlertModal] = useState(null);
  const loadRequestId = useRef(0);
  
  // Denominations - kept for closing the day, though hidden from print view
  const [, setDenom] = useState({
    count_1000: 0, count_500: 0, count_200: 0, count_100: 0,
    count_50: 0, count_20: 0, count_coins: 0
  });

  const [ytdReleases, setYtdReleases] = useState(0);
  const [ytdCollections, setYtdCollections] = useState(0);
  const [ytdExpenses, setYtdExpenses] = useState(0);
  const [isEditingYtd, setIsEditingYtd] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [remarksSaving, setRemarksSaving] = useState(false);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (!isCompleteDcrDate(date)) {
      setLoading(false);
      setError('');
      return;
    }
<<<<<<< HEAD
    if (dayjs(date).day() === 0) {
      setLoading(false);
=======
    return err?.message || 'Failed to load Daily Cash Report.';
  };

  const loadData = async (targetDate = date, targetBranchId = branchId) => {
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
>>>>>>> 0ed7b5612dc76d1a23e48f036e3577966e878ffe
      setData(null);
      setError('DCR date cannot be Sunday. Operations are Monday to Saturday only.');
      return;
    }
    const [yearStr] = targetDate.split('-');
    const year = parseInt(yearStr, 10);
    if (isNaN(year) || year < 1970 || year > 2100) {
      return;
    }
    const d = dayjs(targetDate);
    if (!d.isValid()) {
      return;
    }
    if (d.day() === 0) {
      setData(null);
      setError('DCR date cannot be Sunday. Operations are Monday to Saturday only.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await API.get('/dcr/summary', {
        params: { date: targetDate, ...(targetBranchId ? { branch_id: targetBranchId } : {}) }
      });
      if (requestId !== loadRequestId.current) return;
      setData(res.data);
      API.get('/branches')
        .then(bRes => setBranches(Array.isArray(bRes.data) ? bRes.data : []))
        .catch(err => console.warn('Unable to load DCR branch list', err));
      
      setYtdReleases(res.data.ytd_beg_releases_default ?? 0);
      setYtdCollections(res.data.ytd_beg_collections_default ?? 0);
      setYtdExpenses(res.data.ytd_beg_expenses_default ?? 0);
      setRemarks(res.data.remarks || '');

      if (res.data.dcr) {
        setDenom({
          count_1000: res.data.dcr.count_1000, count_500: res.data.dcr.count_500,
          count_200: res.data.dcr.count_200, count_100: res.data.dcr.count_100,
          count_50: res.data.dcr.count_50, count_20: res.data.dcr.count_20,
          count_coins: res.data.dcr.count_coins
        });
      } else {
        setDenom({ count_1000: 0, count_500: 0, count_200: 0, count_100: 0, count_50: 0, count_20: 0, count_coins: 0 });
      }
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      console.error(err);
      setData(null);
      setError(getLoadErrorMessage(err));
    } 
    finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => {
<<<<<<< HEAD
    loadRequestId.current += 1;
    if (!isCompleteDcrDate(date)) {
      setLoading(false);
      setError('');
      return undefined;
    }
    setLoading(true);
    const timeoutId = window.setTimeout(loadData, DCR_LOAD_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeoutId);
      loadRequestId.current += 1;
    };
  }, [date, branchId, loadData]);
=======
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return;
    }
    const [yearStr] = date.split('-');
    const year = parseInt(yearStr, 10);
    if (isNaN(year) || year < 1970 || year > 2100) {
      return;
    }
    const d = dayjs(date);
    if (!d.isValid()) {
      return;
    }
    if (d.day() === 0) {
      setData(null);
      setError('DCR date cannot be Sunday. Operations are Monday to Saturday only.');
      return;
    }

    setError('');
    const timer = setTimeout(() => {
      loadData(date, branchId);
    }, 400);

    return () => clearTimeout(timer);
  }, [date, branchId]);
>>>>>>> 0ed7b5612dc76d1a23e48f036e3577966e878ffe

  const fmt = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const releaseBalance = (release) => {
    const previousBalance = Number(release.previous_balance || 0);
    return previousBalance > 0 ? previousBalance : Number(release.old_balance_paid_today || 0);
  };

  // Group collections by collector for "4. COLLECTIONS"
  const collByCollector = (data?.collections || []).reduce((acc, c) => {
    const name = c.collector_name || 'Unassigned';
    acc[name] = (acc[name] || 0) + c.amount_paid;
    return acc;
  }, {});

  (data?.releases || []).forEach(r => {
    const name = r.collector_name || 'Unassigned';
    const releasePenalty = Number(r.penalty_payment_count || 0) > 0 ? 0 : Number(r.penalty || 0);
    const releasePassbook = Number(r.today_passbook ?? (r.passbook || 0));
    const releaseBalanceNotInCollections = Math.max(0, Number(r.previous_balance || 0) - Number(r.old_balance_paid_today || 0));
    const releaseCollections = releaseBalanceNotInCollections + releasePenalty + releasePassbook;
    if (releaseCollections > 0) {
      collByCollector[name] = (collByCollector[name] || 0) + releaseCollections;
    }
  });

  (data?.passbooks || []).forEach(p => {
    const name = p.description || 'Unassigned';
    collByCollector[name] = (collByCollector[name] || 0) + p.amount;
  });

  (data?.penalties || []).forEach(p => {
    const name = p.description || 'Unassigned';
    collByCollector[name] = (collByCollector[name] || 0) + p.amount;
  });

  (data?.collectorsOver || []).forEach(c => {
    const name = c.description || 'Unassigned';
    collByCollector[name] = (collByCollector[name] || 0) + c.amount;
  });

  (data?.otherTransactions || []).forEach(c => {
    const name = 'Office';
    collByCollector[name] = (collByCollector[name] || 0) + c.amount;
  });

  const bankCharges = data?.bankCharges || [];
  const interest = data?.interest || [];
  const withdrawal = data?.withdrawals || [];
  const deposit = data?.deposits || [];
  const adjustments = data?.adjustments || [];
  const collectorsOverList = data?.collectorsOver || [];
  const otherTransactionsList = data?.otherTransactions || [];
  const collectionBreakdown = data?.collection_breakdown || {};

  const handleExportExcel = () => {
    if (!data) return;
    // Basic CSV Export
    let csv = `DAILY CASH REPORT\nDate: ${date}\nDCR No: ${data.dcr ? data.dcr.dcr_number : `DCR-${dayjs(date).format('YYYYMMDD')}-0001`}\n\n`;
    
    // 1. LOAN RELEASES
    csv += `1. LOAN RELEASES\nNo.,Client Code,Customer,Collector,Type of Loan,Amount\n`;
    data.releases.forEach((r, i) => {
      csv += `${i + 1},${r.customer_code || ''},"${r.last_name}, ${r.first_name}",${r.collector_name || 'Unassigned'},${r.loan_type || 'NEW'},${(r.principal || 0).toFixed(2)}\n`;
    });
    csv += `TOTAL LOAN RELEASES,,,,,,${data.display_total_releases.toFixed(2)}\n\n`;

    // 2. EXPENSES
    csv += `2. EXPENSES\nParticulars,Amount\n`;
    data.expenses.forEach(e => {
      const particulars = e.description ? `${e.category} - ${e.description}` : e.category;
      csv += `"${particulars}",${(e.amount || 0).toFixed(2)}\n`;
    });
    csv += `TOTAL EXPENSES,,${data.total_expenses.toFixed(2)}\n\n`;

    // 4. COLLECTIONS
    csv += `4. COLLECTIONS\nCollector,Amount\n`;
    Object.entries(collByCollector).forEach(([name, amount]) => {
      csv += `"${name}",${amount.toFixed(2)}\n`;
    });
    csv += `Regular Collections,${Number(collectionBreakdown.regular || 0).toFixed(2)}\n`;
    csv += `Balance Collections,${Number(collectionBreakdown.balance || 0).toFixed(2)}\n`;
    csv += `Penalty Collections,${Number(collectionBreakdown.penalty || 0).toFixed(2)}\n`;
    csv += `Passbook Collections,${Number(collectionBreakdown.passbook || 0).toFixed(2)}\n`;
    csv += `Other Transactions,${Number(collectionBreakdown.other_transactions || 0).toFixed(2)}\n`;
    csv += `TOTAL COLLECTIONS,,${data.total_collections.toFixed(2)}\n\n`;

    // Summary
    csv += `CASH SUMMARY\n`;
    csv += `Beginning Cash,${data.beginning_cash.toFixed(2)}\n`;
    csv += `Total Collections,${data.total_collections.toFixed(2)}\n`;
    csv += `Reconstruct Amount,${Number(data.total_reconstruct_amount || 0).toFixed(2)}\n`;
    csv += `Total Loan Releases,-${data.cash_out_releases.toFixed(2)}\n`;
    csv += `Total Expenses,-${data.total_expenses.toFixed(2)}\n`;
    csv += `Total Deposits,-${data.total_deposits.toFixed(2)}\n`;
    csv += `EXPECTED ENDING CASH,${data.expected_ending_cash.toFixed(2)}\n`;
    if (remarks) csv += `\nNOTES / REMARKS\n"${remarks.replaceAll('"', '""')}"\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DCR_${dayjs(date).format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openChecklist = async () => {
    setChecklistOpen(true);
    setSelectedClients(new Set());
    setChecklistLoading(true);
    try {
      const res = await API.get('/dcr/loan-releases', { params: { date } });
      setChecklistRows(res.data.map(row => ({
        ...row,
        for_bir: Boolean(row.for_bir),
        for_cic: Boolean(row.for_cic),
        for_sec: Boolean(row.for_sec)
      })));
    } catch (err) {
      console.error('Unable to load BIR checklist', err);
    } finally {
      setChecklistLoading(false);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedClients(new Set(checklistRows.map(r => r.loan_id)));
    } else {
      setSelectedClients(new Set());
    }
  };

  const handleSelectClient = (loan_id) => {
    const next = new Set(selectedClients);
    if (next.has(loan_id)) next.delete(loan_id);
    else next.add(loan_id);
    setSelectedClients(next);
  };

  const handleSendTo = async (agency) => {
    if (selectedClients.size === 0) {
      setAlertModal({ type: 'warning', title: 'Action Required', message: 'Please select at least one client before sending.' });
      return;
    }
    setSendingTo(agency);
    try {
      const clientsToSend = checklistRows.filter(r => selectedClients.has(r.loan_id));
      await API.post('/government-compliance/send-clients', { agency, clients: clientsToSend });
      setAlertModal({ type: 'success', title: 'Success!', message: 'Selected loan release records have been successfully sent.' });
      setSelectedClients(new Set());
    } catch (err) {
      setAlertModal({ type: 'error', title: 'Error', message: err?.response?.data?.error || 'Failed to send clients' });
    } finally {
      setSendingTo(null);
    }
  };

  const handleSaveYtd = async () => {
    setYtdSaving(true);
    try {
      await API.post('/dcr/save-ytd', {
        date,
        branch_id: branchId,
        ytd_beg_releases: ytdReleases,
        ytd_beg_collections: ytdCollections,
        ytd_beg_expenses: ytdExpenses
      });
      setAlertModal({ type: 'success', title: 'Success!', message: 'YTD balances saved successfully.' });
      loadData();
    } catch (err) {
      setAlertModal({ type: 'error', title: 'Error', message: 'Failed to save YTD balances.' });
      console.error(err);
    } finally {
      setYtdSaving(false);
    }
  };

  const handleSaveRemarks = async () => {
    setRemarksSaving(true);
    try {
      await API.post('/dcr/remarks', { date, branch_id: branchId, remarks });
      setAlertModal({ type: 'success', title: 'Saved', message: 'DCR notes/remarks were saved successfully.' });
      loadData();
    } catch (err) {
      console.error(err);
      setAlertModal({ type: 'error', title: 'Unable to save', message: err?.response?.data?.error || 'Failed to save DCR notes/remarks.' });
    } finally {
      setRemarksSaving(false);
    }
  };

  return (
    <div className="dcr-container">
      <style>{`
        .dcr-container { max-width: 1200px; margin: 0 auto; background: #fff; padding: 20px; color: #000; font-family: 'Inter', sans-serif; }
        .dcr-header { display: grid; grid-template-columns: 1fr 2fr 1fr; align-items: center; margin-bottom: 20px; }
        .dcr-header h1 { font-size: 24px; color: #1e3a8a; margin: 0; font-weight: 800; }
        .dcr-header .title { text-align: center; font-size: 24px; font-weight: 800; color: #1e293b; margin: 0; }
        .dcr-header .date-subtitle { text-align: center; color: #64748b; font-size: 14px; font-weight: 600; margin-top: 5px; }
        .dcr-header .dcr-no { text-align: right; background: #f8fafc; padding: 10px 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
        
        .dcr-controls { display: flex; justify-content: space-between; margin-bottom: 20px; background: #fff; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; }
        .dcr-controls select, .dcr-controls input { border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 6px; outline: none; margin-right: 10px; }
        .dcr-actions button { padding: 6px 12px; border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; font-weight: 600; cursor: pointer; color: #1d4ed8; margin-left: 10px; display: inline-flex; alignItems: center; gap: 5px; }
        .dcr-actions button.btn-export { color: #ef4444; border-color: #fca5a5; }
        .dcr-actions button.btn-excel { color: #10b981; border-color: #6ee7b7; }
        .dcr-actions button.btn-checklist { color: #7c3aed; border-color: #c4b5fd; }
        .dcr-checklist-modal { max-width: 980px; }
        .dcr-checklist-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
        .dcr-checklist-toolbar input { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 9px 12px; }
        .dcr-checklist-table-wrap { max-height: 58vh; overflow: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
        .dcr-checklist-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .dcr-checklist-table th { position: sticky; top: 0; background: #f8fafc; z-index: 1; text-align: left; padding: 10px; border-bottom: 1px solid #e2e8f0; color: #334155; }
        .dcr-checklist-table td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
        .dcr-checklist-table label { display: inline-flex; align-items: center; justify-content: center; width: 100%; }
        .dcr-checklist-table input[type="checkbox"] { width: 18px; height: 18px; accent-color: #2563eb; }
        
        .dcr-summary-cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 15px; margin-bottom: 20px; }
        .dcr-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px 10px; display: flex; gap: 10px; align-items: center; }
        .dcr-card .icon { width: 40px; height: 40px; display: flex; justify-content: center; align-items: center; border-radius: 8px; font-size: 20px; }
        .dcr-card .details h4 { margin: 0; font-size: 10px; text-transform: uppercase; color: #1d4ed8; font-weight: 800; }
        .dcr-card .details .val { font-size: 18px; font-weight: 800; color: #0f172a; margin: 4px 0 2px 0; }
        .dcr-card .details .sub { font-size: 10px; color: #64748b; }

        .dcr-main-grid { display: grid; grid-template-columns: 2.5fr 1fr; gap: 20px; align-items: start; }
        
        .dcr-section { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 15px; }
        .dcr-section-title { font-size: 13px; font-weight: 800; color: #1d4ed8; padding: 10px 15px; border-bottom: 1px solid #e2e8f0; background: #fff; margin: 0; text-transform: uppercase; }
        
        table.dcr-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        table.dcr-table th { padding: 8px 10px; text-align: left; background: #fff; color: #0f172a; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
        table.dcr-table td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
        table.dcr-table tr:last-child td { border-bottom: none; }
        table.dcr-table .text-right { text-align: right; }
        
        .badge-type { padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; }
        .type-new { background: #dcfce7; color: #16a34a; }
        .type-reloan { background: #dbeafe; color: #2563eb; }
        .type-recon { background: #ffedd5; color: #ea580c; }
        
        .dcr-footer-row { font-weight: 800; font-size: 11px; color: #1d4ed8; text-transform: uppercase; }
        .dcr-footer-row td { padding: 10px; background: #f8fafc; border-top: 2px solid #e2e8f0; }
        
        .cash-summary-row { display: flex; justify-content: space-between; font-size: 11px; padding: 6px 15px; color: #0f172a; }
        .cash-summary-row.bold { font-weight: 800; font-size: 12px; }
        .cash-summary-row.total { background: #1e3a8a; color: #fff; padding: 15px; font-size: 13px; font-weight: 800; margin: 10px; border-radius: 6px; }

        .dcr-signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px; text-align: center; }
        .dcr-sign-box { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100px; }
        .dcr-sign-name { font-weight: 800; font-size: 12px; border-top: 1px solid #cbd5e1; padding-top: 5px; width: 200px; margin-top: 40px; color: #0f172a; }
        .dcr-sign-title { font-size: 11px; color: #64748b; }
        .dcr-sign-date { font-size: 10px; color: #94a3b8; margin-top: 5px; }

        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
          .page-toolbar, .sidebar, .navbar, .dcr-controls { display: none !important; }
          .dcr-container { padding: 0; width: 100%; max-width: 100%; margin: 0; }
        }
      `}</style>

      {/* HEADER */}
      <div className="dcr-header">
        <div>
          <h1>MELANN LENDING INVESTOR CORP.</h1>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 5 }}>Ormoc City</div>
        </div>
        <div>
          <h2 className="title">DAILY CASH REPORT</h2>
          <div className="date-subtitle">📅 {dayjs(date).isValid() ? dayjs(date).format('dddd, MMMM D, YYYY') : 'Select Date'}</div>
        </div>
        <div className="dcr-no">
          <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
            {data?.dcr ? data.dcr.dcr_number : (dayjs(date).isValid() ? `DCR-${dayjs(date).format('YYYYMMDD')}-0001` : 'DCR-00000000-0001')}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>Daily Cash Report No.</div>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="dcr-controls">
        <div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <select value={branchId} onChange={e => setBranchId(e.target.value)} disabled={loading}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
          </select>
        </div>
        <div className="dcr-actions">
          <button type="button" onClick={() => loadData(date, branchId)} disabled={loading}>🔄 Refresh</button>
          <button type="button" className="btn-export" onClick={() => window.print()} disabled={!data || loading}>📄 Export PDF</button>
          <button type="button" className="btn-excel" onClick={handleExportExcel} disabled={!data || loading}>📊 Export Excel</button>
          <button type="button" className="btn-checklist" onClick={openChecklist} disabled={!data || loading}>BIR Checklist</button>
          <button type="button" onClick={() => window.print()} disabled={!data || loading}>🖨️ Print</button>
        </div>
      </div>

      {error && (
        <div style={{ maxWidth: 900, margin: '20px auto', padding: '16px 20px', background: '#fff', border: '1px solid #fecaca', borderRadius: 10, color: '#7f1d1d' }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Daily Cash Report failed to load</div>
          <div style={{ fontSize: 13 }}>{error}</div>
          <button onClick={() => loadData(date, branchId)} disabled={loading} style={{ marginTop: 12, padding: '8px 14px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Loading...' : 'Retry'}
          </button>
        </div>
      )}

      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          Loading Daily Cash Report...
        </div>
      )}

      {!loading && !data && !error && (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          Please select a valid date (Monday to Saturday) to view the Daily Cash Report.
        </div>
      )}

      {!loading && data && (
        <>
          {/* SUMMARY CARDS */}
      <div className="dcr-summary-cards">
        <div className="dcr-card" style={{ borderColor: '#bfdbfe' }}>
          <div className="icon" style={{ background: '#eff6ff', color: '#2563eb' }}>💼</div>
          <div className="details">
            <h4>TOTAL COLLECTIONS</h4>
            <div className="val">₱{fmt(data.total_collections)}</div>
            <div className="sub">From {Object.keys(collByCollector).length} Collector(s)</div>
          </div>
        </div>
        <div className="dcr-card" style={{ borderColor: '#bbf7d0' }}>
          <div className="icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>💸</div>
          <div className="details">
            <h4 style={{ color: '#16a34a' }}>TOTAL LOAN RELEASES</h4>
            <div className="val">₱{fmt(data.display_total_releases)}</div>
            <div className="sub">{data.releases.length} Loan(s) | Recon ₱{fmt(data.total_reconstruct_amount || 0)}</div>
          </div>
        </div>
        <div className="dcr-card" style={{ borderColor: '#fed7aa' }}>
          <div className="icon" style={{ background: '#fff7ed', color: '#ea580c' }}>🧾</div>
          <div className="details">
            <h4 style={{ color: '#ea580c' }}>TOTAL EXPENSES</h4>
            <div className="val">₱{fmt(data.total_expenses)}</div>
            <div className="sub">{data.expenses.length} Transaction(s)</div>
          </div>
        </div>
        <div className="dcr-card" style={{ borderColor: '#e9d5ff' }}>
          <div className="icon" style={{ background: '#faf5ff', color: '#9333ea' }}>🏦</div>
          <div className="details">
            <h4 style={{ color: '#9333ea' }}>TOTAL CASH IN BANK</h4>
            <div className="val">₱{fmt(data.ending_cash_on_bank)}</div>
            <div className="sub">{(data.deposits?.length || 0) + (data.withdrawals?.length || 0)} Transaction(s)</div>
          </div>
        </div>
        <div className="dcr-card" style={{ borderColor: '#bbf7d0' }}>
          <div className="icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>💵</div>
          <div className="details">
            <h4 style={{ color: '#16a34a' }}>CASH ON HAND</h4>
            <div className="val">₱{fmt(data.expected_ending_cash)}</div>
            <div className="sub">As of End of Day</div>
          </div>
        </div>
        <div className="dcr-card" style={{ borderColor: '#bfdbfe' }}>
          <div className="icon" style={{ background: '#eff6ff', color: '#2563eb' }}>📊</div>
          <div className="details">
            <h4>TOTAL CASH POSITION</h4>
            <div className="val">₱{fmt(data.total_cash_position)}</div>
            <div className="sub">Cash on Hand & In Bank</div>
          </div>
        </div>
      </div>

      <div className="dcr-main-grid">
        {/* LEFT COLUMN */}
        <div>
          {/* 1. LOAN RELEASES */}
          <div className="dcr-section">
            <h3 className="dcr-section-title">1. LOAN RELEASES</h3>
            <table className="dcr-table">
              <thead>
                <tr>
                  <th>No.</th><th>Client Code</th><th>Customer</th><th>Collector</th>
                  <th style={{textAlign:'center'}}>Type of Loan</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Penalty</th>
                  <th className="text-right">Passbook</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  if (data.releases.length === 0) {
                    return <tr><td colSpan={12} style={{textAlign:'center', padding: 20}}>No loan releases.</td></tr>;
                  }

                  const sortedReleases = [...data.releases].sort((a, b) => {
                    const cA = a.collector_name || 'Unassigned';
                    const cB = b.collector_name || 'Unassigned';
                    return cA.localeCompare(cB);
                  });

                  return sortedReleases.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td>{r.customer_code || '-'}</td>
                      <td style={{fontWeight: 600}}>{r.last_name}, {r.first_name}</td>
                      <td>{r.collector_name || 'Unassigned'}</td>
                      <td style={{textAlign:'center'}}>
                        <span className={`badge-type type-${(r.loan_type || 'new').toLowerCase()}`}>{r.loan_type || 'NEW'}</span>
                      </td>
                      <td className="text-right">{fmt(r.principal)}</td>
                      <td className="text-right">{fmt(r.today_penalty || 0)}</td>
                      <td className="text-right">{fmt(r.today_passbook || 0)}</td>
                      <td className="text-right">{fmt(releaseBalance(r))}</td>
                    </tr>
                  ));
                })()}
                <tr className="dcr-footer-row">
                  <td colSpan={5}>TOTAL LOAN RELEASES</td>
                  <td className="text-right">₱{fmt(data.display_total_releases)}</td>
                  <td className="text-right">{fmt(data.releases.reduce((s, r) => s + Number(r.today_penalty || 0), 0))}</td>
                  <td className="text-right">{fmt(data.releases.reduce((s, r) => s + Number(r.today_passbook || 0), 0))}</td>
                  <td className="text-right">{fmt(data.releases.reduce((s, r) => s + releaseBalance(r), 0))}</td>
                </tr>
                <tr className="dcr-footer-row">
                  <td colSpan={5}>TOTAL RECONSTRUCT AMOUNT</td>
                  <td className="text-right">₱{fmt(data.total_reconstruct_amount || 0)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
            {/* 2. EXPENSES */}
            <div className="dcr-section">
              <h3 className="dcr-section-title" style={{color: '#ea580c'}}>2. EXPENSES</h3>
              <table className="dcr-table">
                <thead><tr><th>Particulars</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {data.expenses.map((e, i) => (
                    <tr key={i}><td>{e.category}{e.description ? <span style={{color: '#64748b', fontWeight: 'normal'}}> — {e.description}</span> : ''}</td><td className="text-right">{fmt(e.amount)}</td></tr>
                  ))}
                  {data.expenses.length === 0 && <tr><td colSpan={2} style={{textAlign:'center', padding:20, color:'#94a3b8'}}>No expenses recorded.</td></tr>}
                  <tr className="dcr-footer-row"><td style={{color: '#ea580c'}}>TOTAL EXPENSES</td><td className="text-right" style={{color: '#ea580c'}}>₱{fmt(data.total_expenses)}</td></tr>
                </tbody>
              </table>
            </div>
            
            {/* 3. ADJUSTMENTS */}
            {adjustments.length > 0 && (
              <div className="dcr-section">
                <h3 className="dcr-section-title" style={{color: '#ea580c'}}>ADJUSTMENTS</h3>
                <table className="dcr-table">
                  <thead><tr><th>Particulars</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    <tr className="dcr-footer-row"><td style={{color: '#ea580c'}}>TOTAL ADJUSTMENTS</td><td className="text-right" style={{color: '#ea580c'}}>₱0.00</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 5. WITHDRAWAL */}
            {withdrawal.length > 0 && (
              <div className="dcr-section">
                <h3 className="dcr-section-title" style={{color: '#9333ea'}}>WITHDRAWAL</h3>
                <table className="dcr-table">
                  <thead><tr><th>Particulars</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {withdrawal.map((w, i) => <tr key={i}><td>{w.reference_no}</td><td className="text-right">{fmt(w.amount)}</td></tr>)}
                    <tr className="dcr-footer-row"><td style={{color: '#9333ea'}}>TOTAL WITHDRAWAL</td><td className="text-right" style={{color: '#9333ea'}}>₱{fmt(data.total_withdrawals)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 6. DEPOSIT */}
            {deposit.length > 0 && (
              <div className="dcr-section">
                <h3 className="dcr-section-title" style={{color: '#1d4ed8'}}>DEPOSIT</h3>
                <table className="dcr-table">
                  <thead><tr><th>Particulars</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {deposit.map((d, i) => <tr key={i}><td>{d.reference_no}</td><td className="text-right">{fmt(d.amount)}</td></tr>)}
                    <tr className="dcr-footer-row"><td>TOTAL DEPOSIT</td><td className="text-right">₱{fmt(data.total_deposits)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 7. BANK CHARGES */}
            {bankCharges.length > 0 && (
              <div className="dcr-section">
                <h3 className="dcr-section-title" style={{color: '#ef4444'}}>BANK CHARGES</h3>
                <table className="dcr-table">
                  <thead><tr><th>Particulars</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {bankCharges.map((b, i) => <tr key={i}><td>{b.reference_no}</td><td className="text-right">{fmt(b.amount)}</td></tr>)}
                    <tr className="dcr-footer-row"><td style={{color:'#ef4444'}}>TOTAL BANK CHARGES</td><td className="text-right" style={{color:'#ef4444'}}>₱{fmt(data.total_bank_charges)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* 8. INTEREST */}
            {interest.length > 0 && (
              <div className="dcr-section">
                <h3 className="dcr-section-title" style={{color: '#16a34a'}}>INTEREST</h3>
                <table className="dcr-table">
                  <thead><tr><th>Particulars</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {interest.map((int, i) => <tr key={i}><td>{int.reference_no}</td><td className="text-right">{fmt(int.amount)}</td></tr>)}
                    <tr className="dcr-footer-row"><td style={{color:'#16a34a'}}>TOTAL INTEREST</td><td className="text-right" style={{color:'#16a34a'}}>₱{fmt(data.total_bank_interest)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* COLLECTORS OVER */}
            {collectorsOverList.length > 0 && (
              <div className="dcr-section">
                <h3 className="dcr-section-title" style={{color: '#f59e0b'}}>COLLECTORS OVER</h3>
                <table className="dcr-table">
                  <thead><tr><th>Particulars</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {collectorsOverList.map((c, i) => <tr key={i}><td>{c.description || 'Unassigned'}</td><td className="text-right">{fmt(c.amount)}</td></tr>)}
                    <tr className="dcr-footer-row"><td style={{color:'#f59e0b'}}>TOTAL COLLECTORS OVER</td><td className="text-right" style={{color:'#f59e0b'}}>₱{fmt(collectorsOverList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0))}</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* OTHER TRANSACTIONS */}
            {otherTransactionsList.length > 0 && (
              <div className="dcr-section">
                <h3 className="dcr-section-title" style={{color: '#0891b2'}}>OTHER TRANSACTIONS</h3>
                <table className="dcr-table">
                  <thead><tr><th>Particulars</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {otherTransactionsList.map((c, i) => <tr key={i}><td>{c.description || 'Unassigned'}</td><td className="text-right">{fmt(c.amount)}</td></tr>)}
                    <tr className="dcr-footer-row"><td style={{color:'#0891b2'}}>TOTAL OTHER TRANSACTIONS</td><td className="text-right" style={{color:'#0891b2'}}>₱{fmt(otherTransactionsList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0))}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* 4. COLLECTIONS */}
          <div className="dcr-section" style={{marginBottom: 15}}>
            <h3 className="dcr-section-title" style={{color: '#16a34a'}}>4. COLLECTIONS</h3>
            <table className="dcr-table">
              <thead><tr><th>Collector</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {Object.entries(collByCollector).map(([name, amount], i) => (
                  <tr key={i}><td>{name}</td><td className="text-right">{fmt(amount)}</td></tr>
                ))}
                {Object.keys(collByCollector).length === 0 && <tr><td colSpan={2} style={{textAlign:'center', padding:20, color:'#94a3b8'}}>No collections recorded.</td></tr>}
                <tr className="dcr-footer-row"><td style={{color: '#16a34a'}}>TOTAL COLLECTIONS</td><td className="text-right" style={{color: '#16a34a'}}>₱{fmt(data.total_collections)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* 9. CASH SUMMARY */}
          <div className="dcr-section">
            <h3 className="dcr-section-title">9. CASH SUMMARY</h3>
            <div style={{ padding: '10px 0' }}>
              <div style={{ padding: '0 15px', fontWeight: 800, color: '#1d4ed8', fontSize: 11, marginBottom: 5 }}>CASH IN BANK</div>
              <div className="cash-summary-row"><span>Beginning Bank Balance</span><span>₱{fmt(data.beginning_cash_on_bank)}</span></div>
              <div className="cash-summary-row"><span>Total Bank Charges</span><span>- ₱{fmt(data.total_bank_charges)}</span></div>
              <div className="cash-summary-row"><span>Total Deposit</span><span>+ ₱{fmt(data.total_deposits)}</span></div>
              <div className="cash-summary-row"><span>Total Interest</span><span>+ ₱{fmt(data.total_bank_interest)}</span></div>
              <div className="cash-summary-row"><span>Total Withdrawal</span><span>- ₱{fmt(data.total_withdrawals)}</span></div>
              <div className="cash-summary-row bold" style={{ color: '#1d4ed8', marginTop: 5, paddingBottom: 15 }}><span>TOTAL CASH IN BANK</span><span>₱{fmt(data.ending_cash_on_bank)}</span></div>
              
              <div style={{ borderTop: '1px solid #e2e8f0', margin: '0 15px' }}></div>
              
              <div style={{ padding: '15px 15px 5px 15px', fontWeight: 800, color: '#16a34a', fontSize: 11 }}>CASH ON HAND</div>
              <div className="cash-summary-row"><span>Beginning Cash on Hand</span><span>₱{fmt(data.beginning_cash)}</span></div>
              <div className="cash-summary-row"><span>Total Adjustments</span><span>₱{fmt(data.total_adjustments)}</span></div>
              <div className="cash-summary-row"><span>Total Withdrawals</span><span>₱{fmt(data.total_withdrawals)}</span></div>
              <div className="cash-summary-row"><span>Total Collections</span><span>₱{fmt(data.total_collections)}</span></div>
              <div className="cash-summary-row"><span style={{paddingLeft: 10}}>Balance Collections</span><span>₱{fmt(collectionBreakdown.balance || 0)}</span></div>
              <div className="cash-summary-row"><span style={{paddingLeft: 10}}>Penalty Collections</span><span>₱{fmt(collectionBreakdown.penalty || 0)}</span></div>
              <div className="cash-summary-row"><span style={{paddingLeft: 10}}>Other Transactions</span><span>₱{fmt(collectionBreakdown.other_transactions || 0)}</span></div>
              <div className="cash-summary-row"><span style={{paddingLeft: 10}}>Reconstruct Amount</span><span>₱{fmt(data.total_reconstruct_amount || 0)}</span></div>
              
              <div className="cash-summary-row bold" style={{ marginTop: 10 }}><span>CASH AVAILABLE</span><span>₱{fmt(data.beginning_cash + data.total_collections + data.total_adjustments + data.total_withdrawals)}</span></div>
              <div style={{ padding: '5px 15px', fontSize: 11, fontWeight: 800, color: '#0f172a' }}>LESS:</div>
              <div className="cash-summary-row"><span style={{paddingLeft: 10}}>Total Loan Releases (Cash out)</span><span>₱{fmt(data.cash_out_releases)}</span></div>
              <div className="cash-summary-row"><span style={{paddingLeft: 10}}>Total Expenses</span><span>₱{fmt(data.total_expenses)}</span></div>
              <div className="cash-summary-row"><span style={{paddingLeft: 10}}>Total Deposits</span><span>₱{fmt(data.total_deposits)}</span></div>
              <div className="cash-summary-row bold" style={{ marginTop: 10, color: '#ef4444' }}><span>CASH ON HAND (END OF DAY)</span><span>₱{fmt(data.expected_ending_cash)}</span></div>
              
              <div className="cash-summary-row total">
                <span>TOTAL CASH ON HAND & IN BANK</span>
                <span>₱{fmt(data.total_cash_position)}</span>
              </div>
            </div>
          </div>



          <div className="dcr-section" style={{ background: '#f8fafc', padding: 15 }}>
            <div style={{ fontWeight: 800, color: '#1d4ed8', fontSize: 11, marginBottom: 10 }}>NOTES</div>
            <ul style={{ margin: 0, paddingLeft: 15, fontSize: 10, color: '#334155', lineHeight: 1.6 }}>
              <li>All amounts are in Philippine Peso (PHP).</li>
              <li>This report is system-generated and does not require manual computation.</li>
              <li>Please review all figures before closing the day.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="dcr-section" style={{ marginTop: '20px' }}>
        <h3 className="dcr-section-title">10. YTD OVERALL TRANSACTIONS</h3>
        <div style={{ padding: '10px 15px' }}>
          <table className="dcr-table" style={{ marginTop: '10px' }}>
            <thead>
              <tr>
                <th>CATEGORY</th>
                <th className="text-right">BEGINNING BALANCE</th>
                <th className="text-right">TODAY</th>
                <th className="text-right">ENDING BALANCE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 700 }}>Total Releases</td>
                <td className="text-right">
                  {!isEditingYtd ? (
                    <span>₱{fmt(ytdReleases)}</span>
                  ) : (
                    <input type="number" value={ytdReleases} onChange={e => setYtdReleases(Number(e.target.value))} style={{ textAlign: 'right', width: '100px', border: '1px solid #cbd5e1', padding: '4px', borderRadius: '4px' }} />
                  )}
                </td>
                <td className="text-right">₱{fmt(data.display_total_releases)}</td>
                <td className="text-right bold" style={{ color: '#1d4ed8' }}>₱{fmt(Number(ytdReleases) + data.display_total_releases)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Total Collections</td>
                <td className="text-right">
                  {!isEditingYtd ? (
                    <span>₱{fmt(ytdCollections)}</span>
                  ) : (
                    <input type="number" value={ytdCollections} onChange={e => setYtdCollections(Number(e.target.value))} style={{ textAlign: 'right', width: '100px', border: '1px solid #cbd5e1', padding: '4px', borderRadius: '4px' }} />
                  )}
                </td>
                <td className="text-right">₱{fmt(data.total_collections)}</td>
                <td className="text-right bold" style={{ color: '#16a34a' }}>₱{fmt(Number(ytdCollections) + data.total_collections)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>Total Expenses</td>
                <td className="text-right">
                  {!isEditingYtd ? (
                    <span>₱{fmt(ytdExpenses)}</span>
                  ) : (
                    <input type="number" value={ytdExpenses} onChange={e => setYtdExpenses(Number(e.target.value))} style={{ textAlign: 'right', width: '100px', border: '1px solid #cbd5e1', padding: '4px', borderRadius: '4px' }} />
                  )}
                </td>
                <td className="text-right">₱{fmt(data.total_expenses)}</td>
                <td className="text-right bold" style={{ color: '#ef4444' }}>₱{fmt(Number(ytdExpenses) + data.total_expenses)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ marginTop: '15px', textAlign: 'right' }}>
            {!isEditingYtd ? (
              <button 
                type="button" 
                onClick={() => setIsEditingYtd(true)}
                style={{ padding: '8px 16px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                ✏️ Edit YTD Balances
              </button>
            ) : (
              <div style={{ display: 'inline-flex', gap: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsEditingYtd(false);
                    setYtdReleases(data.ytd_beg_releases_default || 0);
                    setYtdCollections(data.ytd_beg_collections_default || 0);
                    setYtdExpenses(data.ytd_beg_expenses_default || 0);
                  }}
                  disabled={ytdSaving}
                  style={{ padding: '8px 16px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={() => { handleSaveYtd(); setIsEditingYtd(false); }} 
                  disabled={ytdSaving}
                  style={{ padding: '8px 16px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: ytdSaving ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  {ytdSaving ? 'Saving...' : '💾 Save YTD Balances'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dcr-section" style={{ marginTop: '20px' }}>
        <h3 className="dcr-section-title">11. NOTES / REMARKS</h3>
        <div style={{ padding: '12px 15px' }}>
          <textarea
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Enter an explanation for any discrepancy or other DCR notes..."
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, font: 'inherit', fontSize: 13 }}
          />
          <div className="dcr-actions" style={{ marginTop: 10, textAlign: 'right' }}>
            <button type="button" onClick={handleSaveRemarks} disabled={remarksSaving}>
              {remarksSaving ? 'Saving...' : '💾 Save Notes / Remarks'}
            </button>
          </div>
        </div>
      </div>

      <div className="dcr-signatures">
        <div className="dcr-sign-box">
          <div className="dcr-sign-name">MARILYN O. RELOBA</div>
          <div className="dcr-sign-title">Branch Manager</div>
          <div className="dcr-sign-date">{dayjs(date).format('MMMM D, YYYY')} {dayjs().format('h:mm A')}</div>
        </div>
        <div className="dcr-sign-box">
          <div className="dcr-sign-name">VICTORIO L. RELOBA JR.</div>
          <div className="dcr-sign-title">Operations Manager</div>
          <div className="dcr-sign-date">{dayjs(date).format('MMMM D, YYYY')} {dayjs().format('h:mm A')}</div>
        </div>
        <div className="dcr-sign-box">
          <div className="dcr-sign-name">ANNA LIZA R. RODRIGUEZ</div>
          <div className="dcr-sign-title">Executive Vice-President</div>
          <div className="dcr-sign-date">{dayjs(date).format('MMMM D, YYYY')} {dayjs().format('h:mm A')}</div>
        </div>
      </div>
      </>
      )}

      {checklistOpen && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setChecklistOpen(false)}>
          <div className="modal dcr-checklist-modal">
            <div className="modal-header">
              <span className="modal-title">BIR / CIC / SEC Client Checklist</span>
              <button className="modal-close" onClick={() => setChecklistOpen(false)}>x</button>
            </div>
            <div className="modal-body">
              <div className="dcr-checklist-toolbar">
                <div style={{ flex: 1, color: '#64748b', fontSize: 13 }}>
                  Loan release clients for {dayjs(date).format('MMMM D, YYYY')}
                </div>
                <button className="btn btn-secondary" onClick={openChecklist} disabled={checklistLoading}>
                  {checklistLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              <div className="dcr-checklist-table-wrap">
                <table className="dcr-checklist-table">
                  <thead>
                    <tr>
                      <th style={{ padding: '12px', borderBottom: '1px solid #cbd5e1' }}>
                        <input type="checkbox" onChange={handleSelectAll} checked={checklistRows.length > 0 && selectedClients.size === checklistRows.length} />
                      </th>
                      <th style={{ padding: '12px', borderBottom: '1px solid #cbd5e1', fontSize: '12px', color: '#64748b' }}>CLIENT CODE</th>
                      <th style={{ padding: '12px', borderBottom: '1px solid #cbd5e1', fontSize: '12px', color: '#64748b' }}>CLIENT NAME</th>
                      <th style={{ padding: '12px', borderBottom: '1px solid #cbd5e1', fontSize: '12px', color: '#64748b' }}>LOAN AMOUNT</th>
                      <th style={{ padding: '12px', borderBottom: '1px solid #cbd5e1', fontSize: '12px', color: '#64748b' }}>TYPE</th>
                      <th style={{ padding: '12px', borderBottom: '1px solid #cbd5e1', fontSize: '12px', color: '#64748b' }}>RELEASE DATE</th>
                      <th style={{ padding: '12px', borderBottom: '1px solid #cbd5e1', fontSize: '12px', color: '#64748b' }}>COLLECTOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklistLoading ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>Loading clients...</td></tr>
                    ) : checklistRows.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>No loan releases found for this DCR date.</td></tr>
                    ) : checklistRows.map(row => (
                      <tr key={row.loan_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px' }}>
                          <input type="checkbox" checked={selectedClients.has(row.loan_id)} onChange={() => handleSelectClient(row.loan_id)} />
                        </td>
                        <td style={{ padding: '12px', color: '#334155', fontWeight: '600' }}>{row.customer_code}</td>
                        <td style={{ padding: '12px', color: '#0f172a', fontWeight: 'bold' }}>{row.customer_name}</td>
                        <td style={{ padding: '12px', color: '#0f172a', fontWeight: 'bold' }}>₱{Number(row.loan_amount).toLocaleString()}</td>
                        <td style={{ padding: '12px' }}><span style={{ padding: '4px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{row.loan_type}</span></td>
                        <td style={{ padding: '12px', color: '#475569' }}>{row.date_released}</td>
                        <td style={{ padding: '12px', color: '#475569' }}>{row.collector_name || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 'bold' }}>
                  {selectedClients.size} clients selected
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setChecklistOpen(false)} style={{ padding: '8px 16px', border: 'none', background: '#f1f5f9', color: '#334155', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                  <button onClick={() => handleSendTo('CIC')} disabled={sendingTo === 'CIC' || selectedClients.size === 0} style={{ padding: '8px 16px', border: 'none', background: '#0284c7', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {sendingTo === 'CIC' ? 'Sending...' : 'Send to CIC'}
                  </button>
                  <button onClick={() => handleSendTo('SEC')} disabled={sendingTo === 'SEC' || selectedClients.size === 0} style={{ padding: '8px 16px', border: 'none', background: '#16a34a', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {sendingTo === 'SEC' ? 'Sending...' : 'Send to SEC'}
                  </button>
                  <button onClick={() => handleSendTo('BIR')} disabled={sendingTo === 'BIR' || selectedClients.size === 0} style={{ padding: '8px 16px', border: 'none', background: '#ea580c', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {sendingTo === 'BIR' ? 'Sending...' : 'Send to BIR'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Modern Alert Popup Modal */}
      {alertModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '30px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
            <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: alertModal.type === 'success' ? '#dcfce7' : alertModal.type === 'error' ? '#fee2e2' : '#fef9c3', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto', fontSize: '32px' }}>
              {alertModal.type === 'success' ? '✅' : alertModal.type === 'error' ? '❌' : '⚠️'}
            </div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '22px', color: '#0f172a', fontWeight: '800' }}>{alertModal.title}</h3>
            <p style={{ margin: '0 0 28px 0', color: '#475569', fontSize: '15px', lineHeight: '1.5' }}>{alertModal.message}</p>
            <button onClick={() => setAlertModal(null)} style={{ background: '#0f172a', color: '#fff', border: 'none', padding: '14px 24px', borderRadius: '10px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', width: '100%', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              Got it
            </button>
          </div>
          <style>{`
            @keyframes popIn {
              from { opacity: 0; transform: scale(0.9) translateY(10px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}

    </div>
  );
}
