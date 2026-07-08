const { dbAll, dbGet, dbRun } = require('../db/database');
const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
dayjs.extend(isBetween);

async function getHolidays() {
  const h = await dbAll('SELECT holiday_date FROM tblHoliday');
  return new Set(h.map(x => x.holiday_date));
}

async function getSettings() {
  const rows = await dbAll('SELECT setting_key, setting_value FROM tblSystemSettings');
  const s = {};
  rows.forEach(r => s[r.setting_key] = r.setting_value);
  return s;
}

// Evaluate a single loan
async function evaluateLoan(loan, holidays, settings, todayStr = dayjs().format('YYYY-MM-DD')) {
  // If not active, or balance <= 0, resolve any active alert
  if (loan.status !== 'active' || loan.balance <= 0) {
    await resolveAlert(loan.id, 'Resolved by Status Change or Full Payment');
    return;
  }

  const excludeSundays = settings['exclude_sundays'] !== 'false'; // default true
  
  // Get all active payments
  const payments = await dbAll(`SELECT date_paid, amount_paid FROM tblPayment WHERE loan_id = ? AND status = 'active'`, [loan.id]);
  
  const paymentDates = new Set();
  payments.forEach(p => {
    if (p.amount_paid > 0) {
      paymentDates.add(p.date_paid);
    }
  });

  // Calculate schedule dates backward from today to date_released
  let currentDate = dayjs(todayStr);
  const releaseDate = dayjs(loan.date_released);
  
  let consecutiveMissed = 0;
  let totalMissed = 0;
  let streakBroken = false;
  let firstMissedDate = null;
  let latestMissedDate = null;

  while (currentDate.isAfter(releaseDate) || currentDate.isSame(releaseDate, 'day')) {
    const dateStr = currentDate.format('YYYY-MM-DD');
    const isSunday = currentDate.day() === 0;
    
    let isScheduledDay = true;
    if (excludeSundays && isSunday) isScheduledDay = false;
    if (holidays.has(dateStr)) isScheduledDay = false;
    
    if (isScheduledDay) {
      const hasPayment = paymentDates.has(dateStr);
      
      if (hasPayment) {
        streakBroken = true; // The most recent valid days have payments, streak is broken
      } else {
        totalMissed++;
        if (!streakBroken) {
          consecutiveMissed++;
          if (!latestMissedDate) latestMissedDate = dateStr;
          firstMissedDate = dateStr; // Overwrites as we go back, leaving the oldest in the current streak
        }
      }
    }
    currentDate = currentDate.subtract(1, 'day');
  }

  // Handle Alerts
  const activeAlert = await dbGet(`SELECT * FROM tblMonitoringAlert WHERE loan_id = ? AND status = 'Active'`, [loan.id]);

  if (consecutiveMissed >= 3) {
    let alertLevel = 'Day 3';
    if (consecutiveMissed >= 4) alertLevel = 'Day 4+';

    if (activeAlert) {
      // Update existing alert
      await dbRun(`
        UPDATE tblMonitoringAlert 
        SET consecutive_days = ?, total_missed_days = ?, alert_level = ?, latest_missed_date = ?, first_missed_date = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [consecutiveMissed, totalMissed, alertLevel, latestMissedDate, firstMissedDate, activeAlert.id]);
      
      // If escalated, log it or notify
      if (activeAlert.alert_level !== alertLevel) {
        await logAudit('system', 'Alert Escalated', activeAlert.alert_level, alertLevel, 'Monitoring', activeAlert.id);
        await createNotification(loan.collector_id, 'Alert Escalated', `Client ${loan.customer_id} reached ${alertLevel}`, 'Monitoring', activeAlert.id);
      }
    } else {
      // Create new sequence/alert
      const pastAlerts = await dbGet(`SELECT COUNT(*) as c FROM tblMonitoringAlert WHERE loan_id = ?`, [loan.id]);
      const seq = pastAlerts.c + 1;
      let repeatRisk = 'Low Risk';
      if (seq === 2) repeatRisk = 'Moderate Risk';
      if (seq >= 3) repeatRisk = 'High Risk';

      const r = await dbRun(`
        INSERT INTO tblMonitoringAlert 
        (customer_id, loan_id, branch_id, collector_id, first_missed_date, latest_missed_date, consecutive_days, total_missed_days, alert_level, sequence_number, repeat_risk)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [loan.customer_id, loan.id, loan.branch_id || 0, loan.collector_id || 0, firstMissedDate, latestMissedDate, consecutiveMissed, totalMissed, alertLevel, seq, repeatRisk]);
      
      await logAudit('system', 'Alert Created', null, alertLevel, 'Monitoring', r.lastID);
      await createNotification(loan.collector_id, 'New 3-Day Alert', `Client ${loan.customer_id} missed 3 consecutive days`, 'Monitoring', r.lastID);
    }
  } else {
    // If consecutiveMissed < 3 but has active alert, resolve it
    if (activeAlert) {
      await resolveAlert(loan.id, 'Resolved by Payment');
    }
  }
}

async function resolveAlert(loanId, reason) {
  const activeAlert = await dbGet(`SELECT * FROM tblMonitoringAlert WHERE loan_id = ? AND status = 'Active'`, [loanId]);
  if (activeAlert) {
    await dbRun(`UPDATE tblMonitoringAlert SET status = 'Resolved', resolution_reason = ?, resolved_at = datetime('now') WHERE id = ?`, [reason, activeAlert.id]);
    await logAudit('system', 'Alert Resolved', 'Active', 'Resolved', 'Monitoring', activeAlert.id);
    await createNotification(activeAlert.collector_id, 'Alert Resolved', `Alert for loan ${loanId} was resolved.`, 'Monitoring', activeAlert.id);
  }
}

async function runDailyMonitoring() {
  console.log('🔄 Running 3-Day No-Payment Daily Evaluation...');
  const holidays = await getHolidays();
  const settings = await getSettings();
  
  const activeLoans = await dbAll(`SELECT * FROM tblLoan WHERE status = 'active' AND balance > 0`);
  for (const loan of activeLoans) {
    await evaluateLoan(loan, holidays, settings);
  }
  console.log('✅ Daily Evaluation Complete.');
}

// Event triggered recalculation for a specific loan
async function triggerLoanRecalculation(loanId) {
  const holidays = await getHolidays();
  const settings = await getSettings();
  const loan = await dbGet(`SELECT * FROM tblLoan WHERE id = ?`, [loanId]);
  if (loan) {
    await evaluateLoan(loan, holidays, settings);
  }
}

async function logAudit(userRole, action, prev, newV, moduleName, refId) {
  await dbRun(`INSERT INTO tblSystemAudit (role, action, previous_value, new_value, module, ip_address) VALUES (?,?,?,?,?,?)`, 
    [userRole, action, prev, newV, moduleName, refId?.toString()]);
}

async function createNotification(userId, title, msg, moduleName, relatedId) {
  if (!userId) return;
  await dbRun(`INSERT INTO tblInAppNotification (user_id, title, message, related_module, related_id) VALUES (?,?,?,?,?)`, 
    [userId, title, msg, moduleName, relatedId]);
}

let cronInterval = null;

async function startNoPaymentMonitoringScheduler() {
  // Check settings for cutoff time, e.g., '20:00' (8:00 PM)
  const set = await getSettings();
  const cutoff = set['daily_cutoff'] || '20:00';
  const [targetH, targetM] = cutoff.split(':').map(Number);

  console.log(`🕒 3-Day Monitoring Scheduler initialized. Cut-off time: ${cutoff}`);

  cronInterval = setInterval(() => {
    const now = dayjs();
    // Run if it's the target hour and minute, only once per day
    // The setInterval runs every 1 minute
    if (now.hour() === targetH && now.minute() === targetM) {
      runDailyMonitoring();
    }
  }, 60 * 1000); // Check every minute
}

module.exports = {
  startNoPaymentMonitoringScheduler,
  runDailyMonitoring,
  triggerLoanRecalculation,
  logAudit,
  createNotification
};
