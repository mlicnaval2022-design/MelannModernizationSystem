import { useState } from 'react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import './Payments.css'

const fmt = n => Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })

export default function ReversePayment() {
  const { hasRole } = useAuth()
  const [clientCode, setClientCode] = useState('')
  const [paymentCode, setPaymentCode] = useState('')
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    setPayment(null)
    setError(null)
    if (!clientCode || !paymentCode) {
      setError('Please enter both Client Code and Payment Code.')
      return
    }

    setLoading(true)
    try {
      const { data } = await API.get(`/reversals/search?customer_code=${clientCode}&payment_code=${paymentCode}`)
      setPayment(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error finding payment.')
    } finally {
      setLoading(false)
    }
  }

  const handleReverse = async () => {
    if (!payment) return
    const reason = window.prompt('Please enter the reason for reversal:')
    if (!reason) return

    if (!window.confirm(`Are you sure you want to reverse Payment ${payment.payment_code} for ${payment.customer_name}?`)) return

    try {
      await API.post('/reversals/payment/by-code', {
        customer_code: clientCode,
        payment_code: paymentCode,
        reason
      })
      alert('Payment reversed successfully!')
      setPayment(null)
      setClientCode('')
      setPaymentCode('')
    } catch (err) {
      alert(err.response?.data?.error || 'Error reversing payment')
    }
  }

  return (
    <div className="payments-container">
      <div className="payments-header">
        <div>
          <h2 className="payments-title">
            <span className="payments-title-icon">↩️</span>
            Reverse Payment
          </h2>
          <p className="payments-subtitle">Search and reverse an existing payment transaction.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '30px' }}>
        {/* Search Panel */}
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', alignSelf: 'start' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', color: '#0f172a' }}>Search Payment</h3>
          
          <form onSubmit={handleSearch}>
            <div className="form-group">
              <label>Client Code</label>
              <input 
                type="text" 
                className="form-control" 
                value={clientCode} 
                onChange={e => setClientCode(e.target.value)} 
                placeholder="e.g. 1598"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Payment Code</label>
              <input 
                type="text" 
                className="form-control" 
                value={paymentCode} 
                onChange={e => setPaymentCode(e.target.value)} 
                placeholder="e.g. 0003"
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loading}>
              {loading ? 'Searching...' : 'Search Payment'}
            </button>
          </form>

          {error && (
            <div style={{ marginTop: '20px', padding: '12px', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '14px' }}>
              ❌ {error}
            </div>
          )}
        </div>

        {/* Details Panel */}
        <div>
          {payment ? (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Payment Details</h3>
                <span style={{ 
                  padding: '6px 14px', 
                  borderRadius: '20px', 
                  fontSize: '13px', 
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: payment.status === 'active' ? '#dcfce7' : '#fee2e2',
                  color: payment.status === 'active' ? '#16a34a' : '#ef4444'
                }}>
                  {payment.status === 'active' ? '🟢 Posted' : '🔴 Reversed'}
                </span>
              </div>
              
              <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Client Name</div>
                  <div style={{ fontSize: '15px', color: '#0f172a', fontWeight: 600 }}>{payment.customer_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Client Code</div>
                  <div style={{ fontSize: '15px', color: '#0f172a', fontWeight: 600 }}>{payment.customer_code}</div>
                </div>
                
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Loan Code</div>
                  <div style={{ fontSize: '15px', color: '#3b82f6', fontWeight: 700 }}>{payment.loan_code}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Payment Code</div>
                  <div style={{ fontSize: '15px', color: '#0f172a', fontWeight: 700, fontFamily: 'monospace' }}>{payment.payment_code}</div>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Collector</div>
                  <div style={{ fontSize: '15px', color: '#0f172a' }}>{payment.collector_name || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>OR Number</div>
                  <div style={{ fontSize: '15px', color: '#0f172a', fontFamily: 'monospace' }}>{payment.or_number || 'N/A'}</div>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Date Paid</div>
                  <div style={{ fontSize: '15px', color: '#0f172a' }}>{payment.date_paid}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Amount Paid</div>
                  <div style={{ fontSize: '20px', color: '#16a34a', fontWeight: 800 }}>₱ {fmt(payment.amount_paid)}</div>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Balance Before</div>
                  <div style={{ fontSize: '15px', color: '#475569' }}>₱ {fmt(payment.balance_before)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Balance After</div>
                  <div style={{ fontSize: '15px', color: '#475569', fontWeight: 700 }}>₱ {fmt(payment.balance_after)}</div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Posted By</div>
                  <div style={{ fontSize: '15px', color: '#0f172a' }}>{payment.encoded_by_name || 'System'}</div>
                </div>
              </div>

              <div style={{ padding: '20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn-danger" 
                  disabled={payment.status === 'reversed' || !hasRole(['admin', 'manager'])}
                  onClick={handleReverse}
                  style={{ padding: '10px 24px', fontWeight: 700 }}
                >
                  {payment.status === 'reversed' ? 'Already Reversed' : 'Reverse Payment'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', color: '#64748b' }}>
              <span style={{ fontSize: '40px', marginBottom: '16px' }}>🔍</span>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#475569' }}>No Payment Selected</h3>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>Search for a payment using Client Code and Payment Code.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
