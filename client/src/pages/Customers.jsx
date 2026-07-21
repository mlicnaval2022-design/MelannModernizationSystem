import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import html2pdf from 'html2pdf.js'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import '../soa.css'
import '../soa-v2.css'
import '../customers.css'
import '../customers-v2.css'
import CustomerWizard from '../components/CustomerWizard'
import logoImg from '../assets/logo.png'
import { Users, CheckCircle, XCircle, Calendar, Search, Filter, FileText, Phone, Mail, MapPin, User, MoreVertical, BarChart2, Plus, Printer, X, PieChart, List, Wallet, Scale, CalendarDays, CalendarClock, Info } from 'lucide-react'

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

  useEffect(() => {
    const openSoaId = searchParams.get('openSoa')
    if (openSoaId) openSoa(openSoaId)
  }, [searchParams])

  const [status, setStatus] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [collectorFilter, setCollectorFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
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
  const [penaltyLoan, setPenaltyLoan] = useState(null)
  const [editingPenaltyPayment, setEditingPenaltyPayment] = useState(null)
  const [printModeLoan, setPrintModeLoan] = useState(null)
  const [loanDeleteTarget, setLoanDeleteTarget] = useState(null)
  const [loanDeleteProcessing, setLoanDeleteProcessing] = useState(false)
  const [loanDeleteSuccess, setLoanDeleteSuccess] = useState(null)
  const [loanDeleteError, setLoanDeleteError] = useState(null)
  const suppressNextPrintRef = useRef(false)

  useEffect(() => {
    if (printModeLoan) {
      if (suppressNextPrintRef.current) return;
      const timer = setTimeout(() => {
        window.print();
        setPrintModeLoan(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [printModeLoan]);

  useEffect(() => {
    if (soaModal) {
      document.body.classList.add('soa-print-mode');
    } else {
      document.body.classList.remove('soa-print-mode');
    }
    document.body.classList.toggle('soa-print-profile', soaModal && soaTab === 'profile' && !printModeLoan);
    document.body.classList.toggle('soa-print-statement', soaModal && (soaTab !== 'profile' || printModeLoan));

    return () => {
      document.body.classList.remove('soa-print-mode', 'soa-print-profile', 'soa-print-statement');
    };
  }, [soaModal, soaTab, printModeLoan]);
  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = API.defaults.baseURL.replace('/api', '');
    return `${baseUrl}${path}`;
  };

  const getLoanStatusLabel = (loan) => {
    if (!loan) return '—';
    const lstatus = (loan.status || '').toLowerCase();
    
    if (lstatus === 'reversed') return 'Reversed';
    if (lstatus === 'fullpaid' || lstatus === 'fully paid' || lstatus === 'fully_paid') return 'Fully Paid';
    
    if (['active', 'approved'].includes(lstatus)) {
        const cstatus = (soaData?.status || '').toUpperCase();
        if (cstatus === 'RELAX') return 'Relax';
        if (cstatus === 'HOLD') return 'Hold';
        
        if (loan.date_maturity) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const maturity = new Date(loan.date_maturity);
          maturity.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((today.getTime() - maturity.getTime()) / (1000 * 3600 * 24));
          if (diffDays > 45) return 'Pastdue';
          if (diffDays >= 1) return 'Overdue';
        }

        const type = (loan.loan_type || '').toLowerCase();
        if (type === 'recon') return 'Recon';
        if (type === 're-loan' || type === 'reloan' || loan.status === 'reloan_pending') return 'Reloan';
        if (type === 'new') return 'New';
    }
    return loan.status ? loan.status.replace(/_/g, ' ') : '—';
  };

  const getLoanStatusClass = (loan) => {
    if (!loan) return 'unknown';
    const lstatus = (loan.status || '').toLowerCase();
    
    if (lstatus === 'reversed') return 'reversed';
    if (lstatus === 'fullpaid' || lstatus === 'fully paid' || lstatus === 'fully_paid') return 'fully-paid';
    
    if (['active', 'approved'].includes(lstatus)) {
        const cstatus = (soaData?.status || '').toUpperCase();
        if (cstatus === 'RELAX') return 'relax';
        if (cstatus === 'HOLD') return 'hold';
        
        if (loan.date_maturity) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const maturity = new Date(loan.date_maturity);
          maturity.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((today.getTime() - maturity.getTime()) / (1000 * 3600 * 24));
          if (diffDays > 45) return 'pastdue';
          if (diffDays >= 1) return 'overdue';
        }

        const type = (loan.loan_type || '').toLowerCase();
        if (type === 'recon') return 'recon';
        if (type === 're-loan' || type === 'reloan' || loan.status === 'reloan_pending') return 'reloan';
        if (type === 'new') return 'new';
    }
    return lstatus || 'unknown';
  };
  const getCalculatedCustomerStatus = (data) => {
    if (!data) return 'Active';
    if (!data.loans || data.loans.length === 0) return data.status || 'Active';
    
    const activeLoan = data.loans.find(l => !['fullpaid', 'closed', 'rejected', 'cancelled', 'reversed'].includes(l.status?.toLowerCase()));
    
    if (!activeLoan) return data.status || 'Active';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let isPastdue = false;
    let isOverdue = false;
    
    if (activeLoan.date_maturity) {
      const maturity = new Date(activeLoan.date_maturity);
      maturity.setHours(0, 0, 0, 0);
      
      const diffTime = today.getTime() - maturity.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
      
      if (diffDays > 45) {
        isPastdue = true;
      } else if (diffDays >= 1) {
        isOverdue = true;
      }
    }
    
    if (isPastdue) return 'Pastdue';
    if (isOverdue) return 'Overdue';
    
    const lType = activeLoan.loan_type?.toLowerCase() || '';
    if (lType === 're-loan' || lType === 'reloan') return 'Reloan';
    if (lType === 'recon') return 'Recon';
    
    return 'Active';
  };

  const load = () => {
    setLoading(true)
    Promise.all([
      API.get('/customers', { params: { search, status, branch_id: branchFilter, collector_id: collectorFilter } }),
      API.get('/reports/customers-metrics')
    ]).then(([rCust, rMet]) => {
      setRows(rCust.data)
      setMetrics(rMet.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search, status, branchFilter, collectorFilter])
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
      } catch {
        cicStatus = null;
      }
      setSoaData({ ...r.data, cicStatus });
    } catch {
      alert('Failed to load SOA data');
      setSoaModal(false);
    } finally {
      setSoaLoading(false);
    }
  }

  const deleteLoanFromSoa = async (loan) => {
    if (!loan?.id || loanDeleteProcessing) return;
    const loanCode = loan.loan_code || `Loan ${loan.id}`;
    try {
      setLoanDeleteProcessing(true);
      await API.delete(`/loans/${loan.id}`);
      setSoaData(prev => prev ? ({
        ...prev,
        loans: (prev.loans || []).filter(l => l.id !== loan.id),
        payments: (prev.payments || []).filter(p => p.loan_id !== loan.id && p.loan_code !== loan.loan_code)
      }) : prev);
      setSelectedLoanForPayments(prev => prev?.id === loan.id ? null : prev);
      setPrintModeLoan(prev => prev?.id === loan.id ? null : prev);
      setLoanDeleteTarget(null);
      setLoanDeleteSuccess(`${loanCode} successfully deleted.`);
      load();
    } catch (err) {
      setLoanDeleteError(err.response?.data?.error || 'Failed to delete loan');
    } finally {
      setLoanDeleteProcessing(false);
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
  const formatMoneyExact = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPhp = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPhpExact = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatMoneyExactDeduction = (value) => Number(value || 0) > 0 ? `-${formatMoneyExact(value)}` : formatMoneyExact(0);
  const formatPhpDeduction = (value) => Number(value || 0) > 0 ? `-${formatPhpExact(value)}` : formatPhpExact(0);
  const formatPaymentCode = (payment) => {
    const rawCode = payment?.payment_code && payment.payment_code !== 'N/A'
      ? payment.payment_code
      : payment?.or_number;
    if (!rawCode || rawCode === 'N/A') return 'N/A';
    return String(rawCode).replace(/^JCASH-?/i, '');
  };
  const formatDateLong = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { month: 'long', day: '2-digit', year: 'numeric' });
  };
  const formatDateNumeric = (value) => {
    if (!value) return '-';
    const date = parseLocalDate(value);
    if (!date) return value;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}-${day}-${date.getFullYear()}`;
  };
  const formatDateShort = (value) => {
    if (!value) return '-';
    const date = parseLocalDate(value);
    if (!date) return value;
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  };
  const parseLocalDate = (value) => {
    if (!value) return null;
    const text = String(value).slice(0, 10);
    const parts = text.split('-').map(Number);
    if (parts.length === 3 && parts.every(Boolean)) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const addMonths = (date, months) => {
    const result = new Date(date);
    const day = result.getDate();
    result.setMonth(result.getMonth() + months);
    if (result.getDate() !== day) result.setDate(0);
    return result;
  };
  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };
  const isGoodPayment = (payment) => {
    const statusText = String(payment.status || payment.payment_status || 'active').toLowerCase();
    return !['cancelled', 'canceled', 'void', 'reversed', 'bad', 'bounced', 'penalty'].includes(statusText);
  };
  const getLoanPayments = (loan) => (soaData?.payments || [])
    .filter(p => p.loan_code === loan?.loan_code && isGoodPayment(p))
    .map(p => ({ ...p, paidDate: parseLocalDate(p.date_paid), amount: Number(p.amount_paid || 0) }))
    .filter(p => p.paidDate)
    .sort((a, b) => a.paidDate - b.paidDate);
  const getPaymentHistoryRows = (loan) => (soaData?.payments || [])
    .filter(p => p.loan_code === loan?.loan_code)
    .sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid));
  const getPaymentStatusText = (payment) => {
    const isReversed = payment.status === 'reversed';
    const isFullyPaid = payment.status === 'active' && Number(payment.balance_after) <= 0;
    const isPartial = payment.status === 'active' && Number(payment.balance_after) > 0;

    if (isReversed) return 'Reversed';
    if (payment.status === 'penalty') return 'Penalty';
    if (isFullyPaid) return 'Fully Paid';
    if (isPartial) return 'Active';
    return payment.status || 'Active';
  };
  const exportPaymentHistory = (loan) => {
    if (!loan) return;
    suppressNextPrintRef.current = true;
    setPrintModeLoan(loan);

    setTimeout(() => {
      const source = document.querySelector('.formal-soa-print');
      if (!source) {
        suppressNextPrintRef.current = false;
        setPrintModeLoan(null);
        return;
      }

      const exportRoot = source.cloneNode(true);
      exportRoot.classList.add('soa-pdf-export');
      exportRoot.style.display = 'block';
      exportRoot.style.width = '7.75in';
      exportRoot.style.maxWidth = '7.75in';
      exportRoot.style.margin = '0';
      exportRoot.style.background = '#ffffff';
      exportRoot.style.boxSizing = 'border-box';

      const pdfStyle = document.createElement('style');
      pdfStyle.textContent = `
        .soa-pdf-export,
        .soa-pdf-export * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          box-sizing: border-box !important;
        }
        .soa-pdf-export {
          display: block !important;
          position: static !important;
          width: 100% !important;
          max-width: 100% !important;
          background: #fff !important;
          color: #000 !important;
          font-family: Arial, Helvetica, sans-serif !important;
          font-size: 10px !important;
          line-height: 1.18 !important;
          min-height: 0 !important;
          padding: 0 !important;
          transform: none !important;
        }
        .soa-pdf-export table { page-break-inside: auto !important; }
        .soa-pdf-export thead { display: table-header-group !important; }
        .soa-pdf-export tr { page-break-inside: avoid !important; page-break-after: auto !important; }
        .soa-pdf-export td,
        .soa-pdf-export th,
        .soa-pdf-export strong { color: #000 !important; }
        .soa-pdf-export .f-soa-header {
          display: flex !important;
          justify-content: space-between !important;
          align-items: flex-start !important;
          border-bottom: 2px solid #0b297a !important;
          padding-bottom: 8px !important;
          margin-bottom: 9px !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .soa-pdf-export .f-soa-header-left { display: flex !important; align-items: center !important; gap: 10px !important; }
        .soa-pdf-export .f-soa-logo { width: 86px !important; height: 86px !important; object-fit: contain !important; }
        .soa-pdf-export .f-soa-company { padding-top: 0 !important; }
        .soa-pdf-export .f-soa-company h2 {
          font-size: 24px !important;
          color: #061f66 !important;
          margin: 0 !important;
          font-weight: 900 !important;
          letter-spacing: 0.5px !important;
        }
        .soa-pdf-export .f-soa-company h3 {
          font-size: 13px !important;
          color: #111827 !important;
          margin: 1px 0 6px 0 !important;
          font-weight: 800 !important;
          letter-spacing: 1px !important;
        }
        .soa-pdf-export .f-soa-contact p {
          font-size: 11px !important;
          color: #111827 !important;
          margin: 0 !important;
          line-height: 1.4 !important;
          display: flex !important;
          align-items: flex-start !important;
          gap: 6px !important;
          font-weight: 800 !important;
        }
        .soa-pdf-export .f-soa-contact p i { color: #0b297a !important; }
        .soa-pdf-export .f-soa-header-right { padding-top: 5px !important; width: 250px !important; }
        .soa-pdf-export .f-soa-header-right table {
          font-size: 11px !important;
          color: #000 !important;
          border-collapse: separate !important;
          border-spacing: 0 2px !important;
          width: 100% !important;
        }
        .soa-pdf-export .f-soa-header-right table td { padding: 2px 4px !important; vertical-align: top !important; }
        .soa-pdf-export .f-soa-header-right table td:first-child {
          color: #111827 !important;
          font-weight: 700 !important;
          width: 90px !important;
        }
        .soa-pdf-export .f-soa-header-right table td:last-child { color: #061f66 !important; }
        .soa-pdf-export .f-soa-title-wrapper {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 12px !important;
          margin: 11px 0 14px 0 !important;
        }
        .soa-pdf-export .f-soa-title-line { height: 2px !important; background: #eab308 !important; flex: 1 !important; max-width: 120px !important; }
        .soa-pdf-export .f-soa-title-dot { width: 6px !important; height: 6px !important; background: #eab308 !important; border-radius: 50% !important; }
        .soa-pdf-export .f-soa-title {
          text-align: center !important;
          font-size: 23px !important;
          color: #061f66 !important;
          font-weight: 900 !important;
          letter-spacing: 1px !important;
          margin: 0 !important;
          line-height: 1 !important;
        }
        .soa-pdf-export .f-soa-section {
          border: 1.5px solid #111827 !important;
          border-radius: 4px !important;
          margin-bottom: 10px !important;
          overflow: hidden !important;
          background: #fff !important;
          break-inside: auto !important;
          page-break-inside: auto !important;
        }
        .soa-pdf-export .f-soa-sec-header {
          background: #0b297a !important;
          color: #fff !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          padding: 5px 9px !important;
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }
        .soa-pdf-export .f-soa-sec-header * { color: #fff !important; }
        .soa-pdf-export .f-soa-loan-info { padding: 7px 9px !important; }
        .soa-pdf-export .f-soa-grid-3 { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 8px !important; }
        .soa-pdf-export .f-soa-grid-3 table:nth-child(1),
        .soa-pdf-export .f-soa-grid-3 table:nth-child(2) {
          border-right: 1.25px solid #374151 !important;
          padding-right: 8px !important;
        }
        .soa-pdf-export .f-soa-grid-3 table { width: 100% !important; font-size: 10px !important; border-collapse: collapse !important; }
        .soa-pdf-export .f-soa-grid-3 table td {
          padding: 2px 2px !important;
          color: #0f172a !important;
          vertical-align: top !important;
          line-height: 1.12 !important;
        }
        .soa-pdf-export .f-soa-grid-3 table td:first-child {
          width: 96px !important;
          color: #111827 !important;
          font-weight: 800 !important;
        }
        .soa-pdf-export .f-soa-grid-3 table td:nth-child(2) {
          width: 10px !important;
          color: #111827 !important;
          font-weight: 800 !important;
        }
        .soa-pdf-export .f-soa-ledger-table-new { width: 100% !important; border-collapse: collapse !important; }
        .soa-pdf-export .f-soa-ledger-table-new th {
          background: #f8fafc !important;
          color: #061f66 !important;
          font-size: 8.5px !important;
          font-weight: 800 !important;
          padding: 4px 6px !important;
          text-align: center !important;
          text-transform: uppercase !important;
          border: 1.15px solid #4b5563 !important;
          line-height: 1.1 !important;
        }
        .soa-pdf-export .f-soa-ledger-table-new th i { color: #64748b !important; margin-right: 4px !important; }
        .soa-pdf-export .f-soa-ledger-table-new td {
          padding: 3px 6px !important;
          font-size: 8.8px !important;
          color: #0f172a !important;
          text-align: center !important;
          vertical-align: middle !important;
          border: 1.15px solid #4b5563 !important;
          line-height: 1.12 !important;
        }
        .soa-pdf-export .f-soa-payment-ledger-table th:first-child,
        .soa-pdf-export .f-soa-payment-ledger-table td:first-child { text-align: left !important; }
        .soa-pdf-export .f-soa-row-even { background: #fff !important; }
        .soa-pdf-export .f-soa-row-odd { background: #f8fafc !important; }
        .soa-pdf-export .f-soa-ledger-table-new tr { border-bottom: 1px solid #cbd5e1 !important; }
        .soa-pdf-export .f-soa-ledger-table-new tr:last-child { border-bottom: none !important; }
        .soa-pdf-export .f-soa-payment-ledger-table tfoot td {
          background: #0b297a !important;
          color: #fff !important;
          border-color: #0b297a !important;
          padding: 5px 6px !important;
          text-align: center !important;
        }
        .soa-pdf-export .f-soa-payment-ledger-table tfoot td * { color: #fff !important; }
        .soa-pdf-export .f-soa-status-badge,
        .soa-pdf-export .f-soa-status-badge * {
          background: #f0fdf4 !important;
          color: #14532d !important;
          padding: 2px 6px !important;
          border-radius: 12px !important;
          font-size: 8.5px !important;
          font-weight: 600 !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 3px !important;
          border-color: #16a34a !important;
        }
        .soa-pdf-export .f-soa-footer-text { font-size: 10px !important; font-weight: 700 !important; text-transform: uppercase !important; color: #fff !important; }
        .soa-pdf-export .f-soa-footer-amount { font-size: 13px !important; font-weight: 800 !important; color: #fff !important; }
        .soa-pdf-export .f-soa-penalty-summary { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; border-bottom: 1px solid #94a3b8 !important; }
        .soa-pdf-export .f-soa-penalty-summary div {
          padding: 5px 7px !important;
          border-right: 1px solid #374151 !important;
          text-align: center !important;
        }
        .soa-pdf-export .f-soa-penalty-summary div:last-child { border-right: none !important; }
        .soa-pdf-export .f-soa-penalty-summary span,
        .soa-pdf-export .f-soa-penalty-footer span {
          display: block !important;
          color: #111827 !important;
          font-size: 7.8px !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          margin-bottom: 2px !important;
          line-height: 1.05 !important;
        }
        .soa-pdf-export .f-soa-penalty-summary strong { color: #0f172a !important; font-size: 9px !important; font-weight: 800 !important; }
        .soa-pdf-export .f-soa-penalty-meta {
          display: grid !important;
          grid-template-columns: repeat(3, 1fr) !important;
          gap: 6px !important;
          padding: 4px 7px !important;
          color: #111827 !important;
          font-size: 8.3px !important;
          font-weight: 800 !important;
          border-bottom: 1px solid #94a3b8 !important;
          text-align: center !important;
          line-height: 1.1 !important;
        }
        .soa-pdf-export .f-soa-penalty-table td:first-child span {
          display: block !important;
          color: #111827 !important;
          font-size: 7.8px !important;
          font-weight: 800 !important;
          margin-top: 1px !important;
          line-height: 1.12 !important;
        }
        .soa-pdf-export .f-soa-penalty-payment { color: #b91c1c !important; font-weight: 800 !important; }
        .soa-pdf-export .f-soa-penalty-footer {
          background: #0b297a !important;
          color: #fff !important;
          display: grid !important;
          grid-template-columns: repeat(3, 1fr) !important;
        }
        .soa-pdf-export .f-soa-penalty-footer div {
          padding: 6px 8px !important;
          border-right: 1px solid #374151 !important;
          text-align: center !important;
        }
        .soa-pdf-export .f-soa-penalty-footer div:last-child { border-right: none !important; }
        .soa-pdf-export .f-soa-penalty-footer span { color: #fff !important; }
        .soa-pdf-export .f-soa-penalty-footer strong { color: #fff !important; font-size: 12px !important; font-weight: 900 !important; }
        .soa-pdf-export .f-soa-photo-grid {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 10px !important;
          padding: 8px !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .soa-pdf-export .f-soa-photo-tile {
          border: 1.15px solid #4b5563 !important;
          border-radius: 4px !important;
          overflow: hidden !important;
          background: #fff !important;
          min-width: 0 !important;
        }
        .soa-pdf-export .f-soa-photo-label {
          display: block !important;
          background: #f8fafc !important;
          border-bottom: 1.15px solid #4b5563 !important;
          color: #061f66 !important;
          font-size: 8.5px !important;
          font-weight: 900 !important;
          padding: 4px 7px !important;
          text-transform: uppercase !important;
        }
        .soa-pdf-export .f-soa-photo-tile img,
        .soa-pdf-export .f-soa-photo-placeholder {
          align-items: center !important;
          background: #f8fafc !important;
          color: #475569 !important;
          display: flex !important;
          font-size: 9px !important;
          font-weight: 800 !important;
          height: 120px !important;
          justify-content: center !important;
          object-fit: contain !important;
          width: 100% !important;
        }
        .soa-pdf-export .f-soa-thank-you { text-align: center !important; margin-top: 10px !important; }
        .soa-pdf-export .f-soa-thank-you p {
          color: #0b297a !important;
          font-style: italic !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          line-height: 1.25 !important;
          margin: 0 !important;
        }
      `;
      exportRoot.prepend(pdfStyle);

      const exportHost = document.createElement('div');
      exportHost.className = 'soa-print-statement';
      exportHost.style.position = 'fixed';
      exportHost.style.left = '-10000px';
      exportHost.style.top = '0';
      exportHost.style.width = '8.5in';
      exportHost.style.background = '#ffffff';
      exportHost.appendChild(exportRoot);
      document.body.appendChild(exportHost);

      html2pdf()
        .set({
          margin: [0.3, 0.3, 0.3, 0.45],
          filename: `Statement_of_Account_${loan.loan_code || 'loan'}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'in', format: [8.5, 13], orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        })
        .from(exportRoot)
        .save()
        .finally(() => {
          exportHost.remove();
          suppressNextPrintRef.current = false;
          setPrintModeLoan(null);
        });
    }, 250);
  };
  const getPenaltyComputation = (loan) => {
    const dueDate = parseLocalDate(loan?.date_maturity);
    const datePrepared = new Date();
    const principal = Number(loan?.principal || 0);
    const interestAmount = Number(loan?.interest_amount || 0);
    const registeredOutstanding = Number(loan?.total_amortization || 0) || principal + interestAmount || Number(loan?.balance || 0);
    const payments = getLoanPayments(loan);

    if (!dueDate) {
      return {
        dueDate,
        datePrepared,
        registeredOutstanding,
        paymentsBeforeDue: 0,
        beginningOverdueBalance: registeredOutstanding,
        rows: [],
        remainingOverdueBalance: registeredOutstanding,
        totalPenalty: 0,
        updatedAmountDue: registeredOutstanding
      };
    }

    const paymentsBeforeDue = payments
      .filter(p => p.paidDate <= dueDate)
      .reduce((sum, p) => sum + p.amount, 0);
    let beginningBalance = Math.max(0, registeredOutstanding - paymentsBeforeDue);
    const monthlyPeriods = [];
    const rows = [];
    let totalPenalty = 0;

    if (beginningBalance > 0 && datePrepared > dueDate) {
      let periodStart = new Date(dueDate);
      while (periodStart < datePrepared) {
        const nextBoundary = addMonths(periodStart, 1);
        const periodEnd = nextBoundary < datePrepared ? addDays(nextBoundary, -1) : new Date(datePrepared);
        const paymentMade = payments
          .filter(p => p.paidDate > periodStart && p.paidDate <= periodEnd)
          .reduce((sum, p) => sum + p.amount, 0);

        monthlyPeriods.push({
          periodStart,
          periodEnd,
          paymentMade
        });

        periodStart = nextBoundary;
      }

      let groupStartIndex = 0;
      for (let index = 0; index < monthlyPeriods.length; index += 1) {
        const period = monthlyPeriods[index];
        const isFirstMonth = index === 0;
        const hasPayment = period.paymentMade > 0;
        const isLastMonth = index === monthlyPeriods.length - 1;

        if (!isFirstMonth && !hasPayment && !isLastMonth) continue;

        const groupPeriods = monthlyPeriods.slice(groupStartIndex, index + 1);
        const paymentMade = groupPeriods.reduce((sum, item) => sum + item.paymentMade, 0);
        const penaltyBase = Math.max(0, beginningBalance - paymentMade);
        const monthlyPenalty = penaltyBase * 0.05;
        const months = groupPeriods.length;
        const penaltySubtotal = monthlyPenalty * months;

        rows.push({
          periodNo: rows.length + 1,
          periodStart: groupPeriods[0].periodStart,
          periodEnd: groupPeriods[groupPeriods.length - 1].periodEnd,
          beginningBalance,
          paymentMade,
          penaltyBase,
          monthlyPenalty,
          months,
          penaltySubtotal
        });

        totalPenalty += penaltySubtotal;
        beginningBalance = penaltyBase;
        groupStartIndex = index + 1;
        if (beginningBalance <= 0) break;
      }
    }

    return {
      dueDate,
      datePrepared,
      registeredOutstanding,
      paymentsBeforeDue,
      beginningOverdueBalance: Math.max(0, registeredOutstanding - paymentsBeforeDue),
      rows,
      remainingOverdueBalance: beginningBalance,
      totalPenalty,
      updatedAmountDue: beginningBalance + totalPenalty
    };
  };

  return (
    <div className="customers-v2-container">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px 0' }}>Customers</h1>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Metrics Row */}
      <div className="metrics-v2-row">
        <div className="metric-v2-card">
          <div className="metric-v2-icon-wrap purple">
            <Users size={24} />
          </div>
          <div className="metric-v2-content">
            <div className="metric-v2-title">Total Customers</div>
            <div className="metric-v2-value">{metrics ? metrics.total_customers.toLocaleString() : '...'}</div>
            <div className="metric-v2-sub text-green">↑ {metrics ? metrics.new_this_month : 0} this month</div>
          </div>
          <div className="metric-v2-chart-icon"><BarChart2 size={16} /></div>
        </div>

        <div className="metric-v2-card active-card">
          <div className="metric-v2-icon-wrap green">
            <CheckCircle size={24} />
          </div>
          <div className="metric-v2-content">
            <div className="metric-v2-title">Active Customers</div>
            <div className="metric-v2-value">{metrics ? metrics.active_customers.toLocaleString() : '...'}</div>
            <div className="metric-v2-sub text-gray">
              {metrics && metrics.total_customers > 0 ? Math.round((metrics.active_customers / metrics.total_customers) * 100) : 0}% of total
            </div>
          </div>
          <div className="metric-v2-chart-icon"><BarChart2 size={16} /></div>
        </div>

        <div className="metric-v2-card">
          <div className="metric-v2-icon-wrap red">
            <XCircle size={24} />
          </div>
          <div className="metric-v2-content">
            <div className="metric-v2-title">Inactive Customers</div>
            <div className="metric-v2-value">{metrics ? metrics.inactive_customers.toLocaleString() : '...'}</div>
            <div className="metric-v2-sub text-gray">
              {metrics && metrics.total_customers > 0 ? Math.round((metrics.inactive_customers / metrics.total_customers) * 100) : 0}% of total
            </div>
          </div>
          <div className="metric-v2-chart-icon"><BarChart2 size={16} /></div>
        </div>

        <div className="metric-v2-card">
          <div className="metric-v2-icon-wrap blue">
            <Calendar size={24} />
          </div>
          <div className="metric-v2-content">
            <div className="metric-v2-title">New This Month</div>
            <div className="metric-v2-value">{metrics ? metrics.new_this_month.toLocaleString() : '...'}</div>
            <div className="metric-v2-sub text-green">↑ {metrics ? metrics.new_this_month : 0} vs last month</div>
          </div>
          <div className="metric-v2-chart-icon"><BarChart2 size={16} /></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar-v2">
        <div className="toolbar-v2-left">
          <div className="toolbar-v2-search">
            <Search />
            <input placeholder="Search customers..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="toolbar-v2-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Status: All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="hold">Hold</option>
            <option value="reversed">Reversed</option>
          </select>
          <button className="toolbar-v2-btn toolbar-v2-btn-outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} /> More Filters
          </button>
        </div>
        <div className="toolbar-v2-right">
          <button className="toolbar-v2-btn toolbar-v2-btn-outline" onClick={handlePrint}>
            <FileText size={16} /> Export PDF
          </button>
          <button className="toolbar-v2-btn toolbar-v2-btn-primary" onClick={openNew}>
            <Plus size={16} /> New Customer
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="more-filters-bar" style={{ display: 'flex', gap: '15px', padding: '15px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <div className="filter-group">
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>Branch</label>
            <select className="toolbar-select" value={branchFilter} onChange={e => { setBranchFilter(e.target.value); setPage(1); }} style={{ width: '200px' }}>
              <option value="">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.branch_name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', display: 'block', marginBottom: '4px' }}>Collector</label>
            <select className="toolbar-select" value={collectorFilter} onChange={e => { setCollectorFilter(e.target.value); setPage(1); }} style={{ width: '200px' }}>
              <option value="">All Collectors</option>
              {collectors.map(c => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>
          <div className="filter-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setBranchFilter(''); setCollectorFilter(''); }}>Clear</button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="table-v2-container">
        <table className="table-v2">
          <thead>
            <tr>
              <th>CUSTOMER</th>
              <th>CONTACT INFO</th>
              <th>LOCATION</th>
              <th>COLLECTOR</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{textAlign:'center', padding: '40px'}}>⏳ Loading...</td></tr>
              : currentRows.length === 0 ? <tr><td colSpan={6} style={{textAlign:'center', padding: '40px', color: '#64748b'}}>No customers found</td></tr>
              : currentRows.map(r => {
                const initials = (r.first_name?.[0] || '') + (r.last_name?.[0] || '');
                const cleanInitials = initials || r.full_name?.substring(0, 2).toUpperCase() || 'AJ';
                
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="cell-customer">
                        <div className="avatar-v2">{cleanInitials}</div>
                        <div>
                          <div className="customer-name-v2">{r.full_name}</div>
                          <div className="customer-id-v2">#{r.customer_code}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-info-row">
                        <Phone />
                        {r.contact || 'NONE'}
                      </div>
                      <div className="cell-info-row">
                        <Mail />
                        {r.email || 'NONE'}
                      </div>
                    </td>
                    <td>
                      <div className="cell-info-row" style={{ alignItems: 'flex-start' }}>
                        <MapPin style={{ marginTop: '2px' }} />
                        <div style={{ maxWidth: '200px', lineHeight: '1.4' }}>{[r.address, r.sitio, r.purok, r.brgy, r.city, r.province].filter(Boolean).join(', ') || '—'}</div>
                      </div>
                    </td>
                    <td>
                      <div className="cell-info-row">
                        <User />
                        {r.collector_name || 'Unassigned'}
                      </div>
                    </td>
                    <td>
                      <div className={`cell-status ${r.display_status?.toLowerCase().replace(' ', '') || r.status?.toLowerCase().replace(' ', '') || 'inactive'}`}>
                        <div className={`status-dot ${r.display_status?.toLowerCase().replace(' ', '') || r.status?.toLowerCase().replace(' ', '') || 'inactive'}`}></div>
                        {r.display_status || r.status || 'Unknown'}
                      </div>
                    </td>
                    <td>
                      <div className="cell-actions">
                        <button className="btn-soa-v2" onClick={() => openSoa(r.id)}>SOA</button>
                        <button className="btn-soa-v2" onClick={() => openEdit(r)}>
                          Edit Information
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
          <div className="soa-modal-v2">
            <div className="soa-header-v2">
              <div className="soa-header-left-v2">
                <div className="soa-icon-box-v2">
                  <FileText size={28} />
                  SOA
                </div>
                <div>
                  <h2 className="soa-title-v2">Statement of Account</h2>
                  <p className="soa-subtitle-v2">Official statement of your account with Melann Lending</p>
                </div>
              </div>
              <div className="soa-header-right-v2">
                <button className="soa-close-icon" onClick={() => setSoaModal(false)}><X size={24} /></button>
                <div className="soa-date-v2">Date: <span>{new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</span></div>
                <div className="soa-preview-note-v2">Print preview: Legal portrait, 1 page expected</div>
              </div>
            </div>

            <div className="soa-body-v2" id="printable-area">
              {soaLoading ? <div className="text-center" style={{ padding: 40 }}>Loading SOA Data...</div> : soaData ? (() => {
                const loans = soaData.loans || [];
                const loanCycleMap = new Map([...loans]
                  .sort((a, b) => String(a.date_released || a.created_at || '').localeCompare(String(b.date_released || b.created_at || '')) || Number(a.id || 0) - Number(b.id || 0))
                  .map((loan, index) => [loan.id, index + 1]));
                const validLoans = loans.filter(l => ['active', 'pastdue', 'fullpaid'].includes(l.status));
                const activeLoans = loans.filter(l => ['active', 'pastdue'].includes(l.status));
                const currentLoan = printModeLoan || activeLoans[0] || validLoans[0] || loans[0] || {};
                const sortedPayments = soaData.payments
                  ? [...soaData.payments]
                      .filter(p => (printModeLoan ? p.loan_code === printModeLoan.loan_code : true) && isGoodPayment(p))
                      .sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid))
                  : [];
                const printLedgerPayments = [...sortedPayments].sort((a, b) => new Date(a.date_paid) - new Date(b.date_paid));
                const totalLoanAmt = printModeLoan ? Number(currentLoan.total_amortization || currentLoan.principal || 0) : validLoans.reduce((sum, l) => sum + Number(l.total_amortization || l.principal || 0), 0);
                const outstandingBal = printModeLoan ? Number(currentLoan.balance || 0) : activeLoans.reduce((sum, l) => sum + Number(l.balance || 0), 0);
                const totalRunningBalance = printLedgerPayments.length > 0 ? Number(printLedgerPayments[printLedgerPayments.length - 1].balance_after || 0) : outstandingBal;
                const totalPaid = sortedPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
                const lastPayment = sortedPayments.length > 0 ? new Date(sortedPayments[0].date_paid).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '-';
                const nextDueDate = (printModeLoan ? [printModeLoan] : activeLoans).length > 0 && (printModeLoan || activeLoans[0]).date_maturity ? new Date((printModeLoan || activeLoans[0]).date_maturity).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '-';
                const memberSince = soaData.created_at ? new Date(soaData.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : '-';
                const accountStatus = (currentLoan.id ? getLoanStatusLabel(currentLoan) : soaData.status) || '-';
                const soaNumber = `SOA-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${soaData.customer_code || soaData.id}`;
                const penaltyComputation = getPenaltyComputation(currentLoan);
                const profileSections = [
                  { title: 'Personal Information', fields: [['Customer Code', soaData.customer_code], ['Classification', soaData.customer_classification], ['Full Name', soaData.full_name], ['Gender', soaData.gender], ['Birth Date', soaData.birth_date], ['Civil Status', soaData.civil_status], ['Nationality', soaData.nationality], ['Status', soaData.status]] },
                  { title: 'Address Information', fields: [['Address', [soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ')], ['Province', soaData.province], ['Zip Code', soaData.zip_code], ['Home Status', soaData.home_status]] },
                  { title: 'Contact Information', fields: [['Main Contact', soaData.contact], ['Secondary Contact', soaData.secondary_contact], ['Email', soaData.email], ['Facebook', soaData.fb_account]] },
                  { title: 'Business Information', fields: [['Business Type', soaData.business_type], ['Occupation', soaData.occupation], ['Business Name', soaData.business_name], ['Monthly Income', soaData.income_per_month ? formatPhp(soaData.income_per_month) : ''], ['Monthly Expense', soaData.expenses_per_month ? formatPhp(soaData.expenses_per_month) : ''], ['Loan Purpose', soaData.loan_purpose], ['Collateral', soaData.collateral], ['Branch', soaData.branch_name], ['Collector', soaData.collector_name]] },
                  { title: 'ID Information', fields: [['ID Type', soaData.id_type], ['ID Number', soaData.id_number], ['Issue Date', soaData.id_issue_date], ['Expiry Date', soaData.id_expiry_date], ['Issued By', soaData.id_issued_by], ['Place of Issue', soaData.id_place_of_issue]] },
                ];
                
                const initials = (soaData.first_name?.[0] || '') + (soaData.last_name?.[0] || '');
                const cleanInitials = initials || soaData.full_name?.substring(0, 2).toUpperCase() || 'AJ';

                return (
                  <>
                  <style media="print">{`@page { size: ${soaTab === 'profile' ? '13in 8.5in' : '8.5in 13in'}; margin: ${soaTab === 'profile' ? '0.25in 0.12in 0.25in 0.35in' : '0.3in 0.3in 0.3in 0.45in'}; }`}</style>
                  <div className="printable-soa-wrapper">
                    <div className="soa-brand-v2">
                      <div>
                        <h2 className="soa-brand-name-v2">MELANN LENDING</h2>
                        <p className="soa-brand-sub-v2">STATEMENT OF ACCOUNT</p>
                      </div>
                      <div className="soa-actions-v2 screen-only">
                        <button className="soa-btn-outline-v2" onClick={() => setSoaModal(false)}>
                          Back
                        </button>
                        <button className="soa-btn-primary-v2" onClick={() => window.print()}>
                          <Printer size={16} /> Print
                        </button>
                      </div>
                    </div>

                    <div className="soa-tabs-v2 screen-only">
                      {[['summary', 'Summary', PieChart], ['profile', 'Profile', User], ['history', 'Loans & Payments History', List]].map(([id, label, Icon]) => (
                        <button key={id} type="button" className={`soa-tab-v2 ${soaTab === id ? 'active' : ''}`} onClick={() => setSoaTab(id)}>
                          <Icon size={18} /> {label}
                        </button>
                      ))}
                    </div>

                    {soaTab === 'summary' && (
                      <>
                        <div className="soa-card-v2 print-card">
                          <div className="soa-cust-info-v2">
                            <div className="soa-avatar-v2">
                              {soaData.photo_client ? (
                                <img src={getImageUrl(soaData.photo_client)} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                              ) : cleanInitials}
                            </div>
                            <div className="soa-info-grid-v2">
                              <div>
                                <div className="soa-label-v2">Customer Name</div>
                                <div className="soa-val-v2">{soaData.full_name} <CheckCircle size={16} color="#eab308" fill="#fef08a" /></div>
                                <div className="soa-label-v2">Contact</div>
                                <div className="soa-val-sub-v2"><Phone size={14} /> {soaData.contact || 'NONE'}</div>
                              </div>
                              <div>
                                <div className="soa-label-v2">Customer Code</div>
                                <div className="soa-val-v2" style={{ fontSize: 18 }}>{soaData.customer_code}</div>
                                <div className="soa-label-v2">Customer Status</div>
                                {(() => {
                                  const cstat = getCalculatedCustomerStatus(soaData) || 'Active';
                                  const cclass = cstat.toLowerCase().replace(' ', '');
                                  return (
                                    <div className={`soa-status-badge-v2 ${cclass}`}>
                                      <div className={`dot ${cclass}`}></div> {cstat}
                                    </div>
                                  );
                                })()}
                              </div>
                              <div>
                                <div className="soa-label-v2">Address</div>
                                <div className="soa-val-v2" style={{ fontSize: 14, lineHeight: 1.4 }}>{[soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ') || '-'}</div>
                                <div className="soa-label-v2">Member Since</div>
                                <div className="soa-val-sub-v2"><CalendarDays size={14} /> {memberSince}</div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="soa-divider-v2"></div>
                          
                          <div className="soa-chart-v2">
                            <div className="soa-chart-label-v2">OUTSTANDING BALANCE</div>
                            <div className="donut-v2">
                              <div className="donut-inner-v2">
                                <div className="donut-val-v2">{formatPhp(outstandingBal)}</div>
                                <div className="donut-sub-v2">As of {new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div>
                              </div>
                              <div className="donut-dot-v2"></div>
                            </div>
                          </div>
                        </div>

                        <div className="soa-metrics-row-v2 print-card">
                          <div className="soa-metric-card-v2 blue">
                            <div className="soa-metric-icon-v2"><Wallet size={24} /></div>
                            <div>
                              <div className="soa-metric-label-v2">Total Loan Amount</div>
                              <div className="soa-metric-val-v2">{formatPhp(totalLoanAmt)}</div>
                            </div>
                          </div>
                          <div className="soa-metric-card-v2 green">
                            <div className="soa-metric-icon-v2"><CheckCircle size={24} /></div>
                            <div>
                              <div className="soa-metric-label-v2">Total Paid</div>
                              <div className="soa-metric-val-v2 green">{formatPhp(totalPaid)}</div>
                            </div>
                          </div>
                          <div className="soa-metric-card-v2 purple">
                            <div className="soa-metric-icon-v2"><Scale size={24} /></div>
                            <div>
                              <div className="soa-metric-label-v2">Outstanding Balance</div>
                              <div className="soa-metric-val-v2 blue">{formatPhp(outstandingBal)}</div>
                            </div>
                          </div>
                          <div className="soa-metric-card-v2 orange">
                            <div className="soa-metric-icon-v2"><FileText size={24} /></div>
                            <div>
                              <div className="soa-metric-label-v2">Total Payments</div>
                              <div className="soa-metric-val-v2 orange">{sortedPayments.length}</div>
                            </div>
                          </div>
                          <div className="soa-metric-card-v2 pink">
                            <div className="soa-metric-icon-v2"><CalendarDays size={24} /></div>
                            <div>
                              <div className="soa-metric-label-v2">Last Payment</div>
                              <div className="soa-metric-val-v2 pink" style={{ fontSize: 16 }}>{lastPayment}</div>
                            </div>
                          </div>
                        </div>

                        <div className="soa-due-card-v2 print-card">
                          <div className="soa-due-icon-v2"><CalendarClock size={24} /></div>
                          <div className="soa-due-content-v2">
                            <div className="label">Next Due Date</div>
                            <div className="val">{nextDueDate}</div>
                          </div>
                          <div className="soa-due-divider"></div>
                          <div className="soa-due-text">Stay on track! You have an upcoming due date.</div>
                          
                          <svg className="soa-due-bg-waves" width="400" height="100" viewBox="0 0 400 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 60C100 60 150 20 250 20C350 20 400 80 400 80" stroke="#bfdbfe" strokeWidth="2"/>
                            <path d="M0 80C120 80 180 40 280 40C380 40 400 60 400 60" stroke="#bfdbfe" strokeWidth="1"/>
                          </svg>
                        </div>

                        {currentLoan.remarks && (
                          <div className="soa-card-v2 print-card" style={{ padding: 18, marginTop: 16 }}>
                            <div className="soa-label-v2">Manager Note / Loan Remarks</div>
                            <div className="soa-val-v2" style={{ fontSize: 14, lineHeight: 1.5, alignItems: 'flex-start' }}>{currentLoan.remarks}</div>
                          </div>
                        )}

                        <div className="soa-alert-v2 screen-only">
                          <div className="soa-alert-icon-v2"><Info size={16} /></div>
                          <div className="soa-alert-text-v2">Thank you for keeping your account active. For any concerns, please contact your collector or visit our office.</div>
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

                        <section className="soa-profile-section" style={{ marginTop: '24px', gridColumn: '1 / -1' }}>
                          <h4>ID AND PHOTO ATTACHMENTS</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '12px' }}>
                            {[
                              ['Client Photo', soaData.photo_client],
                              ['ID Front', soaData.photo_id_front],
                              ['ID Back', soaData.photo_id_back],
                              ['Business Proof / Store', soaData.photo_business_proof],
                            ].map(([label, path]) => (
                              <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#fff' }}>
                                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b', marginBottom: '8px' }}>{label}</div>
                                {path ? (
                                  <img src={getImageUrl(path)} alt={label} style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px' }} />
                                ) : (
                                  <div style={{ width: '100%', height: '150px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', borderRadius: '4px', fontSize: '14px' }}>No image</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    )}

                    {soaTab === 'history' && (
                      <div className="soa-card">
                        <div className="soa-list-card-header"><div className="soa-list-title">Loans & Payments History</div></div>
                        {loans.length > 0 ? (<table className="data-table" style={{ fontSize: 13 }}><thead><tr><th>Cycle Count</th><th>Loan Code</th><th>Type</th><th>Date Released</th><th>Maturity</th><th>Period</th><th>Principal</th><th>Interest Rate</th><th>Interest Amount</th><th>Total Loan</th><th>Amortization</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loans.map(l => (<tr key={l.id} onClick={() => setSelectedLoanForPayments(l)} style={{ cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}><td><span className="badge badge-cycle">Cycle {loanCycleMap.get(l.id) || '-'}</span></td><td className="mono" style={{color: '#2563eb', fontWeight: '600'}} title="View payment history for this loan">{l.loan_code}</td><td>
  {l.loan_type || '-'}
  {String(l.status).toLowerCase() === 'reversed' && <span style={{ color: '#ef4444', marginLeft: '6px', fontWeight: 'bold', fontSize: '11px' }}>(REVERSED)</span>}
</td><td>{l.date_released || '-'}</td><td>{l.date_maturity || '-'}</td><td>{l.loan_period || 0} Days</td><td>{formatPhp(l.principal)}</td><td>{l.interest_rate || 0}%</td><td>{formatPhp(l.interest_amount)}</td><td>{formatPhp(l.total_amortization)}</td><td>{formatPhp(l.amortization)}</td><td>{formatPhp(l.balance)}</td><td><span className={`badge badge-${getLoanStatusClass(l)}`}>{getLoanStatusLabel(l)}</span></td><td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="action-btn" onClick={(e) => { e.stopPropagation(); setPrintModeLoan(l); }}><i className="bi bi-printer"></i> Print</button><button className="action-btn" style={{ borderColor: '#fecaca', color: '#dc2626', background: '#fff5f5' }} onClick={(e) => { e.stopPropagation(); setLoanDeleteTarget(l); }}><i className="bi bi-trash"></i> Delete</button></div></td></tr>))}</tbody></table>) : (<div className="soa-empty-state"><div className="soa-empty-title">No loans found.</div><div className="soa-empty-sub">There are no loan records associated with this account.</div></div>)}
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
                          <div className="f-soa-contact">
                            <p><i className="bi bi-geo-alt-fill"></i> <span>Lot 3 Blk 2, Brgy. San Isidro<br/>Ormoc City</span></p>
                            <p style={{marginTop: '4px'}}><i className="bi bi-telephone-fill"></i> <span>Contact No.: 09171131000</span></p>
                          </div>
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

                    <div className="f-soa-title-wrapper">
                      <div className="f-soa-title-line"></div>
                      <div className="f-soa-title-dot"></div>
                      <h1 className="f-soa-title">STATEMENT OF ACCOUNT</h1>
                      <div className="f-soa-title-dot"></div>
                      <div className="f-soa-title-line"></div>
                    </div>

                    {loans.length > 0 && (
                      <div className="f-soa-section">
                        <div className="f-soa-sec-header">
                          <i className="bi bi-file-earmark-text"></i> LOAN INFORMATION
                        </div>
                        <div className="f-soa-sec-body f-soa-loan-info">
                          <div className="f-soa-grid-3">
                            <table>
                              <tbody>
                                <tr><td>Customer Code</td><td>:</td><td className="fw-bold">{soaData.customer_code}</td></tr>
                                <tr><td>Customer Name</td><td>:</td><td className="fw-bold text-uppercase">{soaData.full_name}</td></tr>
                                <tr><td colSpan="3" style={{height:'15px'}}></td></tr>
                                <tr><td>Loan Code</td><td>:</td><td>{currentLoan.loan_code || '-'}</td></tr>
                                <tr><td>Loan Type</td><td>:</td><td className="text-uppercase">{currentLoan.loan_type || '-'}</td></tr>
                                <tr><td>Date Released</td><td>:</td><td>{formatDateLong(currentLoan.date_released)}</td></tr>
                              </tbody>
                            </table>
                            <table>
                              <tbody>
                                <tr><td>Principal Amount</td><td>:</td><td className="fw-bold">{formatMoney(currentLoan.principal)}</td></tr>
                                <tr><td>Interest Rate</td><td>:</td><td>{currentLoan.interest_rate || 0}%</td></tr>
                                <tr><td colSpan="3" style={{height:'15px'}}></td></tr>
                                <tr><td>Loan Term</td><td>:</td><td>{currentLoan.loan_period || 0} Days</td></tr>
                                <tr><td>Maturity Date</td><td>:</td><td className="fw-bold">{formatDateLong(currentLoan.date_maturity)}</td></tr>
                                <tr><td>Daily Payment</td><td>:</td><td className="fw-bold">{formatMoney(currentLoan.amortization)}</td></tr>
                              </tbody>
                            </table>
                            <table className="f-soa-no-border">
                              <tbody>
                                <tr><td>Payment Frequency</td><td>:</td><td>Daily</td></tr>
                                <tr><td>Purpose</td><td>:</td><td>{currentLoan.purpose || soaData.loan_purpose || '-'}</td></tr>
                                <tr><td>Manager Note</td><td>:</td><td>{currentLoan.remarks || '-'}</td></tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="f-soa-section">
                      <div className="f-soa-sec-header">
                        <i className="bi bi-receipt"></i> PAYMENT HISTORY (LEDGER)
                      </div>
                      <div className="f-soa-sec-body f-soa-no-pad">
                        <table className="f-soa-ledger-table-new f-soa-payment-ledger-table">
                          <thead>
                            <tr>
                              <th><i className="bi bi-calendar3"></i> DATE</th>
                              <th><i className="bi bi-tags-fill"></i> PAYMENT CODE</th>
                              <th><i className="bi bi-coin"></i> PAYMENTS</th>
                              <th><i className="bi bi-scales"></i> RUNNING BALANCE</th>
                              <th><i className="bi bi-flag-fill"></i> STATUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {printLedgerPayments.length > 0 ? printLedgerPayments.map((p, index) => (
                              <tr key={p.id} className={index % 2 === 0 ? 'f-soa-row-even' : 'f-soa-row-odd'}>
                                <td>{formatDateNumeric(p.date_paid)}</td>
                                <td>{formatPaymentCode(p)}</td>
                                <td className="fw-bold">{formatMoney(p.amount_paid)}</td>
                                <td>{formatMoney(p.balance_after)}</td>
                                <td><span className="f-soa-status-badge"><i className="bi bi-check2"></i> Active</span></td>
                              </tr>
                            )) : (
                              <tr><td colSpan="5" className="f-soa-empty">No payments found.</td></tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td></td>
                              <td></td>
                              <td>
                                <div className="f-soa-footer-text">TOTAL PAYMENTS RECEIVED</div>
                                <div className="f-soa-footer-amount">{formatMoney(totalPaid)}</div>
                              </td>
                              <td>
                                <div className="f-soa-footer-text">TOTAL RUNNING BALANCE</div>
                                <div className="f-soa-footer-amount">{formatMoney(totalRunningBalance)}</div>
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    <div className="f-soa-section screen-only" style={{marginBottom: 0}}>
                      <div className="f-soa-sec-header">
                        <i className="bi bi-calculator"></i> PENALTY COMPUTATION
                      </div>
                      <div className="f-soa-sec-body f-soa-no-pad">
                        <div className="f-soa-penalty-summary">
                          <div>
                            <span>Outstanding Balance</span>
                            <strong>{formatMoneyExact(penaltyComputation.registeredOutstanding)}</strong>
                          </div>
                          <div>
                            <span>Paid On/Before Due</span>
                            <strong>{formatMoneyExact(penaltyComputation.paymentsBeforeDue)}</strong>
                          </div>
                          <div>
                            <span>Beginning Overdue</span>
                            <strong>{formatMoneyExact(penaltyComputation.beginningOverdueBalance)}</strong>
                          </div>
                          <div>
                            <span>Penalty Rate</span>
                            <strong>5% Monthly</strong>
                          </div>
                        </div>
                        <div className="f-soa-penalty-meta">
                          <span><b>Due Date:</b> {formatDateLong(currentLoan.date_maturity)}</span>
                          <span><b>Date Prepared:</b> {formatDateLong(penaltyComputation.datePrepared)}</span>
                          <span><b>Method:</b> Non-compounding</span>
                        </div>
                        <table className="f-soa-ledger-table-new f-soa-penalty-table">
                          <thead>
                            <tr>
                              <th>PERIOD</th>
                              <th>BEGINNING BALANCE</th>
                              <th>PAYMENT MADE</th>
                              <th>PENALTY BASE</th>
                              <th>NO. OF MONTHS</th>
                              <th>MONTHLY PENALTY (5%)</th>
                              <th>PENALTY SUBTOTAL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {penaltyComputation.rows.length > 0 ? penaltyComputation.rows.map((row, index) => (
                              <tr key={row.periodNo} className={index % 2 === 0 ? 'f-soa-row-even' : 'f-soa-row-odd'}>
                                <td>
                                  Period {row.periodNo}
                                  <span>{formatDateShort(row.periodStart)} - {formatDateShort(row.periodEnd)}</span>
                                </td>
                                <td>{formatMoneyExact(row.beginningBalance)}</td>
                                <td className={row.paymentMade > 0 ? 'f-soa-penalty-payment' : ''}>{formatMoneyExactDeduction(row.paymentMade)}</td>
                                <td className="fw-bold">{formatMoneyExact(row.penaltyBase)}</td>
                                <td>{row.months}</td>
                                <td>{formatMoneyExact(row.monthlyPenalty)}</td>
                                <td className="fw-bold">{formatMoneyExact(row.penaltySubtotal)}</td>
                              </tr>
                            )) : (
                              <tr><td colSpan="7" className="f-soa-empty">No penalty period to compute yet.</td></tr>
                            )}
                          </tbody>
                        </table>
                        <div className="f-soa-penalty-footer">
                          <div>
                            <span>Remaining Overdue Balance</span>
                            <strong>{formatMoneyExact(penaltyComputation.remainingOverdueBalance)}</strong>
                          </div>
                          <div>
                            <span>Total Penalty</span>
                            <strong>{formatMoneyExact(penaltyComputation.totalPenalty)}</strong>
                          </div>
                          <div>
                            <span>Updated Amount Due</span>
                            <strong>{formatMoneyExact(penaltyComputation.updatedAmountDue)}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="f-soa-section" style={{marginBottom: 0}}>
                      <div className="f-soa-sec-header">
                        <i className="bi bi-images"></i> CLIENT PHOTOS
                      </div>
                      <div className="f-soa-sec-body f-soa-no-pad">
                        <div className="f-soa-photo-grid">
                          <div className="f-soa-photo-tile">
                            <span className="f-soa-photo-label">Face ID</span>
                            {soaData.photo_client ? (
                              <img src={getImageUrl(soaData.photo_client)} alt="Client Face ID" />
                            ) : (
                              <div className="f-soa-photo-placeholder">No Face ID Photo</div>
                            )}
                          </div>
                          <div className="f-soa-photo-tile">
                            <span className="f-soa-photo-label">Store / Business Photo</span>
                            {soaData.photo_business_proof ? (
                              <img src={getImageUrl(soaData.photo_business_proof)} alt="Store or Business" />
                            ) : (
                              <div className="f-soa-photo-placeholder">No Store Photo</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="f-soa-thank-you">
                      <p>Thank you for your prompt payments.<br/>We are here to serve you better.</p>
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

      {/* Payment Ledger Modal - Redesigned to match reference exactly */}
      {selectedLoanForPayments && (
        <div className="modal-overlay" style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '20px' }} onClick={() => { setSelectedLoanForPayments(null); setPenaltyLoan(null); }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                  type="button"
                  onClick={() => exportPaymentHistory(selectedLoanForPayments)}
                  style={{ background: '#f0fdf4', color: '#16a34a', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#dcfce7'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f0fdf4'}
                >
                  <i className="bi bi-file-earmark-pdf"></i> Export PDF
                </button>
                <button 
                  onClick={() => setPrintModeLoan(selectedLoanForPayments)} 
                  style={{ background: '#eff6ff', color: '#2563eb', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
                  onMouseLeave={e => e.currentTarget.style.background = '#eff6ff'}
                >
                  <i className="bi bi-printer"></i> Print Statement
                </button>
                <button onClick={() => { setSelectedLoanForPayments(null); setPenaltyLoan(null); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '28px', cursor: 'pointer', padding: '4px', lineHeight: '1' }}>&times;</button>
              </div>
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
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '18px', flexShrink: 0 }}>
                        <i className="bi bi-info-circle"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>STATUS</div>
                        {(() => {
                          const statusText = (getLoanStatusLabel ? getLoanStatusLabel(selectedLoanForPayments) : selectedLoanForPayments.status || 'UNKNOWN').toUpperCase();
                          
                          let bg = '#f1f5f9';
                          let color = '#64748b';
                          
                          if (statusText === 'RELOAN') { bg = '#dcfce7'; color = '#16a34a'; } // Green
                          else if (statusText === 'OVERDUE') { bg = '#ffedd5'; color = '#ea580c'; } // Orange
                          else if (statusText === 'RECON') { bg = '#dbeafe'; color = '#2563eb'; } // Blue
                          else if (statusText === 'PASTDUE' || statusText === 'PAST DUE') { bg = '#fee2e2'; color = '#ef4444'; } // Red
                          else if (statusText === 'FULLY PAID' || statusText === 'FULLPAID') { bg = '#f3e8ff'; color = '#9333ea'; } // Violet
                          else if (statusText === 'NEW') { bg = '#e0e7ff'; color = '#4f46e5'; } // Indigo

                          return (
                            <span style={{ 
                              display: 'inline-block',
                              padding: '4px 12px',
                              borderRadius: '20px',
                              backgroundColor: bg,
                              color: color,
                              fontSize: '12px',
                              fontWeight: '700',
                              letterSpacing: '0.5px'
                            }}>
                              {statusText}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Payment History Section Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <i className="bi bi-file-text" style={{ color: '#2563eb', fontSize: '20px' }}></i>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENT HISTORY</h3>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
                <button
                  type="button"
                  onClick={() => setPenaltyLoan(selectedLoanForPayments)}
                  style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ffedd5'; e.currentTarget.style.borderColor = '#fdba74'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.borderColor = '#fed7aa'; }}
                >
                  <i className="bi bi-calculator"></i> View Penalty
                </button>
              </div>

              {/* Payment History Logic */}
              {(() => {
                const loanPayments = getPaymentHistoryRows(selectedLoanForPayments);
                const validPayments = loanPayments.filter(p => isGoodPayment(p));
                const totalPaid = validPayments.reduce((sum, p) => sum + Number(p.amount_paid || 0), 0);
                const totalPayable = Number(selectedLoanForPayments.total_amortization || selectedLoanForPayments.principal);
                const paymentRate = totalPayable > 0 ? Math.min(100, (totalPaid / totalPayable) * 100).toFixed(2) : 0;
                const lastPaymentDate = validPayments.length > 0 ? validPayments[0].date_paid : '-';

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
                              const isReversed = p.status === 'reversed';
                              const isPenalty = p.status === 'penalty';
                              const isFullyPaid = p.status === 'active' && Number(p.balance_after) <= 0; 
                              const isPartial = p.status === 'active' && Number(p.balance_after) > 0;
                              
                              // Pill styles
                              let pillBg = '#f1f5f9', pillColor = '#64748b', pillIcon = 'bi-circle';
                              let statusText = getPaymentStatusText(p);
                              
                              if (isReversed) { pillBg = '#fee2e2'; pillColor = '#ef4444'; pillIcon = 'bi-x-circle'; }
                              else if (isPenalty) { pillBg = '#fef3c7'; pillColor = '#b45309'; pillIcon = 'bi-exclamation-circle'; }
                              else if (isFullyPaid) { pillBg = '#f3e8ff'; pillColor = '#9333ea'; pillIcon = 'bi-check-circle'; }
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
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '500', color: '#2563eb' }}>
                                    {formatPaymentCode(p)}
                                  </td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '700', color: isReversed ? '#94a3b8' : '#0f172a', textDecoration: isReversed ? 'line-through' : 'none' }}>{formatPhp(p.amount_paid)}</td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '700', color: isReversed ? '#94a3b8' : '#0f172a', textDecoration: isReversed ? 'line-through' : 'none' }}>{formatPhp(p.balance_after)}</td>
                                  <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '9999px', backgroundColor: pillBg, color: pillColor, fontSize: '12px', fontWeight: '600' }}>
                                        <i className={`bi ${pillIcon}`}></i> {statusText}
                                      </span>
                                      {isPenalty && (
                                        <button
                                          type="button"
                                          title="View/Edit Penalty"
                                          style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#b45309',
                                            cursor: 'pointer',
                                            padding: '4px 8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderRadius: '6px',
                                            transition: 'background-color 0.2s, color 0.2s',
                                            fontSize: '12px',
                                            fontWeight: '600'
                                          }}
                                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef3c7'; e.currentTarget.style.color = '#d97706'; }}
                                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#b45309'; }}
                                          onClick={() => setEditingPenaltyPayment(p)}
                                        >
                                          <i className="bi bi-pencil-square"></i>
                                        </button>
                                      )}
                                    </div>
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
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#2563eb' }}>{validPayments.length}</div>
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
                onClick={() => { setSelectedLoanForPayments(null); setPenaltyLoan(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: '#334155', transition: 'all 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                <i className="bi bi-arrow-left"></i> Back
              </button>
            </div>
          </div>
        </div>
      )}

      {penaltyLoan && (
        <div className="modal-overlay" style={{ zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.72)', padding: '20px' }} onClick={() => setPenaltyLoan(null)}>
          <div className="modal-content" style={{ width: '100%', maxWidth: '960px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
            {(() => {
              const computation = getPenaltyComputation(penaltyLoan);

              return (
                <>
                  <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '56px', height: '56px', borderRadius: '12px', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c', fontSize: '28px' }}>
                        <i className="bi bi-calculator"></i>
                      </div>
                      <div>
                        <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '700', color: '#1e293b' }}>Penalty Computation</h2>
                        <div style={{ color: '#64748b', fontSize: '14px' }}>{soaData?.full_name?.toUpperCase() || '-'} - Loan {penaltyLoan.loan_code}</div>
                      </div>
                    </div>
                    <button onClick={() => setPenaltyLoan(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '28px', cursor: 'pointer', padding: '4px', lineHeight: '1' }}>&times;</button>
                  </div>

                  <div style={{ padding: '28px 32px', overflowY: 'auto', backgroundColor: '#fdfdfd' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '20px' }}>
                      <div style={{ padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Outstanding Balance</div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{formatPhpExact(computation.registeredOutstanding)}</div>
                      </div>
                      <div style={{ padding: '14px', backgroundColor: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Paid On/Before Due</div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: '#2563eb' }}>{formatPhpExact(computation.paymentsBeforeDue)}</div>
                      </div>
                      <div style={{ padding: '14px', backgroundColor: '#fff7ed', borderRadius: '12px', border: '1px solid #fed7aa' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Beginning Overdue</div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: '#ea580c' }}>{formatPhpExact(computation.beginningOverdueBalance)}</div>
                      </div>
                      <div style={{ padding: '14px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Penalty Rate</div>
                        <div style={{ fontSize: '18px', fontWeight: '800', color: '#16a34a' }}>5% / month</div>
                      </div>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px 20px', marginBottom: '20px', backgroundColor: '#ffffff', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>Due Date</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#ef4444' }}>{formatDateLong(penaltyLoan.date_maturity)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>Date Prepared</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>{formatDateLong(computation.datePrepared)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>Method</div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>Non-compounding</div>
                      </div>
                    </div>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#ffffff', marginBottom: '20px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                          <tr>
                            <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>Period</th>
                            <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>Beginning Balance</th>
                            <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>Payment Made</th>
                            <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>Penalty Base</th>
                            <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>No. of Months</th>
                            <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>Monthly Penalty</th>
                            <th style={{ padding: '14px 16px', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase' }}>Penalty Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {computation.rows.length > 0 ? computation.rows.map((row, idx) => (
                            <tr key={row.periodNo} style={{ borderBottom: idx === computation.rows.length - 1 ? 'none' : '1px solid #f1f5f9' }}>
                              <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                                Period {row.periodNo}
                                <div style={{ fontSize: '11px', fontWeight: '500', color: '#64748b', marginTop: '2px' }}>{formatDateLong(row.periodStart)} - {formatDateLong(row.periodEnd)}</div>
                              </td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{formatPhpExact(row.beginningBalance)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '700', color: row.paymentMade > 0 ? '#dc2626' : '#2563eb' }}>{formatPhpDeduction(row.paymentMade)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '700', color: '#ea580c' }}>{formatPhpExact(row.penaltyBase)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '700', color: '#0f172a', textAlign: 'center' }}>{row.months}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>{formatPhpExact(row.monthlyPenalty)}</td>
                              <td style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '800', color: '#16a34a' }}>{formatPhpExact(row.penaltySubtotal)}</td>
                            </tr>
                          )) : (
                            <tr>
                              <td colSpan="7" style={{ padding: '36px 16px', textAlign: 'center', color: '#64748b', fontSize: '14px', fontWeight: '600' }}>
                                No penalty period to compute yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                      <div style={{ padding: '18px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Remaining Overdue Balance</div>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{formatPhpExact(computation.remainingOverdueBalance)}</div>
                      </div>
                      <div style={{ padding: '18px', backgroundColor: '#fff7ed', borderRadius: '12px', border: '1px solid #fed7aa' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Total Penalty</div>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#ea580c' }}>{formatPhpExact(computation.totalPenalty)}</div>
                      </div>
                      <div style={{ padding: '18px', backgroundColor: '#ecfdf5', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Updated Amount Due</div>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#059669' }}>{formatPhpExact(computation.updatedAmountDue)}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '16px 32px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      type="button" 
                      onClick={() => setPenaltyLoan(null)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 24px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', color: '#334155', transition: 'all 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                    >
                      <i className="bi bi-x-lg"></i> Close
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {editingPenaltyPayment && (
        <div className="modal-overlay" style={{ zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.72)', padding: '20px' }}>
          <div className="modal-content" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '20px', fontWeight: '800' }}>Edit Penalty Amount</h3>
              <button onClick={() => setEditingPenaltyPayment(null)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: '#475569', fontSize: '14px', fontWeight: '600' }}>Amount (PHP)</label>
              <input 
                type="number" 
                defaultValue={editingPenaltyPayment.amount_paid}
                id="editPenaltyAmountInput"
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                onClick={() => setEditingPenaltyPayment(null)}
                style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const amt = document.getElementById('editPenaltyAmountInput').value;
                  if (!amt || isNaN(amt) || Number(amt) < 0) return alert('Invalid amount');
                  try {
                    await API.put(`/payments/${editingPenaltyPayment.id}/penalty-amount`, { amount_paid: amt });
                    setEditingPenaltyPayment(null);
                    openSoa(soaData.id);
                  } catch (e) {
                    alert('Failed to update: ' + (e.response?.data?.error || e.message));
                  }
                }}
                style={{ flex: 1, padding: '10px', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {loanDeleteTarget && (
        <div className="modal-overlay" style={{ zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.68)', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px 26px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <i className="bi bi-trash" style={{ fontSize: 22 }}></i>
              </div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Delete loan?</h3>
              <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
                This will permanently remove <strong style={{ color: '#0f172a' }}>{loanDeleteTarget.loan_code || `Loan ${loanDeleteTarget.id}`}</strong> from the SOA, including its payments and schedules.
              </p>
            </div>
            <div style={{ padding: '18px 26px 24px', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-light" style={{ border: '1px solid #cbd5e1' }} onClick={() => setLoanDeleteTarget(null)} disabled={loanDeleteProcessing}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => deleteLoanFromSoa(loanDeleteTarget)} disabled={loanDeleteProcessing}>
                {loanDeleteProcessing ? 'Deleting...' : 'Yes, Delete Loan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loanDeleteSuccess && (
        <div className="modal-overlay" style={{ zIndex: 100003, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.55)', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(15, 23, 42, 0.24)', padding: 26, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <i className="bi bi-check-lg" style={{ fontSize: 26 }}></i>
            </div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Loan Deleted</h3>
            <p style={{ margin: '8px 0 22px', color: '#64748b', fontSize: 14 }}>{loanDeleteSuccess}</p>
            <button type="button" className="btn btn-primary" onClick={() => setLoanDeleteSuccess(null)}>OK</button>
          </div>
        </div>
      )}

      {loanDeleteError && (
        <div className="modal-overlay" style={{ zIndex: 100003, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.55)', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(15, 23, 42, 0.24)', padding: 26, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <i className="bi bi-exclamation-triangle" style={{ fontSize: 24 }}></i>
            </div>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Delete Failed</h3>
            <p style={{ margin: '8px 0 22px', color: '#64748b', fontSize: 14 }}>{loanDeleteError}</p>
            <button type="button" className="btn btn-primary" onClick={() => setLoanDeleteError(null)}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}
