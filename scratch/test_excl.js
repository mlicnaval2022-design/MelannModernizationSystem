const { buildCollectionPaymentExclusionSql, isExcludedCollectionPayment } = require('../server/src/services/paymentClassification');
const { dbAll } = require('../server/src/db/database');

async function testExclusions() {
  console.log('--- Exclusion check on JS function ---');
  const p1 = { amount_paid: 1600, status: 'recon', payment_type: 'recon', remarks: '[RECON] Reconstruction balance adjustment' };
  const p2 = { amount_paid: 35, status: 'active', payment_type: 'regular', remarks: 'Auto-posted old balance during RECON' };
  const p3 = { amount_paid: 60, status: 'active', payment_type: 'regular', remarks: 'Auto-posted old balance during Reloan' };

  console.log('p1 (1600 recon) isExcluded:', isExcludedCollectionPayment(p1));
  console.log('p2 (35 recon balance) isExcluded:', isExcludedCollectionPayment(p2));
  console.log('p3 (60 reloan balance) isExcluded:', isExcludedCollectionPayment(p3));

  console.log('\n--- SQL Exclusion clause ---');
  console.log(buildCollectionPaymentExclusionSql('p'));
}

testExclusions().catch(console.error);
