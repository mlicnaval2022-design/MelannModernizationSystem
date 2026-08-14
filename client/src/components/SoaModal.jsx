import { useEffect, useRef, useState } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../soa.css';
import '../soa-v2.css';
import '../soa-profile.css';
import '../customers.css';
import '../customers-v2.css';
import ReloanModal from './ReloanModal';
import logoImg from '../assets/logo.png';
import {
  Users,
  CheckCircle,
  XCircle,
  Calendar,
  Search,
  Filter,
  FileText,
  Phone,
  Mail,
  MapPin,
  User,
  MoreVertical,
  BarChart2,
  Plus,
  Printer,
  X,
  PieChart,
  List,
  Wallet,
  Scale,
  CalendarDays,
  CalendarClock,
  Info,
  ArrowDown,
  ArrowUp,
  ArrowDownUp
} from 'lucide-react';

export default function SoaModal({ customerId, onClose, onCustomerEdit, onRefresh }) {
  const { user } = useAuth();
  const [soaLoading, setSoaLoading] = useState(true);
  const [soaData, setSoaData] = useState(null);
  const [soaTab, setSoaTab] = useState('summary');
  const [selectedLoanForPayments, setSelectedLoanForPayments] = useState(null);
  const [paymentHistoryDateSort, setPaymentHistoryDateSort] = useState('desc');
  const [penaltyLoan, setPenaltyLoan] = useState(null);
  const [editingPenaltyPayment, setEditingPenaltyPayment] = useState(null);
  const [printModeLoan, setPrintModeLoan] = useState(null);
  const [loanDeleteTarget, setLoanDeleteTarget] = useState(null);
  const [loanDeleteProcessing, setLoanDeleteProcessing] = useState(false);
  const [loanDeleteSuccess, setLoanDeleteSuccess] = useState(null);
  const [loanDeleteError, setLoanDeleteError] = useState(null);
  const [editLoanModal, setEditLoanModal] = useState(null);
  const [editLoanError, setEditLoanError] = useState(null);
  const [cancelConfirmModal, setCancelConfirmModal] = useState(null);
  const [reloanModalOpen, setReloanModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const suppressNextPrintRef = useRef(false);

  const fetchSoaData = async (id) => {
    if (!id) return;
    setSoaLoading(true);
    try {
      const r = await API.get(`/customers/${id}`);
      let cicStatus = null;
      try {
        const cicReq = await API.get(`/cic/readiness/${id}`);
        cicStatus = cicReq.data;
      } catch {
        cicStatus = null;
      }
      let creditEval = null;
      try {
        const evalReq = await API.get(`/customers/${id}/credit-eval`);
        creditEval = evalReq.data;
      } catch {
        creditEval = null;
      }
      setSoaData({ ...r.data, cicStatus, creditEval });
    } catch (err) {
      alert('Failed to load SOA data');
      if (onClose) onClose();
    } finally {
      setSoaLoading(false);
    }
  };

  useEffect(() => {
    if (customerId) {
      fetchSoaData(customerId);
    }
  }, [customerId]);

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
    document.body.classList.add('soa-print-mode');
    document.body.classList.toggle('soa-print-profile', soaTab === 'profile' && !printModeLoan);
    document.body.classList.toggle('soa-print-statement', soaTab !== 'profile' || printModeLoan);

    return () => {
      document.body.classList.remove('soa-print-mode', 'soa-print-profile', 'soa-print-statement');
    };
  }, [soaTab, printModeLoan]);

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = API.defaults.baseURL.replace('/api', '');
    return `${baseUrl}${path}`;
  };

  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const cleaned = String(dateStr).split('T')[0];
    const parts = cleaned.split('-');
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return new Date(dateStr);
  };

  const formatDateLong = (dateStr) => {
    const parsed = parseLocalDate(dateStr);
    if (!parsed || isNaN(parsed.getTime())) return dateStr || '-';
    return parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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

  const formatPhp = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPhpExact = (value) => `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPhpDeduction = (value) => Number(value || 0) > 0 ? `-${formatPhpExact(value)}` : formatPhpExact(0);

  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  const isGoodPayment = (payment) => {
    const statusText = String(payment.status || payment.payment_status || 'active').toLowerCase();
    return !['cancelled', 'canceled', 'void', 'reversed', 'bad', 'bounced', 'penalty'].includes(statusText);
  };

  const formatAccountabilityUser = (value) => {
    const name = String(value || '').trim();
    if (!name) return '-';
    return name
      .replace(/[._-]+/g, ' ')
      .toLowerCase()
      .replace(/\b[a-z]/g, letter => letter.toUpperCase());
  };
  const getLoanUserName = (loan) => formatAccountabilityUser(loan?.created_by_username || loan?.created_by_name);
  const getPaymentUserName = (payment) => formatAccountabilityUser(payment?.encoded_by_username || payment?.encoded_by_name);

  const getPaymentHistoryRows = (loan) => {
    const direction = paymentHistoryDateSort === 'asc' ? 1 : -1;
    return (soaData?.payments || [])
      .filter(p => p.loan_code === loan?.loan_code)
      .sort((a, b) => {
        const dateCompare = String(a.date_paid || '').localeCompare(String(b.date_paid || ''));
        if (dateCompare !== 0) return dateCompare * direction;
        return (Number(a.id || 0) - Number(b.id || 0)) * direction;
      });
  };

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
        .soa-pdf-export td, .soa-pdf-export th { padding: 4px 6px !important; font-size: 10px !important; border-color: #000 !important; }
        .soa-pdf-export .f-soa-section-title { font-size: 11px !important; background: #e2e8f0 !important; color: #000 !important; padding: 4px 6px !important; margin-top: 8px !important; margin-bottom: 6px !important; }
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
        .soa-pdf-export .f-soa-company p { margin: 1px 0 !important; font-size: 10px !important; color: #1e293b !important; }
        .soa-pdf-export .f-soa-header-right { text-align: right !important; }
        .soa-pdf-export .f-soa-header-right h1 {
          font-size: 22px !important;
          color: #061f66 !important;
          margin: 0 0 4px 0 !important;
          font-weight: 900 !important;
          letter-spacing: 0.5px !important;
        }
        .soa-pdf-export .f-soa-meta-table { font-size: 10px !important; margin-left: auto !important; }
        .soa-pdf-export .f-soa-meta-table td { padding: 1px 3px !important; border: none !important; }
        .soa-pdf-export .f-soa-info-grid {
          display: grid !important;
          grid-template-columns: repeat(3, 1fr) !important;
          gap: 10px !important;
          margin-bottom: 12px !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .soa-pdf-export .f-soa-info-card {
          border: 1px solid #94a3b8 !important;
          border-radius: 4px !important;
          padding: 6px 8px !important;
          background: #fff !important;
        }
        .soa-pdf-export .f-soa-card-title {
          font-size: 10px !important;
          font-weight: 900 !important;
          color: #000 !important;
          border-bottom: 1px solid #cbd5e1 !important;
          padding-bottom: 3px !important;
          margin-bottom: 5px !important;
          text-transform: uppercase !important;
        }
        .soa-pdf-export .f-soa-field-table { width: 100% !important; font-size: 9.5px !important; }
        .soa-pdf-export .f-soa-field-table td { padding: 1.5px 2px !important; border: none !important; }
        .soa-pdf-export .f-soa-field-table td.lbl { color: #334155 !important; font-weight: 700 !important; width: 42% !important; }
        .soa-pdf-export .f-soa-field-table td.val { font-weight: 700 !important; color: #000 !important; }
        .soa-pdf-export .f-soa-table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin-top: 6px !important;
          font-size: 9px !important;
        }
        .soa-pdf-export .f-soa-table th {
          background: #1e3a8a !important;
          color: #ffffff !important;
          border: 1px solid #1e3a8a !important;
          padding: 4px 5px !important;
          font-size: 9px !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          text-align: center !important;
        }
        .soa-pdf-export .f-soa-table td {
          border: 1px solid #64748b !important;
          padding: 3.5px 5px !important;
          font-size: 9px !important;
          color: #000 !important;
        }
        .soa-pdf-export .f-soa-table tbody tr:nth-child(even) td { background: #f8fafc !important; }
        .soa-pdf-export .f-soa-sign-grid {
          display: grid !important;
          grid-template-columns: repeat(3, 1fr) !important;
          gap: 20px !important;
          margin-top: 24px !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .soa-pdf-export .f-soa-sign-box { text-align: center !important; font-size: 10px !important; }
        .soa-pdf-export .f-soa-sign-line { border-bottom: 1px solid #000 !important; height: 32px !important; margin-bottom: 4px !important; }
        .soa-pdf-export .f-soa-thank-you {
          margin-top: 14px !important;
          text-align: center !important;
          font-size: 10px !important;
          font-style: italic !important;
          font-weight: 700 !important;
          color: #1e3a8a !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
      `;
      exportRoot.appendChild(pdfStyle);

      const workerContainer = document.createElement('div');
      workerContainer.style.position = 'fixed';
      workerContainer.style.left = '-9999px';
      workerContainer.style.top = '0';
      workerContainer.style.width = '7.75in';
      workerContainer.style.background = '#ffffff';
      workerContainer.appendChild(exportRoot);
      document.body.appendChild(workerContainer);

      const customerCode = soaData?.customer_code || loan.customer_code || loan.id;
      const loanCode = loan.loan_code || `LN-${loan.id}`;
      const filename = `SOA-${loanCode}-${customerCode}.pdf`;

      import('html2pdf.js').then((module) => {
        const html2pdfLib = module.default || module;
        const opt = {
          margin: [0.25, 0.25, 0.25, 0.35],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            windowWidth: 800
          },
          jsPDF: { unit: 'in', format: [8.5, 13], orientation: 'portrait' }
        };

        html2pdfLib().set(opt).from(exportRoot).save().then(() => {
          document.body.removeChild(workerContainer);
          suppressNextPrintRef.current = false;
          setPrintModeLoan(null);
        }).catch((err) => {
          console.error('PDF export failed:', err);
          document.body.removeChild(workerContainer);
          suppressNextPrintRef.current = false;
          setPrintModeLoan(null);
          alert('Failed to generate PDF export.');
        });
      }).catch(err => {
        console.error('Error loading html2pdf:', err);
        document.body.removeChild(workerContainer);
        suppressNextPrintRef.current = false;
        setPrintModeLoan(null);
      });
    }, 400);
  };

  const getPenaltyComputation = (loan) => {
    if (!loan) return null;

    const registeredOutstanding = Number(loan.balance || 0);
    const maturityDate = parseLocalDate(loan.date_maturity);
    const releaseDate = parseLocalDate(loan.date_released);
    const allPayments = (soaData?.payments || [])
      .filter(p => p.loan_code === loan.loan_code)
      .map(p => ({
        ...p,
        paidDate: parseLocalDate(p.date_paid),
        amount: Number(p.amount_paid || 0)
      }))
      .filter(p => p.paidDate);

    const goodPayments = allPayments.filter(p => isGoodPayment(p));
    const manualPenaltyPayments = allPayments.filter(p => String(p.status).toLowerCase() === 'penalty');

    const paymentsBeforeDue = goodPayments
      .filter(p => maturityDate ? p.paidDate <= maturityDate : true)
      .reduce((sum, p) => sum + p.amount, 0);

    const principal = Number(loan.principal || 0);
    const interestAmt = Number(loan.interest_amount || (Number(loan.total_amortization || 0) - principal) || 0);
    const totalLoanAmt = Number(loan.total_amortization || (principal + interestAmt) || 0);

    const beginningOverdueBalance = Math.max(0, totalLoanAmt - paymentsBeforeDue);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const gracePeriodEnd = maturityDate ? addDays(maturityDate, 3) : null;
    const isPastGracePeriod = gracePeriodEnd ? today > gracePeriodEnd : false;

    let overdueDays = 0;
    if (maturityDate && today > maturityDate) {
      overdueDays = Math.floor((today - maturityDate) / (1000 * 60 * 60 * 24));
    }

    const rows = [];
    let cumulativePenalty = 0;

    manualPenaltyPayments
      .sort((a, b) => a.paidDate - b.paidDate)
      .forEach((penaltyPayment) => {
        cumulativePenalty += penaltyPayment.amount;
        rows.push({
          key: `manual-${penaltyPayment.id}`,
          periodLabel: `Penalty Posted (${formatDateLong(penaltyPayment.date_paid)})`,
          beginningBalance: beginningOverdueBalance,
          paymentMade: 0,
          penaltyBase: beginningOverdueBalance,
          monthlyPenaltyRate: 0,
          monthlyPenalty: penaltyPayment.amount,
          penaltySubtotal: cumulativePenalty,
          isManual: true,
          paymentObj: penaltyPayment
        });
      });

    if (manualPenaltyPayments.length === 0) {
      if (maturityDate && isPastGracePeriod) {
        let currentCycleStart = maturityDate;

        while (currentCycleStart < today) {
          const currentCycleEnd = addDays(currentCycleStart, 30);
          const paymentsInCycle = goodPayments
            .filter(p => p.paidDate > currentCycleStart && p.paidDate <= currentCycleEnd)
            .reduce((sum, p) => sum + p.amount, 0);

          const previousPenaltyBase = rows.length > 0
            ? Math.max(0, rows[rows.length - 1].beginningBalance - rows[rows.length - 1].paymentMade)
            : beginningOverdueBalance;

          const penaltyBase = Math.max(0, previousPenaltyBase);
          const monthlyPenalty = Number((penaltyBase * 0.05).toFixed(2));
          cumulativePenalty += monthlyPenalty;

          rows.push({
            key: currentCycleStart.toISOString(),
            periodLabel: `${formatDateLong(currentCycleStart)} - ${formatDateLong(currentCycleEnd)}`,
            beginningBalance: previousPenaltyBase,
            paymentMade: paymentsInCycle,
            penaltyBase,
            monthlyPenaltyRate: 5,
            monthlyPenalty,
            penaltySubtotal: cumulativePenalty,
            isManual: false
          });

          currentCycleStart = currentCycleEnd;
        }
      }
    }

    const remainingOverdueBalance = registeredOutstanding;
    const totalPenalty = cumulativePenalty;
    const updatedAmountDue = remainingOverdueBalance + totalPenalty;

    return {
      registeredOutstanding,
      paymentsBeforeDue,
      beginningOverdueBalance,
      maturityDate,
      releaseDate,
      gracePeriodEnd,
      isPastGracePeriod,
      overdueDays,
      rows,
      remainingOverdueBalance,
      totalPenalty,
      updatedAmountDue
    };
  };

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
      if (onRefresh) onRefresh();
    } catch (err) {
      setLoanDeleteError(err.response?.data?.error || 'Failed to delete loan');
    } finally {
      setLoanDeleteProcessing(false);
    }
  };

  const initiateCancelLoanFromSoa = () => {
    if (!editLoanModal?.id) return;
    setCancelConfirmModal({
      show: true,
      loan: editLoanModal,
      processing: false,
      error: null
    });
  };

  const confirmCancelLoanFromSoa = async () => {
    if (!cancelConfirmModal?.loan?.id) return;
    const targetLoan = cancelConfirmModal.loan;
    const loanCode = targetLoan.loan_code || `Loan ${targetLoan.id}`;
    try {
      setCancelConfirmModal(prev => ({ ...prev, processing: true, error: null }));
      const response = await API.post(`/loans/${targetLoan.id}/cancel`, { remarks: 'Loan cancelled via SOA edit' });
      const updatedLoan = response.data?.loan || { ...targetLoan, status: 'cancelled' };

      setSoaData(prev => {
        if (!prev) return prev;
        const loans = (prev.loans || []).map(l => l.id === targetLoan.id ? { ...l, ...updatedLoan, status: 'cancelled' } : l);
        return { ...prev, loans };
      });

      setSelectedLoanForPayments(prev => prev?.id === targetLoan.id ? { ...prev, ...updatedLoan, status: 'cancelled' } : prev);
      setPrintModeLoan(prev => prev?.id === targetLoan.id ? null : prev);
      setEditLoanModal(null);
      setCancelConfirmModal(null);
      setLoanDeleteSuccess(`${loanCode} successfully cancelled.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      setCancelConfirmModal(prev => ({
        ...prev,
        processing: false,
        error: err.response?.data?.error || 'Failed to cancel loan'
      }));
    }
  };

  return (
    <>
      <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose && onClose()}>
        <div className="soa-modal-v2 soa-modern-refresh">
          <div className="soa-header-v2">
            <div className="soa-header-left-v2">
              <div className="soa-icon-box-v2 soa-logo-mark-refresh">
                <img src={logoImg} alt="Melann Lending logo" />
              </div>
              <div>
                <h2 className="soa-title-v2">Statement of Account</h2>
                <p className="soa-subtitle-v2">Official statement of your account with Melann Lending</p>
              </div>
            </div>
            <div className="soa-header-right-v2">
              <button className="soa-close-icon" onClick={() => onClose && onClose()}><X size={24} /></button>
              <div className="soa-date-v2">Date: <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
              <div className="soa-preview-note-v2">Print preview: Legal portrait, 1 page expected</div>
            </div>
          </div>

          <div className="soa-body-v2" id="printable-area">
            {soaLoading ? (
              <div className="text-center" style={{ padding: 40 }}>Loading SOA Data...</div>
            ) : soaData ? (() => {
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
              const lastPayment = sortedPayments.length > 0 ? new Date(sortedPayments[0].date_paid).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
              const nextDueDate = (printModeLoan ? [printModeLoan] : activeLoans).length > 0 && (printModeLoan || activeLoans[0]).date_maturity ? new Date((printModeLoan || activeLoans[0]).date_maturity).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
              const memberSince = soaData.created_at ? new Date(soaData.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
              const customerAddress = [soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city, soaData.province, soaData.zip_code].filter(Boolean).join(', ') || '-';
              const accountStatus = (currentLoan.id ? getLoanStatusLabel(currentLoan) : soaData.status) || '-';
              const soaNumber = `SOA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${soaData.customer_code || soaData.id}`;
              const penaltyComputation = getPenaltyComputation(currentLoan);
              const profileSections = [
                { title: 'Personal Information', fields: [['Customer Code', soaData.customer_code], ['Classification', soaData.customer_classification], ['Full Name', soaData.full_name], ['Gender', soaData.gender], ['Birth Date', soaData.birth_date], ['Civil Status', soaData.civil_status], ['Nationality', soaData.nationality], ['Educational Background', soaData.educational_background], ['Occupational Status', soaData.occupational_status], ['Status', soaData.status]] },
                { title: 'Address Information', fields: [['Address', [soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ')], ['Province', soaData.province], ['Zip Code', soaData.zip_code], ['Home Status', soaData.home_status]] },
                { title: 'Contact Information', fields: [['Main Contact', soaData.contact], ['Secondary Contact', soaData.secondary_contact], ['Email', soaData.email], ['Facebook', soaData.fb_account]] },
                { title: 'Business Information', fields: [['Business Type', soaData.business_type], ['Occupation', soaData.occupation], ['Business Name', soaData.business_name], ['Monthly Income', soaData.income_per_month ? formatPhp(soaData.income_per_month) : ''], ['Monthly Expense', soaData.expenses_per_month ? formatPhp(soaData.expenses_per_month) : ''], ['Loan Purpose', soaData.loan_purpose], ['Collateral', soaData.collateral], ['Branch', soaData.branch_name], ['Collector', soaData.collector_name]] },
                { title: 'ID Information', fields: [['ID Type', soaData.id_type], ['ID Number', soaData.id_number], ['Issue Date', soaData.id_issue_date], ['Expiry Date', soaData.id_expiry_date], ['Issued By', soaData.id_issued_by], ['Place of Issue', soaData.id_place_of_issue]] },
              ];
              const cCreditEval = soaData.creditEval;
              const cLoans = soaData.loans || [];
              const cPastDue = cLoans.filter(l => String(l.status || '').toLowerCase() === 'pastdue').length;
              let cScore = cCreditEval && typeof cCreditEval.credit_score === 'number' ? cCreditEval.credit_score : 100 - (cPastDue * 20);
              if (!cCreditEval) {
                const sStr = String(soaData.status || '').toLowerCase();
                if (sStr.includes('pastdue')) cScore -= 30;
                if (sStr.includes('recon')) cScore -= 15;
                if (sStr.includes('relax')) cScore -= 10;
              }
              cScore = Math.max(0, Math.min(100, cScore));
              const cRating = cScore >= 90 ? 'EXCELLENT' : cScore >= 80 ? 'GOOD' : cScore >= 70 ? 'FAIR' : cScore >= 60 ? 'RISKY' : 'POOR';

              profileSections.push({
                title: 'Credit Scoring & Evaluation',
                fields: [
                  ['Credit Score', `${cScore} / 100 (${cRating})`],
                  ['Total Loans Availed', cCreditEval ? (cCreditEval.total_loans ?? 0) : cLoans.length],
                  ['On-Time Payments', cCreditEval ? (cCreditEval.on_time_payments ?? 0) : (soaData.payments || []).filter(p => p.status === 'active').length],
                  ['Late Payments', cCreditEval ? (cCreditEval.late_payments ?? 0) : 0],
                  ['Past Due Occurrences', cCreditEval ? (cCreditEval.past_due_occurrences ?? 0) : cPastDue],
                  ['Recon History', cCreditEval ? (cCreditEval.recon_history ?? 0) : 0],
                ]
              });

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
                        <button className="soa-btn-primary-v2" style={{ background: '#10b981', color: '#fff' }} onClick={() => setReloanModalOpen(true)}>
                          <Plus size={16} /> Input Loan
                        </button>
                        <button className="soa-btn-outline-v2" onClick={() => onClose && onClose()}>
                          Back
                        </button>
                        <button className="soa-btn-primary-v2" onClick={() => window.print()}>
                          <Printer size={16} /> Print
                        </button>
                      </div>
                    </div>

                    <div className="soa-tabs-v2 screen-only">
                      {[['summary', 'Summary', PieChart], ['profile', 'Profile', User], ['history', 'Loans & Payments History', List]].map(([id, label, IconComp]) => (
                        <button key={id} type="button" className={`soa-tab-v2 ${soaTab === id ? 'active' : ''}`} onClick={() => setSoaTab(id)}>
                          <IconComp size={18} /> {label}
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
                                <div className="soa-val-v2" style={{ fontSize: 14, lineHeight: 1.4 }}>{customerAddress}</div>
                                <div className="soa-label-v2">Member Since</div>
                                <div className="soa-val-sub-v2"><CalendarDays size={14} /> {memberSince}</div>
                              </div>
                            </div>
                          </div>

                          <div className="soa-divider-v2"></div>

                          <div className="soa-chart-v2">
                            <div className="soa-balance-icon-v2"><Wallet size={22} /></div>
                            <div className="soa-chart-label-v2">OUTSTANDING BALANCE</div>
                            <div className="donut-v2">
                              <div className="donut-inner-v2">
                                <div className="donut-currency-v2">PHP</div>
                                <div className="donut-val-v2">{Number(outstandingBal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                <div className="donut-sub-v2">As of {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
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

                        {(() => {
                          const creditEval = soaData.creditEval;
                          const loansList = soaData.loans || [];
                          const paymentsList = soaData.payments || [];
                          const activePaymentsCount = paymentsList.filter(p => p.status === 'active').length;
                          const pastDueCount = loansList.filter(l => String(l.status || '').toLowerCase() === 'pastdue').length;

                          const latestL = loansList[0];
                          const releaseDate = latestL ? (latestL.date_released || (latestL.created_at ? String(latestL.created_at).split('T')[0] : null)) : null;
                          const todayStr = new Date().toISOString().split('T')[0];
                          const daysSinceRel = releaseDate ? Math.max(0, Math.floor((new Date(todayStr) - new Date(releaseDate)) / 86400000)) : 0;

                          const isUnrated = creditEval ? creditEval.is_unrated : (activePaymentsCount === 0 && daysSinceRel <= 1);

                          let score = 100;
                          if (creditEval && typeof creditEval.credit_score === 'number') {
                            score = creditEval.credit_score;
                          } else if (activePaymentsCount === 0) {
                            if (daysSinceRel <= 1) {
                              score = 100;
                            } else {
                              score = Math.max(0, 100 - (daysSinceRel * 15) - (pastDueCount * 20));
                            }
                          } else {
                            score = Math.max(0, Math.min(100, 100 - (pastDueCount * 20)));
                          }

                          let meta = { label: 'EXCELLENT', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '⭐' };

                          if (isUnrated) {
                            meta = { label: 'NEW CLIENT (UNRATED)', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1', icon: '🆕' };
                          } else if (score >= 90) {
                            meta = { label: 'EXCELLENT', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '⭐' };
                          } else if (score >= 80) {
                            meta = { label: 'GOOD', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', icon: '👍' };
                          } else if (score >= 70) {
                            meta = { label: 'FAIR', color: '#ca8a04', bg: '#fef9c3', border: '#fef08a', icon: '⚖️' };
                          } else if (score >= 60) {
                            meta = { label: 'RISKY', color: '#ea580c', bg: '#fff7ed', border: '#ffedd5', icon: '⚠️' };
                          } else {
                            meta = { label: 'POOR', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🚨' };
                          }

                          const onTime = creditEval ? (creditEval.on_time_payments || 0) : activePaymentsCount;
                          const late = creditEval ? (creditEval.late_payments || 0) : 0;
                          const pdCount = creditEval ? (creditEval.past_due_occurrences || 0) : pastDueCount;
                          const totalL = creditEval ? (creditEval.total_loans || 0) : loansList.length;

                          return (
                            <div className="soa-card-v2 print-card" style={{ marginTop: 16, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 12, padding: '16px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: meta.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                    {isUnrated ? 'NEW' : score}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, color: meta.color }}>
                                      CREDIT SCORING EVALUATION
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                      Rating: <span style={{ color: meta.color }}>{meta.label}</span> {isUnrated ? '(No Payments Yet)' : `(${score}/100 Pts)`}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                                      {isUnrated ? (
                                        <span>New account &bull; Total Loans: <strong>{totalL}</strong> &bull; Payments Received: <strong>0</strong></span>
                                      ) : (
                                        <span>On-Time: <strong>{onTime}</strong> &bull; Late: <strong>{late}</strong> &bull; Past Due: <strong>{pdCount}</strong> &bull; Total Loans: <strong>{totalL}</strong></span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ background: '#ffffff', padding: '6px 14px', borderRadius: 999, border: `1px solid ${meta.border}`, fontWeight: 800, fontSize: 13, color: meta.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>{meta.icon}</span> Score: {isUnrated ? 'UNRATED' : `${score} Pts`}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="soa-due-card-v2 print-card">
                          <div className="soa-due-icon-v2"><CalendarClock size={24} /></div>
                          <div className="soa-due-content-v2">
                            <div className="label">Next Due Date</div>
                            <div className="val">{nextDueDate}</div>
                          </div>
                          <div className="soa-due-divider"></div>
                          <div className="soa-due-text">Stay on track! You have an upcoming due date.</div>

                          <svg className="soa-due-bg-waves" width="400" height="100" viewBox="0 0 400 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M0 60C100 60 150 20 250 20C350 20 400 80 400 80" stroke="#bfdbfe" strokeWidth="2" />
                            <path d="M0 80C120 80 180 40 280 40C380 40 400 60 400 60" stroke="#bfdbfe" strokeWidth="1" />
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

                    {soaTab === 'profile' && (() => {
                      const customerStatus = getCalculatedCustomerStatus(soaData) || 'Active';
                      const statusClass = customerStatus.toLowerCase().replace(/\s+/g, '');
                      const createdDate = soaData.created_at ? new Date(soaData.created_at).toISOString().split('T')[0] : '-';
                      const updatedDate = soaData.updated_at ? new Date(soaData.updated_at).toISOString().split('T')[0] : createdDate;

                      return (
                        <div className="po-container">
                          <div className="po-header">
                            <div className="po-header-left">
                              <div className="po-header-icon">
                                <User size={22} color="#fff" />
                              </div>
                              <div>
                                <h3 className="po-header-title">Profile Overview</h3>
                                <p className="po-header-sub">View and manage customer details</p>
                              </div>
                            </div>
                            {onCustomerEdit && (
                              <button
                                type="button"
                                className="po-edit-btn"
                                onClick={() => {
                                  if (onClose) onClose();
                                  onCustomerEdit(soaData);
                                }}
                              >
                                <i className="bi bi-pencil" style={{ marginRight: '4px' }}></i> Edit Profile
                              </button>
                            )}
                          </div>

                          <div className="po-grid">
                            <div className="po-col">
                              <div className="po-card">
                                <div className="po-card-header">
                                  <div className="po-card-icon-box"><User size={16} color="#0b297a" /></div>
                                  <h4 className="po-card-title">PERSONAL INFORMATION</h4>
                                </div>
                                <div className="po-card-body po-fields-grid-3">
                                  <div className="po-field">
                                    <span className="po-field-label">CUSTOMER CODE</span>
                                    <div className="po-field-val-wrap"><Users size={14} className="po-field-icon" /><strong>{soaData.customer_code || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">CLASSIFICATION</span>
                                    <div className="po-field-val-wrap"><FileText size={14} className="po-field-icon" /><strong>{soaData.customer_classification || 'New Client'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">FULL NAME</span>
                                    <div className="po-field-val-wrap"><User size={14} className="po-field-icon" /><strong>{soaData.full_name || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">GENDER</span>
                                    <div className="po-field-val-wrap"><User size={14} className="po-field-icon" /><strong>{soaData.gender || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">BIRTHDATE</span>
                                    <div className="po-field-val-wrap"><Calendar size={14} className="po-field-icon" /><strong>{soaData.birth_date || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">CIVIL STATUS</span>
                                    <div className="po-field-val-wrap"><Scale size={14} className="po-field-icon" /><strong>{soaData.civil_status || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">NATIONALITY</span>
                                    <div className="po-field-val-wrap"><FileText size={14} className="po-field-icon" /><strong>{soaData.nationality || 'Filipino'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">PREFERRED PRONOUN</span>
                                    <div className="po-field-val-wrap"><Info size={14} className="po-field-icon" /><strong>{soaData.preferred_pronoun || 'Prefer not to say'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">OCCUPATIONAL STATUS</span>
                                    <div className="po-field-val-wrap"><User size={14} className="po-field-icon" /><strong>{soaData.occupational_status || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">STATUS</span>
                                    <div><span className={`po-status-badge ${statusClass}`}>{customerStatus}</span></div>
                                  </div>
                                </div>
                              </div>

                              <div className="po-card">
                                <div className="po-card-header">
                                  <div className="po-card-icon-box"><MapPin size={16} color="#0b297a" /></div>
                                  <h4 className="po-card-title">ADDRESS INFORMATION</h4>
                                </div>
                                <div className="po-card-body po-fields-grid-4">
                                  <div className="po-field">
                                    <span className="po-field-label">ADDRESS</span>
                                    <div className="po-field-val-wrap"><MapPin size={14} className="po-field-icon" /><strong>{[soaData.address, soaData.sitio, soaData.purok, soaData.brgy, soaData.city].filter(Boolean).join(', ') || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">PROVINCE</span>
                                    <strong>{soaData.province || '-'}</strong>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">ZIP CODE</span>
                                    <strong>{soaData.zip_code || '-'}</strong>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">NEARBY ESTABLISHMENT</span>
                                    <strong>{soaData.home_status || soaData.nearby_establishment || '-'}</strong>
                                  </div>
                                </div>
                              </div>

                              <div className="po-card">
                                <div className="po-card-header">
                                  <div className="po-card-icon-box"><FileText size={16} color="#0b297a" /></div>
                                  <h4 className="po-card-title">ID INFORMATION</h4>
                                </div>
                                <div className="po-card-body po-fields-grid-3">
                                  <div className="po-field">
                                    <span className="po-field-label">ID TYPE</span>
                                    <div className="po-field-val-wrap"><FileText size={14} className="po-field-icon" /><strong>{soaData.id_type || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">ID NUMBER</span>
                                    <div className="po-field-val-wrap"><FileText size={14} className="po-field-icon" /><strong>{soaData.id_number || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">ISSUE DATE</span>
                                    <div className="po-field-val-wrap"><Calendar size={14} className="po-field-icon" /><strong>{soaData.id_issue_date || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">EXPIRY DATE</span>
                                    <div className="po-field-val-wrap"><Calendar size={14} className="po-field-icon" /><strong>{soaData.id_expiry_date || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">ISSUED BY</span>
                                    <div className="po-field-val-wrap"><MapPin size={14} className="po-field-icon" /><strong>{soaData.id_issued_by || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">PLACE OF ISSUE</span>
                                    <div className="po-field-val-wrap"><MapPin size={14} className="po-field-icon" /><strong>{soaData.id_place_of_issue || '-'}</strong></div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="po-col">
                              <div className="po-card">
                                <div className="po-card-header">
                                  <div className="po-card-icon-box"><Phone size={16} color="#0b297a" /></div>
                                  <h4 className="po-card-title">CONTACT INFORMATION</h4>
                                </div>
                                <div className="po-card-body po-fields-grid-2">
                                  <div className="po-field">
                                    <span className="po-field-label">MAIN CONTACT</span>
                                    <div className="po-field-val-wrap"><Phone size={14} className="po-field-icon" /><strong>{soaData.contact || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">SECONDARY CONTACT</span>
                                    <div className="po-field-val-wrap"><Phone size={14} className="po-field-icon" /><strong>{soaData.secondary_contact || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">EMAIL</span>
                                    <div className="po-field-val-wrap"><Mail size={14} className="po-field-icon" /><strong>{soaData.email || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">FACEBOOK</span>
                                    <div className="po-field-val-wrap"><User size={14} className="po-field-icon" /><strong>{soaData.fb_account || '-'}</strong></div>
                                  </div>
                                </div>
                              </div>

                              <div className="po-card">
                                <div className="po-card-header">
                                  <div className="po-card-icon-box"><Wallet size={16} color="#0b297a" /></div>
                                  <h4 className="po-card-title">BUSINESS INFORMATION</h4>
                                </div>
                                <div className="po-card-body po-fields-grid-3">
                                  <div className="po-field">
                                    <span className="po-field-label">BUSINESS TYPE</span>
                                    <div className="po-field-val-wrap"><MapPin size={14} className="po-field-icon" /><strong>{soaData.business_type || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">DESCRIPTION</span>
                                    <div className="po-field-val-wrap"><User size={14} className="po-field-icon" /><strong>{soaData.occupation || soaData.business_description || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">BUSINESS NAME</span>
                                    <div className="po-field-val-wrap"><MapPin size={14} className="po-field-icon" /><strong>{soaData.business_name || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">MONTHLY INCOME</span>
                                    <div className="po-field-val-wrap"><Wallet size={14} className="po-field-icon" /><strong>{soaData.income_per_month ? formatPhp(soaData.income_per_month) : '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">MONTHLY EXPENSES</span>
                                    <div className="po-field-val-wrap"><BarChart2 size={14} className="po-field-icon" /><strong>{soaData.expenses_per_month ? formatPhp(soaData.expenses_per_month) : '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">LOAN PURPOSE</span>
                                    <div className="po-field-val-wrap"><FileText size={14} className="po-field-icon" /><strong>{soaData.loan_purpose || '-'}</strong></div>
                                  </div>
                                  <div className="po-field">
                                    <span className="po-field-label">COLLECTOR</span>
                                    <div className="po-field-val-wrap"><User size={14} className="po-field-icon" /><strong>{soaData.collector_name || '-'}</strong></div>
                                  </div>
                                </div>
                              </div>

                              <div className="po-card">
                                <div className="po-card-header">
                                  <div className="po-card-icon-box"><FileText size={16} color="#0b297a" /></div>
                                  <h4 className="po-card-title">ID AND PHOTO ATTACHMENTS</h4>
                                </div>
                                <div className="po-card-body">
                                  <div className="po-attachments-grid">
                                    {[
                                      ['Client Photo', soaData.photo_client, User],
                                      ['ID Front', soaData.photo_id_front, FileText],
                                      ['ID Back', soaData.photo_id_back, FileText],
                                      ['Business Proof / Store', soaData.photo_business_proof, MapPin],
                                    ].map(([label, path, IconComp]) => (
                                      <div key={label} className="po-attachment-tile">
                                        <div className="po-attachment-label">
                                          <IconComp size={13} color="#2563eb" /> <span>{label}</span>
                                        </div>
                                        {path ? (
                                          <div className="po-attachment-img-box" style={{ cursor: 'pointer' }} onClick={() => setPreviewImage(getImageUrl(path))}>
                                            <img src={getImageUrl(path)} alt={label} />
                                          </div>
                                        ) : (
                                          <div className="po-attachment-placeholder">
                                            <IconComp size={24} color="#94a3b8" />
                                            <span>No Image</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="po-footer">
                            <div className="po-footer-item">
                              <i className="bi bi-shield-check"></i> <span>Profile ID: #{soaData.customer_code || soaData.id}</span>
                            </div>
                            <div className="po-footer-item">
                              <Calendar size={14} /> <span>Date Created: {createdDate}</span>
                            </div>
                            <div className="po-footer-item">
                              <Calendar size={14} /> <span>Last Updated: {updatedDate}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {soaTab === 'history' && (
                      <>
                        {(() => {
                          const creditEval = soaData.creditEval;
                          const loansList = soaData.loans || [];
                          const paymentsList = soaData.payments || [];
                          const activePaymentsCount = paymentsList.filter(p => p.status === 'active').length;
                          const pastDueCount = loansList.filter(l => String(l.status || '').toLowerCase() === 'pastdue').length;

                          const latestL = loansList[0];
                          const releaseDate = latestL ? (latestL.date_released || (latestL.created_at ? String(latestL.created_at).split('T')[0] : null)) : null;
                          const todayStr = new Date().toISOString().split('T')[0];
                          const daysSinceRel = releaseDate ? Math.max(0, Math.floor((new Date(todayStr) - new Date(releaseDate)) / 86400000)) : 0;

                          const isUnrated = creditEval ? creditEval.is_unrated : (activePaymentsCount === 0 && daysSinceRel <= 1);

                          let score = 100;
                          if (creditEval && typeof creditEval.credit_score === 'number') {
                            score = creditEval.credit_score;
                          } else if (activePaymentsCount === 0) {
                            if (daysSinceRel <= 1) {
                              score = 100;
                            } else {
                              score = Math.max(0, 100 - (daysSinceRel * 15) - (pastDueCount * 20));
                            }
                          } else {
                            score = Math.max(0, Math.min(100, 100 - (pastDueCount * 20)));
                          }

                          let meta = { label: 'EXCELLENT', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '⭐' };

                          if (isUnrated) {
                            meta = { label: 'NEW CLIENT (UNRATED)', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1', icon: '🆕' };
                          } else if (score >= 90) {
                            meta = { label: 'EXCELLENT', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', icon: '⭐' };
                          } else if (score >= 80) {
                            meta = { label: 'GOOD', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', icon: '👍' };
                          } else if (score >= 70) {
                            meta = { label: 'FAIR', color: '#ca8a04', bg: '#fef9c3', border: '#fef08a', icon: '⚖️' };
                          } else if (score >= 60) {
                            meta = { label: 'RISKY', color: '#ea580c', bg: '#fff7ed', border: '#ffedd5', icon: '⚠️' };
                          } else {
                            meta = { label: 'POOR', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🚨' };
                          }

                          const onTime = creditEval ? (creditEval.on_time_payments || 0) : activePaymentsCount;
                          const late = creditEval ? (creditEval.late_payments || 0) : 0;
                          const pdCount = creditEval ? (creditEval.past_due_occurrences || 0) : pastDueCount;
                          const totalL = creditEval ? (creditEval.total_loans || 0) : loansList.length;

                          return (
                            <div className="soa-card-v2 print-card" style={{ marginBottom: 16, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 12, padding: '16px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: meta.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                    {isUnrated ? 'NEW' : score}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, color: meta.color }}>
                                      CREDIT SCORING EVALUATION
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                                      Rating: <span style={{ color: meta.color }}>{meta.label}</span> {isUnrated ? '(No Payments Yet)' : `(${score}/100 Pts)`}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                                      {isUnrated ? (
                                        <span>New account &bull; Total Loans: <strong>{totalL}</strong> &bull; Payments Received: <strong>0</strong></span>
                                      ) : (
                                        <span>On-Time Payments: <strong>{onTime}</strong> &bull; Late Payments: <strong>{late}</strong> &bull; Past Due: <strong>{pdCount}</strong> &bull; Total Loans: <strong>{totalL}</strong></span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ background: '#ffffff', padding: '6px 14px', borderRadius: 999, border: `1px solid ${meta.border}`, fontWeight: 800, fontSize: 13, color: meta.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>{meta.icon}</span> Score: {isUnrated ? 'UNRATED' : `${score} Pts`}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="soa-card">
                          <div className="soa-list-card-header"><div className="soa-list-title">Loans & Payments History</div></div>
                          {loans.length > 0 ? (
                            <table className="data-table" style={{ fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th>Cycle Count</th>
                                  <th>Loan Code</th>
                                  <th>Type</th>
                                  <th>Date Released</th>
                                  <th>Maturity</th>
                                  <th>Period</th>
                                  <th>Principal</th>
                                  <th>Interest Rate</th>
                                  <th>Interest Amount</th>
                                  <th>Total Loan</th>
                                  <th>Amortization</th>
                                  <th>Balance</th>
                                  <th>Status</th>
                                  <th>User</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {loans.map(l => (
                                  <tr key={l.id} onClick={() => setSelectedLoanForPayments(l)} style={{ cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <td><span className="badge badge-cycle">Cycle {loanCycleMap.get(l.id) || '-'}</span></td>
                                    <td className="mono" style={{ color: '#2563eb', fontWeight: '600' }} title="View payment history for this loan">{l.loan_code}</td>
                                    <td>
                                      {l.loan_type || '-'}
                                      {String(l.status).toLowerCase() === 'reversed' && <span style={{ color: '#ef4444', marginLeft: '6px', fontWeight: 'bold', fontSize: '11px' }}>(REVERSED)</span>}
                                    </td>
                                    <td>{l.date_released || '-'}</td>
                                    <td>{l.date_maturity || '-'}</td>
                                    <td>{l.loan_period || 0} Days</td>
                                    <td>{formatPhp(l.principal)}</td>
                                    <td>{l.interest_rate || 0}%</td>
                                    <td>{formatPhp(l.interest_amount)}</td>
                                    <td>{formatPhp(l.total_amortization)}</td>
                                    <td>{formatPhp(l.amortization)}</td>
                                    <td>{formatPhp(l.balance)}</td>
                                    <td><span className={`badge badge-${getLoanStatusClass(l)}`}>{getLoanStatusLabel(l)}</span></td>
                                    <td style={{ fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{getLoanUserName(l)}</td>
                                    <td>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <button className="action-btn" style={{ borderColor: '#bfdbfe', color: '#2563eb', background: '#eff6ff' }} onClick={(e) => { e.stopPropagation(); setEditLoanError(null); setEditLoanModal({ ...l, __original: { ...l } }); }}><i className="bi bi-pencil"></i> Edit</button>
                                        <button className="action-btn" onClick={(e) => { e.stopPropagation(); setPrintModeLoan(l); }}><i className="bi bi-printer"></i> Print</button>
                                        <button className="action-btn" style={{ borderColor: '#fecaca', color: '#dc2626', background: '#fff5f5' }} onClick={(e) => { e.stopPropagation(); setLoanDeleteTarget(l); }}><i className="bi bi-trash"></i> Delete</button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="soa-empty-state">
                              <div className="soa-empty-title">No loans found.</div>
                              <div className="soa-empty-sub">There are no loan records associated with this account.</div>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    <div className="print-footer print-only">
                      <div className="print-footer-col"><p>We are committed to provide reliable and responsible lending solutions for your financial growth.</p></div>
                      <div className="print-footer-col center-col"><div>09171131000</div><div>melann.lic2016@gmail.com</div><div>facebook.com/MelannLendingInvestorCorp</div></div>
                      <div className="print-footer-col right-col"><div style={{ color: '#1e3a8a', fontStyle: 'italic', fontSize: 16 }}>Thank you for choosing</div><div className="print-footer-brand">MELANN LENDING!</div></div>
                      <div className="print-footer-wave"></div>
                    </div>
                  </div>
                </>
              );
            })() : <div className="text-danger text-center">Failed to load data.</div>}
          </div>
        </div>
      </div>

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

      {selectedLoanForPayments && (
        <div className="modal-overlay" style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', padding: '20px' }} onClick={() => { setSelectedLoanForPayments(null); setPenaltyLoan(null); }}>
          <div className="modal-content payment-history-refresh" style={{ width: '100%', maxWidth: '1480px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
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
                >
                  <i className="bi bi-file-earmark-pdf"></i> Export PDF
                </button>
                <button
                  onClick={() => setPrintModeLoan(selectedLoanForPayments)}
                  style={{ background: '#eff6ff', color: '#2563eb', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s' }}
                >
                  <i className="bi bi-printer"></i> Print Statement
                </button>
                <button onClick={() => { setSelectedLoanForPayments(null); setPenaltyLoan(null); }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '28px', cursor: 'pointer', padding: '4px', lineHeight: '1' }}>&times;</button>
              </div>
            </div>

            <div className="payment-history-refresh-body" style={{ padding: '32px', overflowY: 'auto', backgroundColor: '#fdfdfd' }}>
              {(() => {
                const principal = Number(selectedLoanForPayments.principal) || 0;
                const interestRate = Number(selectedLoanForPayments.interest_rate) || 0;
                let interestAmount = Number(selectedLoanForPayments.interest_amount) || 0;
                if (interestAmount === 0 && interestRate > 0) {
                  interestAmount = principal * (interestRate / 100);
                }

                let totalLoan = Number(selectedLoanForPayments.total_amortization) || 0;
                if (totalLoan <= principal) {
                  totalLoan = principal + interestAmount;
                }

                let remainingBalance = Number(selectedLoanForPayments.balance) || 0;
                const isPaid = selectedLoanForPayments.status?.toLowerCase() === 'paid';

                if (remainingBalance === 0 && !isPaid) {
                  const pForLoan = (soaData?.payments || []).filter(p => p.loan_code === selectedLoanForPayments.loan_code).sort((a, b) => new Date(b.date_paid) - new Date(a.date_paid));
                  if (pForLoan.length > 0) {
                    remainingBalance = Number(pForLoan[0].balance_after) || 0;
                  } else {
                    remainingBalance = Number(selectedLoanForPayments.total_amortization) > 0 ? Number(selectedLoanForPayments.total_amortization) : totalLoan;
                  }
                }

                return (
                  <div className="ph-loan-info-panel">
                    <div className="ph-loan-info-grid">
                      <div className="ph-info-card compact">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-file-earmark-text"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>LOAN REFERENCE</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#2563eb' }}>{selectedLoanForPayments.loan_code}</div>
                        </div>
                      </div>

                      <div className="ph-info-card compact">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-person"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>CLIENT CODE</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{soaData?.customer_code || '-'}</div>
                        </div>
                      </div>

                      <div className="ph-info-card compact">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-calendar3"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>LOAN DATE</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatDateLong(selectedLoanForPayments.date_released)}</div>
                        </div>
                      </div>

                      <div className="ph-info-card compact">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-calendar-event"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>MATURITY DATE</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatDateLong(selectedLoanForPayments.date_maturity)}</div>
                        </div>
                      </div>

                      <div className="ph-info-card wide">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-person-badge"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>CLIENT NAME</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{soaData?.full_name?.toUpperCase() || '-'}</div>
                        </div>
                      </div>

                      <div className="ph-info-card wide">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-cash-stack"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>PRINCIPAL LOAN</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(principal)}</div>
                        </div>
                      </div>

                      <div className="ph-info-card wide">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-piggy-bank"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>INTEREST AMOUNT</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(interestAmount)} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>({interestRate}%)</span></div>
                        </div>
                      </div>

                      <div className="ph-info-card wide">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-wallet2"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>TOTAL LOAN</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(totalLoan)}</div>
                        </div>
                      </div>

                      <div className="ph-info-card xl">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-arrow-repeat"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>AMORTIZATION</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>{formatPhp(selectedLoanForPayments.amortization)}</div>
                        </div>
                      </div>

                      <div className="ph-info-card xl">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-info-circle"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>STATUS</div>
                          <span className={`badge badge-${getLoanStatusClass(selectedLoanForPayments)}`}>{getLoanStatusLabel(selectedLoanForPayments)}</span>
                        </div>
                      </div>

                      <div className="ph-info-card xl">
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e', fontSize: '18px', flexShrink: 0 }}>
                          <i className="bi bi-wallet"></i>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>REMAINING BALANCE</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>{formatPhp(remainingBalance)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <i className="bi bi-file-text" style={{ color: '#2563eb', fontSize: '20px' }}></i>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENT HISTORY</h3>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
                <button
                  type="button"
                  onClick={() => setPenaltyLoan(selectedLoanForPayments)}
                  style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                >
                  <i className="bi bi-calculator"></i> View Penalty
                </button>
              </div>

              {(() => {
                const loanPayments = getPaymentHistoryRows(selectedLoanForPayments);
                return (
                  <>
                    {loanPayments.length > 0 ? (
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px', backgroundColor: '#ffffff' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead style={{ backgroundColor: '#0d6efd', color: '#ffffff' }}>
                            <tr>
                              <th style={{ padding: '10px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <button
                                  type="button"
                                  onClick={() => setPaymentHistoryDateSort(sort => sort === 'desc' ? 'asc' : 'desc')}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    minHeight: '34px',
                                    padding: '6px 10px 6px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.65)',
                                    background: 'rgba(255,255,255,0.18)',
                                    color: '#ffffff',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    Date
                                    <ArrowDownUp size={16} strokeWidth={2.8} />
                                  </span>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '3px 8px',
                                      borderRadius: '999px',
                                      background: '#ffffff',
                                      color: '#0d6efd',
                                      fontSize: '11px',
                                      fontWeight: 900
                                    }}
                                  >
                                    {paymentHistoryDateSort === 'desc' ? <ArrowDown size={14} strokeWidth={3} /> : <ArrowUp size={14} strokeWidth={3} />}
                                    {paymentHistoryDateSort === 'desc' ? 'Newest' : 'Oldest'}
                                  </span>
                                </button>
                              </th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENT CODE</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENTS</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>RUNNING BALANCE</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>USER</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>OFFICIAL RECEIPT NO.</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>PAYMENT TYPE</th>
                              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>STATUS</th>
                              {user?.role === 'admin' && <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>ACTION</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {loanPayments.map((p, index) => {
                              const isReversed = p.status === 'reversed';
                              const statusText = getPaymentStatusText(p);
                              return (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isReversed ? '#fff1f2' : index % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', color: isReversed ? '#94a3b8' : '#0f172a', fontWeight: '500', textDecoration: isReversed ? 'line-through' : 'none' }}>
                                    {formatDateLong(p.date_paid)}
                                  </td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', color: isReversed ? '#94a3b8' : '#2563eb', fontWeight: '600', textDecoration: isReversed ? 'line-through' : 'none' }}>
                                    {p.payment_code || p.id}
                                  </td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '700', color: isReversed ? '#94a3b8' : '#0f172a', textDecoration: isReversed ? 'line-through' : 'none' }}>{formatPhp(p.amount_paid)}</td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '700', color: isReversed ? '#94a3b8' : '#0f172a', textDecoration: isReversed ? 'line-through' : 'none' }}>{formatPhp(p.balance_after)}</td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', fontWeight: '600', color: isReversed ? '#94a3b8' : '#475569', textDecoration: isReversed ? 'line-through' : 'none', whiteSpace: 'nowrap' }}>{getPaymentUserName(p)}</td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', color: isReversed ? '#94a3b8' : '#64748b', textDecoration: isReversed ? 'line-through' : 'none' }}>{p.or_number || '-'}</td>
                                  <td style={{ padding: '16px 24px', fontSize: '14px', color: isReversed ? '#94a3b8' : '#64748b', textDecoration: isReversed ? 'line-through' : 'none' }}>{p.payment_type || p.or_type || '-'}</td>
                                  <td style={{ padding: '16px 24px' }}>
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '4px 12px',
                                      borderRadius: '9999px',
                                      fontSize: '12px',
                                      fontWeight: '600',
                                      backgroundColor: isReversed ? '#ffe4e6' : statusText === 'Penalty' ? '#fff7ed' : statusText === 'Fully Paid' ? '#dcfce7' : '#e0f2fe',
                                      color: isReversed ? '#e11d48' : statusText === 'Penalty' ? '#ea580c' : statusText === 'Fully Paid' ? '#16a34a' : '#0284c7'
                                    }}>
                                      {statusText}
                                    </span>
                                  </td>
                                  {user?.role === 'admin' && (
                                    <td style={{ padding: '16px 24px' }}>
                                      {p.status === 'penalty' && (
                                        <button
                                          onClick={() => setEditingPenaltyPayment(p)}
                                          style={{ padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                                          Edit Penalty
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                        <i className="bi bi-inbox" style={{ fontSize: '32px', color: '#cbd5e1', display: 'block', marginBottom: '8px' }}></i>
                        No payment records found for this loan.
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {penaltyLoan && (() => {
        const computation = getPenaltyComputation(penaltyLoan);
        if (!computation) return null;

        return (
          <div className="modal-overlay" style={{ zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.65)', padding: '20px' }} onClick={() => setPenaltyLoan(null)}>
            <div className="modal-content" style={{ width: '100%', maxWidth: '1000px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '24px 32px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: '#fff7ed' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '52px', height: '52px', borderRadius: '12px', backgroundColor: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c', fontSize: '26px' }}>
                    <i className="bi bi-calculator"></i>
                  </div>
                  <div>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: '800', color: '#9a3412' }}>Overdue Penalty Computation</h2>
                    <div style={{ color: '#c2410c', fontSize: '13px', fontWeight: '500' }}>
                      Loan Reference: <strong>{penaltyLoan.loan_code}</strong> &bull; Client: <strong>{soaData?.full_name}</strong>
                    </div>
                  </div>
                </div>
                <button onClick={() => setPenaltyLoan(null)} style={{ background: 'none', border: 'none', color: '#9a3412', fontSize: '28px', cursor: 'pointer', padding: '4px', lineHeight: '1' }}>&times;</button>
              </div>

              <div style={{ padding: '28px 32px', overflowY: 'auto', backgroundColor: '#ffffff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>REGISTERED OUTSTANDING BALANCE</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a' }}>{formatPhpExact(computation.registeredOutstanding)}</div>
                  </div>
                  <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#1d4ed8', textTransform: 'uppercase', marginBottom: '4px' }}>PAYMENTS BEFORE DUE DATE</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#2563eb' }}>{formatPhpExact(computation.paymentsBeforeDue)}</div>
                  </div>
                  <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#fff7ed', border: '1px solid #fed7aa' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#c2410c', textTransform: 'uppercase', marginBottom: '4px' }}>BEGINNING OVERDUE BALANCE</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#ea580c' }}>{formatPhpExact(computation.beginningOverdueBalance)}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '12px', backgroundColor: computation.isPastGracePeriod ? '#fef2f2' : '#f0fdf4', border: `1px solid ${computation.isPastGracePeriod ? '#fecaca' : '#bbf7d0'}`, fontSize: '13px', color: computation.isPastGracePeriod ? '#991b1b' : '#166534', lineHeight: 1.5 }}>
                  <strong>Grace Period Status:</strong> Maturity date was <strong>{formatDateLong(penaltyLoan.date_maturity)}</strong>. 3-day grace period ended on <strong>{formatDateLong(computation.gracePeriodEnd)}</strong>.
                  {computation.isPastGracePeriod ? (
                    <span> Account is currently <strong style={{ color: '#dc2626' }}>{computation.overdueDays} days overdue</strong>. Penalty of 5% per 30-day month applies.</span>
                  ) : (
                    <span> Account is within the grace period or not yet past due. No automatic penalty computed.</span>
                  )}
                </div>

                <h3 style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                  MONTHLY PENALTY BREAKDOWN (5% PER 30 DAYS)
                </h3>

                {computation.rows.length > 0 ? (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead style={{ backgroundColor: '#f8fafc', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                          <th style={{ padding: '12px 16px', fontWeight: '700' }}>PERIOD / COVERAGE</th>
                          <th style={{ padding: '12px 16px', fontWeight: '700' }}>BEGINNING BAL.</th>
                          <th style={{ padding: '12px 16px', fontWeight: '700' }}>PAYMENT MADE</th>
                          <th style={{ padding: '12px 16px', fontWeight: '700' }}>PENALTY BASE</th>
                          <th style={{ padding: '12px 16px', fontWeight: '700' }}>RATE</th>
                          <th style={{ padding: '12px 16px', fontWeight: '700' }}>MONTHLY PENALTY</th>
                          <th style={{ padding: '12px 16px', fontWeight: '700' }}>CUMULATIVE PENALTY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {computation.rows.map((row) => (
                          <tr key={row.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '14px 16px', fontWeight: '600', color: '#1e293b' }}>{row.periodLabel}</td>
                            <td style={{ padding: '14px 16px', fontWeight: '700', color: '#0f172a' }}>{formatPhpExact(row.beginningBalance)}</td>
                            <td style={{ padding: '14px 16px', fontWeight: '700', color: row.paymentMade > 0 ? '#dc2626' : '#2563eb' }}>{formatPhpDeduction(row.paymentMade)}</td>
                            <td style={{ padding: '14px 16px', fontWeight: '700', color: '#ea580c' }}>{formatPhpExact(row.penaltyBase)}</td>
                            <td style={{ padding: '14px 16px', fontWeight: '600', color: '#64748b' }}>{row.isManual ? 'MANUAL' : `${row.monthlyPenaltyRate}%`}</td>
                            <td style={{ padding: '14px 16px', fontWeight: '700', color: '#16a34a' }}>{formatPhpExact(row.monthlyPenalty)}</td>
                            <td style={{ padding: '14px 16px', fontWeight: '800', color: '#16a34a' }}>{formatPhpExact(row.penaltySubtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', marginBottom: '24px' }}>
                    No penalty records applicable for this loan.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>REMAINING OVERDUE BALANCE</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a' }}>{formatPhpExact(computation.remainingOverdueBalance)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#ea580c', textTransform: 'uppercase', marginBottom: '4px' }}>TOTAL ACCUMULATED PENALTY</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#ea580c' }}>{formatPhpExact(computation.totalPenalty)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#059669', textTransform: 'uppercase', marginBottom: '4px' }}>TOTAL UPDATED AMOUNT DUE</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#059669' }}>{formatPhpExact(computation.updatedAmountDue)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {editingPenaltyPayment && (
        <div className="modal-overlay" style={{ zIndex: 100002, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.65)', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '420px', background: '#ffffff', borderRadius: '16px', padding: '24px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>Edit Penalty Payment</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Penalty Amount (PHP)</label>
              <input
                type="number"
                id="editPenaltyAmountInput"
                defaultValue={editingPenaltyPayment.amount_paid}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Penalty Date</label>
              <input
                type="date"
                id="editPenaltyDateInput"
                defaultValue={editingPenaltyPayment.date_paid ? String(editingPenaltyPayment.date_paid).split('T')[0] : ''}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '15px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setEditingPenaltyPayment(null)}
                style={{ flex: 1, padding: '10px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  const amt = document.getElementById('editPenaltyAmountInput').value;
                  const penaltyDate = document.getElementById('editPenaltyDateInput').value;
                  if (!amt || isNaN(amt) || Number(amt) < 0) return alert('Invalid amount');
                  if (!penaltyDate) return alert('Please select a penalty date');
                  try {
                    await API.put(`/payments/${editingPenaltyPayment.id}/penalty-amount`, { amount_paid: amt, date_paid: penaltyDate });
                    setEditingPenaltyPayment(null);
                    fetchSoaData(soaData.id);
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

      {editLoanModal && (
        <div className="modal-overlay" style={{ zIndex: 100003, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.65)', padding: 20 }} onClick={() => setEditLoanModal(null)}>
          <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(15, 23, 42, 0.28)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Edit Loan Information</h3>
              <button type="button" onClick={() => setEditLoanModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>&times;</button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setEditLoanError(null);
              try {
                const isLoanTypeOnlyEdit = !editLoanModal.__financialTouched;
                const payload = isLoanTypeOnlyEdit
                  ? { loan_type: editLoanModal.loan_type, loan_type_only: true }
                  : editLoanModal;
                await API.put(`/loans/${editLoanModal.id}/edit`, payload);
                const idToReload = editLoanModal.customer_id || soaData?.id;
                setEditLoanModal(null);
                fetchSoaData(idToReload);
                if (onRefresh) onRefresh();
              } catch (err) {
                setEditLoanError(err.response?.data?.error || 'Failed to update loan');
              }
            }}>
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {editLoanError && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{editLoanError}</div>}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Loan Code</label>
                  <input type="text" className="form-control" value={editLoanModal.loan_code || ''} disabled style={{ background: '#f8fafc' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Loan Type</label>
                  <select
                    className="form-control"
                    value={editLoanModal.loan_type || 'New'}
                    onChange={e => { setEditLoanError(null); setEditLoanModal({ ...editLoanModal, loan_type: e.target.value, __loanTypeTouched: true }); }}
                  >
                    <option value="New">New</option>
                    <option value="Reloan">Reloan</option>
                    <option value="Recon">Recon</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Principal Amount (PHP)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editLoanModal.principal || ''}
                    onChange={e => setEditLoanModal({ ...editLoanModal, principal: e.target.value, __financialTouched: true })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Interest Rate (%)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editLoanModal.interest_rate || 0}
                    onChange={e => setEditLoanModal({ ...editLoanModal, interest_rate: e.target.value, __financialTouched: true })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Loan Period (Days)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editLoanModal.loan_period || ''}
                    onChange={e => setEditLoanModal({ ...editLoanModal, loan_period: e.target.value, __financialTouched: true })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Date Released</label>
                  <input
                    type="date"
                    className="form-control"
                    value={editLoanModal.date_released || ''}
                    onChange={e => setEditLoanModal({ ...editLoanModal, date_released: e.target.value, __financialTouched: true })}
                  />
                </div>
              </div>
              <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {!['cancelled', 'canceled'].includes(String(editLoanModal.status || '').toLowerCase()) && (
                  <button type="button" className="btn btn-outline-danger" onClick={initiateCancelLoanFromSoa}>Cancel Loan</button>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn btn-light" onClick={() => setEditLoanModal(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Changes</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {cancelConfirmModal?.show && (
        <div className="modal-overlay" style={{ zIndex: 100004, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.72)', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(15, 23, 42, 0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px 26px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <i className="bi bi-exclamation-triangle" style={{ fontSize: 22 }}></i>
              </div>
              <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0f172a' }}>Cancel this loan?</h3>
              <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>
                This will mark <strong style={{ color: '#0f172a' }}>{cancelConfirmModal.loan?.loan_code || `Loan ${cancelConfirmModal.loan?.id}`}</strong> as cancelled.
              </p>
              {cancelConfirmModal.error && (
                <div style={{ marginTop: 12, background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                  {cancelConfirmModal.error}
                </div>
              )}
            </div>
            <div style={{ padding: '16px 26px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-light" onClick={() => setCancelConfirmModal(null)} disabled={cancelConfirmModal.processing}>Back</button>
              <button type="button" className="btn btn-danger" onClick={confirmCancelLoanFromSoa} disabled={cancelConfirmModal.processing}>
                {cancelConfirmModal.processing ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reloanModalOpen && (
        <ReloanModal
          customer={soaData}
          onClose={() => setReloanModalOpen(false)}
          onSuccess={() => {
            setReloanModalOpen(false);
            if (soaData?.id) fetchSoaData(soaData.id);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </>
  );
}
