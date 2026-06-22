/**
 * Loan Calculator Service
 * Core business logic for amortization, maturity, and balance computations
 */

/**
 * Compute loan amortization (flat/add-on interest)
 */
function computeAmortization(principal, interestRate, loanPeriod) {
  const p = parseFloat(principal);
  const r = parseFloat(interestRate);
  // interestRate is expected to be either 0 or 15
  const interest = p * (r / 100);
  const totalAmount = p + interest;
  // 39 payments (45 days excluding Sundays)
  const amortization = Math.round(totalAmount / 39);
  return {
    interest_amount: parseFloat(interest.toFixed(2)),
    total_amortization: parseFloat(totalAmount.toFixed(2)),
    amortization: amortization,
  };
}

/**
 * Compute maturity date from release date (45 calendar days)
 */
function computeMaturityDate(dateReleased, loanPeriodMonths) {
  const date = new Date(dateReleased);
  date.setDate(date.getDate() + 45);
  return date.toISOString().split('T')[0];
}

/**
 * Generate amortization schedule (39 daily payments excluding Sundays)
 */
function generateAmortizationSchedule(loanId, dateReleased, loanPeriod, amortizationAmount) {
  const schedule = [];
  let currentDate = new Date(dateReleased);
  let paymentsGenerated = 0;
  
  while (paymentsGenerated < 39) {
    currentDate.setDate(currentDate.getDate() + 1);
    // 0 is Sunday
    if (currentDate.getDay() !== 0) {
      paymentsGenerated++;
      schedule.push({
        loan_id: loanId,
        period_number: paymentsGenerated,
        due_date: currentDate.toISOString().split('T')[0],
        amount_due: parseFloat(amortizationAmount.toFixed(2)),
        amount_paid: 0,
        status: 'unpaid',
      });
    }
  }
  return schedule;
}

/**
 * Compute net proceeds (Removed all deductions)
 */
function computeNetProceeds(principal, serviceFeePct, insurance, notarialFee, filingFee) {
  return {
    service_fee: 0,
    total_deductions: 0,
    net_proceeds: parseFloat(principal),
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
