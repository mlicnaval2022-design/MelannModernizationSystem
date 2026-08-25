const test = require('node:test');
const assert = require('node:assert/strict');
const { applyDemandPenaltyPolicy } = require('../../src/services/demandPenaltyPolicy');

test('keeps the generated penalty for the first demand', () => {
  const result = applyDemandPenaltyPolicy({
    demandType: 'first',
    runningBalance: 2340,
    penaltyCharges: 117,
    totalAmountDue: 2457,
    firstDemandPenalty: 999,
  });

  assert.deepEqual(result, { penalty_charges: 117, total_amount_due: 2457 });
});

test('locks later demands to the first demand penalty', () => {
  const result = applyDemandPenaltyPolicy({
    demandType: 'second',
    runningBalance: 2100,
    penaltyCharges: 350,
    totalAmountDue: 2450,
    firstDemandPenalty: 117,
  });

  assert.deepEqual(result, { penalty_charges: 117, total_amount_due: 2217 });
});

test('preserves a legitimate zero penalty from the first demand', () => {
  const result = applyDemandPenaltyPolicy({
    demandType: 'third',
    runningBalance: 1800,
    penaltyCharges: 400,
    totalAmountDue: 2200,
    firstDemandPenalty: 0,
  });

  assert.deepEqual(result, { penalty_charges: 0, total_amount_due: 1800 });
});

test('falls back to the requested amounts when no first demand exists', () => {
  const result = applyDemandPenaltyPolicy({
    demandType: 'second',
    runningBalance: 2100,
    penaltyCharges: 350,
    totalAmountDue: 2450,
    firstDemandPenalty: null,
  });

  assert.deepEqual(result, { penalty_charges: 350, total_amount_due: 2450 });
});
