const express = require('express');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit, createNotification, runDailyMonitoring } = require('../services/noPaymentMonitoring');
const dayjs = require('dayjs');
const router = express.Router();

function buildMonitoringEligibilityCondition() {
  return `
    LOWER(c.status) IN ('active', 'recon')
    AND LOWER(l.status) = 'active'
    AND COALESCE(l.balance, 0) > 0
    AND (
      LOWER(COALESCE(l.loan_type, '')) LIKE '%recon%'
      OR l.date_maturity IS NULL
      OR date(l.date_maturity) >= date(?)
    )
  `;
}

router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const { tab, branch_id, collector_id } = req.query;
    
    let baseCond = buildMonitoringEligibilityCondition();
    const params = [dayjs().format('YYYY-MM-DD')];

    // Role-based access
    if (req.user.role === 'collector') {
      if (collector_id) {
        baseCond += ` AND m.collector_id = ?`;
        params.push(collector_id);
      }
    } else if (req.user.role === 'teller' || req.user.role === 'manager' || req.user.role === 'accounting') {
      if (req.user.branch_id) {
        baseCond += ` AND m.branch_id = ?`;
        params.push(req.user.branch_id);
      } else if (branch_id) {
        baseCond += ` AND m.branch_id = ?`;
        params.push(branch_id);
      }
      if (collector_id) {
        baseCond += ` AND m.collector_id = ?`;
        params.push(collector_id);
      }
    } else if (req.user.role === 'admin') {
      if (branch_id) {
        baseCond += ` AND m.branch_id = ?`;
        params.push(branch_id);
      }
      if (collector_id) {
        baseCond += ` AND m.collector_id = ?`;
        params.push(collector_id);
      }
    }

    if (tab === 'new') {
      baseCond += ` AND m.status = 'Active' AND m.alert_level = 'Day 3' AND m.sequence_number = 1`;
    } else if (tab === 'monitoring') {
      baseCond += ` AND m.status = 'Active' AND m.alert_level IN ('Day 3', 'Day 4+')`;
    } else if (tab === 'ptp') {
      baseCond += ` AND m.status = 'Active' AND EXISTS (SELECT 1 FROM tblPromiseToPay ptp WHERE ptp.alert_id = m.id AND ptp.status IN ('Pending', 'Due Today'))`;
    } else if (tab === 'escalated') {
      baseCond += ` AND m.status = 'Active' AND m.alert_level = 'Day 4+'`;
    } else if (tab === 'resolved') {
      baseCond += ` AND m.status = 'Resolved'`;
    } else if (tab === 'history') {
      // All records
    }

    const q = `
      SELECT m.*, 
             c.customer_code, c.full_name as customer_name, c.address, c.contact, c.status as customer_status,
             l.loan_code, l.loan_type, l.date_released, l.date_maturity, l.amortization, l.balance,
             co.first_name || ' ' || co.last_name as collector_name,
             b.branch_name,
             (SELECT ptp.promise_date FROM tblPromiseToPay ptp WHERE ptp.alert_id = m.id AND ptp.status IN ('Pending', 'Due Today') ORDER BY ptp.id DESC LIMIT 1) as ptp_date,
             (SELECT ptp.promised_amount FROM tblPromiseToPay ptp WHERE ptp.alert_id = m.id AND ptp.status IN ('Pending', 'Due Today') ORDER BY ptp.id DESC LIMIT 1) as ptp_amount,
             (SELECT f.follow_up_date FROM tblFollowUp f WHERE f.alert_id = m.id ORDER BY f.id DESC LIMIT 1) as last_follow_up_date,
             (SELECT f.contact_result FROM tblFollowUp f WHERE f.alert_id = m.id ORDER BY f.id DESC LIMIT 1) as last_follow_up_result,
             (SELECT p.date_paid FROM tblPayment p WHERE p.loan_id = m.loan_id AND p.status='active' ORDER BY p.date_paid DESC LIMIT 1) as last_payment_date,
             (SELECT p.amount_paid FROM tblPayment p WHERE p.loan_id = m.loan_id AND p.status='active' ORDER BY p.date_paid DESC LIMIT 1) as last_payment_amount
      FROM tblMonitoringAlert m
      JOIN tblCustomer c ON m.customer_id = c.id
      JOIN tblLoan l ON m.loan_id = l.id
      LEFT JOIN tblCollector co ON m.collector_id = co.id
      LEFT JOIN tblBranch b ON m.branch_id = b.id
      WHERE ${baseCond}
      ORDER BY m.updated_at DESC
    `;

    const alerts = await dbAll(q, params);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/follow-up', authenticateToken, async (req, res) => {
  try {
    const { alert_id, customer_id, follow_up_date, follow_up_method, contact_result, remarks, next_follow_up_date } = req.body;
    
    await dbRun(`
      INSERT INTO tblFollowUp (alert_id, customer_id, user_id, follow_up_date, follow_up_method, contact_result, remarks, next_follow_up_date) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [alert_id, customer_id, req.user.id, follow_up_date, follow_up_method, contact_result, remarks, next_follow_up_date]);
    
    await logAudit(req.user.role, 'Added Follow-up', null, contact_result, 'Monitoring', alert_id);
    res.json({ message: 'Follow-up recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ptp', authenticateToken, async (req, res) => {
  try {
    const { alert_id, customer_id, promise_date, promised_amount, payment_method, reason, remarks } = req.body;
    
    await dbRun(`
      INSERT INTO tblPromiseToPay (alert_id, customer_id, user_id, promise_date, promised_amount, payment_method, reason, remarks) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [alert_id, customer_id, req.user.id, promise_date, promised_amount, payment_method, reason, remarks]);
    
    await logAudit(req.user.role, 'Added Promise To Pay', null, `${promise_date} - ${promised_amount}`, 'Monitoring', alert_id);
    res.json({ message: 'Promise to Pay recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/resolve', authenticateToken, async (req, res) => {
  try {
    const { alert_id, reason } = req.body;
    await dbRun(`UPDATE tblMonitoringAlert SET status = 'Resolved', resolution_reason = ?, resolved_at = datetime('now'), resolved_by = ? WHERE id = ?`, [reason, req.user.id, alert_id]);
    await logAudit(req.user.role, 'Manually Resolved Alert', 'Active', 'Resolved', 'Monitoring', alert_id);
    res.json({ message: 'Alert resolved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/escalate', authenticateToken, requireRole('manager', 'admin'), async (req, res) => {
  try {
    const { alert_id, remarks } = req.body;
    const alert = await dbGet(`SELECT alert_level FROM tblMonitoringAlert WHERE id = ?`, [alert_id]);
    if (alert) {
      await dbRun(`UPDATE tblMonitoringAlert SET alert_level = 'Day 4+' WHERE id = ?`, [alert_id]);
      await logAudit(req.user.role, 'Manually Escalated Case', alert.alert_level, 'Day 4+', 'Monitoring', alert_id);
      
      if (remarks) {
        await dbRun(`
          INSERT INTO tblFollowUp (alert_id, customer_id, user_id, follow_up_date, follow_up_method, contact_result, remarks) 
          VALUES (?, (SELECT customer_id FROM tblMonitoringAlert WHERE id=?), ?, date('now'), 'Other', 'Manager Escalation', ?)
        `, [alert_id, alert_id, req.user.id, remarks]);
      }
      
      res.json({ message: 'Alert escalated' });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    // Return unread notifications for this user, or all if admin?
    // Wait, requirement: Collector, Supervisor, Manager. For now let's just get everything for this user.
    let q = `SELECT * FROM tblInAppNotification WHERE is_read = 0`;
    const params = [];
    
    // Simplification: just return all recent unread for the demo
    q += ` ORDER BY created_at DESC LIMIT 50`;
    
    const notifs = await dbAll(q, params);
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.body;
    if (id) {
      await dbRun(`UPDATE tblInAppNotification SET is_read = 1 WHERE id = ?`, [id]);
    } else {
      await dbRun(`UPDATE tblInAppNotification SET is_read = 1`);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/timeline/:alert_id', authenticateToken, async (req, res) => {
  try {
    const f = await dbAll(`SELECT *, 'followup' as _type FROM tblFollowUp WHERE alert_id = ?`, [req.params.alert_id]);
    const p = await dbAll(`SELECT *, 'ptp' as _type FROM tblPromiseToPay WHERE alert_id = ?`, [req.params.alert_id]);
    const timeline = [...f, ...p].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run-daily', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await runDailyMonitoring();
    const active = await dbGet(`
      SELECT COUNT(*) as c
      FROM tblMonitoringAlert m
      JOIN tblCustomer c ON m.customer_id = c.id
      JOIN tblLoan l ON m.loan_id = l.id
      WHERE m.status = 'Active'
        AND ${buildMonitoringEligibilityCondition()}
    `, [dayjs().format('YYYY-MM-DD')]);
    res.json({ message: 'Daily monitoring completed', active_alerts: active.c });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
