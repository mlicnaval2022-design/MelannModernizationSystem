const SPECIAL_PAYMENT_TYPES = Object.freeze(['recon', 'deceased', 'writeoff']);

const PAYMENT_TYPE_CONFIG = Object.freeze({
  recon: {
    label: 'Recon',
    remarkTag: 'RECON',
    defaultRemark: 'Reconstruction balance adjustment',
  },
  deceased: {
    label: 'Deceased',
    remarkTag: 'DECEASED',
    defaultRemark: 'Deceased account settlement',
  },
  writeoff: {
    label: 'Write-off',
    remarkTag: 'WRITE-OFF',
    defaultRemark: 'Written-off account settlement',
  },
});

const isTruthyFlag = value => value === true || value === 1 || value === '1' || value === 'true';

const resolveSpecialPaymentType = body => {
  const selected = [
    isTruthyFlag(body.is_recon) || isTruthyFlag(body.isRecon) ? 'recon' : null,
    isTruthyFlag(body.is_deceased) || isTruthyFlag(body.isDeceased) ? 'deceased' : null,
    isTruthyFlag(body.is_write_off) || isTruthyFlag(body.isWriteOff) || isTruthyFlag(body.is_writeoff) ? 'writeoff' : null,
  ].filter(Boolean);

  if (selected.length > 1) {
    const error = new Error('Select only one of Recon, Deceased, or Write-off.');
    error.statusCode = 400;
    throw error;
  }

  return selected[0] || null;
};

const buildSpecialPaymentRemarks = (type, remarks) => {
  if (!type) return remarks;
  const config = PAYMENT_TYPE_CONFIG[type];
  const cleanRemarks = String(remarks || '').trim();
  if (!cleanRemarks) return `[${config.remarkTag}] ${config.defaultRemark}`;
  if (cleanRemarks.toUpperCase().includes(config.remarkTag)) return cleanRemarks;
  return `[${config.remarkTag}] ${cleanRemarks}`;
};

const isExcludedCollectionPayment = payment => {
  const normalize = value => String(value || '').toLowerCase().replace(/[-_\s]/g, '');
  const status = normalize(payment.status);
  const paymentType = normalize(payment.payment_type);
  const remarks = normalize(payment.remarks);
  return SPECIAL_PAYMENT_TYPES.some(type => {
    const normalizedType = normalize(type);
    return status === normalizedType || paymentType === normalizedType || remarks.includes(normalizedType);
  });
};

const normalizedSqlValue = expression => (
  `LOWER(REPLACE(REPLACE(REPLACE(COALESCE(${expression}, ''), '-', ''), '_', ''), ' ', ''))`
);

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
    conditions.push(...SPECIAL_PAYMENT_TYPES.map(type => `${remarks} NOT LIKE '%${type}%'`));
  }
  return conditions.join(' AND ');
};

module.exports = {
  PAYMENT_TYPE_CONFIG,
  SPECIAL_PAYMENT_TYPES,
  buildCollectionPaymentExclusionSql,
  buildSpecialPaymentRemarks,
  isExcludedCollectionPayment,
  resolveSpecialPaymentType,
};
