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

test('Access single-loan scan uses a validated Loan ID without requiring dates', () => {
  const where = _test.accessLoanWhere({ prefix: 'l.', loanId: '30997' });

  assert.match(where, /l\.LoanID=30997/);
  assert.doesNotMatch(where, /DateRelease/);
  assert.match(where, /l\.LoanStatus='Good'/);
  assert.match(where, /IsNull\(l\.Status\) OR l\.Status NOT IN/);
  assert.doesNotMatch(where, /Fully Paid|FullyPaid|'Paid'/);
});

test('single-loan scan rejects unsafe or non-numeric Loan IDs', () => {
  assert.equal(_test.validateLoanId(' 30997 '), '30997');
  assert.throws(() => _test.validateLoanId('30997 OR 1=1'), /numbers only/);
  assert.throws(() => _test.validateLoanId(''), /numbers only/);
});
