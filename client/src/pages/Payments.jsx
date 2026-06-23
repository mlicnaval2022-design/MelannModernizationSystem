import { useEffect, useState, useRef } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import './Payments.css'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
const today = () => new Date().toISOString().split('T')[0]
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

export default function Payments() {
  useAuth()
  const [collectors, setCollectors] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [searchTable, setSearchTable] = useState('')
  
  const [selectedCollector, setSelectedCollector] = useState('')
  const [scannerInput, setScannerInput] = useState('')
  
  const [activeLoan, setActiveLoan] = useState(null)
  
  const [form, setForm] = useState({ amount_paid: '', date_paid: today(), remarks: '' })
  const [saving, setSaving] = useState(false)
  const [notification, setNotification] = useState(null)
  
  const scannerRef = useRef(null)
  const amountInputRef = useRef(null)

  const [clientList, setClientList] = useState([])

  useEffect(() => {
    API.get('/collectors').then(r => setCollectors(r.data.filter(c => c.is_active)))
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
    setForm({ amount_paid: '', date_paid: today(), remarks: '' })
    
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
        setForm({ amount_paid: 0, date_paid: today(), remarks: '' })
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
    if (!activeLoan) return
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
        force_duplicate
      }
      const r = await API.post('/payments', payload)
      
      setActiveLoan(null)
      setScannerInput('')
      setForm({ amount_paid: '', date_paid: today(), remarks: '' })
      loadRecentPayments()
      
      if (r.data.loan_status === 'fullpaid') {
        setNotification({ type: 'success', message: 'Customer is now Fully Paid' })
      } else {
        setNotification({ type: 'success', message: 'Payment saved successfully.' })
      }
      
      if (scannerRef.current) scannerRef.current.focus()
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.is_duplicate) {
        if (window.confirm(err.response.data.error + '\n\nDo you want to post it anyway?')) {
          handlePost(null, true)
        }
      } else {
        setNotification({ type: 'danger', message: err.response?.data?.error || 'Error posting payment' })
      }
    } finally {
      if (!force_duplicate) setSaving(false)
    }
  }

  const cancelEncoding = () => {
    setActiveLoan(null)
    setScannerInput('')
    setForm({ amount_paid: '', date_paid: today(), remarks: '' })
    setNotification(null)
    if (scannerRef.current) scannerRef.current.focus()
  }
  
  const handleTableSearch = (e) => {
    if (e.key === 'Enter') {
      loadRecentPayments(searchTable);
    }
  }

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
        <div className="payments-breadcrumb">
          Dashboard <span style={{color: '#94a3b8'}}>/</span> Payments <span style={{color: '#94a3b8'}}>/</span> Encode Payments
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

      <div className="payments-card">
        <div className="payments-card-header">
          <span className="icon">💳</span>
          Payment Form
        </div>
        
        <div className="payments-form-body">
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
                    {collectors.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
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
                      onChange={e => setScannerInput(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={e => { if (e.key === 'Enter') handleScan(e) }}
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
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (activeLoan && !saving) handlePost(e);
                          }
                        }}
                        disabled={!activeLoan}
                      />
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
              {recentPayments.map((p, i) => (
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
                    {p.loan_status === 'fullpaid' || p.balance_after <= 0 
                      ? <span className="badge-no">Yes</span>
                      : <span style={{ color: '#ef4444', fontWeight: '600', background: '#fef2f2', padding: '4px 8px', borderRadius: '4px' }}>No</span>}
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
    </div>
  )
}
