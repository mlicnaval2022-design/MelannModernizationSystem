import React from 'react';

/**
 * Modern ConfirmModal Component
 * Replaces native window.confirm/alert dialogs with a beautiful, modern modal UI.
 */
export default function ConfirmModal({
  isOpen,
  title = 'Confirm Action',
  message,
  badgeText,
  subMessage,
  type = 'danger', // 'danger' | 'warning' | 'info' | 'success'
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  loading = false
}) {
  if (!isOpen) return null;

  const typeConfig = {
    danger: {
      iconBg: '#fef2f2',
      iconColor: '#ef4444',
      iconBorder: '#fca5a5',
      icon: 'bi-exclamation-triangle-fill',
      confirmBg: 'linear-gradient(135deg, #ef4444, #dc2626)',
      confirmShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
      badgeBg: '#fef2f2',
      badgeColor: '#991b1b',
      badgeBorder: '#fecaca'
    },
    warning: {
      iconBg: '#fffbeb',
      iconColor: '#f59e0b',
      iconBorder: '#fde68a',
      icon: 'bi-exclamation-circle-fill',
      confirmBg: 'linear-gradient(135deg, #f59e0b, #d97706)',
      confirmShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
      badgeBg: '#fffbeb',
      badgeColor: '#92400e',
      badgeBorder: '#fef3c7'
    },
    info: {
      iconBg: '#eff6ff',
      iconColor: '#3b82f6',
      iconBorder: '#bfdbfe',
      icon: 'bi-info-circle-fill',
      confirmBg: 'linear-gradient(135deg, #3b82f6, #2563eb)',
      confirmShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
      badgeBg: '#eff6ff',
      badgeColor: '#1e40af',
      badgeBorder: '#dbeafe'
    },
    success: {
      iconBg: '#f0fdf4',
      iconColor: '#22c55e',
      iconBorder: '#bbf7d0',
      icon: 'bi-check-circle-fill',
      confirmBg: 'linear-gradient(135deg, #22c55e, #16a34a)',
      confirmShadow: '0 4px 14px rgba(34, 197, 94, 0.35)',
      badgeBg: '#f0fdf4',
      badgeColor: '#166534',
      badgeBorder: '#dcfce7'
    }
  };

  const config = typeConfig[type] || typeConfig.danger;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100050,
        padding: '20px'
      }}
      onMouseDown={e => {
        if (e.target === e.currentTarget && !loading && onCancel) {
          onCancel();
        }
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          padding: '28px 28px 24px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8)',
          animation: 'modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          textAlign: 'center',
          position: 'relative'
        }}
      >
        {/* Icon Header */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: config.iconBg,
            color: config.iconColor,
            border: `2px solid ${config.iconBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 16px auto',
            boxShadow: `0 8px 16px -4px ${config.iconBg}`
          }}
        >
          <i className={`bi ${config.icon}`}></i>
        </div>

        {/* Title */}
        <h3
          style={{
            margin: '0 0 8px 0',
            fontSize: '20px',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.02em'
          }}
        >
          {title}
        </h3>

        {/* Optional Badge */}
        {badgeText && (
          <div style={{ marginBottom: '14px' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '20px',
                background: config.badgeBg,
                color: config.badgeColor,
                border: `1px solid ${config.badgeBorder}`,
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'monospace'
              }}
            >
              {badgeText}
            </span>
          </div>
        )}

        {/* Message */}
        <p
          style={{
            color: '#475569',
            fontSize: '14px',
            lineHeight: 1.55,
            margin: '0 0 16px 0',
            fontWeight: 450
          }}
        >
          {message}
        </p>

        {/* Optional SubMessage / Warning Callout */}
        {subMessage && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#334155',
              textAlign: 'left',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start'
            }}
          >
            <i className="bi bi-info-circle" style={{ color: '#64748b', fontSize: '15px', marginTop: '1px' }}></i>
            <div style={{ flex: 1, lineHeight: '1.45' }}>{subMessage}</div>
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'center',
            marginTop: '20px'
          }}
        >
          {cancelText && (
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '11px 18px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontWeight: 600,
                fontSize: '14px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                outline: 'none'
              }}
              onMouseEnter={e => {
                if (!loading) {
                  e.target.style.background = '#f8fafc';
                  e.target.style.borderColor = '#94a3b8';
                }
              }}
              onMouseLeave={e => {
                if (!loading) {
                  e.target.style.background = '#ffffff';
                  e.target.style.borderColor = '#cbd5e1';
                }
              }}
            >
              {cancelText}
            </button>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            style={{
              flex: cancelText ? 1.2 : 1,
              padding: '11px 18px',
              borderRadius: '12px',
              border: 'none',
              background: config.confirmBg,
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: config.confirmShadow,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              outline: 'none'
            }}
            onMouseEnter={e => {
              if (!loading) {
                e.target.style.opacity = '0.92';
                e.target.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={e => {
              if (!loading) {
                e.target.style.opacity = '1';
                e.target.style.transform = 'translateY(0)';
              }
            }}
          >
            {loading ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '14px',
                    height: '14px',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite'
                  }}
                ></span>
                Processing...
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
