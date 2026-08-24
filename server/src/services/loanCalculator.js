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
 * Count working days (excluding Sundays) for a given loan period
 */
function getWorkingDays(period) {
  const p = parseInt(period) || 45;
  if (p === 26 || p === 30) return 26;
  if (p === 39 || p === 45) return 39;
  if (p === 52 || p === 60) return 52;
  if (p === 78 || p === 90) return 78;
  if (p === 104 || p === 120) return 104;
  if (p === 156 || p === 180) return 156;
  if (p % 6 === 0) return p;
  const fullWeeks = Math.floor(p / 7);
  const remainder = p % 7;
  return (fullWeeks * 6) + Math.min(remainder, 6);
}

/**
 * Compute maturity date from release date using working days (excluding Sundays)
 */
function computeMaturityDate(dateReleased, loanPeriod) {
  if (!dateReleased) return '';
  const workingDays = getWorkingDays(loanPeriod);
  const date = new Date(`${String(dateReleased).slice(0, 10)}T00:00:00`);
  let added = 0;
  while (added < workingDays) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0) { // skip Sunday
      added++;
    }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Generate amortization schedule (daily payments excluding Sundays)
 * Number of payments is based on working days in the loan period
 */
function generateAmortizationSchedule(loanId, dateReleased, loanPeriod, amortizationAmount) {
  const schedule = [];
  let currentDate = new Date(`${String(dateReleased).slice(0, 10)}T00:00:00`);
  const totalPayments = getWorkingDays(loanPeriod);
  let paymentsGenerated = 0;
  
  while (paymentsGenerated < totalPayments) {
    currentDate.setDate(currentDate.getDate() + 1);
    // 0 is Sunday
    if (currentDate.getDay() !== 0) {
      paymentsGenerated++;
      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      schedule.push({
        loan_id: loanId,
        period_number: paymentsGenerated,
        due_date: `${y}-${m}-${d}`,
        amount_due: parseFloat(Number(amortizationAmount).toFixed(2)),
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
