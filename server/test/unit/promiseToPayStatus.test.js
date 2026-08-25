const test = require('node:test');
const assert = require('node:assert/strict');
const { getAutomaticStatus } = require('../../src/services/promiseToPayStatus');

const base = {
  loan: { balance: 500 },
  outcomeLoan: null,
  promiseDate: '2026-08-20',
  today: '2026-08-20'
};

test('PTP becomes Overdue PTP when its promise date passes with no payment', () => {
  assert.equal(getAutomaticStatus({ ...base, payments: [], promiseDate: '2026-08-19' }), 'Overdue PTP');
});

test('PTP detects a partial payment made on or after the promise date', () => {
  assert.equal(getAutomaticStatus({
    ...base,
    payments: [{ amount_paid: 300, balance_after: 200, status: 'active' }]
  }), 'Partial Paid Done');
});

test('PTP classifies a completed recon and reloan correctly', () => {
  const reconPayment = [{ amount_paid: 500, balance_after: 0, status: 'recon', payment_type: 'recon' }];
  assert.equal(getAutomaticStatus({ ...base, payments: reconPayment }), 'Fully Paid(Recon)');

  const regularPayment = [{ amount_paid: 500, balance_after: 0, status: 'active', payment_type: 'regular' }];
  assert.equal(getAutomaticStatus({ ...base, payments: regularPayment, outcomeLoan: { loan_type: 'Reloan' } }), 'Fully Paid(Reloan)');
  assert.equal(getAutomaticStatus({ ...base, payments: regularPayment }), 'Fully Paid');
});
