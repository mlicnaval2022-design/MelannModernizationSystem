import { useEffect, useState, useRef } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import './Payments.css'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const today = () => {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}
const formatDateTime = date => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
const formatDate = date => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}
const byCollectorCode = (a, b) =>
  String(a.collector_code || '').localeCompare(String(b.collector_code || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
const collectorLabel = collector =>
  [collector.collector_code, `${collector.first_name} ${collector.last_name}`.trim()].filter(Boolean).join(' - ')

export default function Payments() {
  const { hasRole, hasPermission } = useAuth()
  // Reversals are a destructive payment action, so expose them to legacy
  // manager roles and to any role explicitly granted Payments CRUD access.
  const canReversePayment = hasRole('admin', 'manager') || hasPermission('payments', 'crud')
  const [activeTab, setActiveTab] = useState('encode')
  const [collectors, setCollectors] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [searchTable, setSearchTable] = useState('')
  const [reverseClientCode, setReverseClientCode] = useState('')
  const [reverseCustomer, setReverseCustomer] = useState(null)
  const [reversePayments, setReversePayments] = useState([])
  const [reverseLatestLoan, setReverseLatestLoan] = useState(null)
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([])
  const [reverseLoading, setReverseLoading] = useState(false)
  const [reverseMessage, setReverseMessage] = useState(null)
  
  const [selectedCollector, setSelectedCollector] = useState('')
  const [scannerInput, setScannerInput] = useState('')
  
  const [activeLoan, setActiveLoan] = useState(null)
  
  const [form, setForm] = useState({ amount_paid: '', date_paid: today(), remarks: '', is_recon: false })
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState(null)
  const [confirmModal, setConfirmModal] = useState(null)
  
  const scannerRef = useRef(null)
  const amountInputRef = useRef(null)

  const [clientList, setClientList] = useState([])

  useEffect(() => {
    API.get('/collectors').then(r => setCollectors(r.data.filter(c => c.is_active).sort(byCollectorCode)))
    loadRecentPayments()
  }, [])

  useEffect(() => {
    if (selectedCollector) {
      API.get('/loans/sheet/collection', { params: { collector_id: selectedCollector } })
        .then(r => setClientList(r.data.loans || []))
        .catch(console.error)
    } else {
      setClientList([])
    }
  }, [selectedCollector])

  const loadRecentPayments = (search = '') => {
    API.get('/payments', { params: { search } })
      .then(r => setRecentPayments(r.data))
      .catch(console.error)
  }

  const handleScan = async (e, codeToScan = null) => {
    if (e) e.preventDefault()
    const targetCode = codeToScan || scannerInput.trim()
    if (!targetCode) return
    setNotification(null)
    setActiveLoan(null)
    setForm({ amount_paid: '', date_paid: today(), remarks: '', is_recon: false })
    
    if (!selectedCollector) {
      setNotification({ type: 'warning', message: 'Please select a collector first.' })
      return
    }

    try {
      const r = await API.get('/loans/lookup/client', { params: { code: targetCode } })
      const loan = r.data
      
      if (String(loan.collector_id) !== String(selectedCollector)) {
        setNotification({ type: 'warning', message: 'Client does not belong to the selected collector.' })
      } else {
        setActiveLoan(loan)
        setForm({ amount_paid: 0, date_paid: today(), remarks: '', is_recon: false })
        setNotification({ type: 'success', message: 'Customer Loaded Successfully' })
        setTimeout(() => {
          if (amountInputRef.current) {
            amountInputRef.current.focus()
            amountInputRef.current.select()
          }
        }, 50)
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Customer code not found.'
      setNotification({ type: 'danger', message: msg })
    }
  }

  const handlePost = async (e, force_duplicate = false) => {
    if (e) e.preventDefault()
    if (saving && !force_duplicate) return
    if (!activeLoan) return
    
    const amount = Number(form.amount_paid)
    if (!amount || amount <= 0) {
      setNotification({ type: 'danger', message: 'Please enter a valid payment amount.' })
      return
    }

    setNotification(null)
    setSaving(true)
    try {
      const payload = {
        loan_id: activeLoan.id,
        or_number: 'N/A',
        date_paid: form.date_paid,
        amount_paid: form.amount_paid,
        collector_id: selectedCollector,
        remarks: form.remarks,
        is_recon: Boolean(form.is_recon),
        force_duplicate
      }
      const r = await API.post('/payments', payload)
      
      setActiveLoan(null)
      setScannerInput('')
      setForm({ amount_paid: '', date_paid: today(), remarks: '', is_recon: false })
      loadRecentPayments()
      
      const isReconPayment = Boolean(r.data.is_recon || form.is_recon || r.data.status === 'recon');
      const successMessage = isReconPayment
        ? `Reconstruction Payment Posted. Customer is now Fully Paid. Payment Code: ${r.data.payment_code}`
        : r.data.loan_status === 'fullpaid'
        ? `Customer is now Fully Paid. Payment Code: ${r.data.payment_code}`
        : `Payment Successfully Posted. Payment Code: ${r.data.payment_code}`

      setNotification({ type: 'success', message: successMessage })

      // Do not jump the viewport to the scanner at the top after saving.
      if (scannerRef.current) scannerRef.current.focus({ preventScroll: true })
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.is_duplicate) {
        setConfirmModal({
          title: 'Duplicate Payment Detected',
          message: err.response.data.error,
          subMessage: 'Do you want to post it anyway?',
          confirmText: 'Yes, Post Anyway',
          onConfirm: async () => {
            setConfirmModal(null)
            await handlePost(null, true)
          },
          onCancel: () => setConfirmModal(null)
        })
      } else if (err.response?.data?.is_loan_timeline_conflict) {
        setConfirmModal({
          title: 'Payment Posting Blocked',
          message: err.response.data.error,
          subMessage: 'Review the client SOA or post only to the correct active loan period.',
          confirmText: null,
          tone: 'danger',
          onCancel: () => setConfirmModal(null)
        })
      } else {
        setNotification({ type: 'danger', message: err.response?.data?.error || 'Error posting payment' })
      }
    } finally {
      setSaving(false)
    }
  }

  const handlePaymentFormKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent?.isComposing) return
    if (e.target.closest('.search-area')) return

    e.preventDefault()
    if (activeLoan) {
      handlePost(e)
    } else if (e.target === scannerRef.current) {
      handleScan(e)
    }
  }

  const cancelEncoding = () => {
    setActiveLoan(null)
    setScannerInput('')
    setForm({ amount_paid: '', date_paid: today(), remarks: '', is_recon: false })
    setNotification(null)
    if (scannerRef.current) scannerRef.current.focus()
  }
  
  const handleTableSearch = (e) => {
    if (e.key === 'Enter') {
      loadRecentPayments(searchTable);
    }
  }

  const handleReverseSearch = async (e) => {
    e.preventDefault()
    setReverseCustomer(null)
    setReversePayments([])
    setReverseLatestLoan(null)
    setSelectedPaymentIds([])
    setReverseMessage(null)

    if (!reverseClientCode) {
      setReverseMessage({ type: 'danger', message: 'Please enter a Client Code.' })
      return
    }

    setReverseLoading(true)
    try {
      const { data } = await API.get(`/reversals/client/${reverseClientCode.trim()}/payments`)
      setReverseCustomer(data.customer)
      setReverseLatestLoan(data.latest_loan || null)
      setReversePayments(data.payments || [])
      if (!data.payments || data.payments.length === 0) {
        setReverseMessage({ type: 'danger', message: 'No payment records found for this client latest loan.' })
      }
    } catch (err) {
      setReverseMessage({ type: 'danger', message: err.response?.data?.error || 'Error finding payments.' })
    } finally {
      setReverseLoading(false)
    }
  }

  const clearReverseSearch = () => {
    setReverseClientCode('')
    setReverseCustomer(null)
    setReversePayments([])
    setReverseLatestLoan(null)
    setSelectedPaymentIds([])
    setReverseMessage(null)
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const activeIds = reversePayments.filter(p => p.status === 'active').map(p => p.id)
      setSelectedPaymentIds(activeIds)
    } else {
      setSelectedPaymentIds([])
    }
  }

  const handleSelectPayment = (id) => {
    setSelectedPaymentIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    )
  }

  const [previewModal, setPreviewModal] = useState(false)

  const handlePreviewReversal = () => {
    if (selectedPaymentIds.length === 0) {
      setReverseMessage({ type: 'danger', message: 'Please select at least one payment to preview reversal.' })
      return
    }
    setPreviewModal(true)
  }

  const handleReverseBatch = async () => {
    if (selectedPaymentIds.length === 0 || !canReversePayment) return
    const reason = 'N/A'

    try {
      await API.post('/reversals/batch', {
        payment_ids: selectedPaymentIds,
        reason
      })
      setReverseMessage({ type: 'success', message: 'Batch reversal processed successfully.' })
      await handleReverseSearch({ preventDefault: () => {} })
      loadRecentPayments()
    } catch (err) {
      setReverseMessage({ type: 'danger', message: err.response?.data?.error || 'Error processing batch reversal.' })
    }
  }

  const [reverseLoanClientCode, setReverseLoanClientCode] = useState('')
  const [reverseLoanCustomer, setReverseLoanCustomer] = useState(null)
  const [reverseLoansList, setReverseLoansList] = useState([])
  const [selectedLoanIds, setSelectedLoanIds] = useState([])
  const [reverseLoanLoading, setReverseLoanLoading] = useState(false)
  const [reverseLoanMessage, setReverseLoanMessage] = useState(null)
  const [previewReverseLoanModal, setPreviewReverseLoanModal] = useState(false)

  const handleReverseLoanSearch = async (e) => {
    e.preventDefault()
    setReverseLoanCustomer(null)
    setReverseLoansList([])
    setSelectedLoanIds([])
    setReverseLoanMessage(null)

    if (!reverseLoanClientCode) {
      setReverseLoanMessage({ type: 'danger', message: 'Please enter a Client Code.' })
      return
    }

    setReverseLoanLoading(true)
    try {
      const { data } = await API.get(`/loans`, { params: { search: reverseLoanClientCode.trim() } })
      const exactMatches = data.filter(l => String(l.customer_code).toLowerCase() === String(reverseLoanClientCode.trim()).toLowerCase())
      if (exactMatches.length > 0) {
        setReverseLoanCustomer({ customer_code: exactMatches[0].customer_code, full_name: exactMatches[0].customer_name })
        setReverseLoansList(exactMatches)
      } else {
        setReverseLoanMessage({ type: 'danger', message: 'No loan records found for this exact client code.' })
      }
    } catch (err) {
      setReverseLoanMessage({ type: 'danger', message: err.response?.data?.error || 'Error finding loans.' })
    } finally {
      setReverseLoanLoading(false)
    }
  }

  const clearReverseLoanSearch = () => {
    setReverseLoanClientCode('')
    setReverseLoanCustomer(null)
    setReverseLoansList([])
    setSelectedLoanIds([])
    setReverseLoanMessage(null)
  }

  const handleSelectAllLoans = (e) => {
    if (e.target.checked) {
      const activeIds = reverseLoansList.filter(l => l.status !== 'reversed').map(l => l.id)
      setSelectedLoanIds(activeIds)
    } else {
      setSelectedLoanIds([])
    }
  }

  const handleSelectLoan = (id) => {
    setSelectedLoanIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    )
  }

  const handlePreviewReverseLoan = () => {
    if (selectedLoanIds.length === 0) {
      setReverseLoanMessage({ type: 'danger', message: 'Please select at least one loan to preview reversal.' })
      return
    }
    setPreviewReverseLoanModal(true)
  }

  const handleReverseLoanBatch = async () => {
    if (selectedLoanIds.length === 0 || !canReversePayment) return

    try {
      await Promise.all(selectedLoanIds.map(id => 
        API.put(`/loans/${id}/status`, { status: 'reversed' })
      ))
      setReverseLoanMessage({ type: 'success', message: 'Loans reversed successfully.' })
      setPreviewReverseLoanModal(false)
      await handleReverseLoanSearch({ preventDefault: () => {} })
    } catch (err) {
      setReverseLoanMessage({ type: 'danger', message: err.response?.data?.error || 'Error processing loan reversal.' })
    }
  }

  const formatCurrency = value => `₱${fmt(value)}`
  const formatPaymentDate = value => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  
  const getSelectedPayments = () => reversePayments.filter(p => selectedPaymentIds.includes(p.id))
  const totalSelectedAmount = getSelectedPayments().reduce((sum, p) => sum + p.amount_paid, 0)

  return (
    <div className="payments-container">
      <div className="payments-header">
        <div>
          <h2 className="payments-title">
            <span className="payments-title-icon">🧾</span>
            Encode Payments
          </h2>
          <p className="payments-subtitle">Record payments for clients and automatically update their account balance.</p>
        </div>
      </div>

      {notification && (
        <div className="payments-notification" style={{
          background: notification.type === 'danger' ? '#fef2f2' : notification.type === 'warning' ? '#fffbeb' : '#f0fdf4',
          borderColor: notification.type === 'danger' ? '#fca5a5' : notification.type === 'warning' ? '#fcd34d' : '#bbf7d0',
          color: notification.type === 'danger' ? '#991b1b' : notification.type === 'warning' ? '#92400e' : '#166534'
        }}>
          {notification.type === 'success' && <span className="icon">✓</span>}
          {notification.type === 'warning' && <span>⚠️</span>}
          {notification.type === 'danger' && <span>❌</span>}
          <span>NOTIFICATION: {notification.message}</span>
        </div>
      )}

      <div className="payment-tabs">
        <button className={`payment-tab ${activeTab === 'encode' ? 'active' : ''}`} onClick={() => setActiveTab('encode')}>
          Encode Payment
        </button>
        {canReversePayment && (
          <>
            <button className={`payment-tab ${activeTab === 'reverse' ? 'active' : ''}`} onClick={() => setActiveTab('reverse')}>
              Reverse Payment
            </button>
          </>
        )}
      </div>

      {activeTab === 'encode' && (
      <div className="payments-card">
        <div className="payments-card-header">
          <span className="icon">💳</span>
          Payment Form
        </div>
        
        <div className="payments-form-body" onKeyDown={handlePaymentFormKeyDown}>
          <div className="p-row">
            {/* LEFT COLUMN */}
            <div className="p-col-6" style={{ paddingRight: '40px' }}>
              
              <div className="p-form-group" style={{ alignItems: 'center' }}>
                <label className="p-label">Collector <span className="req">*</span></label>
                <div className="p-input-wrapper">
                  <select className="p-input" value={selectedCollector} onChange={e => {
                    setSelectedCollector(e.target.value)
                    setScannerInput('')
                    setActiveLoan(null)
                    setNotification(null)
                  }} style={{ appearance: 'none' }}>
                    <option value="">-- Select Collector --</option>
                    {collectors.map(c => <option key={c.id} value={c.id}>{collectorLabel(c)}</option>)}
                  </select>
                  <span className="p-icon-right">⌄</span>
                </div>
              </div>

              <div className="p-form-group" style={{ alignItems: 'flex-start' }}>
                <label className="p-label" style={{ marginTop: '8px' }}>Code <span className="req">*</span></label>
                <div className="p-input-wrapper">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input 
                      ref={scannerRef}
                      type="text" 
                      className="p-input" 
                      value={scannerInput}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '');
                        setScannerInput(val);
                        if (activeLoan && activeLoan.customer_code !== val) {
                          setActiveLoan(null);
                          setForm({ amount_paid: '', date_paid: today(), remarks: '' });
                        }
                      }}
                      placeholder="00234"
                    />
                    {activeLoan && <span className="badge-found" style={{ position: 'static', transform: 'none', whiteSpace: 'nowrap' }}>✓ Found</span>}
                  </div>
                  <span className="p-help-text">Enter customer code. Details will be loaded automatically.</span>
                </div>
              </div>

              <div className="p-form-group">
                <label className="p-label">Customer</label>
                <div className="p-input-wrapper">
                  <input type="text" className="p-input" readOnly value={activeLoan?.customer_name || ''} />
                </div>
              </div>

              <div className="p-form-group">
                <label className="p-label">Principal</label>
                <div className="p-input-wrapper">
                  <input type="text" className="p-input" readOnly value={activeLoan ? `₱ ${fmt(activeLoan.principal)}` : ''} />
                </div>
              </div>

              <div className="p-form-group">
                <label className="p-label">Amortization</label>
                <div className="p-input-wrapper">
                  <input type="text" className="p-input" readOnly value={activeLoan ? `₱ ${fmt(activeLoan.amortization)}` : ''} />
                </div>
              </div>

              <div className="p-form-group">
                <label className="p-label">Date Released</label>
                <div className="p-input-wrapper">
                  <input type="text" className="p-input" readOnly value={formatDate(activeLoan?.date_released)} />
                  <span className="p-icon-right">📅</span>
                </div>
              </div>

              <div className="p-form-group">
                <label className="p-label">Maturity</label>
                <div className="p-input-wrapper">
                  <input type="text" className="p-input" readOnly value={formatDate(activeLoan?.date_maturity)} />
                  <span className="p-icon-right">📅</span>
                </div>
              </div>

              <div className="p-form-group" style={{ alignItems: 'flex-start' }}>
                <label className="p-label" style={{ marginTop: '8px' }}>Notes</label>
                <div className="p-input-wrapper">
                  <textarea className="p-input" placeholder="Optional notes..." rows="3" style={{ resize: 'none' }} value={form.remarks} onChange={e => setForm({...form, remarks: e.target.value})} disabled={!activeLoan}></textarea>
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN */}
            <div className="p-col-6">
              <div className="p-row">
                {/* Right Side - Column 1 */}
                <div className="p-col-6">
                  
                  <div className="p-form-group" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <label className="p-label" style={{ marginBottom: '8px' }}>Date <span className="req">*</span></label>
                    <div className="p-input-wrapper" style={{ width: '100%' }}>
                      <input type="text" className="p-input" readOnly value={formatDateTime(new Date())} />
                      <span className="p-icon-right">📅</span>
                    </div>
                  </div>

                  <div className="info-card">
                    <div className="info-card-title">
                      <span className="icon">📄</span> Balance Info
                    </div>
                    <div className="info-row">
                      <span className="lbl">Amortization</span>
                      <span className="val">₱ {activeLoan ? fmt(activeLoan.amortization) : '0.00'}</span>
                    </div>
                    <div className="info-row">
                      <span className="lbl">Payments made</span>
                      <span className="val">₱ {activeLoan ? fmt(activeLoan.total_payments_made) : '0.00'}</span>
                    </div>
                    <div className="info-total">
                      <span>Total Balance</span>
                      <span>₱ {activeLoan ? fmt(activeLoan.balance) : '0.00'}</span>
                    </div>
                  </div>

                  <div className="settlements-card">
                    <div className="info-card-title">
                      <span className="icon" style={{ borderColor: '#bbf7d0' }}>💳</span> Settlements
                    </div>
                    <div className="info-row">
                      <span className="lbl">Outstanding Balance</span>
                      <span className="val">₱ {activeLoan ? fmt(activeLoan.balance) : '0.00'}</span>
                    </div>
                    <div className="info-row">
                      <span className="lbl">Less: Amount Paid <span className="req">*</span></span>
                      <input 
                        type="number" 
                        step="0.01" 
                        className="p-input" 
                        style={{ width: '100px', padding: '4px 8px', textAlign: 'right', fontWeight: 'bold' }} 
                        placeholder="₱ 0.00" 
                        ref={amountInputRef}
                        value={form.amount_paid} 
                        onChange={e => setForm({...form, amount_paid: e.target.value})}
                        disabled={!activeLoan}
                      />
                    </div>
                    <div className="info-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: activeLoan ? 'pointer' : 'default', userSelect: 'none', margin: 0 }}>
                        <input 
                          type="checkbox" 
                          id="recon-checkbox"
                          checked={Boolean(form.is_recon)} 
                          disabled={!activeLoan}
                          onChange={e => {
                            const checked = e.target.checked;
                            setForm(prev => ({
                              ...prev,
                              is_recon: checked,
                              amount_paid: checked && activeLoan ? String(activeLoan.balance) : prev.amount_paid
                            }));
                          }} 
                          style={{ width: '17px', height: '17px', accentColor: '#7c3aed', cursor: activeLoan ? 'pointer' : 'default' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: '700', color: form.is_recon ? '#6d28d9' : '#334155' }}>
                          Recon (Reconstruct)
                        </span>
                      </label>
                      {form.is_recon && (
                        <span style={{ fontSize: '11px', fontWeight: '800', backgroundColor: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '12px', border: '1px solid #ddd6fe' }}>
                          RECON ONLY
                        </span>
                      )}
                    </div>
                    <div className="info-total">
                      <span>Total Balance</span>
                      <span>₱ {activeLoan ? fmt(Math.max(0, activeLoan.balance - (parseFloat(form.amount_paid) || 0))) : '0.00'}</span>
                    </div>
                  </div>

                </div>

                {/* Right Side - Column 2 */}
                <div className="p-col-6">
                  
                  <div style={{ height: '58px' }}></div> {/* Spacer to align with Date field */}

                  <div className="clients-list-card" style={{ marginBottom: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e3a8a', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Clients ({clientList.length})</span>
                    </div>
                    <div className="clients-list-container">
                      {clientList.length === 0 ? (
                        <div style={{ color: '#64748b', fontSize: '11px', padding: '20px', textAlign: 'center' }}>
                          {selectedCollector ? 'No clients found.' : 'Select a collector first.'}
                        </div>
                      ) : (
                        clientList.map(c => (
                          <div 
                            key={c.id} 
                            className={`client-list-item ${c.customer_code === scannerInput ? 'active' : ''}`}
                            onClick={() => {
                              setScannerInput(c.customer_code)
                              handleScan(null, c.customer_code)
                            }}
                          >
                            <span className="c-code">{c.customer_code}</span>
                            <span className="c-name">{c.customer_name}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="p-form-group" style={{ flexDirection: 'column', alignItems: 'flex-start', marginTop: 'auto' }}>
                    <label className="p-label" style={{ marginBottom: '8px' }}>Date Payment <span className="req">*</span></label>
                    <div className="p-input-wrapper" style={{ width: '100%' }}>
                      <input 
                        type="date" 
                        className="p-input" 
                        value={form.date_paid} 
                        onChange={e => setForm({...form, date_paid: e.target.value})} 
                        disabled={!activeLoan}
                      />
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Command Prompt */}
        <div className="cmd-prompt">
          <div className="cmd-left">
            <div className="cmd-icon">&gt;_</div>
            <div>
              <div className="cmd-title">Command Prompt</div>
              <div className="cmd-desc">Enter customer code and press <span style={{ fontWeight: 'bold' }}>Enter ↵</span> to load details automatically.<br/>Example: 00234</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Press <span style={{ background: '#fff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '4px 8px', color: '#3b82f6' }}>Enter ↵</span>
          </div>
        </div>

        {/* Search Area */}
        <div className="search-area">
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>Search Here</div>
          <div className="search-input-wrapper">
            <span className="icon">🔍</span>
            <input 
              type="text" 
              className="search-input" 
              placeholder="Search by code, customer name, or date..." 
              value={searchTable}
              onChange={e => setSearchTable(e.target.value)}
              onKeyDown={handleTableSearch}
            />
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            Search using customer code, customer name or encoded date.
          </div>
        </div>

        {/* Table */}
        <div className="p-table-wrapper">
          <table className="p-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Code</th>
                <th>Customer</th>
                <th>Total Balance</th>
                <th>Date Released</th>
                <th>Date Payment</th>
                <th>Principal</th>
                <th>Amortization</th>
                <th>Other Charges</th>
                <th>Amount Paid</th>
                <th>Date Encoded</th>
                <th>Collector</th>
                <th>Fully Paid</th>
              </tr>
            </thead>
            <tbody>
              {(searchTable ? recentPayments : recentPayments.slice(0, 3)).map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>{p.customer_code}</td>
                  <td className="fw-bold">{p.customer_name}</td>
                  <td className="fw-bold">₱ {fmt(p.balance_after)}</td>
                  <td>{formatDate(p.date_released)}</td>
                  <td>{formatDate(p.date_paid)}</td>
                  <td>₱ {fmt(p.principal)}</td>
                  <td>₱ {fmt(p.amortization)}</td>
                  <td>₱ 0.00</td>
                  <td className="fw-bold" style={{ color: '#1e3a8a' }}>₱ {fmt(p.amount_paid)}</td>
                  <td>{formatDateTime(p.created_at)}</td>
                  <td>{p.collector_name}</td>
                  <td>
                    {p.status === 'recon' || p.payment_type === 'recon' || String(p.remarks || '').toLowerCase().includes('recon') ? (
                      <span style={{ color: '#7c3aed', fontWeight: '700', background: '#ede9fe', padding: '4px 8px', borderRadius: '4px' }}>
                        {Number(p.balance_after) <= 0 ? 'Fully Paid(Recon)' : 'Recon'}
                      </span>
                    ) : p.loan_status === 'fullpaid' || p.balance_after <= 0 ? (
                      <span className="badge-no">Yes</span>
                    ) : (
                      <span style={{ color: '#ef4444', fontWeight: '600', background: '#fef2f2', padding: '4px 8px', borderRadius: '4px' }}>No</span>
                    )}
                  </td>
                </tr>
              ))}
              {recentPayments.length === 0 && (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No recent payments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="p-footer">
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="p-btn p-btn-primary" onClick={handlePost} disabled={!activeLoan || saving}>
              💾 Save Payment
            </button>
            <button className="p-btn p-btn-secondary" onClick={cancelEncoding}>
              ✕ Cancel
            </button>
          </div>
          <div className="p-note">
            <span style={{ border: '1px solid #2563eb', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>i</span>
            NOTE: Code must only be used by numbers.
          </div>
        </div>

      </div>
      )}

      {activeTab === 'reverse' && (
        <div className="reverse-payment-shell">
          <div className="reverse-payment-header">
            <div className="reverse-title-wrap">
              <span className="reverse-title-icon">↩</span>
              <div>
                <h2>Reverse Payment</h2>
                <p>Search and reverse existing payment transactions safely.</p>
              </div>
            </div>
          </div>

          {reverseMessage && (
            <div className={`reverse-alert ${reverseMessage.type}`}>{reverseMessage.message}</div>
          )}

          <div className="reverse-main-grid" style={{ gridTemplateColumns: '1fr' }}>
            <form className="reverse-search-card" onSubmit={handleReverseSearch} style={{ maxWidth: '400px', margin: '0 auto 20px auto' }}>
              <h3><span>⌕</span> Search Client</h3>
              <label>Client Code <b>*</b></label>
              <div className="reverse-field">
                <span>♙</span>
                <input value={reverseClientCode} onChange={e => setReverseClientCode(e.target.value.replace(/\D/g, ''))} placeholder="1598" autoFocus />
                {reverseClientCode && <em>✓</em>}
              </div>
              <small>Enter the client code to fetch all their payments.</small>

              <button type="submit" className="reverse-search-btn" disabled={reverseLoading} style={{ marginTop: '16px' }}>
                {reverseLoading ? 'Searching...' : '⌕ Search Payments'}
              </button>
              {reverseCustomer && (
                <div style={{ marginTop: '14px', padding: '12px', border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: '10px', display: 'grid', gap: '8px' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client Name</span>
                    <strong style={{ color: '#0f172a', fontSize: '14px' }}>{reverseCustomer.full_name || '-'}</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loan Cycle</span>
                      <strong style={{ color: '#1d4ed8', fontSize: '14px' }}>Cycle {reverseLatestLoan?.loan_cycle || '-'}</strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Loan No.</span>
                      <strong style={{ color: '#1d4ed8', fontSize: '14px' }}>{reverseLatestLoan?.loan_code || '-'}</strong>
                    </div>
                  </div>
                </div>
              )}
            </form>

            <div className="reverse-details-card" style={{ gridColumn: 'span 1' }}>
              <div className="reverse-section-title" style={{ alignItems: 'flex-start', gap: '16px' }}>
                <h3><span>▤</span> Payment Transaction History</h3>
                {reverseCustomer && (
                  <span className="reverse-status posted" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                    {reverseCustomer.full_name} ({reverseCustomer.customer_code})
                  </span>
                )}
                {reverseCustomer && reverseLatestLoan && (
                  <span className="reverse-status posted" style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                    Latest loan only: {reverseLatestLoan.loan_code} - {reverseLatestLoan.loan_type || 'Loan'} - {reverseLatestLoan.date_released || '-'}
                  </span>
                )}
                {reverseCustomer && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selected</span>
                      <strong style={{ fontSize: '16px', color: '#0f172a' }}>{selectedPaymentIds.length}</strong>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</span>
                      <strong style={{ fontSize: '16px', color: '#ef4444' }}>{formatCurrency(totalSelectedAmount)}</strong>
                    </div>
                    <button className="reverse-clear-btn" onClick={clearReverseSearch} style={{ border: '1px solid #e2e8f0', background: '#fff', padding: '9px 14px', fontSize: '13px', borderRadius: '8px', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>Clear</button>
                    <button className="reverse-preview-btn" onClick={handlePreviewReversal} disabled={selectedPaymentIds.length === 0} style={{ background: selectedPaymentIds.length > 0 ? '#1d4ed8' : '#cbd5e1', color: '#fff', border: 'none', padding: '9px 16px', fontSize: '13px', borderRadius: '8px', fontWeight: 800, cursor: selectedPaymentIds.length > 0 ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: selectedPaymentIds.length > 0 ? '0 4px 6px -1px rgba(29, 78, 216, 0.3)' : 'none' }}>
                      Preview Reversal
                    </button>
                  </div>
                )}
              </div>

              {reverseCustomer ? (
                <div style={{ overflow: 'auto', padding: '0 20px 20px 20px', maxHeight: '460px' }}>
                  <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px', width: '40px' }}>
                          <input 
                            type="checkbox" 
                            onChange={handleSelectAll}
                            checked={reversePayments.length > 0 && selectedPaymentIds.length === reversePayments.filter(p => p.status === 'active' || p.status === 'recon').length && reversePayments.filter(p => p.status === 'active' || p.status === 'recon').length > 0}
                            disabled={reversePayments.filter(p => p.status === 'active' || p.status === 'recon').length === 0}
                          />
                        </th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Code</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Date Paid</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Amount Paid</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Collector</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Loan ID</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Balance Before</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Balance After</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Posted By</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reversePayments.length === 0 ? (
                        <tr><td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No payments found for this client.</td></tr>
                      ) : reversePayments.map(p => {
                        const isReversed = p.status === 'reversed';
                        const isPenalty = p.status === 'penalty';
                        const isRecon = p.status === 'recon' || p.payment_type === 'recon';
                        const isSelected = selectedPaymentIds.includes(p.id);
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? '#eff6ff' : 'transparent', opacity: isReversed ? 0.6 : 1 }}>
                            <td style={{ padding: '12px' }}>
                              <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => handleSelectPayment(p.id)}
                                disabled={isReversed}
                              />
                            </td>
                            <td style={{ padding: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#3b82f6' }}>{p.payment_code}</td>
                            <td style={{ padding: '12px', color: '#334155' }}>{p.date_paid}</td>
                            <td style={{ padding: '12px', fontWeight: 800, color: isReversed ? '#64748b' : isRecon ? '#7c3aed' : '#16a34a' }}>{formatCurrency(p.amount_paid)}</td>
                            <td style={{ padding: '12px', color: '#334155' }}>{p.collector_name || 'N/A'}</td>
                            <td style={{ padding: '12px', color: '#3b82f6', fontWeight: 600 }}>{p.loan_code}</td>
                            <td style={{ padding: '12px', color: '#475569' }}>{formatCurrency(p.balance_before)}</td>
                            <td style={{ padding: '12px', color: '#475569' }}>{formatCurrency(p.balance_after)}</td>
                            <td style={{ padding: '12px', color: '#334155' }}>{p.encoded_by_name || 'System'}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                background: isReversed ? '#fee2e2' : isPenalty ? '#fef3c7' : isRecon ? '#ede9fe' : '#dcfce7',
                                color: isReversed ? '#ef4444' : isPenalty ? '#b45309' : isRecon ? '#7c3aed' : '#16a34a'
                              }}>
                                {isReversed ? 'REVERSED' : isPenalty ? 'PENALTY' : isRecon ? 'RECON' : 'POSTED'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="reverse-empty-state">
                  <span>⌕</span>
                  <strong>No client selected</strong>
                  <p>Search using a client code to view their payments.</p>
                </div>
              )}
            </div>
          </div>

          {false && reverseCustomer && (
            <div style={{ position: 'sticky', bottom: 0, background: '#fff', padding: '16px 30px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 -10px 15px -3px rgba(0,0,0,0.05)', borderRadius: '0 0 16px 16px', zIndex: 10 }}>
              <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '13px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selected Payments</span>
                  <strong style={{ fontSize: '20px', color: '#0f172a' }}>{selectedPaymentIds.length}</strong>
                </div>
                <div>
                  <span style={{ display: 'block', fontSize: '13px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Amount Selected</span>
                  <strong style={{ fontSize: '22px', color: '#ef4444' }}>{formatCurrency(totalSelectedAmount)}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <button className="reverse-clear-btn" onClick={clearReverseSearch} style={{ border: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 24px', fontSize: '14px', borderRadius: '8px', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>× Clear</button>
                <button 
                  className="reverse-preview-btn" 
                  onClick={handlePreviewReversal} 
                  disabled={selectedPaymentIds.length === 0}
                  style={{ background: selectedPaymentIds.length > 0 ? '#1d4ed8' : '#cbd5e1', color: '#fff', border: 'none', padding: '12px 32px', fontSize: '15px', borderRadius: '8px', fontWeight: 700, cursor: selectedPaymentIds.length > 0 ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: selectedPaymentIds.length > 0 ? '0 4px 6px -1px rgba(29, 78, 216, 0.3)' : 'none' }}
                >
                  ◉ Preview Reversal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reverse-loan' && (
        <div className="reverse-payment-shell">
          <div className="reverse-payment-header">
            <div className="reverse-title-wrap">
              <span className="reverse-title-icon">↩</span>
              <div>
                <h2>Reverse Loan</h2>
                <p>Search and reverse existing loans safely.</p>
              </div>
            </div>
          </div>

          {reverseLoanMessage && (
            <div className={`reverse-alert ${reverseLoanMessage.type}`}>{reverseLoanMessage.message}</div>
          )}

          <div className="reverse-main-grid" style={{ gridTemplateColumns: '1fr' }}>
            <form className="reverse-search-card" onSubmit={handleReverseLoanSearch} style={{ maxWidth: '400px', margin: '0 auto 20px auto' }}>
              <h3><span>⌕</span> Search Client</h3>
              <label>Client Code <b>*</b></label>
              <div className="reverse-field">
                <span>♙</span>
                <input value={reverseLoanClientCode} onChange={e => setReverseLoanClientCode(e.target.value.replace(/\D/g, ''))} placeholder="1598" autoFocus />
                {reverseLoanClientCode && <em>✓</em>}
              </div>
              <small>Enter the client code to fetch all their loans.</small>

              <button type="submit" className="reverse-search-btn" disabled={reverseLoanLoading} style={{ marginTop: '16px' }}>
                {reverseLoanLoading ? 'Searching...' : '⌕ Search Loans'}
              </button>
            </form>

            <div className="reverse-details-card" style={{ gridColumn: 'span 1' }}>
              <div className="reverse-section-title">
                <h3><span>▤</span> Loan History</h3>
                {reverseLoanCustomer && (
                  <span className="reverse-status posted" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                    {reverseLoanCustomer.full_name} ({reverseLoanCustomer.customer_code})
                  </span>
                )}
              </div>

              {reverseLoanCustomer ? (
                <div style={{ overflowX: 'auto', padding: '0 20px 20px 20px' }}>
                  <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px', width: '40px' }}>
                          <input 
                            type="checkbox" 
                            onChange={handleSelectAllLoans}
                            checked={reverseLoansList.length > 0 && selectedLoanIds.length === reverseLoansList.filter(l => l.status !== 'reversed').length && reverseLoansList.filter(l => l.status !== 'reversed').length > 0}
                            disabled={reverseLoansList.filter(l => l.status !== 'reversed').length === 0}
                          />
                        </th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Loan Code</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Type</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Principal</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Amortization</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Date Released</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reverseLoansList.length === 0 ? (
                        <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No loans found for this client.</td></tr>
                      ) : reverseLoansList.map(l => {
                        const isReversed = l.status === 'reversed';
                        const isSelected = selectedLoanIds.includes(l.id);
                        return (
                          <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9', background: isSelected ? '#eff6ff' : 'transparent', opacity: isReversed ? 0.6 : 1 }}>
                            <td style={{ padding: '12px' }}>
                              <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => handleSelectLoan(l.id)}
                                disabled={isReversed}
                              />
                            </td>
                            <td style={{ padding: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#3b82f6' }}>{l.loan_code}</td>
                            <td style={{ padding: '12px', color: '#334155' }}>{l.loan_type}</td>
                            <td style={{ padding: '12px', color: '#334155', fontWeight: 600 }}>{formatCurrency(l.principal)}</td>
                            <td style={{ padding: '12px', color: '#334155', fontWeight: 600 }}>{formatCurrency(l.amortization)}</td>
                            <td style={{ padding: '12px', color: '#334155' }}>{formatDate(l.date_released)}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                background: isReversed ? '#fee2e2' : '#dcfce7', color: isReversed ? '#ef4444' : '#16a34a'
                              }}>
                                {isReversed ? 'REVERSED' : l.status.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="reverse-empty-state">
                  <span>⌕</span>
                  <strong>No client selected</strong>
                  <p>Search using a client code to view their loans.</p>
                </div>
              )}
            </div>
          </div>

          {reverseLoanCustomer && (
            <div style={{ position: 'sticky', bottom: 0, background: '#fff', padding: '16px 30px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 -10px 15px -3px rgba(0,0,0,0.05)', borderRadius: '0 0 16px 16px', zIndex: 10 }}>
              <div style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
                <div>
                  <span style={{ display: 'block', fontSize: '13px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Selected Loans</span>
                  <strong style={{ fontSize: '20px', color: '#0f172a' }}>{selectedLoanIds.length}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <button className="reverse-clear-btn" onClick={clearReverseLoanSearch} style={{ border: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 24px', fontSize: '14px', borderRadius: '8px', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>× Clear</button>
                <button 
                  className="reverse-preview-btn" 
                  onClick={handlePreviewReverseLoan} 
                  disabled={selectedLoanIds.length === 0}
                  style={{ background: selectedLoanIds.length > 0 ? '#1d4ed8' : '#cbd5e1', color: '#fff', border: 'none', padding: '12px 32px', fontSize: '15px', borderRadius: '8px', fontWeight: 700, cursor: selectedLoanIds.length > 0 ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: selectedLoanIds.length > 0 ? '0 4px 6px -1px rgba(29, 78, 216, 0.3)' : 'none' }}
                >
                  ◉ Preview Reversal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {previewReverseLoanModal && (
        <div className="modal-overlay" onClick={() => setPreviewReverseLoanModal(false)}>
          <div className="modal-content" style={{ maxWidth: 600, background: '#ffffff', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '24px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{color: '#ef4444'}}>◉</span> Preview Loan Reversal</h3>
              <button className="close-btn" style={{ background: 'transparent', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }} onClick={() => setPreviewReverseLoanModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '30px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <p style={{ margin: 0, color: '#1e3a8a', fontSize: 14, lineHeight: '1.5' }}>
                  You are about to reverse <strong>{selectedLoanIds.length}</strong> loan(s) for <strong style={{textTransform: 'uppercase'}}>{reverseLoanCustomer?.full_name}</strong> ({reverseLoanCustomer?.customer_code}).
                  The status of these loans will be changed to reversed.
                </p>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '30px' }}>
                <button 
                  onClick={() => setPreviewReverseLoanModal(false)}
                  style={{ padding: '12px 24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleReverseLoanBatch}
                  style={{ padding: '12px 32px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.3)' }}
                >
                  Confirm Reverse Loans
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewModal && (
        <div className="modal-overlay" onClick={() => setPreviewModal(false)}>
          <div className="modal-content" style={{ maxWidth: 600, background: '#ffffff', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '24px 30px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{color: '#ef4444'}}>◉</span> Preview Batch Reversal</h3>
              <button className="close-btn" style={{ background: 'transparent', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }} onClick={() => setPreviewModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '30px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                <p style={{ margin: 0, color: '#1e3a8a', fontSize: 14, lineHeight: '1.5' }}>
                  You are about to reverse <strong>{selectedPaymentIds.length}</strong> payment(s) for <strong style={{textTransform: 'uppercase'}}>{reverseCustomer?.full_name}</strong> ({reverseCustomer?.customer_code}).
                  The outstanding balance on the affected loans will be restored and amortization schedules reverted.
                </p>
              </div>
              
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Selected OR Numbers:</span>
                  <strong style={{ fontSize: 15, color: '#0f172a', fontFamily: 'monospace' }}>
                    {getSelectedPayments().map(p => p.or_number || p.payment_code).join(', ')}
                  </strong>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fff1f2' }}>
                  <span style={{ fontSize: 14, color: '#9f1239', fontWeight: 700 }}>Total Amount to Reverse:</span>
                  <strong style={{ fontSize: 20, color: '#e11d48' }}>{formatCurrency(totalSelectedAmount)}</strong>
                </div>

                {getSelectedPayments().reduce((acc, p) => {
                  if (!acc.includes(p.loan_code)) acc.push(p.loan_code)
                  return acc
                }, []).map(loan_code => {
                  const loanPayments = getSelectedPayments().filter(p => p.loan_code === loan_code)
                  const loanTotal = loanPayments.reduce((s,p) => s+p.amount_paid, 0)
                  const currentBalance = loanPayments[0].current_loan_balance
                  return (
                    <div key={loan_code} style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                      <div style={{ fontSize: 13, color: '#3b82f6', fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{fontSize: 16}}>▥</span> LOAN {loan_code}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 14, color: '#475569' }}>Current Balance:</span>
                        <strong style={{ fontSize: 15, color: '#0f172a' }}>{formatCurrency(currentBalance)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 15, color: '#0f172a', fontWeight: 700 }}>Restored Loan Balance:</span>
                        <strong style={{ fontSize: 22, color: '#1d4ed8' }}>{formatCurrency(Number(currentBalance) + Number(loanTotal))}</strong>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 30, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" style={{ padding: '12px 24px', fontSize: '15px', fontWeight: 600 }} onClick={() => setPreviewModal(false)}>Cancel</button>
                <button className="btn btn-danger" style={{ padding: '12px 32px', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => {
                  setPreviewModal(false)
                  handleReverseBatch()
                }}>
                  <span>⚠️</span> Confirm Reverse
                </button>
              </div>
            </div>
          </div>
        </div>      )}

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
              background: confirmModal.tone === 'danger' ? '#fef2f2' : '#fffbeb',
              color: confirmModal.tone === 'danger' ? '#dc2626' : '#f59e0b',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', margin: '0 auto 18px auto',
              border: `2px solid ${confirmModal.tone === 'danger' ? '#fecaca' : '#fde68a'}`
            }}>
              ⚠
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              {confirmModal.title || 'Confirm Action'}
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
                {confirmModal.confirmText ? 'Cancel' : 'OK'}
              </button>
              {confirmModal.confirmText && (
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
                  {confirmModal.confirmText}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes paymentConfirmIn {
          from { opacity: 0; transform: scale(0.9) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}
