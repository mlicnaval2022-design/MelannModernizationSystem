const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeAmortization,
  computeMaturityDate,
  generateAmortizationSchedule,
  getWorkingDays,
} = require('../../src/services/loanCalculator');
const { isSundayDate, requireOperationDate, sqlNotSunday } = require('../../src/services/operationDays');

test('computeAmortization calculates add-on interest across working days', () => {
  assert.deepEqual(computeAmortization(10000, 10, 45), {
    interest_amount: 1000,
    total_amortization: 11000,
    amortization: 283,
  });
});

test('getWorkingDays excludes Sundays from calendar loan period', () => {
  assert.equal(getWorkingDays(7), 6);
  assert.equal(getWorkingDays(45), 39);
});

test('computeMaturityDate adds calendar days', () => {
  assert.equal(computeMaturityDate('2026-07-01', 45), '2026-08-15');
  assert.equal(computeMaturityDate('2026-07-17', 30), '2026-08-16');
});

test('generateAmortizationSchedule skips Sundays and keeps payment order', () => {
  const schedule = generateAmortizationSchedule(12, '2026-07-04', 3, 100);

  assert.deepEqual(schedule.map((entry) => entry.due_date), ['2026-07-06', '2026-07-07', '2026-07-08']);
  assert.deepEqual(schedule.map((entry) => entry.period_number), [1, 2, 3]);
  assert.equal(schedule[0].loan_id, 12);
  assert.equal(schedule[0].amount_due, 100);
});

test('operation date helpers identify and reject Sundays', () => {
  assert.equal(isSundayDate('2026-07-19'), true);
  assert.equal(isSundayDate('2026-07-20'), false);
  assert.throws(
    () => requireOperationDate('2026-07-19', 'Payment date'),
    /Payment date cannot be Sunday/
  );
  assert.equal(sqlNotSunday('p.date_paid'), "strftime('%w', p.date_paid) != '0'");
});
