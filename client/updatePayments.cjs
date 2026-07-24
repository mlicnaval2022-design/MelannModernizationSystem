const fs = require('fs');

let code = fs.readFileSync('src/pages/Payments.jsx', 'utf8');

// 1. Replace state variables
code = code.replace(
`  const [reverseClientCode, setReverseClientCode] = useState('')
  const [reversePaymentCode, setReversePaymentCode] = useState('')
  const [reversePayment, setReversePayment] = useState(null)
  const [reverseLoading, setReverseLoading] = useState(false)
  const [reverseMessage, setReverseMessage] = useState(null)`,
`  const [reverseClientCode, setReverseClientCode] = useState('')
  const [reverseCustomer, setReverseCustomer] = useState(null)
  const [reversePayments, setReversePayments] = useState([])
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([])
  const [reverseLoading, setReverseLoading] = useState(false)
  const [reverseMessage, setReverseMessage] = useState(null)`
);

// 2. Replace functions
const funcStartStr = `  const handleReverseSearch = async (e) => {`;
const funcEndStr = `  const normalizedReverseCode = reversePaymentCode ? reversePaymentCode.padStart(4, '0') : ''`;
const funcStart = code.indexOf(funcStartStr);
const funcEnd = code.indexOf(funcEndStr) + funcEndStr.length;

const newFuncs = `  const handleReverseSearch = async (e) => {
    e.preventDefault()
    setReverseCustomer(null)
    setReversePayments([])
    setSelectedPaymentIds([])
    setReverseMessage(null)

    if (!reverseClientCode) {
      setReverseMessage({ type: 'danger', message: 'Please enter a Client Code.' })
      return
    }

    setReverseLoading(true)
    try {
      const { data } = await API.get(\`/reversals/client/\${reverseClientCode.trim()}/payments\`)
      setReverseCustomer(data.customer)
      setReversePayments(data.payments || [])
      if (!data.payments || data.payments.length === 0) {
        setReverseMessage({ type: 'danger', message: 'No payment records found for this client.' })
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

  const formatCurrency = value => \`₱\${fmt(value)}\`
  const formatPaymentDate = value => {
    if (!value) return ''
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  
  const getSelectedPayments = () => reversePayments.filter(p => selectedPaymentIds.includes(p.id))
  const totalSelectedAmount = getSelectedPayments().reduce((sum, p) => sum + p.amount_paid, 0)`;

code = code.substring(0, funcStart) + newFuncs + code.substring(funcEnd);

// 3. Replace JSX
const jsxStartStr = `<div className="reverse-payment-shell">`;
const jsxEndStr = `      )}
    </div>
  )
}`;
const jsxStart = code.indexOf(jsxStartStr);
const jsxEnd = code.indexOf(jsxEndStr);

const newJsx = `<div className="reverse-payment-shell">
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
            <div className={\`reverse-alert \${reverseMessage.type}\`}>{reverseMessage.message}</div>
          )}

          <div className="reverse-main-grid" style={{ gridTemplateColumns: '1fr' }}>
            <form className="reverse-search-card" onSubmit={handleReverseSearch} style={{ maxWidth: '400px', margin: '0 auto 20px auto' }}>
              <h3><span>⌕</span> Search Client</h3>
              <label>Client Code <b>*</b></label>
              <div className="reverse-field">
                <span>♙</span>
                <input value={reverseClientCode} onChange={e => setReverseClientCode(e.target.value.replace(/\\D/g, ''))} placeholder="1598" autoFocus />
                {reverseClientCode && <em>✓</em>}
              </div>
              <small>Enter the client code to fetch all their payments.</small>

              <button type="submit" className="reverse-search-btn" disabled={reverseLoading} style={{ marginTop: '16px' }}>
                {reverseLoading ? 'Searching...' : '⌕ Search Payments'}
              </button>
            </form>

            <div className="reverse-details-card" style={{ gridColumn: 'span 1' }}>
              <div className="reverse-section-title">
                <h3><span>▤</span> Payment Transaction History</h3>
                {reverseCustomer && (
                  <span className="reverse-status posted" style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                    {reverseCustomer.full_name} ({reverseCustomer.customer_code})
                  </span>
                )}
              </div>

              {reverseCustomer ? (
                <div style={{ overflowX: 'auto', padding: '0 20px 20px 20px' }}>
                  <table className="data-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px', width: '40px' }}>
                          <input 
                            type="checkbox" 
                            onChange={handleSelectAll}
                            checked={reversePayments.length > 0 && selectedPaymentIds.length === reversePayments.filter(p => p.status === 'active').length && reversePayments.filter(p => p.status === 'active').length > 0}
                            disabled={reversePayments.filter(p => p.status === 'active').length === 0}
                          />
                        </th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>Code</th>
                        <th style={{ padding: '12px', color: '#475569', fontWeight: 700 }}>OR Number</th>
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
                        <tr><td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No payments found for this client.</td></tr>
                      ) : reversePayments.map(p => {
                        const isReversed = p.status === 'reversed';
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
                            <td style={{ padding: '12px', fontFamily: 'monospace', color: '#0f172a' }}>{p.or_number || 'N/A'}</td>
                            <td style={{ padding: '12px', color: '#334155' }}>{p.date_paid}</td>
                            <td style={{ padding: '12px', fontWeight: 800, color: isReversed ? '#64748b' : '#16a34a' }}>{formatCurrency(p.amount_paid)}</td>
                            <td style={{ padding: '12px', color: '#334155' }}>{p.collector_name || 'N/A'}</td>
                            <td style={{ padding: '12px', color: '#3b82f6', fontWeight: 600 }}>{p.loan_code}</td>
                            <td style={{ padding: '12px', color: '#475569' }}>{formatCurrency(p.balance_before)}</td>
                            <td style={{ padding: '12px', color: '#475569' }}>{formatCurrency(p.balance_after)}</td>
                            <td style={{ padding: '12px', color: '#334155' }}>{p.encoded_by_name || 'System'}</td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                background: isReversed ? '#fee2e2' : '#dcfce7', color: isReversed ? '#ef4444' : '#16a34a'
                              }}>
                                {isReversed ? 'REVERSED' : 'POSTED'}
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

          {reverseCustomer && (
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
                  <strong style={{ fontSize: 20, color: '#e11d48' }}>+ {formatCurrency(totalSelectedAmount)}</strong>
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
        </div>`;

code = code.substring(0, jsxStart) + newJsx + code.substring(jsxEnd);

fs.writeFileSync('src/pages/Payments.jsx', code);
console.log('Successfully updated Payments.jsx');
