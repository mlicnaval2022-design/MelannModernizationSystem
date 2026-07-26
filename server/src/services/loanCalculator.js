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
  const period = parseInt(loanPeriod) || 45;
  const interest = p * (r / 100);
  const totalAmount = Math.ceil(p + interest);
  const workingDays = getWorkingDays(period);
  const amortization = Math.ceil(totalAmount / workingDays);
  return {
    interest_amount: parseFloat(interest.toFixed(2)),
    total_amortization: parseFloat(totalAmount.toFixed(2)),
    amortization: amortization,
  };
}

/**
 * Compute maturity date from release date using the actual loan period (calendar days)
 */
function computeMaturityDate(dateReleased, loanPeriod) {
  const days = parseInt(loanPeriod) || 45;
  const date = new Date(dateReleased);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Count working days (excluding Sundays) within a given number of calendar days
 */
function getWorkingDays(calendarDays) {
  const days = parseInt(calendarDays) || 45;
  if (days === 30) return 26;
  if (days === 45) return 39;
  if (days === 60) return 52;
  const fullWeeks = Math.floor(days / 7);
  const remainder = days % 7;
  return (fullWeeks * 6) + Math.min(remainder, 6);
}

/**
 * Generate amortization schedule (daily payments excluding Sundays)
 * Number of payments is based on working days in the loan period
 */
function generateAmortizationSchedule(loanId, dateReleased, loanPeriod, amortizationAmount) {
  const schedule = [];
  let currentDate = new Date(dateReleased);
  const calendarDays = parseInt(loanPeriod) || 45;
  const totalPayments = getWorkingDays(calendarDays);
  let paymentsGenerated = 0;
  
  while (paymentsGenerated < totalPayments) {
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
  getWorkingDays,
  generateAmortizationSchedule,
  computeNetProceeds,
  isPastDue,
};
