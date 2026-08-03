const { dbAll, dbGet, dbRun } = require('../db/database');
const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
const { sqlNotSunday } = require('./operationDays');
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

const ACTIVE_MONITORING_CUSTOMER_STATUSES = new Set(['active', 'recon']);

function isReconLoan(loan) {
  return String(loan.loan_type || '').toLowerCase().includes('recon');
}

function isPastMaturity(loan, todayStr) {
  if (!loan.date_maturity) return false;
  const maturityDate = dayjs(loan.date_maturity);
  return maturityDate.isValid() && maturityDate.isBefore(dayjs(todayStr), 'day');
}

function isEligibleForNoPaymentMonitoring(loan, todayStr = dayjs().format('YYYY-MM-DD')) {
  const customerStatus = String(loan.customer_status || '').toLowerCase();
  const loanStatus = String(loan.status || '').toLowerCase();

  return ACTIVE_MONITORING_CUSTOMER_STATUSES.has(customerStatus)
    && loanStatus === 'active'
    && Number(loan.balance || 0) > 0
    && (isReconLoan(loan) || !isPastMaturity(loan, todayStr));
}

// Evaluate a single loan
async function evaluateLoan(loan, holidays, settings, todayStr = dayjs().format('YYYY-MM-DD')) {
  if (!isEligibleForNoPaymentMonitoring(loan, todayStr)) {
    await resolveAlert(loan.id, 'Resolved by Monitoring Eligibility Change');
    return;
  }

  const excludeSundays = settings['exclude_sundays'] !== 'false'; // default true

  // Get all active payments (exclude Sunday payments)
  const payments = await dbAll(
    `SELECT date_paid, amount_paid FROM tblPayment WHERE loan_id = ? AND status = 'active' AND ${sqlNotSunday('date_paid')}`,
    [loan.id]
  );

  const paymentDates = new Set();
  payments.forEach(p => {
    if (p.amount_paid > 0) {
      paymentDates.add(p.date_paid);
    }
  });

  // Calculate schedule dates backward from today to date_released
  // Sunday days are NOT counted as missed — they are non-operation days
  let currentDate = dayjs(todayStr);
  const releaseDate = dayjs(loan.date_released);

  let consecutiveMissed = 0;
  let totalMissed = 0;
  let streakBroken = false;
  let firstMissedDate = null;
  let latestMissedDate = null;

  while (currentDate.isAfter(releaseDate, 'day')) {
    const dateStr = currentDate.format('YYYY-MM-DD');
    const isSunday = currentDate.day() === 0;

    // Sundays and holidays are non-scheduled — they never count as missed
    let isScheduledDay = true;
    if (excludeSundays && isSunday) isScheduledDay = false;
    if (holidays.has(dateStr)) isScheduledDay = false;

    const hasPayment = paymentDates.has(dateStr);

    if (hasPayment) {
      streakBroken = true; // Any payment breaks the streak (even on non-scheduled days)
    } else if (isScheduledDay) {
      totalMissed++;
      if (!streakBroken) {
        consecutiveMissed++;
        if (!latestMissedDate) latestMissedDate = dateStr;
        firstMissedDate = dateStr; // Overwrites as we go back, leaving the oldest in the current streak
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
    // consecutiveMissed < 3 — resolve any existing active alert
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
  const todayStr = dayjs().format('YYYY-MM-DD');
  const todayDow = dayjs(todayStr).day(); // 0 = Sunday

  // No operations on Sunday — skip the scan entirely
  if (todayDow === 0) {
    console.log('⏭️  Daily Monitoring skipped — today is Sunday (no operations).');
    return;
  }

  console.log('🔄 Running 3-Day No-Payment Daily Evaluation...');
  const holidays = await getHolidays();
  const settings = await getSettings();

  const ineligibleActiveAlerts = await dbAll(`
    SELECT m.loan_id
    FROM tblMonitoringAlert m
    JOIN tblLoan l ON m.loan_id = l.id
    JOIN tblCustomer c ON m.customer_id = c.id
    WHERE m.status = 'Active'
      AND NOT (
        LOWER(c.status) IN ('active', 'recon')
        AND LOWER(l.status) = 'active'
        AND COALESCE(l.balance, 0) > 0
        AND (
          LOWER(COALESCE(l.loan_type, '')) LIKE '%recon%'
          OR l.date_maturity IS NULL
          OR date(l.date_maturity) >= date(?)
        )
      )
  `, [todayStr]);

  for (const alert of ineligibleActiveAlerts) {
    await resolveAlert(alert.loan_id, 'Resolved by Monitoring Eligibility Change');
  }

  const activeLoans = await dbAll(`
    SELECT l.*, c.status as customer_status
    FROM tblLoan l
    JOIN tblCustomer c ON l.customer_id = c.id
    WHERE LOWER(l.status) = 'active'
      AND COALESCE(l.balance, 0) > 0
      AND LOWER(c.status) IN ('active', 'recon')
      AND (
        LOWER(COALESCE(l.loan_type, '')) LIKE '%recon%'
        OR l.date_maturity IS NULL
        OR date(l.date_maturity) >= date(?)
      )
  `, [todayStr]);

  for (const loan of activeLoans) {
    await evaluateLoan(loan, holidays, settings, todayStr);
  }

  // Log a dedicated 'Daily Monitoring Run' audit entry.
  // The startup check uses ONLY this action to decide if today's scan already ran,
  // preventing other audit entries (payments, follow-ups, etc.) from blocking recalculation.
  await logAudit('system', 'Daily Monitoring Run', null, todayStr, 'Monitoring', null);
  console.log('✅ Daily Evaluation Complete.');
}

// Event-triggered recalculation for a specific loan (e.g., after a payment is posted)
async function triggerLoanRecalculation(loanId) {
  const holidays = await getHolidays();
  const settings = await getSettings();
  const loan = await dbGet(`
    SELECT l.*, c.status as customer_status
    FROM tblLoan l
    JOIN tblCustomer c ON l.customer_id = c.id
    WHERE l.id = ?
  `, [loanId]);
  if (loan) {
    await evaluateLoan(loan, holidays, settings);
  }
}

async function logAudit(userRole, action, prev, newV, moduleName, refId) {
  await dbRun(
    `INSERT INTO tblSystemAudit (role, action, previous_value, new_value, module, ip_address) VALUES (?,?,?,?,?,?)`,
    [userRole, action, prev, newV, moduleName, refId?.toString()]
  );
}

async function createNotification(userId, title, msg, moduleName, relatedId) {
  if (!userId) return;
  await dbRun(
    `INSERT INTO tblInAppNotification (user_id, title, message, related_module, related_id) VALUES (?,?,?,?,?)`,
    [userId, title, msg, moduleName, relatedId]
  );
}

let cronInterval = null;
let lastRunDate = null; // Track to prevent double-runs on the same day

async function startNoPaymentMonitoringScheduler() {
  // Check settings for cutoff time, e.g., '20:00' (8:00 PM)
  const set = await getSettings();
  const cutoff = set['daily_cutoff'] || '20:00';
  const [targetH, targetM] = cutoff.split(':').map(Number);

  console.log(`🕒 3-Day Monitoring Scheduler initialized. Cut-off time: ${cutoff}`);

  // Run on startup if today's dedicated 'Daily Monitoring Run' hasn't been logged yet.
  // IMPORTANT: We only look for 'Daily Monitoring Run' — NOT other monitoring actions like
  // 'Alert Created' or 'Alert Resolved', because those can be created by payments/follow-ups
  // that happen after the cutoff. Without this fix, a payment posted at e.g. 9 PM would
  // cause the next morning's startup scan to be skipped, leaving stale alert data.
  const todayStr = dayjs().format('YYYY-MM-DD');
  const lastAudit = await dbGet(
    `SELECT MAX(created_at) as last_run FROM tblSystemAudit WHERE module = 'Monitoring' AND action = 'Daily Monitoring Run'`
  );
  const lastRunStr = lastAudit?.last_run ? dayjs(lastAudit.last_run).format('YYYY-MM-DD') : null;

  if (lastRunStr !== todayStr) {
    console.log(`🔄 Monitoring hasn't run today (last run: ${lastRunStr || 'never'}). Running catch-up now...`);
    lastRunDate = todayStr;
    await runDailyMonitoring();
  } else {
    lastRunDate = todayStr;
    console.log(`✅ Monitoring already ran today. Skipping startup run.`);
  }

  cronInterval = setInterval(() => {
    const now = dayjs();
    const nowDateStr = now.format('YYYY-MM-DD');
    // Run if it's the target hour and minute, and hasn't run today yet
    if (now.hour() === targetH && now.minute() === targetM && lastRunDate !== nowDateStr) {
      lastRunDate = nowDateStr;
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
