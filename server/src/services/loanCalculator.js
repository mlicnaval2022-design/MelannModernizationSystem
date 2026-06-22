/**
 * Loan Calculator Service
 * Core business logic for amortization, maturity, and balance computations
 */

/**
 * Compute loan amortization (flat/add-on interest)
 */
function computeAmortization(principal, interestRate, loanPeriod) {
  const interest = principal * (interestRate / 100) * loanPeriod;
  const totalAmount = principal + interest;
  const amortization = totalAmount / loanPeriod;
  return {
    interest_amount: parseFloat(interest.toFixed(2)),
    total_amortization: parseFloat(totalAmount.toFixed(2)),
    amortization: parseFloat(amortization.toFixed(2)),
  };
}

/**
 * Compute maturity date from release date and period (months)
 */
function computeMaturityDate(dateReleased, loanPeriodMonths) {
  const date = new Date(dateReleased);
  date.setMonth(date.getMonth() + parseInt(loanPeriodMonths));
  return date.toISOString().split('T')[0];
}

/**
 * Generate amortization schedule (monthly)
 */
function generateAmortizationSchedule(loanId, dateReleased, loanPeriod, amortizationAmount) {
  const schedule = [];
  for (let i = 1; i <= loanPeriod; i++) {
    const dueDate = new Date(dateReleased);
    dueDate.setMonth(dueDate.getMonth() + i);
    schedule.push({
      loan_id: loanId,
      period_number: i,
      due_date: dueDate.toISOString().split('T')[0],
      amount_due: parseFloat(amortizationAmount.toFixed(2)),
      amount_paid: 0,
      status: 'unpaid',
    });
  }
  return schedule;
}

/**
 * Compute net proceeds after deductions
 */
function computeNetProceeds(principal, serviceFeePct, insurance, notarialFee, filingFee) {
  const serviceFee = principal * (serviceFeePct / 100);
  const totalDeductions = serviceFee + insurance + notarialFee + filingFee;
  const netProceeds = principal - totalDeductions;
  return {
    service_fee: parseFloat(serviceFee.toFixed(2)),
    total_deductions: parseFloat(totalDeductions.toFixed(2)),
    net_proceeds: parseFloat(netProceeds.toFixed(2)),
  };
}

/**
 * Check if a loan is past due
 */
function isPastDue(dateMaturity) {
  const today = new Date();
  const maturity = new Date(dateMaturity);
  return today > maturity;
}

module.exports = {
  computeAmortization,
  computeMaturityDate,
  generateAmortizationSchedule,
  computeNetProceeds,
  isPastDue,
};
