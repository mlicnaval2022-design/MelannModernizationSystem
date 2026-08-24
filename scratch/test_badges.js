const { dbAll, dbGet, dbRun } = require('../server/src/db/database');
const { buildCollectionPaymentExclusionSql, isExcludedCollectionPayment } = require('../server/src/services/paymentClassification');

// Test payment status text logic
function getPaymentStatusText(payment) {
  const isReversed = payment.status === 'reversed';
  const remarks = String(payment.remarks || '').toLowerCase();
  const paymentType = String(payment.payment_type || '').toLowerCase();
  const status = String(payment.status || '').toLowerCase();
  const isOldBalance = remarks.includes('old balance') || ['balance', 'old_balance'].includes(paymentType);
  
  if (isReversed) return 'Reversed';
  
  if (isOldBalance) {
    if (remarks.includes('recon')) return 'Balance(Recon)';
    if (remarks.includes('reloan') || remarks.includes('re-loan')) return 'Balance(Reloan)';
    if (Number(payment.balance_after || 0) <= 0) return 'Balance(Fully Paid)';
    return 'Balance';
  }

  const isRecon = status === 'recon' || paymentType === 'recon' || remarks.includes('recon');
  const isDeceased = status === 'deceased' || paymentType === 'deceased' || remarks.includes('deceased');
  const normalizedWriteOff = value => String(value || '').toLowerCase().replace(/[-_\s]/g, '');
  const isWriteOff = normalizedWriteOff(status) === 'writeoff' || normalizedWriteOff(paymentType) === 'writeoff' || normalizedWriteOff(remarks).includes('writeoff');
  const isFullyPaid = (status === 'active' || isRecon || isDeceased || isWriteOff) && Number(payment.balance_after || 0) <= 0;
  const isPartial = status === 'active' && Number(payment.balance_after || 0) > 0;

  if (isDeceased) return isFullyPaid ? 'Fully Paid(Deceased)' : 'Deceased';
  if (isWriteOff) return isFullyPaid ? 'Fully Paid(Write-off)' : 'Write-off';
  if (isRecon) return isFullyPaid ? 'Fully Paid(Recon)' : 'Recon';
  if (status === 'penalty') return 'Penalty';
  if (isFullyPaid) return 'Fully Paid';
  if (isPartial) return 'Active';
  return payment.status || 'Active';
}

console.log('--- Test Status Texts ---');
console.log('1600 Recon (bal 35):', getPaymentStatusText({ amount_paid: 1600, balance_after: 35, status: 'recon', payment_type: 'recon', remarks: '[RECON] Reconstruction balance adjustment' }));
console.log('35 Recon Balance (bal 0):', getPaymentStatusText({ amount_paid: 35, balance_after: 0, status: 'active', payment_type: 'regular', remarks: 'Auto-posted old balance during RECON' }));
console.log('60 Reloan Balance (bal 0):', getPaymentStatusText({ amount_paid: 60, balance_after: 0, status: 'active', payment_type: 'regular', remarks: 'Auto-posted old balance during Reloan' }));
console.log('General old balance (bal 0):', getPaymentStatusText({ amount_paid: 100, balance_after: 0, status: 'active', payment_type: 'balance', remarks: 'Old balance' }));
console.log('Regular payment (bal 1500):', getPaymentStatusText({ amount_paid: 100, balance_after: 1500, status: 'active', payment_type: 'regular', remarks: '' }));
console.log('Regular payment (bal 0):', getPaymentStatusText({ amount_paid: 100, balance_after: 0, status: 'active', payment_type: 'regular', remarks: '' }));
