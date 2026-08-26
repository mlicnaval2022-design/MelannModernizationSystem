const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../../src/services/jcashMigrationService');

test('JCash scan normalizes zero, one, or many Access rows into arrays', () => {
  assert.deepEqual(_test.asArray(null), []);
  assert.deepEqual(_test.asArray({ LoanID: 30997 }), [{ LoanID: 30997 }]);
  assert.deepEqual(_test.asArray([{ LoanID: 30997 }, { LoanID: 29007 }]), [{ LoanID: 30997 }, { LoanID: 29007 }]);
});

test('JCash loan eligibility allows blank or non-excluded row Status when LoanStatus is Good', () => {
  assert.equal(_test.isMigratableLoan({ source_loan_status: 'Good', source_row_status: null, balance: 220 }), true);
  assert.equal(_test.isMigratableLoan({ source_loan_status: 'Good', source_row_status: 'Active', balance: 220 }), true);
  assert.equal(_test.isMigratableLoan({ source_loan_status: 'Good Status', source_row_status: '', balance: 220 }), true);
});

test('JCash eligibility trusts a positive balance over a stale paid row flag', () => {
  assert.equal(_test.isMigratableLoan({ source_loan_status: 'Good', source_row_status: 'FullyPaid', balance: 220 }), true);
  assert.equal(_test.isMigratableLoan({ source_loan_status: 'Good', source_row_status: 'Paid', balance: 288 }), true);
});

test('JCash eligibility still excludes zero-balance, non-Good, and reversed records', () => {
  assert.equal(_test.isMigratableLoan({ source_loan_status: 'Fully Paid', source_row_status: null, balance: 220 }), false);
  assert.equal(_test.isMigratableLoan({ source_loan_status: 'Good', source_row_status: 'Good', balance: 0 }), false);
  assert.equal(_test.isMigratableLoan({ source_loan_status: 'Good', source_row_status: ' Reversed ', balance: 220 }), false);
});

test('Access scan query no longer requires the separate Status field to be Good', () => {
  const where = _test.accessLoanWhere({ prefix: 'l.', from: '2023-01-01', to: '2024-12-31' });

  assert.match(where, /l\.LoanStatus='Good'/);
  assert.doesNotMatch(where, /l\.Status='Good'/);
  assert.match(where, /IsNull\(l\.Status\) OR l\.Status NOT IN/);
  assert.doesNotMatch(where, /Fully Paid|FullyPaid|'Paid'/);
  assert.match(where, /l\.Balance/);
  assert.match(where, /#01\/01\/2023#/);
  assert.match(where, /#12\/31\/2024#/);
});

test('Access single-loan scan reads the exact loan before applying eligibility rules', () => {
  const where = _test.accessLoanWhere({ prefix: 'l.', loanId: '30997' });

  assert.equal(where, 'l.LoanID=30997');
});

test('single-loan scan rejects unsafe or non-numeric Loan IDs', () => {
  assert.equal(_test.validateLoanId(' 30997 '), '30997');
  assert.throws(() => _test.validateLoanId('30997 OR 1=1'), /numbers only/);
  assert.throws(() => _test.validateLoanId(''), /numbers only/);
});

test('single-loan eligibility is rebuilt from its visible payment ledger when loan summary is stale', () => {
  const loan = _test.mapLoan({
    LoanID: 30997,
    Code: 3148,
    LoanStatus: 'Good',
    Status: 'Paid',
    Principal: 6000,
    LoanTotal: 6810,
    TotalPayment: 6810,
    Balance: 0,
    DateRelease: '2024-01-10',
  });
  const payments = [
    _test.mapPayment({ LoanID: 30997, Status: 'Good', DatePaid: '2024-04-23', TotalBalance: 6410, NewBalance: 6360, ID: 655047 }),
    _test.mapPayment({ LoanID: 30997, Status: 'Good', DatePaid: '2025-01-10', TotalBalance: 370, NewBalance: 220, ID: 700001 }),
  ];

  assert.equal(loan.balance, 0);
  _test.applyLedgerTotals([loan], payments);
  assert.equal(loan.balance, 6610);
  assert.equal(_test.isMigratableLoan(loan), true);
});

test('JCash payment balances are rebuilt chronologically when source rows were backdated', () => {
  const loan = _test.mapLoan({
    LoanID: 3828,
    Code: 745,
    LoanStatus: 'Good',
    Principal: 10000,
    LoanTotal: 10600,
    TotalPayment: 6280,
    Balance: 4320,
    DateRelease: '2017-10-01',
  });
  const payments = [
    _test.mapPayment({ LoanID: 3828, Status: 'Good', DatePaid: '2017-10-31', TotalBalance: 10600, NewBalance: 8920, ID: 175 }),
    _test.mapPayment({ LoanID: 3828, Status: 'Good', DatePaid: '2017-11-17', TotalBalance: 8920, NewBalance: 8320, ID: 176 }),
    _test.mapPayment({ LoanID: 3828, Status: 'Good', DatePaid: '2021-04-24', TotalBalance: 8320, NewBalance: 7320, ID: 177 }),
    _test.mapPayment({ LoanID: 3828, Status: 'Good', DatePaid: '2021-03-30', TotalBalance: 4320, NewBalance: 3320, ID: 181 }),
  ];

  _test.applyLedgerTotals([loan], payments);
  const chronological = payments.sort((a, b) => a.date_paid.localeCompare(b.date_paid));

  assert.deepEqual(chronological.map(payment => payment.balance_after), [8920, 8320, 7320, 6320]);
  assert.equal(loan.balance, 6320);
});

test('JCash migration trusts an explicit payment amount over a corrupted balance delta', () => {
  assert.equal(_test.getActualPaymentAmount({
    amount_paid: 500,
    balance_before: 9000,
    balance_after: 7000,
  }), 500);
  assert.equal(_test.getActualPaymentAmount({
    amount_paid: null,
    balance_before: 9000,
    balance_after: 8500,
  }), 500);
});
