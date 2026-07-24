const db = require('./server/src/db/database'); 
const date = '2026-07-17';
const reconLoanTypesSql = "('recon', 'reconstruct', 'reconstructed')";
const getDcrLoanCondition = () => `(
  (LOWER(COALESCE(l.loan_type, '')) IN ${reconLoanTypesSql} AND date(l.created_at) = ?)
  OR
  (LOWER(COALESCE(l.loan_type, '')) NOT IN ${reconLoanTypesSql} AND l.date_released = ?)
) AND l.status IN ('active', 'fully_paid')`;

db.dbAll(`SELECT l.id, l.principal, l.net_proceeds, l.loan_type, l.status, l.date_released, l.created_at FROM tblLoan l WHERE ` + getDcrLoanCondition(), [date, date])
  .then(rows => {
    console.log(rows);
    console.log('Total Principal (DCR fully_paid):', rows.reduce((s, r) => s + r.principal, 0));
  });

const getDcrLoanConditionFix = () => `(
  (LOWER(COALESCE(l.loan_type, '')) IN ${reconLoanTypesSql} AND date(l.created_at) = ?)
  OR
  (LOWER(COALESCE(l.loan_type, '')) NOT IN ${reconLoanTypesSql} AND l.date_released = ?)
) AND l.status IN ('active', 'fullpaid')`;

db.dbAll(`SELECT l.id, l.principal, l.net_proceeds, l.loan_type, l.status, l.date_released, l.created_at FROM tblLoan l WHERE ` + getDcrLoanConditionFix(), [date, date])
  .then(rows => {
    console.log('Total Principal (DCR fullpaid):', rows.reduce((s, r) => s + r.principal, 0));
  });

db.dbAll(`SELECT COALESCE(SUM(principal),0) as total, COUNT(*) as c FROM tblLoan WHERE date_released = ? AND status != 'reversed'`, [date])
  .then(rows => {
    console.log('Original Dashboard Logic:', rows);
  });
