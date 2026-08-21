const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCollectionPaymentExclusionSql,
  buildSpecialPaymentRemarks,
  isExcludedCollectionPayment,
  resolveSpecialPaymentType,
} = require('../../src/services/paymentClassification');

test('resolves exactly one special settlement type', () => {
  assert.equal(resolveSpecialPaymentType({ is_recon: true }), 'recon');
  assert.equal(resolveSpecialPaymentType({ is_deceased: true }), 'deceased');
  assert.equal(resolveSpecialPaymentType({ is_write_off: true }), 'writeoff');
  assert.equal(resolveSpecialPaymentType({}), null);
  assert.throws(
    () => resolveSpecialPaymentType({ is_deceased: true, is_write_off: true }),
    /Select only one/
  );
});

test('builds tagged remarks for Deceased and Write-off settlements', () => {
  assert.equal(buildSpecialPaymentRemarks('deceased', ''), '[DECEASED] Deceased account settlement');
  assert.equal(buildSpecialPaymentRemarks('writeoff', 'Approved by manager'), '[WRITE-OFF] Approved by manager');
  assert.equal(buildSpecialPaymentRemarks('recon', '[RECON] Existing note'), '[RECON] Existing note');
});

test('recognizes excluded collection payments across status, type, and legacy remarks', () => {
  assert.equal(isExcludedCollectionPayment({ status: 'deceased' }), true);
  assert.equal(isExcludedCollectionPayment({ payment_type: 'write-off' }), true);
  assert.equal(isExcludedCollectionPayment({ status: 'active', remarks: '[WRITE OFF] manual import' }), true);
  assert.equal(isExcludedCollectionPayment({ status: 'active', payment_type: 'regular', remarks: 'cash payment' }), false);
});

test('SQL exclusion predicate supports aliases and all special types', () => {
  const sql = buildCollectionPaymentExclusionSql('p');
  assert.match(sql, /p\.status/);
  assert.match(sql, /p\.payment_type/);
  assert.match(sql, /p\.remarks/);
  assert.match(sql, /recon/);
  assert.match(sql, /deceased/);
  assert.match(sql, /writeoff/);
});
