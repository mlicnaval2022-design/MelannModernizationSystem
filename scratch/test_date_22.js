const { dbAll, dbGet } = require('../server/src/db/database');
const { buildCollectionPaymentExclusionSql } = require('../server/src/services/paymentClassification');
const { sqlNotSunday } = require('../server/src/services/operationDays');

async function testDate(date) {
  console.log(`=== Testing collections for ${date} ===`);
  
  // 1. Collections query as in dcr.js
  const pCond = `p.date_paid = ? AND p.status IN ('active', 'penalty') AND ${buildCollectionPaymentExclusionSql('p')} AND ${sqlNotSunday('p.date_paid')}`;
  const collections = await dbAll(`
    SELECT p.id, p.or_number, p.payment_code, p.amount_paid, p.payment_type, p.status, p.remarks, p.date_paid,
           c.customer_code, c.first_name, c.last_name,
           COALESCE(
             co.first_name || ' ' || co.last_name,
             rco.first_name || ' ' || rco.last_name,
             cco.first_name || ' ' || cco.last_name
           ) as collector_name
    FROM tblPayment p
    JOIN tblCustomer c ON p.customer_id = c.id
    LEFT JOIN tblCollector co ON p.collector_id = co.id
    LEFT JOIN tblLoan rl ON (rl.customer_id = p.customer_id AND rl.date_released = p.date_paid AND LOWER(COALESCE(rl.status, '')) NOT IN ('reversed', 'rejected', 'cancelled', 'canceled'))
    LEFT JOIN tblCollector rco ON rl.collector_id = rco.id
    LEFT JOIN tblCollector cco ON c.collector_id = cco.id
    WHERE ${pCond}
  `, [date]);

  console.log(`Collections count: ${collections.length}, Total: ${collections.reduce((s, c) => s + c.amount_paid, 0)}`);
  
  const alaoInCollections = collections.find(c => c.customer_code === '3881' || c.last_name === 'ALAO');
  console.log('Alao, Arlyn in collections:', alaoInCollections);

  // Group by collector
  const byCollector = {};
  collections.forEach(c => {
    byCollector[c.collector_name] = (byCollector[c.collector_name] || 0) + c.amount_paid;
  });
  console.log('Aldie Rosal collection:', byCollector['Aldie Rosal']);
}

testDate('2026-08-22').catch(console.error);
