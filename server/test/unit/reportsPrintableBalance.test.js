const test = require('node:test');
const assert = require('node:assert/strict');

const { __private } = require('../../src/routes/reports');

test('collection report folds Pastdue aliases into the regular collector name', () => {
  assert.equal(__private.normalizeCollectorReportName('Aldie Rosal Pastdue'), 'Aldie Rosal');
  assert.equal(__private.normalizeCollectorReportName('Renato Domingono Past Due'), 'Renato Domingono');
});

test('recon promissory does not use loan balance as printable previous balance', async () => {
  const loan = {
    loan_type: 'Recon',
    previous_balance: 0,
    balance: 3910,
    customer_id: 1,
    date_released: '2026-08-06',
  };

  await __private.resolvePrintablePreviousBalance(loan, async () => null);

  assert.equal(Number(loan.previous_balance || 0), 0);
});

test('recon promissory uses explicit old-balance payment when present', async () => {
  const loan = {
    loan_type: 'Recon',
    previous_balance: 0,
    balance: 3910,
    customer_id: 1,
    date_released: '2026-08-06',
  };

  await __private.resolvePrintablePreviousBalance(loan, async ({ customerId, dateReleased }) => {
    assert.equal(customerId, 1);
    assert.equal(dateReleased, '2026-08-06');
    return { amount_paid: 125 };
  });

  assert.equal(loan.previous_balance, 125);
});

test('reloan promissory keeps an existing previous balance', async () => {
  const loan = {
    loan_type: 'Re-Loan',
    previous_balance: 500,
    balance: 11000,
    customer_id: 1,
    date_released: '2026-08-06',
  };

  await __private.resolvePrintablePreviousBalance(loan, async () => {
    throw new Error('existing previous balance should not require lookup');
  });

  assert.equal(loan.previous_balance, 500);
});

test('collection release charge rows exclude passbook and expose unassigned penalty client detail', () => {
  const rows = __private.buildCollectionReleaseChargeRows([{
    id: 6,
    customer_id: 12,
    loan_code: '20260813-0003',
    date_released: '2026-08-13',
    balance: 0,
    previous_balance: 0,
    penalty: 50,
    passbook: 50,
    customer_code: 'C-0012',
    customer_name: 'BELICARIO, WELMA',
    collector_name: 'Unassigned',
    penalty_payment_count: 0,
    balance_payment_count: 0,
  }]);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    id: 'release-charge-penalty-6',
    loan_id: 6,
    loan_code: '20260813-0003',
    customer_id: 12,
    customer_code: 'C-0012',
    customer_name: 'BELICARIO, WELMA',
    collector_name: 'Unassigned',
    date_paid: '2026-08-13',
    balance_after: 0,
    collection_source: 'loan_release',
    amount_paid: 50,
    payment_type: 'penalty',
    payment_code: 'PENALTY',
    or_number: 'PENALTY',
    remarks: 'Loan release penalty charge',
  });
});
