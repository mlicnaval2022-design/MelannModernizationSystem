const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateLoanLedger } = require('../../src/services/loanBalanceRecalculator');

test('loan ledger produces a continuous chronological running balance', () => {
  const ledger = calculateLoanLedger(
    { total_amortization: 10600 },
    [
      { id: 1, amount_paid: 1680 },
      { id: 2, amount_paid: 600 },
      { id: 3, amount_paid: 1000 },
    ]
  );

  assert.deepEqual(
    ledger.entries.map(entry => [entry.balanceBefore, entry.balanceAfter]),
    [[10600, 8920], [8920, 8320], [8320, 7320]]
  );
  assert.equal(ledger.finalBalance, 7320);
  assert.equal(ledger.totalPaid, 3280);
});

test('loan ledger clamps an overpayment at zero without allowing a negative balance', () => {
  const ledger = calculateLoanLedger(
    { principal: 1000, interest_amount: 100 },
    [{ id: 1, amount_paid: 1200 }]
  );

  assert.equal(ledger.entries[0].balanceBefore, 1100);
  assert.equal(ledger.entries[0].balanceAfter, 0);
  assert.equal(ledger.finalBalance, 0);
});
