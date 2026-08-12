const test = require('node:test');
const assert = require('node:assert/strict');

const { __private } = require('../../src/routes/reports');

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
