import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import SoaModal from '../components/SoaModal';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Handshake,
  History,
  Layers,
  Loader2,
  Pencil,
  Phone,
  PlusCircle,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Trash2,
  User,
  UserCheck,
  Users,
  Wallet,
  X,
  XCircle
} from 'lucide-react';
import './PromiseToPayMonitoring.css';

function fmtAmt(val) {
  return Number(val || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function fmtDate(d) {
  if (!d) return '-';
  return dayjs(d).format('MMM DD, YYYY');
}

export default function PromiseToPayMonitoring() {
  const { hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('monitoring');

  // Common State
  const [collectors, setCollectors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // SOA Modal State
  const [soaModal, setSoaModal] = useState({ show: false, customerId: null, loanId: null });

  // -------------------------------------------------------------
  // TAB 1: SET PROMISE-TO-PAY STATE
  // -------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientDetailsLoading, setClientDetailsLoading] = useState(false);
  const [clientLoans, setClientLoans] = useState([]);
  const [clientPtpHistory, setClientPtpHistory] = useState([]);

  // Form Fields
  const [ptpForm, setPtpForm] = useState({
    loan_id: '',
    collector_id: '',
    promise_date: '',
    follow_up_date: '',
    recurring_schedule: 'One-time',
    recurring_days: [],
    payment_method: 'Field Collection',
    remarks: ''
  });
  const [savingPtp, setSavingPtp] = useState(false);
  const canCreatePtp = hasPermission('ptp-monitoring', 'create');
  const canUpdatePtp = hasPermission('ptp-monitoring', 'update');
  const canDeletePtp = hasPermission('ptp-monitoring', 'delete');

  // -------------------------------------------------------------
  // TAB 2: PTP MONITORING STATE
  // -------------------------------------------------------------
  const [monitoringRecords, setMonitoringRecords] = useState([]);
  const [monitoringSummary, setMonitoringSummary] = useState({
    total_records: 0,
    total_active_ptp: 0,
    total_promised_amount: 0,
    total_collected_amount: 0,
    due_today_count: 0,
    overdue_count: 0,
    pending_count: 0,
    fulfilled_count: 0,
    broken_count: 0
  });
  const [collectorTabs, setCollectorTabs] = useState([]);
  const [selectedCollectorTab, setSelectedCollectorTab] = useState('all'); // 'all' | collector_id | 'unassigned'
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSchedule, setFilterSchedule] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');



  // -------------------------------------------------------------
  // TAB 3: PTP UPDATE STATE
  // -------------------------------------------------------------
  const [dueRecords, setDueRecords] = useState([]);
  const [dueCounts, setDueCounts] = useState({ overdue: 0, due_today: 0, upcoming: 0, all_due: 0, total: 0 });
  const [dueFilter, setDueFilter] = useState('all_due'); // 'all_due' | 'overdue' | 'due_today' | 'upcoming_3days' | 'all_records'
  const [dueSearch, setDueSearch] = useState('');
  const [dueCollectorFilter, setDueCollectorFilter] = useState('all');

  // Quick Update Modal
  const [updateModal, setUpdateModal] = useState({
    show: false,
    record: null,
    status: 'Paid',
    paid_amount: '',
    payment_date: dayjs().format('YYYY-MM-DD'),
    new_promise_date: dayjs().add(3, 'day').format('YYYY-MM-DD'),
    new_follow_up_date: dayjs().add(2, 'day').format('YYYY-MM-DD'),
    recurring_schedule: 'One-time',
    remarks: '',
    saving: false
  });

  // Delete Confirmation Modal
  const [deleteModal, setDeleteModal] = useState({
    show: false,
    record: null,
    deleting: false
  });

  // Edit Modal State
  const [editModal, setEditModal] = useState({
    show: false,
    record: null,
    form: {
      promise_date: '',
      follow_up_date: '',
      recurring_schedule: 'One-time',
      payment_method: 'Field Collection',
      collector_id: '',
      remarks: '',
      status: 'Pending'
    },
    saving: false
  });

  // Feedback / Success Popup Modal
  const [successModal, setSuccessModal] = useState(null);

  // Client Quick View Details Modal
  const [quickClientModal, setQuickClientModal] = useState({ show: false, data: null, history: [] });

  // Load initial dropdowns
  useEffect(() => {
    API.get('/collectors')
      .then(res => setCollectors(res.data || []))
      .catch(err => console.error('Failed to load collectors', err));
    API.get('/branches')
      .then(res => setBranches(res.data || []))
      .catch(err => console.error('Failed to load branches', err));
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // -------------------------------------------------------------
  // DATA FETCHING FUNCTIONS
  // -------------------------------------------------------------
  const fetchMonitoringData = async () => {
    setLoading(true);
    try {
      const params = {
        collector_id: selectedCollectorTab,
        status: filterStatus,
        recurring_schedule: filterSchedule,
        search: filterSearch,
        date_from: filterDateFrom,
        date_to: filterDateTo
      };
      const res = await API.get('/ptp/monitoring', { params });
      setMonitoringRecords(res.data.records || []);
      setMonitoringSummary(res.data.summary || {});
      setCollectorTabs(res.data.collectorTabs || []);
    } catch (err) {
      console.error('Error fetching PTP monitoring data:', err);
      showToast(err.response?.data?.error || 'Failed to load monitoring data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchDueUpdates = async () => {
    setLoading(true);
    try {
      const params = {
        due_filter: dueFilter,
        collector_id: dueCollectorFilter,
        search: dueSearch
      };
      const res = await API.get('/ptp/due-updates', { params });
      setDueRecords(res.data.records || []);
      setDueCounts(res.data.counts || {});
    } catch (err) {
      console.error('Error fetching due PTP records:', err);
      showToast(err.response?.data?.error || 'Failed to load due records', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'monitoring') {
      fetchMonitoringData();
    } else if (activeTab === 'update') {
      fetchDueUpdates();
    }
  }, [
    activeTab,
    selectedCollectorTab,
    filterStatus,
    filterSchedule,
    filterDateFrom,
    filterDateTo,
    dueFilter,
    dueCollectorFilter
  ]);

  // Client search debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await API.get('/ptp/search-client', { params: { q: searchQuery } });
        setSearchResults(res.data || []);
      } catch (err) {
        console.error('Client search error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Select Client in Tab 1
  const handleSelectClient = async (client) => {
    setSelectedClient(client);
    setSearchResults([]);
    setClientDetailsLoading(true);

    try {
      const res = await API.get(`/ptp/client/${client.id}`);
      const fetchedLoans = res.data.loans || [];
      setClientLoans(fetchedLoans);
      setClientPtpHistory(res.data.history || []);

      // Auto-select active loan if available
      const activeLoan = fetchedLoans.find(l => ['active', 'pastdue', 'recon'].includes((l.status || '').toLowerCase()) && Number(l.balance || 0) > 0) || fetchedLoans[0];

      setPtpForm(prev => ({
        ...prev,
        loan_id: activeLoan ? activeLoan.id : '',
        collector_id: activeLoan?.collector_id || client.collector_id || '',
        promise_date: '',
        follow_up_date: '',
        recurring_schedule: 'One-time',
        recurring_days: [],
        remarks: ''
      }));
    } catch (err) {
      console.error('Error loading client details:', err);
      showToast('Could not load complete client details', 'error');
    } finally {
      setClientDetailsLoading(false);
    }
  };

  // Submit Set PTP Form
  const handleSubmitPtp = async (e) => {
    e.preventDefault();
    if (!canCreatePtp) {
      showToast('Input or Full Access is required to create a Promise-to-Pay record.', 'error');
      return;
    }
    if (!selectedClient) {
      showToast('Please search and select a client first.', 'error');
      return;
    }
    if (!ptpForm.promise_date && !ptpForm.follow_up_date && ptpForm.recurring_schedule === 'One-time') {
      showToast('Set a Promise-to-Pay Date, Follow-up Date, or Recurring Schedule.', 'error');
      return;
    }
    if (['Monthly', 'Weekly'].includes(ptpForm.recurring_schedule) && ptpForm.recurring_days.length === 0) {
      showToast(`Select at least one ${ptpForm.recurring_schedule === 'Monthly' ? 'day of the month' : 'day of the week'}.`, 'error');
      return;
    }

    setSavingPtp(true);
    try {
      const res = await API.post('/ptp', {
        customer_id: selectedClient.id,
        loan_id: ptpForm.loan_id || null,
        collector_id: ptpForm.collector_id || null,
        promise_date: ptpForm.promise_date || null,
        follow_up_date: ptpForm.follow_up_date || null,
        recurring_schedule: ptpForm.recurring_schedule,
        recurring_days: ptpForm.recurring_days,
        payment_method: ptpForm.payment_method,
        remarks: ptpForm.remarks
      });

      // Refresh client history
      const histRes = await API.get(`/ptp/client/${selectedClient.id}`);
      setClientPtpHistory(histRes.data.history || []);

      const assignedCollectorObj = collectors.find(c => String(c.id) === String(ptpForm.collector_id));
      const collectorName = assignedCollectorObj ? `${assignedCollectorObj.first_name} ${assignedCollectorObj.last_name}` : 'Unassigned';

      // Show Success Modal
      setSuccessModal({
        title: 'Promise-to-Pay Saved Successfully!',
        message: `Promise-to-Pay commitment for ${selectedClient.full_name} (${selectedClient.customer_code}) has been recorded.`,
        type: 'create',
        details: {
          clientCode: selectedClient.customer_code,
          clientName: selectedClient.full_name,
          promiseDate: ptpForm.promise_date,
          followUpDate: ptpForm.follow_up_date,
          schedule: ptpForm.recurring_schedule,
          paymentMethod: ptpForm.payment_method,
          collector: collectorName
        }
      });

      // Reset form fields slightly
      setPtpForm(prev => ({
        ...prev,
        promise_date: '',
        follow_up_date: '',
        recurring_schedule: 'One-time',
        recurring_days: [],
        remarks: ''
      }));
    } catch (err) {
      console.error('Save PTP error:', err);
      showToast(err.response?.data?.error || 'Failed to save Promise-to-Pay', 'error');
    } finally {
      setSavingPtp(false);
    }
  };

  const handleCancelPtp = () => {
    setSelectedClient(null);
    setClientLoans([]);
    setClientPtpHistory([]);
    setSearchQuery('');
    setPtpForm({
      loan_id: '', collector_id: '', promise_date: '', follow_up_date: '',
      recurring_schedule: 'One-time', recurring_days: [], payment_method: 'Field Collection', remarks: ''
    });
  };

  // Open Delete Confirmation Modal
  const handleOpenDeleteModal = (record) => {
    if (!canDeletePtp) {
      showToast('Full Access (CRUD) is required to delete a Promise-to-Pay record.', 'error');
      return;
    }
    setDeleteModal({
      show: true,
      record,
      deleting: false
    });
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!deleteModal.record) return;
    const clientName = deleteModal.record.customer_name || 'this client';
    setDeleteModal(prev => ({ ...prev, deleting: true }));
    try {
      await API.delete(`/ptp/${deleteModal.record.id}`);
      setDeleteModal({ show: false, record: null, deleting: false });
      if (activeTab === 'monitoring') fetchMonitoringData();
      else if (activeTab === 'update') fetchDueUpdates();

      setSuccessModal({
        title: 'Promise-to-Pay Deleted',
        message: `The Promise-to-Pay record for ${clientName} has been permanently deleted.`,
        type: 'delete'
      });
    } catch (err) {
      console.error('Delete PTP error:', err);
      showToast(err.response?.data?.error || 'Failed to delete Promise-to-Pay record.', 'error');
      setDeleteModal(prev => ({ ...prev, deleting: false }));
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (record) => {
    if (!canUpdatePtp) {
      showToast('Edit or Full Access is required to edit a Promise-to-Pay record.', 'error');
      return;
    }
    setEditModal({
      show: true,
      record,
      form: {
        promise_date: record.promise_date ? record.promise_date.slice(0, 10) : '',
        follow_up_date: record.follow_up_date ? record.follow_up_date.slice(0, 10) : '',
        recurring_schedule: record.recurring_schedule || 'One-time',
        payment_method: record.payment_method || 'Field Collection',
        collector_id: record.collector_id || '',
        remarks: record.remarks || '',
        status: record.status || 'Pending'
      },
      saving: false
    });
  };

  // Submit Edit Modal
  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    if (!editModal.record) return;
    if (!canUpdatePtp) {
      showToast('Edit or Full Access is required to edit a Promise-to-Pay record.', 'error');
      return;
    }

    setEditModal(prev => ({ ...prev, saving: true }));
    try {
      await API.put(`/ptp/${editModal.record.id}`, {
        promise_date: editModal.form.promise_date || null,
        follow_up_date: editModal.form.follow_up_date || null,
        recurring_schedule: editModal.form.recurring_schedule,
        payment_method: editModal.form.payment_method,
        collector_id: editModal.form.collector_id || null,
        remarks: editModal.form.remarks,
        status: editModal.form.status
      });

      const clientName = editModal.record.customer_name || 'Client';
      setEditModal(prev => ({ ...prev, show: false, saving: false }));
      if (activeTab === 'monitoring') fetchMonitoringData();
      else if (activeTab === 'update') fetchDueUpdates();

      setSuccessModal({
        title: 'Changes Saved Successfully!',
        message: `Promise-to-Pay details for ${clientName} have been updated.`,
        type: 'edit'
      });
    } catch (err) {
      console.error('Edit PTP error:', err);
      showToast(err.response?.data?.error || 'Failed to save changes.', 'error');
      setEditModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Open Quick Update Modal
  const handleOpenUpdateModal = (record) => {
    if (!canUpdatePtp) {
      showToast('Edit or Full Access is required to update a Promise-to-Pay record.', 'error');
      return;
    }
    const todayStr = dayjs().format('YYYY-MM-DD');
    setUpdateModal({
      show: true,
      record,
      status: 'Paid',
      paid_amount: record.promised_amount || record.loan_balance || '',
      payment_date: todayStr,
      new_promise_date: dayjs().add(3, 'day').format('YYYY-MM-DD'),
      new_follow_up_date: dayjs().add(2, 'day').format('YYYY-MM-DD'),
      recurring_schedule: record.recurring_schedule || 'One-time',
      remarks: '',
      saving: false
    });
  };

  // Submit Update Modal
  const handleSubmitUpdate = async (e) => {
    e.preventDefault();
    if (!updateModal.record) return;
    if (!canUpdatePtp) {
      showToast('Edit or Full Access is required to update a Promise-to-Pay record.', 'error');
      return;
    }

    setUpdateModal(prev => ({ ...prev, saving: true }));
    try {
      await API.put(`/ptp/${updateModal.record.id}/status`, {
        status: updateModal.status,
        paid_amount: updateModal.status === 'Paid' || updateModal.status === 'Partially Paid' ? Number(updateModal.paid_amount) : 0,
        payment_date: updateModal.payment_date,
        new_promise_date: updateModal.status === 'Rescheduled' ? updateModal.new_promise_date : null,
        new_follow_up_date: updateModal.status === 'Rescheduled' ? updateModal.new_follow_up_date : null,
        recurring_schedule: updateModal.recurring_schedule,
        remarks: updateModal.remarks
      });

      const clientName = updateModal.record.customer_name || 'Client';
      const statusLabel = updateModal.status;
      setUpdateModal(prev => ({ ...prev, show: false, saving: false }));

      if (activeTab === 'monitoring') fetchMonitoringData();
      else if (activeTab === 'update') fetchDueUpdates();

      setSuccessModal({
        title: 'Status Updated Successfully!',
        message: `Promise-to-Pay record for ${clientName} has been marked as "${statusLabel}".`,
        type: 'update'
      });
    } catch (err) {
      console.error('Update PTP error:', err);
      showToast(err.response?.data?.error || 'Failed to update status', 'error');
      setUpdateModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Open Quick Client View
  const handleOpenQuickClient = async (record) => {
    try {
      const res = await API.get(`/ptp/client/${record.customer_id}`);
      setQuickClientModal({
        show: true,
        data: res.data.customer,
        loans: res.data.loans || [],
        history: res.data.history || []
      });
    } catch (err) {
      showToast('Could not load client details', 'error');
    }
  };

  // Export / Print
  const handleExportCSV = () => {
    const rows = [
      ['Client Code', 'Client Name', 'Contact', 'Collector', 'Branch', 'Loan Code', 'Loan Balance', 'Promise Date', 'Follow-up Date', 'Schedule', 'Promised Amount', 'Status', 'Payment Method', 'Reason', 'Remarks']
    ];

    const dataSet = activeTab === 'update' ? dueRecords : monitoringRecords;
    dataSet.forEach(r => {
      rows.push([
        `"${r.customer_code || ''}"`,
        `"${r.customer_name || ''}"`,
        `"${r.contact || ''}"`,
        `"${r.collector_name || ''}"`,
        `"${r.branch_name || ''}"`,
        `"${r.loan_code || ''}"`,
        r.loan_balance || 0,
        r.promise_date || '',
        r.follow_up_date || '',
        `"${r.recurring_schedule || ''}"`,
        r.promised_amount || 0,
        `"${r.effective_status || r.status || ''}"`,
        `"${r.payment_method || ''}"`,
        `"${r.reason || ''}"`,
        `"${(r.remarks || '').replace(/"/g, '""')}"`
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PTP_Report_${dayjs().format('YYYYMMDD_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render Status Badge
  const renderStatusBadge = (status) => {
    const s = String(status || 'Pending').trim();
    if (s === 'Due Today') {
      return <span className="ptp-badge ptp-badge-due-today"><Clock size={12} /> Due Today</span>;
    }
    if (s === 'Overdue PTP' || s === 'Overdue') {
      return <span className="ptp-badge ptp-badge-overdue"><AlertTriangle size={12} /> Overdue PTP</span>;
    }
    if (s === 'Paid') {
      return <span className="ptp-badge ptp-badge-paid"><CheckCircle2 size={12} /> Kept / Paid</span>;
    }
    if (s === 'Partially Paid') {
      return <span className="ptp-badge ptp-badge-partial"><Banknote size={12} /> Partial Paid</span>;
    }
    if (s === 'Partial Paid Done') {
      return <span className="ptp-badge ptp-badge-partial"><Banknote size={12} /> Partial Paid Done</span>;
    }
    if (s === 'Fully Paid(Recon)' || s === 'Fully Paid(Reloan)' || s === 'Fully Paid') {
      return <span className="ptp-badge ptp-badge-paid"><CheckCircle2 size={12} /> {s}</span>;
    }
    if (s === 'Rescheduled') {
      return <span className="ptp-badge ptp-badge-rescheduled"><RotateCcw size={12} /> Rescheduled</span>;
    }
    if (s === 'Broken') {
      return <span className="ptp-badge ptp-badge-broken"><XCircle size={12} /> Broken Promise</span>;
    }
    if (s === 'Cancelled') {
      return <span className="ptp-badge ptp-badge-cancelled"><X size={12} /> Cancelled</span>;
    }
    return <span className="ptp-badge ptp-badge-pending"><CalendarClock size={12} /> Pending</span>;
  };

  return (
    <div className="ptp-container">
      {toast && (
        <div className={`ptp-toast ${toast.type === 'error' ? 'ptp-toast-error' : 'ptp-toast-success'}`}>
          {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* HEADER & MAIN TAB NAVIGATION */}
      <div className="ptp-header">
        <div className="ptp-header-title-block">
          <div className="ptp-title-badge">
            <Handshake size={24} className="ptp-title-icon" />
            <div>
              <h1 className="ptp-main-title">Promise-to-Pay Monitoring</h1>
              <p className="ptp-main-subtitle">
                Centralized monitoring, collector sheet tracking, and automated due management for client payment commitments
              </p>
            </div>
          </div>
        </div>

        {/* TOP TAB SWITCHER */}
        <div className="ptp-top-tabs">
          {canCreatePtp && (
            <button
              type="button"
              className={`ptp-top-tab-btn ${activeTab === 'set' ? 'active' : ''}`}
              onClick={() => setActiveTab('set')}
            >
              <CalendarPlus size={18} />
              <span>Set Promise-to-Pay</span>
            </button>
          )}

          <button
            type="button"
            className={`ptp-top-tab-btn ${activeTab === 'monitoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('monitoring')}
          >
            <FileSpreadsheet size={18} />
            <span>PTP Monitoring</span>
            {monitoringSummary.total_active_ptp > 0 && (
              <span className="ptp-tab-counter">{monitoringSummary.total_active_ptp}</span>
            )}
          </button>

          <button
            type="button"
            className={`ptp-top-tab-btn ${activeTab === 'update' ? 'active' : ''}`}
            onClick={() => setActiveTab('update')}
          >
            <CalendarCheck size={18} />
            <span>PTP Update</span>
            {dueCounts.all_due > 0 && (
              <span className="ptp-tab-counter ptp-tab-counter-alert">{dueCounts.all_due}</span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SET PROMISE-TO-PAY */}
      {/* ========================================================================= */}
      {activeTab === 'set' && (
        <div className="ptp-tab-content fade-in">
          <div className="ptp-set-grid">
            {/* Left Column: Client Search & PTP Entry Form */}
            <div className="ptp-set-left">
              {/* Client Search Card */}
              <div className="ptp-card">
                <div className="ptp-card-header">
                  <div className="ptp-card-header-title">
                    <Search size={18} className="text-blue-500" />
                    <span>Search Client</span>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">Step 1: Locate Borrower</span>
                </div>
                <div className="ptp-card-body">
                  <div className="ptp-search-wrapper">
                    <Search size={18} className="ptp-search-icon" />
                    <input
                      type="text"
                      className="ptp-search-input"
                      placeholder="Type Client Code (e.g. CUST-0001) or Client Name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                    {searchLoading && <Loader2 size={18} className="animate-spin text-blue-500 mr-2" />}
                    {searchQuery && (
                      <button
                        type="button"
                        className="ptp-search-clear"
                        onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Search Results Dropdown */}
                  {searchResults.length > 0 && (
                    <div className="ptp-search-dropdown">
                      {searchResults.map((cust) => (
                        <div
                          key={cust.id}
                          className="ptp-search-result-item"
                          onClick={() => handleSelectClient(cust)}
                        >
                          <div className="ptp-result-main">
                            <span className="ptp-result-code">{cust.customer_code}</span>
                            <span className="ptp-result-name">{cust.full_name}</span>
                            <span className={`ptp-client-status-pill status-${(cust.customer_status || 'active').toLowerCase()}`}>
                              {cust.customer_status || 'Active'}
                            </span>
                          </div>
                          <div className="ptp-result-sub">
                            <span>📞 {cust.contact || 'No contact'}</span>
                            <span>👤 Collector: {cust.collector_name || 'Unassigned'}</span>
                            <span>💰 Active Loans: {cust.loans?.length || 0} (₱{fmtAmt(cust.total_balance)})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Selected Client Summary Card */}
                  {selectedClient && (
                    <div className="ptp-selected-client-banner">
                      <div className="ptp-selected-client-info">
                        <div className="ptp-avatar-circle">
                          <User size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="ptp-selected-name">{selectedClient.full_name}</h3>
                            <span className="ptp-client-code-tag">{selectedClient.customer_code}</span>
                          </div>
                          <p className="ptp-selected-meta">
                            <span>📍 {selectedClient.address || selectedClient.business_address || 'No Address'}</span>
                            <span>•</span>
                            <span>📞 {selectedClient.contact || 'No contact'}</span>
                            <span>•</span>
                            <span>👤 {selectedClient.collector_name || 'Unassigned Collector'}</span>
                            <span>•</span>
                            <span>🏢 {selectedClient.branch_name || 'Main Branch'}</span>
                          </p>
                        </div>
                      </div>
                      <div className="ptp-selected-actions">
                        <button
                          type="button"
                          className="ptp-btn-secondary"
                          onClick={() => setSoaModal({ show: true, customerId: selectedClient.id })}
                        >
                          <FileText size={14} /> View SOA
                        </button>
                        <button
                          type="button"
                          className="ptp-btn-text"
                          onClick={() => { setSelectedClient(null); setClientLoans([]); setClientPtpHistory([]); }}
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Set PTP Form Card */}
              {selectedClient ? (
                <form onSubmit={handleSubmitPtp} className="ptp-card ptp-form-card">
                  <div className="ptp-card-header">
                    <div className="ptp-card-header-title">
                      <CalendarPlus size={18} className="text-blue-600" />
                      <span>Set Promise-to-Pay Details</span>
                    </div>
                    <span className="text-xs text-gray-500 font-medium">Step 2: Commit Schedule</span>
                  </div>

                  <div className="ptp-card-body">
                    {/* Loan Selection if multiple */}
                    {clientLoans.length > 0 && (
                      <div className="ptp-form-group">
                        <label className="ptp-label">Associated Active Loan</label>
                        <select
                          className="ptp-input"
                          value={ptpForm.loan_id}
                          onChange={(e) => {
                            const lId = e.target.value;
                            const found = clientLoans.find(l => String(l.id) === String(lId));
                            setPtpForm(prev => ({
                              ...prev,
                              loan_id: lId,
                              collector_id: found?.collector_id || prev.collector_id
                            }));
                          }}
                        >
                          {clientLoans.map(ln => (
                            <option key={ln.id} value={ln.id}>
                              {ln.loan_code} - Bal: ₱{fmtAmt(ln.balance)} | Amort: ₱{fmtAmt(ln.amortization)} | Mat: {fmtDate(ln.date_maturity)} ({ln.status})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <p className="ptp-schedule-intro">Set one or more schedule details as applicable. All three fields are optional individually.</p>

                    <div className="ptp-form-row">
                      {/* Promise-to-Pay Date */}
                      <div className="ptp-form-group">
                        <label className="ptp-label">
                          <Calendar size={14} /> Promise-to-Pay Date
                        </label>
                        <input
                          type="date"
                          className="ptp-input ptp-input-highlight"
                          value={ptpForm.promise_date}
                          onChange={(e) => setPtpForm({ ...ptpForm, promise_date: e.target.value })}
                        />
                        <span className="ptp-field-hint">Target date client promised to make payment</span>
                      </div>

                      {/* Follow-up Date */}
                      <div className="ptp-form-group">
                        <label className="ptp-label">
                          <CalendarClock size={14} /> Follow-up Date
                        </label>
                        <input
                          type="date"
                          className="ptp-input"
                          value={ptpForm.follow_up_date}
                          onChange={(e) => setPtpForm({ ...ptpForm, follow_up_date: e.target.value })}
                        />
                        <span className="ptp-field-hint">Reminder date for collector to call or visit</span>
                      </div>
                    </div>

                    <div className="ptp-recurring-card">
                      <div className="ptp-recurring-header">
                        <div>
                          <label className="ptp-label"><Layers size={14} /> Recurring Schedule</label>
                          <span className="ptp-field-hint">Use this only when the client has a repeating payment schedule.</span>
                        </div>
                        <button
                          type="button"
                          className={`ptp-switch ${ptpForm.recurring_schedule !== 'One-time' ? 'is-on' : ''}`}
                          role="switch"
                          aria-checked={ptpForm.recurring_schedule !== 'One-time'}
                          onClick={() => setPtpForm(prev => ({
                            ...prev,
                            recurring_schedule: prev.recurring_schedule === 'One-time' ? 'Monthly' : 'One-time',
                            recurring_days: []
                          }))}
                        ><span /></button>
                      </div>

                      {ptpForm.recurring_schedule !== 'One-time' && (
                        <>
                          <div className="ptp-recurring-tabs" role="tablist" aria-label="Recurring schedule type">
                            {['Monthly', 'Weekly', 'Daily'].map(type => (
                              <button
                                type="button"
                                key={type}
                                className={ptpForm.recurring_schedule === type ? 'active' : ''}
                                onClick={() => setPtpForm(prev => ({ ...prev, recurring_schedule: type, recurring_days: [] }))}
                              >{type === 'Daily' ? 'Everyday' : type}</button>
                            ))}
                          </div>

                          {ptpForm.recurring_schedule === 'Monthly' && (
                            <div className="ptp-day-picker">
                              <span>Select day(s) of the month</span>
                              <div className="ptp-day-grid">
                                {Array.from({ length: 31 }, (_, index) => index + 1).map(day => (
                                  <button
                                    type="button"
                                    key={day}
                                    className={ptpForm.recurring_days.includes(day) ? 'selected' : ''}
                                    onClick={() => setPtpForm(prev => ({
                                      ...prev,
                                      recurring_days: prev.recurring_days.includes(day)
                                        ? prev.recurring_days.filter(value => value !== day)
                                        : [...prev.recurring_days, day]
                                    }))}
                                  >{day}</button>
                                ))}
                              </div>
                            </div>
                          )}

                          {ptpForm.recurring_schedule === 'Weekly' && (
                            <div className="ptp-day-picker">
                              <span>Select day(s) of the week</span>
                              <div className="ptp-week-grid">
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                  <button
                                    type="button"
                                    key={day}
                                    className={ptpForm.recurring_days.includes(day) ? 'selected' : ''}
                                    onClick={() => setPtpForm(prev => ({
                                      ...prev,
                                      recurring_days: prev.recurring_days.includes(day)
                                        ? prev.recurring_days.filter(value => value !== day)
                                        : [...prev.recurring_days, day]
                                    }))}
                                  >{day}</button>
                                ))}
                              </div>
                            </div>
                          )}
                          {ptpForm.recurring_schedule === 'Daily' && <p className="ptp-recurring-everyday">Payment is expected every day.</p>}
                        </>
                      )}
                    </div>

                    <div className="ptp-form-row">
                      {/* Payment Method */}
                      <div className="ptp-form-group">
                        <label className="ptp-label">Payment Channel</label>
                        <select
                          className="ptp-input"
                          value={ptpForm.payment_method}
                          onChange={(e) => setPtpForm({ ...ptpForm, payment_method: e.target.value })}
                        >
                          <option value="Field Collection">Field Collection (Collector Visit)</option>
                          <option value="Office Payment">Office / Branch Payment</option>
                          <option value="GCash / E-Wallet">GCash / Maya / E-Wallet</option>
                          <option value="Bank Transfer">Bank Transfer / Deposit</option>
                          <option value="PDC / Cheque">PDC / Post Dated Cheque</option>
                        </select>
                      </div>

                    </div>

                    {/* Assigned Collector */}
                    <div className="ptp-form-row ptp-form-row-single">
                      <div className="ptp-form-group">
                        <label className="ptp-label">Assigned Collector</label>
                        <select
                          className="ptp-input"
                          value={ptpForm.collector_id}
                          onChange={(e) => setPtpForm({ ...ptpForm, collector_id: e.target.value })}
                        >
                          <option value="">-- Unassigned Collector --</option>
                          {collectors.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.first_name} {c.last_name} ({c.collector_code})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Remarks */}
                    <div className="ptp-form-group">
                      <label className="ptp-label">Collector Remarks & Notes</label>
                      <textarea
                        className="ptp-textarea"
                        rows="3"
                        placeholder="Add specific notes, agreed contact time, or borrower situation..."
                        value={ptpForm.remarks}
                        onChange={(e) => setPtpForm({ ...ptpForm, remarks: e.target.value })}
                      ></textarea>
                    </div>

                    <div className="ptp-form-actions">
                      <button
                        type="submit"
                        className="ptp-btn-primary ptp-btn-lg"
                        disabled={savingPtp}
                      >
                        {savingPtp ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        <span>Save Promise-to-Pay Commitment</span>
                      </button>
                      <button type="button" className="ptp-btn-cancel" onClick={handleCancelPtp} disabled={savingPtp}>
                        <X size={18} /> <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="ptp-card ptp-empty-placeholder">
                  <Search size={40} className="text-gray-300 mb-2" />
                  <h4>No Client Selected</h4>
                  <p>Search a client above by Client Code or Name to set a Promise to Pay.</p>
                </div>
              )}
            </div>

            {/* Right Column: Client Loan Overview & PTP History */}
            <div className="ptp-set-right">
              {selectedClient ? (
                <>
                  {/* Loans Overview Box */}
                  <div className="ptp-card">
                    <div className="ptp-card-header">
                      <div className="ptp-card-header-title">
                        <Wallet size={18} className="text-indigo-600" />
                        <span>Active Loans & Balance</span>
                      </div>
                      <span className="ptp-badge-counter">{clientLoans.length} Loans</span>
                    </div>
                    <div className="ptp-card-body p-0">
                      {clientLoans.length === 0 ? (
                        <p className="p-4 text-gray-500 text-sm">No active loans found for this client.</p>
                      ) : (
                        <div className="ptp-loan-list">
                          {clientLoans.map(loan => (
                            <div key={loan.id} className="ptp-loan-card">
                              <div className="ptp-loan-card-top">
                                <span className="ptp-loan-code">{loan.loan_code}</span>
                                <span className={`ptp-client-status-pill status-${(loan.status || 'active').toLowerCase()}`}>
                                  {loan.status}
                                </span>
                              </div>
                              <div className="ptp-loan-grid">
                                <div>
                                  <span className="text-xs text-gray-400">Balance</span>
                                  <p className="font-semibold text-red-600">₱{fmtAmt(loan.balance)}</p>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-400">Amortization</span>
                                  <p className="font-medium text-gray-800">₱{fmtAmt(loan.amortization)}</p>
                                </div>
                                <div>
                                  <span className="text-xs text-gray-400">Maturity Date</span>
                                  <p className="text-xs font-medium text-gray-700">{fmtDate(loan.date_maturity)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Previous PTP Commitments History */}
                  <div className="ptp-card mt-4">
                    <div className="ptp-card-header">
                      <div className="ptp-card-header-title">
                        <History size={18} className="text-teal-600" />
                        <span>Client PTP History</span>
                      </div>
                      <span className="ptp-badge-counter">{clientPtpHistory.length} Past PTP</span>
                    </div>
                    <div className="ptp-card-body p-0">
                      {clientPtpHistory.length === 0 ? (
                        <p className="p-4 text-gray-500 text-sm">No past Promise to Pay records for this client.</p>
                      ) : (
                        <div className="ptp-history-timeline">
                          {clientPtpHistory.map((item) => (
                            <div key={item.id} className="ptp-timeline-item">
                              <div className="ptp-timeline-badge">
                                {item.effective_status === 'Paid' ? (
                                  <CheckCircle2 size={16} className="text-green-500" />
                                ) : ['Overdue', 'Overdue PTP'].includes(item.effective_status) ? (
                                  <AlertTriangle size={16} className="text-red-500" />
                                ) : (
                                  <Clock size={16} className="text-blue-500" />
                                )}
                              </div>
                              <div className="ptp-timeline-content">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <span className="ptp-timeline-date">{fmtDate(item.promise_date)}</span>
                                    <span className="ptp-timeline-amt font-bold text-gray-800 ml-2">
                                      ₱{fmtAmt(item.promised_amount)}
                                    </span>
                                  </div>
                                  {renderStatusBadge(item.effective_status)}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  <span>{item.recurring_schedule}</span>
                                  <span> • {item.payment_method}</span>
                                  {item.reason && <span> • {item.reason}</span>}
                                </div>
                                {item.remarks && (
                                  <p className="ptp-timeline-remarks">{item.remarks}</p>
                                )}
                                {item.last_update_remarks && (
                                  <p className="ptp-timeline-update-note">
                                    <strong>Update:</strong> {item.last_update_remarks}
                                  </p>
                                )}
                                <div className="text-[11px] text-gray-400 mt-1">
                                  Set on {fmtDate(item.created_at)} by {item.created_by_name || 'Staff'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="ptp-card ptp-guidelines-card">
                  <div className="ptp-card-header">
                    <div className="ptp-card-header-title">
                      <Sparkles size={18} className="text-amber-500" />
                      <span>Promise-to-Pay Workflow</span>
                    </div>
                  </div>
                  <div className="ptp-card-body">
                    <div className="ptp-guide-step">
                      <div className="ptp-guide-num">1</div>
                      <div>
                        <strong>Search Client Code</strong>
                        <p>Locate the customer via Code or Name to see live balances and assigned collectors.</p>
                      </div>
                    </div>
                    <div className="ptp-guide-step">
                      <div className="ptp-guide-num">2</div>
                      <div>
                        <strong>Set Promise Details</strong>
                        <p>Specify the target Promise-to-Pay Date, Promised Amount, Schedule, and Reason.</p>
                      </div>
                    </div>
                    <div className="ptp-guide-step">
                      <div className="ptp-guide-num">3</div>
                      <div>
                        <strong>Monitor by Collector</strong>
                        <p>Commitments immediately store under the Collector's Sheet tab in PTP Monitoring.</p>
                      </div>
                    </div>
                    <div className="ptp-guide-step">
                      <div className="ptp-guide-num">4</div>
                      <div>
                        <strong>Track Due Dates & Update</strong>
                        <p>When the promise date is due, accounts appear in PTP Update for quick status tagging.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PTP MONITORING (BY COLLECTOR SHEET TABS) */}
      {/* ========================================================================= */}
      {activeTab === 'monitoring' && (
        <div className="ptp-tab-content fade-in">
          {/* KPI CARDS BAR */}
          <div className="ptp-kpi-grid">
            <div className="ptp-kpi-card kpi-blue">
              <div className="ptp-kpi-icon-wrap">
                <FileSpreadsheet size={22} />
              </div>
              <div className="ptp-kpi-info">
                <span className="ptp-kpi-label">Total Active PTP</span>
                <h3 className="ptp-kpi-val">{monitoringSummary.total_active_ptp || 0}</h3>
                <span className="ptp-kpi-sub">Across all collectors</span>
              </div>
            </div>

            <div className="ptp-kpi-card kpi-amber">
              <div className="ptp-kpi-icon-wrap">
                <Clock size={22} />
              </div>
              <div className="ptp-kpi-info">
                <span className="ptp-kpi-label">Due Today</span>
                <h3 className="ptp-kpi-val">{monitoringSummary.due_today_count || 0}</h3>
                <span className="ptp-kpi-sub">Target for today</span>
              </div>
            </div>

            <div className="ptp-kpi-card kpi-red">
              <div className="ptp-kpi-icon-wrap">
                <AlertTriangle size={22} />
              </div>
              <div className="ptp-kpi-info">
                <span className="ptp-kpi-label">Overdue PTP</span>
                <h3 className="ptp-kpi-val">{monitoringSummary.overdue_count || 0}</h3>
                <span className="ptp-kpi-sub">Needs immediate action</span>
              </div>
            </div>

            <div className="ptp-kpi-card kpi-green">
              <div className="ptp-kpi-icon-wrap">
                <CheckCircle2 size={22} />
              </div>
              <div className="ptp-kpi-info">
                <span className="ptp-kpi-label">Collected / Fulfilled</span>
                <h3 className="ptp-kpi-val">₱{fmtAmt(monitoringSummary.total_collected_amount)}</h3>
                <span className="ptp-kpi-sub">{monitoringSummary.fulfilled_count || 0} accounts kept</span>
              </div>
            </div>
          </div>

          {/* COLLECTOR SHEET TABS BAR */}
          <div className="ptp-sheet-tabs-container">
            <div className="ptp-sheet-tabs-header">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-blue-600" />
                <span className="font-semibold text-gray-700 text-sm">Collector Sheets:</span>
              </div>
              <span className="text-xs text-gray-500">Switch tabs to view clients assigned to each collector</span>
            </div>

            <div className="ptp-sheet-tabs-scroll">
              {/* All Collectors Tab */}
              <button
                type="button"
                className={`ptp-sheet-tab ${selectedCollectorTab === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCollectorTab('all')}
              >
                <FileSpreadsheet size={15} />
                <span>All Collectors</span>
                <span className="ptp-sheet-tab-badge">{monitoringSummary.total_records || 0}</span>
              </button>

              {/* Individual Collector Tabs */}
              {collectorTabs.map(col => (
                <button
                  key={col.collector_id}
                  type="button"
                  className={`ptp-sheet-tab ${selectedCollectorTab === String(col.collector_id) ? 'active' : ''}`}
                  onClick={() => setSelectedCollectorTab(String(col.collector_id))}
                >
                  <User size={14} />
                  <span>{col.collector_name}</span>
                  <span className={`ptp-sheet-tab-badge ${col.due_today_count > 0 || col.overdue_count > 0 ? 'has-alerts' : ''}`}>
                    {col.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* FILTERS & SEARCH ROW */}
          <div className="ptp-filter-card">
            <div className="ptp-filter-row">
              <div className="ptp-filter-search">
                <Search size={16} className="ptp-filter-search-icon" />
                <input
                  type="text"
                  placeholder="Search client code, name, loan, remarks..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchMonitoringData()}
                />
              </div>

              <div className="ptp-filter-item">
                <label>Status:</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="due_today">Due Today</option>
                  <option value="overdue">Overdue</option>
                  <option value="pending">Pending</option>
                  <option value="fully paid">Fully Paid</option>
                  <option value="fully paid(recon)">Fully Paid (Recon)</option>
                  <option value="fully paid(reloan)">Fully Paid (Reloan)</option>
                  <option value="partial paid done">Partial Paid Done</option>
                  <option value="paid">Kept / Paid (Manual)</option>
                  <option value="partially paid">Partially Paid (Manual)</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="broken">Broken Promise</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="ptp-filter-item">
                <label>Schedule:</label>
                <select
                  value={filterSchedule}
                  onChange={(e) => setFilterSchedule(e.target.value)}
                >
                  <option value="all">All Schedules</option>
                  <option value="One-time">One-time</option>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Semi-Monthly">Semi-Monthly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>

              <div className="ptp-filter-item">
                <label>Date From:</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                />
              </div>

              <div className="ptp-filter-item">
                <label>Date To:</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                />
              </div>

              <div className="ptp-filter-actions">
                <button
                  type="button"
                  className="ptp-btn-secondary"
                  onClick={() => {
                    setFilterSearch('');
                    setFilterStatus('all');
                    setFilterSchedule('all');
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                  title="Reset Filters"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  className="ptp-btn-secondary"
                  onClick={fetchMonitoringData}
                  title="Refresh"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  type="button"
                  className="ptp-btn-secondary"
                  onClick={handleExportCSV}
                  title="Export to CSV"
                >
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* MAIN MONITORING DATA TABLE */}
          <div className="ptp-table-card">
            <div className="ptp-table-wrapper">
              <table className="ptp-table">
                <thead>
                  <tr>
                    <th>Client Code & Name</th>
                    <th>Collector</th>
                    <th>Loan Details</th>
                    <th>Promise Date</th>
                    <th>Follow-up</th>
                    <th>Schedule</th>
                    <th>Status</th>
                    <th>Channel & Remarks</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="ptp-table-loading">
                        <Loader2 size={24} className="animate-spin text-blue-600 mb-2" />
                        <span>Loading Promise-to-Pay records...</span>
                      </td>
                    </tr>
                  ) : monitoringRecords.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="ptp-table-empty">
                        <FileSpreadsheet size={36} className="text-gray-300 mb-2" />
                        <p className="font-semibold text-gray-600">No Promise-to-Pay Records Found</p>
                        <span className="text-xs text-gray-400">
                          {selectedCollectorTab !== 'all'
                            ? 'This collector currently has no active PTP records matching the criteria.'
                            : 'No records found matching current filters. Click "Set Promise-to-Pay" to add.'}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    monitoringRecords.map((r) => (
                      <tr key={r.id} className={`ptp-row-status-${(r.effective_status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                        {/* Client Info */}
                        <td>
                          <div className="ptp-client-cell">
                            <span className="ptp-cell-code">{r.customer_code}</span>
                            <span className="ptp-cell-name">{r.customer_name}</span>
                            <span className="ptp-cell-sub">📞 {r.contact || 'No contact'}</span>
                          </div>
                        </td>

                        {/* Collector */}
                        <td>
                          <div className="ptp-collector-cell">
                            <span className="font-medium text-gray-800">{r.collector_name}</span>
                          </div>
                        </td>

                        {/* Loan Info */}
                        <td>
                          <div className="ptp-loan-cell">
                            <span className="font-mono text-xs font-semibold text-indigo-700">{r.loan_code || 'N/A'}</span>
                            <span className="ptp-loan-balance">Bal: ₱{fmtAmt(r.loan_balance)}</span>
                          </div>
                        </td>

                        {/* Promise Date */}
                        <td>
                          <div className="ptp-date-cell">
                            <span className="font-semibold text-gray-900">{fmtDate(r.promise_date)}</span>
                            {r.effective_status === 'Due Today' && (
                              <span className="ptp-promise-status text-amber-600">Due Today!</span>
                            )}
                            {['Overdue', 'Overdue PTP'].includes(r.effective_status) && (
                              <span className="ptp-promise-status text-red-600">Overdue!</span>
                            )}
                          </div>
                        </td>

                        {/* Follow-up Date */}
                        <td>
                          <span className="text-xs text-gray-700">{fmtDate(r.follow_up_date)}</span>
                        </td>

                        {/* Schedule */}
                        <td>
                          <span className="ptp-schedule-badge">{r.recurring_schedule || 'One-time'}</span>
                        </td>

                        {/* Status */}
                        <td>{renderStatusBadge(r.effective_status)}</td>

                        {/* Channel & Remarks */}
                        <td>
                          <div className="ptp-remarks-cell">
                            <span className="text-xs font-medium text-gray-700">{r.payment_method}</span>
                            {r.reason && <span className="text-[11px] text-gray-500 block">• {r.reason}</span>}
                            {r.remarks && <p className="ptp-remarks-text">{r.remarks}</p>}
                            {r.last_update_remarks && (
                              <p className="ptp-update-text">Note: {r.last_update_remarks}</p>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="ptp-actions-cell">
                            {canUpdatePtp && (
                              <button
                                type="button"
                                className="ptp-btn-action-primary"
                                onClick={() => handleOpenUpdateModal(r)}
                                title="Update Status / Outcome"
                              >
                                <Check size={14} /> Update
                              </button>
                            )}
                            {canUpdatePtp && (
                              <button
                                type="button"
                                className="ptp-btn-action-icon ptp-btn-action-edit"
                                onClick={() => handleOpenEditModal(r)}
                                title="Edit Promise-to-Pay Details"
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="ptp-btn-action-icon"
                              onClick={() => setSoaModal({ show: true, customerId: r.customer_id, loanId: r.loan_id })}
                              title="View SOA"
                            >
                              <FileText size={14} />
                            </button>
                            <button
                              type="button"
                              className="ptp-btn-action-icon"
                              onClick={() => handleOpenQuickClient(r)}
                              title="Client Details & History"
                            >
                              <Eye size={14} />
                            </button>
                            {canDeletePtp && (
                              <button
                                type="button"
                                className="ptp-btn-action-icon ptp-btn-action-delete"
                                onClick={() => handleOpenDeleteModal(r)}
                                title="Delete Promise-to-Pay"
                                aria-label={`Delete Promise-to-Pay for ${r.customer_name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PTP UPDATE (DUE & OVERDUE COMMITMENTS TRACKER) */}
      {/* ========================================================================= */}
      {activeTab === 'update' && (
        <div className="ptp-tab-content fade-in">
          {/* Due Urgency Alert Banner */}
          <div className="ptp-due-banner">
            <div className="flex items-center gap-3">
              <div className="ptp-due-banner-icon">
                <AlertTriangle size={24} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Due & Overdue Commitments Tracker</h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  Clients listed here have reached their promised payment date. Review and update whether the promise was Kept, Partially Paid, Rescheduled, or Broken.
                </p>
              </div>
            </div>
            <div className="ptp-due-banner-stats">
              <div className="ptp-due-stat-box stat-red">
                <span className="ptp-due-stat-num">{dueCounts.overdue || 0}</span>
                <span className="ptp-due-stat-lbl">Overdue</span>
              </div>
              <div className="ptp-due-stat-box stat-amber">
                <span className="ptp-due-stat-num">{dueCounts.due_today || 0}</span>
                <span className="ptp-due-stat-lbl">Due Today</span>
              </div>
              <div className="ptp-due-stat-box stat-blue">
                <span className="ptp-due-stat-num">{dueCounts.upcoming || 0}</span>
                <span className="ptp-due-stat-lbl">Upcoming (3d)</span>
              </div>
            </div>
          </div>

          {/* Sub Tabs for Due Updates */}
          <div className="ptp-filter-card">
            <div className="ptp-filter-row">
              <div className="ptp-due-subtabs">
                <button
                  type="button"
                  className={`ptp-subtab-btn ${dueFilter === 'all_due' ? 'active' : ''}`}
                  onClick={() => setDueFilter('all_due')}
                >
                  <AlertCircle size={14} /> All Due ({dueCounts.all_due || 0})
                </button>
                <button
                  type="button"
                  className={`ptp-subtab-btn ${dueFilter === 'overdue' ? 'active' : ''}`}
                  onClick={() => setDueFilter('overdue')}
                >
                  <AlertTriangle size={14} /> Overdue Only ({dueCounts.overdue || 0})
                </button>
                <button
                  type="button"
                  className={`ptp-subtab-btn ${dueFilter === 'due_today' ? 'active' : ''}`}
                  onClick={() => setDueFilter('due_today')}
                >
                  <Clock size={14} /> Due Today Only ({dueCounts.due_today || 0})
                </button>
                <button
                  type="button"
                  className={`ptp-subtab-btn ${dueFilter === 'upcoming_3days' ? 'active' : ''}`}
                  onClick={() => setDueFilter('upcoming_3days')}
                >
                  <CalendarDays size={14} /> Upcoming 3 Days ({dueCounts.upcoming || 0})
                </button>
                <button
                  type="button"
                  className={`ptp-subtab-btn ${dueFilter === 'all_records' ? 'active' : ''}`}
                  onClick={() => setDueFilter('all_records')}
                >
                  <Layers size={14} /> All Records ({dueCounts.total || 0})
                </button>
              </div>

              <div className="ptp-filter-item ml-auto">
                <label>Collector:</label>
                <select
                  value={dueCollectorFilter}
                  onChange={(e) => setDueCollectorFilter(e.target.value)}
                >
                  <option value="all">All Collectors</option>
                  {collectors.map(c => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                  <option value="unassigned">Unassigned</option>
                </select>
              </div>

              <div className="ptp-filter-search" style={{ minWidth: '220px' }}>
                <Search size={16} className="ptp-filter-search-icon" />
                <input
                  type="text"
                  placeholder="Filter client / loan..."
                  value={dueSearch}
                  onChange={(e) => setDueSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchDueUpdates()}
                />
              </div>

              <button
                type="button"
                className="ptp-btn-secondary"
                onClick={fetchDueUpdates}
                title="Refresh"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Due Records Table */}
          <div className="ptp-table-card">
            <div className="ptp-table-wrapper">
              <table className="ptp-table">
                <thead>
                  <tr>
                    <th>Urgency</th>
                    <th>Client Code & Name</th>
                    <th>Collector</th>
                    <th>Loan Code</th>
                    <th>Current Balance</th>
                    <th>Promise Date</th>
                    <th className="text-right">Promised Amount</th>
                    <th>Status</th>
                    <th>Channel & Notes</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="ptp-table-loading">
                        <Loader2 size={24} className="animate-spin text-blue-600 mb-2" />
                        <span>Loading due Promise-to-Pay records...</span>
                      </td>
                    </tr>
                  ) : dueRecords.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="ptp-table-empty">
                        <CheckCircle2 size={36} className="text-green-500 mb-2" />
                        <p className="font-semibold text-gray-700">No Due PTP Records Pending!</p>
                        <span className="text-xs text-gray-400">All current Promise-to-Pay commitments are updated and up to date.</span>
                      </td>
                    </tr>
                  ) : (
                    dueRecords.map((r) => (
                      <tr key={r.id} className={`ptp-row-due ${['Overdue', 'Overdue PTP'].includes(r.effective_status) ? 'ptp-row-overdue-alert' : ''}`}>
                        {/* Urgency indicator */}
                        <td>
                          {['Overdue', 'Overdue PTP'].includes(r.effective_status) ? (
                            <span className="ptp-urgency-tag urgency-red">
                              <AlertTriangle size={12} /> {Math.abs(r.days_difference || 0)}d Overdue
                            </span>
                          ) : r.effective_status === 'Due Today' ? (
                            <span className="ptp-urgency-tag urgency-amber">
                              <Clock size={12} /> Due Today
                            </span>
                          ) : (
                            <span className="ptp-urgency-tag urgency-blue">
                              In {r.days_difference} days
                            </span>
                          )}
                        </td>

                        {/* Client */}
                        <td>
                          <div className="ptp-client-cell">
                            <span className="ptp-cell-code">{r.customer_code}</span>
                            <span className="ptp-cell-name">{r.customer_name}</span>
                            <span className="ptp-cell-sub">📞 {r.contact || 'No contact'}</span>
                          </div>
                        </td>

                        {/* Collector */}
                        <td>
                          <span className="font-medium text-gray-800 text-xs">{r.collector_name}</span>
                        </td>

                        {/* Loan */}
                        <td>
                          <span className="font-mono text-xs font-semibold text-indigo-700">{r.loan_code || 'N/A'}</span>
                        </td>

                        {/* Balance */}
                        <td>
                          <span className="font-semibold text-red-600 text-xs">₱{fmtAmt(r.loan_balance)}</span>
                        </td>

                        {/* Promise Date */}
                        <td>
                          <span className="font-bold text-gray-900 text-xs">{fmtDate(r.promise_date)}</span>
                        </td>

                        {/* Promised Amount */}
                        <td className="text-right">
                          <span className="ptp-amount-cell">₱{fmtAmt(r.promised_amount)}</span>
                        </td>

                        {/* Status */}
                        <td>{renderStatusBadge(r.effective_status)}</td>

                        {/* Notes */}
                        <td>
                          <div className="ptp-remarks-cell">
                            <span className="text-xs font-medium text-gray-700">{r.payment_method}</span>
                            {r.reason && <span className="text-[11px] text-gray-500 block">• {r.reason}</span>}
                            {r.remarks && <p className="ptp-remarks-text">{r.remarks}</p>}
                          </div>
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="flex items-center justify-center gap-1">
                            {canUpdatePtp && (
                              <button
                                type="button"
                                className="ptp-btn-action-primary"
                                onClick={() => handleOpenUpdateModal(r)}
                              >
                                <Check size={14} /> Update
                              </button>
                            )}
                            <button
                              type="button"
                              className="ptp-btn-action-icon"
                              onClick={() => setSoaModal({ show: true, customerId: r.customer_id, loanId: r.loan_id })}
                              title="View SOA"
                            >
                              <FileText size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK UPDATE STATUS MODAL */}
      {/* ========================================================================= */}
      {updateModal.show && updateModal.record && (
        <div className="ptp-modal-overlay" onClick={() => setUpdateModal(prev => ({ ...prev, show: false }))}>
          <div className="ptp-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ptp-modal-header">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} className="text-blue-600" />
                <h3>Update Promise-to-Pay Outcome</h3>
              </div>
              <button
                type="button"
                className="ptp-modal-close"
                onClick={() => setUpdateModal(prev => ({ ...prev, show: false }))}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitUpdate}>
              <div className="ptp-modal-body">
                {/* Account Summary Banner */}
                <div className="ptp-modal-summary-banner">
                  <div>
                    <span className="text-xs text-gray-500">Client:</span>
                    <h4 className="font-bold text-gray-900">{updateModal.record.customer_name} ({updateModal.record.customer_code})</h4>
                    <span className="text-xs text-gray-600">Collector: {updateModal.record.collector_name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">Original Commitment:</span>
                    <p className="font-bold text-blue-700 text-base">₱{fmtAmt(updateModal.record.promised_amount)}</p>
                    <span className="text-xs text-gray-500">Due: {fmtDate(updateModal.record.promise_date)}</span>
                  </div>
                </div>

                {/* Status Selection Buttons */}
                <div className="ptp-form-group">
                  <label className="ptp-label required">Select Payment / Commitment Outcome</label>
                  <div className="ptp-outcome-selector">
                    <button
                      type="button"
                      className={`ptp-outcome-btn btn-paid ${updateModal.status === 'Paid' ? 'active' : ''}`}
                      onClick={() => setUpdateModal(prev => ({
                        ...prev,
                        status: 'Paid',
                        paid_amount: prev.record.promised_amount || ''
                      }))}
                    >
                      <CheckCircle2 size={16} />
                      <span>Kept / Paid</span>
                    </button>

                    <button
                      type="button"
                      className={`ptp-outcome-btn btn-partial ${updateModal.status === 'Partially Paid' ? 'active' : ''}`}
                      onClick={() => setUpdateModal(prev => ({ ...prev, status: 'Partially Paid' }))}
                    >
                      <Banknote size={16} />
                      <span>Partial Paid</span>
                    </button>

                    <button
                      type="button"
                      className={`ptp-outcome-btn btn-resched ${updateModal.status === 'Rescheduled' ? 'active' : ''}`}
                      onClick={() => setUpdateModal(prev => ({ ...prev, status: 'Rescheduled' }))}
                    >
                      <RotateCcw size={16} />
                      <span>Rescheduled</span>
                    </button>

                    <button
                      type="button"
                      className={`ptp-outcome-btn btn-broken ${updateModal.status === 'Broken' ? 'active' : ''}`}
                      onClick={() => setUpdateModal(prev => ({ ...prev, status: 'Broken' }))}
                    >
                      <XCircle size={16} />
                      <span>Broken Promise</span>
                    </button>
                  </div>
                </div>

                {/* Conditional Fields based on status */}
                {(updateModal.status === 'Paid' || updateModal.status === 'Partially Paid') && (
                  <div className="ptp-form-row">
                    <div className="ptp-form-group">
                      <label className="ptp-label required">Amount Paid (₱)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="ptp-input ptp-input-amount"
                        value={updateModal.paid_amount}
                        onChange={(e) => setUpdateModal(prev => ({ ...prev, paid_amount: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="ptp-form-group">
                      <label className="ptp-label required">Payment Date</label>
                      <input
                        type="date"
                        className="ptp-input"
                        value={updateModal.payment_date}
                        onChange={(e) => setUpdateModal(prev => ({ ...prev, payment_date: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                )}

                {updateModal.status === 'Rescheduled' && (
                  <div className="ptp-form-row">
                    <div className="ptp-form-group">
                      <label className="ptp-label required">New Promise-to-Pay Date</label>
                      <input
                        type="date"
                        className="ptp-input ptp-input-highlight"
                        value={updateModal.new_promise_date}
                        onChange={(e) => setUpdateModal(prev => ({ ...prev, new_promise_date: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="ptp-form-group">
                      <label className="ptp-label">New Follow-up Date</label>
                      <input
                        type="date"
                        className="ptp-input"
                        value={updateModal.new_follow_up_date}
                        onChange={(e) => setUpdateModal(prev => ({ ...prev, new_follow_up_date: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* Remarks & Notes */}
                <div className="ptp-form-group">
                  <label className="ptp-label">Follow-up Notes / Reason for Outcome</label>
                  <textarea
                    className="ptp-textarea"
                    rows="3"
                    placeholder="Enter reason, customer statement, or follow-up details..."
                    value={updateModal.remarks}
                    onChange={(e) => setUpdateModal(prev => ({ ...prev, remarks: e.target.value }))}
                  ></textarea>
                </div>
              </div>

              <div className="ptp-modal-footer">
                <button
                  type="button"
                  className="ptp-btn-secondary"
                  onClick={() => setUpdateModal(prev => ({ ...prev, show: false }))}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ptp-btn-primary"
                  disabled={updateModal.saving}
                >
                  {updateModal.saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  <span>Save Outcome</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK CLIENT MODAL */}
      {/* ========================================================================= */}
      {quickClientModal.show && quickClientModal.data && (
        <div className="ptp-modal-overlay" onClick={() => setQuickClientModal(prev => ({ ...prev, show: false }))}>
          <div className="ptp-modal-content ptp-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="ptp-modal-header">
              <div className="flex items-center gap-2">
                <UserCheck size={20} className="text-blue-600" />
                <h3>Client Profile & Commitment History</h3>
              </div>
              <button
                type="button"
                className="ptp-modal-close"
                onClick={() => setQuickClientModal(prev => ({ ...prev, show: false }))}
              >
                <X size={18} />
              </button>
            </div>

            <div className="ptp-modal-body">
              <div className="ptp-selected-client-banner mb-4">
                <div className="ptp-selected-client-info">
                  <div className="ptp-avatar-circle">
                    <User size={24} />
                  </div>
                  <div>
                    <h3 className="ptp-selected-name">{quickClientModal.data.full_name} ({quickClientModal.data.customer_code})</h3>
                    <p className="ptp-selected-meta">
                      <span>📞 {quickClientModal.data.contact || 'No contact'}</span>
                      <span>•</span>
                      <span>📍 {quickClientModal.data.address || 'No Address'}</span>
                      <span>•</span>
                      <span>👤 {quickClientModal.data.collector_name || 'Unassigned'}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="ptp-btn-secondary"
                  onClick={() => {
                    setSoaModal({ show: true, customerId: quickClientModal.data.id });
                  }}
                >
                  <FileText size={14} /> Full SOA
                </button>
              </div>

              <h4 className="font-semibold text-gray-800 text-sm mb-2">PTP History Timeline ({quickClientModal.history.length})</h4>
              <div className="ptp-history-timeline max-h-[300px] overflow-y-auto">
                {quickClientModal.history.map(item => (
                  <div key={item.id} className="ptp-timeline-item">
                    <div className="ptp-timeline-badge">
                      {item.effective_status === 'Paid' ? (
                        <CheckCircle2 size={16} className="text-green-500" />
                      ) : ['Overdue', 'Overdue PTP'].includes(item.effective_status) ? (
                        <AlertTriangle size={16} className="text-red-500" />
                      ) : (
                        <Clock size={16} className="text-blue-500" />
                      )}
                    </div>
                    <div className="ptp-timeline-content">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="ptp-timeline-date">{fmtDate(item.promise_date)}</span>
                          <span className="ptp-timeline-amt font-bold text-gray-800 ml-2">
                            ₱{fmtAmt(item.promised_amount)}
                          </span>
                        </div>
                        {renderStatusBadge(item.effective_status)}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        <span>{item.recurring_schedule}</span>
                        <span> • {item.payment_method}</span>
                        {item.reason && <span> • {item.reason}</span>}
                      </div>
                      {item.remarks && <p className="ptp-timeline-remarks">{item.remarks}</p>}
                      {item.last_update_remarks && (
                        <p className="ptp-timeline-update-note"><strong>Outcome:</strong> {item.last_update_remarks}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ptp-modal-footer">
              <button
                type="button"
                className="ptp-btn-secondary"
                onClick={() => setQuickClientModal(prev => ({ ...prev, show: false }))}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOA MODAL */}
      {soaModal.show && (
        <SoaModal
          customerId={soaModal.customerId}
          loanId={soaModal.loanId}
          onClose={() => setSoaModal({ show: false, customerId: null, loanId: null })}
        />
      )}

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION POPUP MODAL */}
      {/* ========================================================================= */}
      {deleteModal.show && deleteModal.record && (
        <div className="ptp-modal-overlay" onClick={() => !deleteModal.deleting && setDeleteModal({ show: false, record: null, deleting: false })}>
          <div className="ptp-modal-content ptp-confirm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ptp-confirm-icon-wrap danger">
              <AlertTriangle size={32} />
            </div>

            <h3 className="text-lg font-bold text-gray-900 text-center mb-1">Delete Promise-to-Pay</h3>
            <p className="text-xs text-gray-500 text-center mb-4">
              Are you sure you want to permanently delete this Promise-to-Pay record? This action cannot be undone.
            </p>

            <div className="ptp-confirm-details-card">
              <div className="ptp-confirm-detail-row">
                <span className="label">Customer:</span>
                <span className="value font-semibold text-gray-900">
                  {deleteModal.record.customer_code} - {deleteModal.record.customer_name}
                </span>
              </div>
              <div className="ptp-confirm-detail-row">
                <span className="label">Loan Account:</span>
                <span className="value text-indigo-700 font-mono">
                  {deleteModal.record.loan_code || 'N/A'} {deleteModal.record.loan_balance ? `(Bal: ₱${fmtAmt(deleteModal.record.loan_balance)})` : ''}
                </span>
              </div>
              <div className="ptp-confirm-detail-row">
                <span className="label">Promise Date:</span>
                <span className="value text-gray-800">{fmtDate(deleteModal.record.promise_date)}</span>
              </div>
              <div className="ptp-confirm-detail-row">
                <span className="label">Assigned Collector:</span>
                <span className="value text-gray-800">{deleteModal.record.collector_name || 'Unassigned'}</span>
              </div>
              <div className="ptp-confirm-detail-row">
                <span className="label">Current Status:</span>
                <span className="value">{renderStatusBadge(deleteModal.record.effective_status || deleteModal.record.status)}</span>
              </div>
            </div>

            <div className="ptp-confirm-actions">
              <button
                type="button"
                className="ptp-btn-secondary flex-1"
                onClick={() => setDeleteModal({ show: false, record: null, deleting: false })}
                disabled={deleteModal.deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ptp-btn-danger flex-1"
                onClick={handleConfirmDelete}
                disabled={deleteModal.deleting}
              >
                {deleteModal.deleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} /> Yes, Delete Record
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT PROMISE-TO-PAY DETAILS MODAL */}
      {/* ========================================================================= */}
      {editModal.show && editModal.record && (
        <div className="ptp-modal-overlay" onClick={() => !editModal.saving && setEditModal(prev => ({ ...prev, show: false }))}>
          <div className="ptp-modal-content max-w-xl" onClick={(e) => e.stopPropagation()}>
            <div className="ptp-modal-header">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="ptp-modal-title">Edit Promise-to-Pay Details</h3>
                  <p className="ptp-modal-subtitle">
                    {editModal.record.customer_code} • {editModal.record.customer_name} ({editModal.record.loan_code || 'Loan'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="ptp-modal-close"
                onClick={() => !editModal.saving && setEditModal(prev => ({ ...prev, show: false }))}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="ptp-modal-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Promise Date */}
                <div className="ptp-form-group">
                  <label className="ptp-label required">Promise Date</label>
                  <input
                    type="date"
                    required
                    className="ptp-input"
                    value={editModal.form.promise_date}
                    onChange={(e) => setEditModal(prev => ({ ...prev, form: { ...prev.form, promise_date: e.target.value } }))}
                  />
                </div>

                {/* Follow-up Date */}
                <div className="ptp-form-group">
                  <label className="ptp-label">Follow-up Date</label>
                  <input
                    type="date"
                    className="ptp-input"
                    value={editModal.form.follow_up_date}
                    onChange={(e) => setEditModal(prev => ({ ...prev, form: { ...prev.form, follow_up_date: e.target.value } }))}
                  />
                </div>

                {/* Recurring Schedule */}
                <div className="ptp-form-group">
                  <label className="ptp-label">Commitment Schedule</label>
                  <select
                    className="ptp-input"
                    value={editModal.form.recurring_schedule}
                    onChange={(e) => setEditModal(prev => ({ ...prev, form: { ...prev.form, recurring_schedule: e.target.value } }))}
                  >
                    <option value="One-time">One-time Promise</option>
                    <option value="Daily">Daily Recurring</option>
                    <option value="Weekly">Weekly Recurring</option>
                    <option value="Semi-Monthly">Semi-Monthly (15th/30th)</option>
                    <option value="Monthly">Monthly Recurring</option>
                  </select>
                </div>

                {/* Payment Method / Channel */}
                <div className="ptp-form-group">
                  <label className="ptp-label">Payment Channel</label>
                  <select
                    className="ptp-input"
                    value={editModal.form.payment_method}
                    onChange={(e) => setEditModal(prev => ({ ...prev, form: { ...prev.form, payment_method: e.target.value } }))}
                  >
                    <option value="Field Collection">Field Collection (Collector Pickup)</option>
                    <option value="Office / Branch Visit">Office / Branch Visit</option>
                    <option value="GCash / E-Wallet">GCash / Maya / E-Wallet</option>
                    <option value="Bank Transfer">Bank Transfer / Online Banking</option>
                    <option value="Check Payment">Post-dated Check (PDC)</option>
                    <option value="Other">Other / Direct Remittance</option>
                  </select>
                </div>

                {/* Assigned Collector */}
                <div className="ptp-form-group">
                  <label className="ptp-label">Assigned Collector</label>
                  <select
                    className="ptp-input"
                    value={editModal.form.collector_id}
                    onChange={(e) => setEditModal(prev => ({ ...prev, form: { ...prev.form, collector_id: e.target.value } }))}
                  >
                    <option value="">-- Unassigned --</option>
                    {collectors.map(col => (
                      <option key={col.id} value={col.id}>
                        {col.first_name} {col.last_name} {col.branch_name ? `(${col.branch_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Record Status */}
                <div className="ptp-form-group">
                  <label className="ptp-label">Status</label>
                  <select
                    className="ptp-input"
                    value={editModal.form.status}
                    onChange={(e) => setEditModal(prev => ({ ...prev, form: { ...prev.form, status: e.target.value } }))}
                  >
                    <option value="Pending">Pending / Active</option>
                    <option value="Paid">Kept / Paid (Fulfilled)</option>
                    <option value="Partially Paid">Partially Paid</option>
                    <option value="Rescheduled">Rescheduled</option>
                    <option value="Broken">Broken Promise</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* Remarks */}
              <div className="ptp-form-group mb-4">
                <label className="ptp-label">Remarks & Collection Notes</label>
                <textarea
                  rows="3"
                  className="ptp-input"
                  placeholder="Update collection notes, customer reason, payment breakdown..."
                  value={editModal.form.remarks}
                  onChange={(e) => setEditModal(prev => ({ ...prev, form: { ...prev.form, remarks: e.target.value } }))}
                />
              </div>

              <div className="ptp-modal-footer">
                <button
                  type="button"
                  className="ptp-btn-secondary"
                  onClick={() => setEditModal(prev => ({ ...prev, show: false }))}
                  disabled={editModal.saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ptp-btn-primary"
                  disabled={editModal.saving}
                >
                  {editModal.saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Saving Changes...
                    </>
                  ) : (
                    <>
                      <Save size={16} /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUCCESS / FEEDBACK POPUP MODAL */}
      {/* ========================================================================= */}
      {successModal && (
        <div className="ptp-modal-overlay" onClick={() => setSuccessModal(null)}>
          <div className="ptp-modal-content ptp-confirm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className={`ptp-confirm-icon-wrap ${successModal.type === 'delete' ? 'danger' : 'success'}`}>
              {successModal.type === 'delete' ? (
                <Trash2 size={32} />
              ) : (
                <CheckCircle2 size={32} />
              )}
            </div>

            <h3 className="text-lg font-bold text-gray-900 text-center mb-1">
              {successModal.title}
            </h3>
            <p className="text-xs text-gray-600 text-center mb-4 leading-relaxed">
              {successModal.message}
            </p>

            {successModal.details && (
              <div className="ptp-confirm-details-card mb-4">
                <div className="ptp-confirm-detail-row">
                  <span className="label">Customer:</span>
                  <span className="value font-semibold text-gray-900">
                    {successModal.details.clientCode} - {successModal.details.clientName}
                  </span>
                </div>
                {successModal.details.promiseDate && (
                  <div className="ptp-confirm-detail-row">
                    <span className="label">Promise Date:</span>
                    <span className="value text-indigo-700 font-semibold">{fmtDate(successModal.details.promiseDate)}</span>
                  </div>
                )}
                {successModal.details.schedule && (
                  <div className="ptp-confirm-detail-row">
                    <span className="label">Schedule:</span>
                    <span className="value text-gray-800">{successModal.details.schedule}</span>
                  </div>
                )}
                {successModal.details.collector && (
                  <div className="ptp-confirm-detail-row">
                    <span className="label">Collector:</span>
                    <span className="value text-gray-800">{successModal.details.collector}</span>
                  </div>
                )}
                {successModal.details.paymentMethod && (
                  <div className="ptp-confirm-detail-row">
                    <span className="label">Channel:</span>
                    <span className="value text-gray-800">{successModal.details.paymentMethod}</span>
                  </div>
                )}
              </div>
            )}

            <div className="ptp-confirm-actions">
              {successModal.type === 'create' ? (
                <>
                  <button
                    type="button"
                    className="ptp-btn-secondary flex-1"
                    onClick={() => setSuccessModal(null)}
                  >
                    Set Another PTP
                  </button>
                  <button
                    type="button"
                    className="ptp-btn-primary flex-1"
                    onClick={() => {
                      setSuccessModal(null);
                      setActiveTab('monitoring');
                    }}
                  >
                    View in Monitoring
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="ptp-btn-primary w-full"
                  onClick={() => setSuccessModal(null)}
                >
                  OK, Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

