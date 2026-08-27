const toAmount = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const applyDemandPenaltyPolicy = ({
  demandType,
  runningBalance,
  penaltyCharges,
  totalAmountDue,
  firstDemandPenalty,
}) => {
  const normalizedRunningBalance = toAmount(runningBalance);
  const requestedPenalty = toAmount(penaltyCharges);
  const hasFirstDemandPenalty = firstDemandPenalty !== null && firstDemandPenalty !== undefined;
  const lockedPenalty = demandType === 'first' || !hasFirstDemandPenalty
    ? requestedPenalty
    : toAmount(firstDemandPenalty);

  return {
    penalty_charges: lockedPenalty,
    total_amount_due: demandType === 'first' || !hasFirstDemandPenalty
      ? toAmount(totalAmountDue)
      : normalizedRunningBalance + lockedPenalty,
  };
};

module.exports = { applyDemandPenaltyPolicy };
