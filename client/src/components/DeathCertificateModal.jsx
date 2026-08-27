import { useState, useEffect } from 'react';
import { X, FileText, User, Calendar, CreditCard, ArrowLeft } from 'lucide-react';
import DeathCertificatePanel from './DeathCertificatePanel';
import API from '../services/api';
import '../soa-v2.css';

export default function DeathCertificateModal({ account, customer, onClose, onUpdated }) {
  const baseAccount = account || customer || {};
  const customerId = baseAccount.customer_id || baseAccount.id;

  const [customerData, setCustomerData] = useState({
    id: customerId,
    full_name: baseAccount.customer_name || baseAccount.full_name || '',
    customer_code: baseAccount.customer_code || '',
    loan_code: baseAccount.loan_code || '',
    settlement_date: baseAccount.settlement_date || '',
    death_certificate_image: baseAccount.death_certificate_image || '',
  });

  const [previewImage, setPreviewImage] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (customerId) {
      setLoading(true);
      API.get(`/customers/${customerId}`)
        .then(res => {
          if (!mounted) return;
          const data = res.data?.customer || res.data;
          if (data) {
            setCustomerData(prev => ({
              ...prev,
              id: data.id || customerId,
              full_name: data.full_name || prev.full_name,
              customer_code: data.customer_code || prev.customer_code,
              death_certificate_image: data.death_certificate_image || prev.death_certificate_image,
            }));
          }
        })
        .catch(err => {
          console.error('Failed to fetch customer details for death certificate modal:', err);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }
    return () => {
      mounted = false;
    };
  }, [customerId]);

  const getImageUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = API.defaults.baseURL.replace('/api', '');
    return `${baseUrl}${path}`;
  };

  const handleUpdated = (url) => {
    setCustomerData(prev => ({ ...prev, death_certificate_image: url }));
    onUpdated?.(url);
  };

  const displayDate = (value) => {
    if (!value) return '-';
    try {
      const d = String(value).split('T')[0];
      return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return String(value);
    }
  };

  return (
    <>
      <div
        className="modal-overlay"
        style={{ zIndex: 9999 }}
        onMouseDown={e => e.target === e.currentTarget && onClose?.()}
      >
        <div
          className="modal"
          style={{
            maxWidth: 720,
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: 14,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)'
          }}
        >
          {/* Modal Header */}
          <div
            className="modal-header"
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: '#fef3c7',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <FileText size={20} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  Death Certificate
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 1 }}>
                  {customerData.full_name || 'Client Record'}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Client Details Summary Bar */}
          <div
            style={{
              padding: '10px 20px',
              background: '#fffbeb',
              borderBottom: '1px solid #fef3c7',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 14,
              fontSize: 12.5
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#92400e' }}>
              <User size={14} />
              <span>Client Code:</span>
              <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{customerData.customer_code || '-'}</strong>
            </div>

            {customerData.loan_code && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#92400e' }}>
                <CreditCard size={14} />
                <span>Loan #:</span>
                <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{customerData.loan_code}</strong>
              </div>
            )}

            {customerData.settlement_date && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#92400e' }}>
                <Calendar size={14} />
                <span>Settled:</span>
                <strong>{displayDate(customerData.settlement_date)}</strong>
              </div>
            )}

            <span
              style={{
                marginLeft: 'auto',
                padding: '2px 8px',
                borderRadius: 999,
                background: '#fee2e2',
                color: '#991b1b',
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: 0.5,
                textTransform: 'uppercase'
              }}
            >
              Deceased
            </span>
          </div>

          {/* Modal Body */}
          <div
            className="modal-body"
            style={{
              padding: 20,
              overflowY: 'auto',
              flex: 1
            }}
          >
            <DeathCertificatePanel
              customer={customerData}
              getImageUrl={getImageUrl}
              onPreview={setPreviewImage}
              onUpdated={handleUpdated}
            />
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'flex-end'
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ minWidth: 90 }}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Full-screen lightbox image preview */}
      {previewImage && (
        <div
          className="modal-overlay"
          style={{ zIndex: 100000, background: 'rgba(0, 0, 0, 0.88)' }}
          onClick={() => setPreviewImage(null)}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20
            }}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: 20,
                left: 20,
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#fff',
                fontSize: '14px',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 600,
                backdropFilter: 'blur(4px)'
              }}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <img
              src={previewImage}
              alt="Death Certificate Full Preview"
              style={{
                maxWidth: '92vw',
                maxHeight: '88vh',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
}
