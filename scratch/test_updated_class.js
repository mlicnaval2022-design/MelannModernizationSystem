const SPECIAL_PAYMENT_TYPES = Object.freeze(['recon', 'deceased', 'writeoff']);

const normalizedSqlValue = expression => (
  `LOWER(REPLACE(REPLACE(REPLACE(COALESCE(${expression}, ''), '-', ''), '_', ''), ' ', ''))`
);

const isExcludedCollectionPayment = payment => {
  const normalize = value => String(value || '').toLowerCase().replace(/[-_\s]/g, '');
  const status = normalize(payment.status);
  const paymentType = normalize(payment.payment_type);
  const remarks = normalize(payment.remarks);
  if (remarks.includes('oldbalance') || ['balance', 'oldbalance'].includes(paymentType)) {
    return false;
  }
  return SPECIAL_PAYMENT_TYPES.some(type => {
    const normalizedType = normalize(type);
    return status === normalizedType || paymentType === normalizedType || remarks.includes(normalizedType);
  });
};

const buildCollectionPaymentExclusionSql = (alias = '', options = {}) => {
  const prefix = alias ? `${alias}.` : '';
  const excluded = SPECIAL_PAYMENT_TYPES.map(type => `'${type}'`).join(', ');
  const status = normalizedSqlValue(`${prefix}status`);
  const paymentType = normalizedSqlValue(`${prefix}payment_type`);
  const remarks = normalizedSqlValue(`${prefix}remarks`);
  const conditions = [
    `${status} NOT IN (${excluded})`,
    `${paymentType} NOT IN (${excluded})`,
  ];
  if (options.includeRemarks !== false) {
    conditions.push(
      `(${remarks} LIKE '%oldbalance%' OR (${SPECIAL_PAYMENT_TYPES.map(type => `${remarks} NOT LIKE '%${type}%'`).join(' AND ')}))`
    );
  }
  return conditions.join(' AND ');
};

const p1 = { amount_paid: 1600, status: 'recon', payment_type: 'recon', remarks: '[RECON] Reconstruction balance adjustment' };
const p2 = { amount_paid: 35, status: 'active', payment_type: 'regular', remarks: 'Auto-posted old balance during RECON' };
const p3 = { amount_paid: 60, status: 'active', payment_type: 'regular', remarks: 'Auto-posted old balance during Reloan' };

console.log('p1 (1600 recon):', isExcludedCollectionPayment(p1));
console.log('p2 (35 recon balance):', isExcludedCollectionPayment(p2));
console.log('p3 (60 reloan balance):', isExcludedCollectionPayment(p3));
console.log('SQL:', buildCollectionPaymentExclusionSql('p'));
