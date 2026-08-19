const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const PROVIDER_CODE = 'PF022730';
const CSDF_FILE_PROVIDER_CODE = 'PF022370';
const CONTACT_TYPE_CODE = '3';
const ADDRESS_TYPE_MAIN = 'MI';
const ADDRESS_TYPE_ADDITIONAL = 'AI';

const ID_HEADER = ["Record Type","Provider Code","Subject Reference Date\n(End Day of the Reporting Month)\nddmmyyy","Provider Subject No","Title","First Name","Last Name","Middle Name","Gender","Date of Birth","Place of Birth","Country of Birth (Code)","Nationality","Resident","Civil Status","Mother's Maiden First Name","Mother's Maiden FULL NAME","Mother's Maiden Middle Name","Father First Name","Father Last Name","Address 1: Address Type","Address 1: FullAddress","Address 1: House Owner/Lessee","Address 2: Address Type","Address 2: FullAddress","Address 2: StreetNo","Identification 1: Type","ID 1: Type","ID 1: Number","ID 1: IssueDate","ID 1: IssueCountry","ID 1: ExpiryDate","ID 1: Issued By","ID 2: Type","Contact 1: Type","Contact 1: Value"];
const CI_HEADER = ["Record Type","Provider Code","Branch Code","Contract Reference Date\n(End Day of the Reporting Month)\nddmmyyy","Provider Subject No","Role","Provider Contract No","Contract Type","Contract Phase","Contract Status","Currency","Original Currency","Contract Start Date","Contract Request Date","Contract End Planned Date","Contract End Actual Date","Last Payment Date","Reorganized Credit Code","Board Resolution flag","Financed Amount","Installments Number","Transaction Type / Sub-facility","Purpose of credit","Payment Periodicity","Payment Method","Monthly Payment Amount","First Payment Date","Last payment amount","Next Payment Date","Next Payment","Outstanding Payments Number","Outstanding Balance","Overdue Payments Number","Overdue Payments Amount","Overdue Days","Good Type","Good Value","New/Used Code","Good Brand","Manufacturing Date","Registration number","Provider Guarantee No 1","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 2","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 3","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 4","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 5","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Guarantee No 6","Provider Subject No (Guarantor)","Guarantor Name","Guaranteed Amount","Currency","Validity Start Date","Validity End Date","Guarantee Type","Asset Code ","Asset Description","Asset Location","Asset Appraised Value","Asset Registry External Link","Customer Type","Provider Subject No (Linked Subject 1)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 2)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 3)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 4)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 5)","Role","Name of the Linked Subject","Provider Subject No (Linked Subject 6)","Role","Name of the Linked Subject"];
const HD_HEADER = ["Record Type","Provider Code","File Reference Date\n(End Day of the Reporting Month)\nddmmyyy","Version","Submission Type","Provider Comments"];
const FT_HEADER = ["Record Type","Provider Code","File Reference Date\n(End Day of the Reporting Month)\nddmmyyy","No. of records"];

const MAX_COLS = 120;
const padRow = (row) => {
  const newRow = [...row];
  while (newRow.length < MAX_COLS) newRow.push('');
  return newRow;
};

const ID_TYPE_CODES = new Map([
  ['PASSPORT', '12'],
  ['PASSPORT ID', '12'],
  ['PRC', '13'],
  ['PRC ID', '13'],
  ['DRIVER', '14'],
  ["DRIVER'S LICENSE", '14'],
  ['POLICE CLEARANCE', '15'],
  ['POSTAL', '16'],
  ['POSTAL ID', '16'],
  ['OWWA', '18'],
  ['OWWA ID', '18'],
  ['OFW', '19'],
  ['OFW ID', '19'],
  ['SSS', '20'],
  ['SSS ID', '20'],
  ['TIN', '21'],
  ['TIN ID', '21'],
  ['VOTER', '22'],
  ["VOTER'S ID", '22'],
  ['PHILHEALTH', '23'],
  ['PHILHEALTH ID', '23'],
  ['PAGIBIG', '24'],
  ['PAG-IBIG', '24'],
  ['PAGIBIG ID', '24'],
  ['UMID', '25'],
  ['UMID ID', '25'],
  ['IBP', '28'],
  ['IBP ID', '28'],
  ['GOVERNMENT ID', '30'],
  ['GOVERNMENT OFFICER OR AGENCY ID', '30'],
  ['DIPLOMAT ID', '31'],
  ['NATIONAL ID', '32'],
  ['PHILSYS', '32'],
  ['PHILSYS ID', '32'],
  ['GOCC ID', '34'],
  ['PLRA ID', '35'],
  ['SCHOOL ID', '38'],
  ['STUDENT ID', '38']
]);

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanText(value) {
  return normalize(value).toUpperCase();
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function amount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? String(Math.round(n)) : '';
}

function dateForCic(value, mode = 'DDMMYYYY') {
  if (!value) return '';
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (isNaN(d)) return '';
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return mode === 'YYYYMMDD' ? `${yyyy}${mm}${dd}` : `${dd}${mm}${yyyy}`;
}

function addMonths(year, month, offset) {
  return new Date(Number(year), Number(month) - 1 + offset, 1);
}

function monthStart(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function monthEnd(d) {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

function getPeriod(year, month) {
  const selected = addMonths(year, month, 0);
  // The chosen reporting month is also the loan-release month used for export.
  const covered = selected;
  return {
    selectedYear: selected.getFullYear(),
    selectedMonth: selected.getMonth() + 1,
    coveredYear: covered.getFullYear(),
    coveredMonth: covered.getMonth() + 1,
    startDate: monthStart(covered),
    endDate: monthEnd(covered),
    referenceDate: dateForCic(monthEnd(covered), 'YYYYMMDD'),
    monthName: covered.toLocaleString('en-US', { month: 'long' }),
    filePeriod: `${selected.getFullYear()}${String(selected.getMonth() + 1).padStart(2, '0')}`
  };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

function titleCode(row) {
  const title = cleanText(row.title);
  const civil = cleanText(row.civil_status);
  const gender = cleanText(row.gender);
  if (title.includes('MR') || gender === 'M' || gender === 'MALE') return '10';
  if (title.includes('MRS') || civil.includes('MARRIED')) return '13';
  if (title.includes('MS') || title.includes('MISS') || gender === 'F' || gender === 'FEMALE') return '11';
  return '';
}

function genderCode(value) {
  const gender = cleanText(value);
  if (gender === 'M' || gender === 'MALE') return 'M';
  if (gender === 'F' || gender === 'FEMALE') return 'F';
  return '';
}

function idTypeCode(value) {
  const raw = cleanText(value).replace(/\./g, '');
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return raw;
  if (ID_TYPE_CODES.has(raw)) return ID_TYPE_CODES.get(raw);
  for (const [key, code] of ID_TYPE_CODES.entries()) {
    if (raw.includes(key) || key.includes(raw)) return code;
  }
  return '';
}

function daysBetween(start, end) {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (isNaN(s) || isNaN(e)) return 0;
  return Math.max(0, Math.ceil((e - s) / 86400000));
}

function getContractPhase(loan) {
  const status = String(loan.status || '').toLowerCase();
  if (status === 'fullpaid' || Number(loan.balance || 0) <= 0) {
    if (loan.fully_paid_date && loan.date_maturity && loan.fully_paid_date < loan.date_maturity) return 'CA';
    return 'CL';
  }
  return 'AC';
}

function validateId(loan) {
  const missing = [];
  const contact = digits(loan.contact);
  const idCode = idTypeCode(loan.id_type);

  if (!normalize(loan.first_name)) missing.push('First Name');
  if (!normalize(loan.last_name)) missing.push('Last Name');
  if (!genderCode(loan.gender)) missing.push('Gender');
  if (!dateForCic(loan.birth_date)) missing.push('Date of Birth');
  if (!normalize(loan.civil_status)) missing.push('Civil Status');
  if (!normalize(loan.address)) missing.push('Full Address');
  if (contact.length !== 11) missing.push('Valid 11-digit Contact Number');
  if (!idCode || !normalize(loan.id_number)) missing.push('Valid ID');

  return { missing, contact, idCode };
}

function getCsdfFileName(period, now = new Date()) {
  const reportingDate = String(period.endDate).replace(/-/g, '');
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(value => String(value).padStart(2, '0'))
    .join('');
  return `${CSDF_FILE_PROVIDER_CODE}_CSDF_${reportingDate}${time}.txt`;
}

function validateCi(loan) {
  const missing = [];
  if (!normalize(loan.loan_code)) missing.push('Loan Number');
  if (!dateForCic(loan.date_released)) missing.push('Loan Release Date');
  if (!dateForCic(loan.date_maturity)) missing.push('Due Date');
  if (Number(loan.principal || 0) <= 0) missing.push('Principal Amount');
  if (Number(loan.loan_period || 0) <= 0) missing.push('Loan Term');
  if (Number(loan.total_amortization || 0) <= 0) missing.push('Total Loan Amount');

  return { missing };
}

function buildIdRow(loan, period, idCode, contact) {
  const row = Array(ID_HEADER.length).fill('');
  row[0] = 'ID';
  row[1] = PROVIDER_CODE;
  row[2] = period.referenceDate;
  row[3] = normalize(loan.customer_code);
  row[4] = titleCode(loan);
  row[5] = cleanText(loan.first_name);
  row[6] = cleanText(loan.last_name);
  row[7] = cleanText(loan.middle_name);
  row[8] = genderCode(loan.gender);
  row[9] = dateForCic(loan.birth_date);
  row[10] = cleanText(loan.address);
  row[11] = 'PH';
  row[12] = 'PH';
  row[20] = ADDRESS_TYPE_MAIN;
  row[21] = cleanText(loan.address);
  row[23] = ADDRESS_TYPE_ADDITIONAL;
  row[24] = cleanText(loan.address);
  row[26] = idCode;
  row[27] = idCode;
  row[28] = normalize(loan.id_number);
  row[29] = dateForCic(loan.id_issue_date);
  row[30] = 'PH';
  row[31] = dateForCic(loan.id_expiry_date);
  row[32] = cleanText(loan.id_issued_by);
  row[34] = CONTACT_TYPE_CODE;
  row[35] = contact;
  return padRow(row);
}

function buildCiRow(loan, period) {
  const row = Array(CI_HEADER.length).fill('');
  const overdue = daysBetween(loan.date_maturity, period.endDate);
  const isPastDue = overdue > 0 && Number(loan.balance || 0) > 0;
  const remainingDays = Number(loan.balance || 0) > 0 ? daysBetween(period.endDate, loan.date_maturity) : 0;

  row[0] = 'CI';
  row[1] = PROVIDER_CODE;
  row[2] = '';
  row[3] = period.referenceDate;
  row[4] = normalize(loan.customer_code);
  row[5] = 'B';
  row[6] = normalize(loan.loan_code);
  row[7] = '22';
  row[8] = getContractPhase(loan);
  row[9] = isPastDue ? 'PD' : '';
  row[10] = 'PHP';
  row[11] = 'PHP';
  row[12] = dateForCic(loan.date_released);
  row[14] = dateForCic(loan.date_maturity);
  row[15] = row[8] === 'CA' ? dateForCic(loan.fully_paid_date) : '';
  row[16] = dateForCic(loan.last_payment_date);
  row[19] = amount(loan.principal);
  row[20] = String(Number(loan.loan_period || 0));
  row[21] = 'NA';
  row[22] = '23';
  row[23] = 'D';
  row[24] = 'CAS';
  row[25] = amount(loan.total_amortization);
  row[26] = dateForCic(loan.first_payment_date);
  row[27] = amount(loan.last_payment_amount);
  row[30] = String(remainingDays);
  row[31] = amount(loan.balance);
  row[32] = isPastDue ? String(overdue) : '';
  row[33] = isPastDue ? amount(loan.balance) : '';
  row[34] = isPastDue ? String(overdue) : '';
  return padRow(row);
}

function buildHdRow(period) {
  const row = Array(HD_HEADER.length).fill('');
  row[0] = 'HD';
  row[1] = PROVIDER_CODE;
  row[2] = period.referenceDate;
  row[3] = '1.0';
  row[4] = '1';
  row[5] = `${period.monthName} ${period.coveredYear} Report`;
  return padRow(row);
}

function buildFtRow(period, recordCount) {
  const row = Array(FT_HEADER.length).fill('');
  row[0] = 'FT';
  row[1] = PROVIDER_CODE;
  row[2] = period.referenceDate;
  row[3] = String(recordCount);
  return padRow(row);
}

async function loadLoans(period, branchId, assignedUserId, selectedLoanIds = null) {
  let query = `
    SELECT l.*, c.customer_code, c.first_name, c.last_name, c.middle_name, c.gender, c.birth_date, c.address,
           c.contact, c.id_type, c.id_number, c.id_issue_date, c.id_expiry_date, c.id_issued_by, c.civil_status,
           b.branch_code, b.branch_name,
           co.first_name || ' ' || co.last_name AS collector_name,
           (SELECT p.date_paid FROM tblPayment p WHERE p.loan_id = l.id AND p.status = 'active' ORDER BY p.date_paid ASC, p.id ASC LIMIT 1) as first_payment_date,
           (SELECT p.date_paid FROM tblPayment p WHERE p.loan_id = l.id AND p.status = 'active' ORDER BY p.date_paid DESC, p.id DESC LIMIT 1) as last_payment_date,
           (SELECT p.amount_paid FROM tblPayment p WHERE p.loan_id = l.id AND p.status = 'active' ORDER BY p.date_paid DESC, p.id DESC LIMIT 1) as last_payment_amount,
           (SELECT p.date_paid FROM tblPayment p WHERE p.loan_id = l.id AND p.status IN ('active', 'recon') AND p.balance_after <= 0 ORDER BY p.date_paid DESC, p.id DESC LIMIT 1) as fully_paid_date
    FROM tblLoan l
    JOIN tblCustomer c ON l.customer_id = c.id
    -- CIC submission is based on the BIR client-report queue. A client must
    -- still pass the CIC validations below before it can be exported.
    JOIN tblGovernmentComplianceClients gcc ON l.id = gcc.loan_id
      AND gcc.agency = 'BIR'
      AND gcc.assigned_user_id = ?
    LEFT JOIN tblBranch b ON l.branch_id = b.id
    LEFT JOIN tblCollector co ON l.collector_id = co.id
    -- The selected CIC month is based strictly on the BIR report's Release Date.
    WHERE COALESCE(NULLIF(gcc.release_date, ''), l.date_released) BETWEEN ? AND ?
      AND l.status NOT IN ('reversed', 'rejected')
  `;
  const params = [assignedUserId, period.startDate, period.endDate];
  if (branchId) {
    query += ` AND l.branch_id = ?`;
    params.push(branchId);
  }
  if (selectedLoanIds) {
    query += ` AND l.id IN (${selectedLoanIds.map(() => '?').join(', ')})`;
    params.push(...selectedLoanIds);
  }
  query += ` ORDER BY c.customer_code, l.loan_code`;
  return dbAll(query, params);
}

async function buildSubmission({ year, month, branch_id, file_reference_number, selected_loan_ids }, userId) {
  if (!year || !month) throw new Error('Year and Month are required');
  const selectedLoanIds = [...new Set((Array.isArray(selected_loan_ids) ? selected_loan_ids : []).map(Number).filter(Number.isInteger))];
  if (selectedLoanIds.length === 0) throw new Error('Select at least one client report before validating CIC records.');
  const period = getPeriod(year, month);
  const availableLoans = await loadLoans(period, branch_id, userId);
  const loans = await loadLoans(period, branch_id, userId, selectedLoanIds);
  if (loans.length !== selectedLoanIds.length) throw new Error('One or more selected client reports are no longer available to you. Refresh the client list and try again.');
  const availableClientReports = new Set(availableLoans.map(loan => loan.customer_id)).size;
  const selectedClients = new Map();
  loans.forEach(loan => {
    const clientLoans = selectedClients.get(loan.customer_id) || [];
    clientLoans.push(loan);
    selectedClients.set(loan.customer_id, clientLoans);
  });

  const validClients = [];
  const validCiLoans = [];
  const validationErrors = [];

  for (const clientLoans of selectedClients.values()) {
    const client = clientLoans[0];
    const idCheck = validateId(client);
    if (idCheck.missing.length > 0) {
      validationErrors.push({
        customerId: client.customer_id,
        clientCode: normalize(client.customer_code),
        clientName: cleanText(`${client.first_name || ''} ${client.middle_name || ''} ${client.last_name || ''}`),
        loanNumber: normalize(client.loan_code),
        reason: 'EXCLUDED — INCOMPLETE ID',
        status: 'Excluded',
        missingFields: idCheck.missing
      });
      continue;
    }

    validClients.push({ loan: client, ...idCheck });
    for (const loan of clientLoans) {
      const ciCheck = validateCi(loan);
      if (ciCheck.missing.length > 0) {
        validationErrors.push({
          customerId: loan.customer_id,
          clientCode: normalize(loan.customer_code),
          clientName: cleanText(`${loan.first_name || ''} ${loan.middle_name || ''} ${loan.last_name || ''}`),
          loanNumber: normalize(loan.loan_code),
          reason: 'EXCLUDED — INVALID CI',
          status: 'Excluded',
          missingFields: ciCheck.missing
        });
      } else {
        validCiLoans.push(loan);
      }
    }
  }

  const rows = [];
  const previewRecords = [];
  // Keep track of counts for each type
  let idRecords = 0;
  let ciRecords = 0;

  // Add HD
  const hdRow = buildHdRow(period);
  rows.push(hdRow);
  previewRecords.push({ recordType: 'HD', clientCode: '', loanNumber: '', values: hdRow });

  // Add ID records
  for (const item of validClients) {
    const row = buildIdRow(item.loan, period, item.idCode, item.contact);
    rows.push(row);
    previewRecords.push({ recordType: 'ID', clientCode: item.loan.customer_code, loanNumber: item.loan.loan_code, values: row });
    idRecords += 1;
  }

  // Add CI records
  for (const loan of validCiLoans) {
    const row = buildCiRow(loan, period);
    rows.push(row);
    previewRecords.push({ recordType: 'CI', clientCode: loan.customer_code, loanNumber: loan.loan_code, values: row });
    ciRecords += 1;
  }

  const totalRecords = idRecords + ciRecords;
  const ftRow = buildFtRow(period, totalRecords);
  rows.push(ftRow);
  previewRecords.push({ recordType: 'FT', clientCode: '', loanNumber: '', values: ftRow });

  return {
    period,
    fileName: getCsdfFileName(period),
    fileReferenceNumber: normalize(file_reference_number),
    counts: {
      totalIdRecords: idRecords,
      totalCiRecords: ciRecords,
      totalRecordsForFt: totalRecords,
      availableClientReports,
      selectedClients: selectedClients.size,
      validCicClients: validClients.length,
      excludedClients: validationErrors.filter(error => error.reason === 'EXCLUDED — INCOMPLETE ID').length,
      validLoanAccounts: validCiLoans.length,
      excludedLoanAccounts: validationErrors.filter(error => error.reason === 'EXCLUDED — INVALID CI').length
    },
    previewRecords,
    validationErrors,
    rows,
    csvData: toCsv(rows)
  };
}

router.get('/candidates', authenticateToken, async (req, res) => {
  try {
    const { year, month, branch_id } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'Year and month are required' });
    const period = getPeriod(year, month);
    const loans = await loadLoans(period, branch_id, req.user.id);
    const eligibleLoans = loans.filter(loan => (
      validateId(loan).missing.length === 0 && validateCi(loan).missing.length === 0
    ));
    res.json({
      period,
      availableClientReports: new Set(eligibleLoans.map(loan => loan.customer_id)).size,
      clients: eligibleLoans.map(loan => ({
        loan_id: loan.id,
        customer_id: loan.customer_id,
        customer_code: loan.customer_code,
        customer_name: cleanText(`${loan.first_name || ''} ${loan.middle_name || ''} ${loan.last_name || ''}`),
        collector_name: loan.collector_name,
        branch_name: loan.branch_name,
        loan_code: loan.loan_code,
        date_released: loan.date_released,
        date_maturity: loan.date_maturity,
        balance: loan.balance,
        cic_eligibility: 'Eligible'
      }))
    });
  } catch (error) {
    console.error('CIC Candidates Error:', error);
    res.status(500).json({ error: 'Failed to load CIC client reports' });
  }
});

router.post('/preview', authenticateToken, async (req, res) => {
  try {
    res.json(await buildSubmission(req.body, req.user.id));
  } catch (error) {
    console.error('CIC Preview Error:', error);
    res.status(500).json({ error: error.message || 'Failed to preview CIC records' });
  }
});

router.post('/validate', authenticateToken, async (req, res) => {
  try {
    const submission = await buildSubmission(req.body, req.user.id);
    res.json({
      reporting: submission.period,
      summary: {
        totalEligible: submission.counts.selectedClients,
        ready: submission.counts.validCicClients,
        withErrors: submission.counts.excludedClients
      },
      errors: submission.validationErrors.map(e => ({
        customerId: e.customerId,
        customerName: e.clientName,
        loanCode: e.loanNumber,
        missingFields: e.missingFields.join(', ')
      }))
    });
  } catch (error) {
    console.error('CIC Validation Error:', error);
    res.status(500).json({ error: 'Failed to validate records' });
  }
});

router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const submission = await buildSubmission(req.body, req.user.id);
    const finalCsvData = submission.csvData;
    const finalTotalRecords = submission.counts.totalRecordsForFt;

    if (finalTotalRecords === 0) {
      return res.status(400).json({ error: 'No valid CIC records found for the selected reporting month.' });
    }

    const batchNumber = `${PROVIDER_CODE}-CIC-${submission.period.filePeriod}-${Date.now()}`;
    const batchRes = await dbRun(
      'INSERT INTO tblCICSubmissionBatch (batch_number, month, year, branch_id, total_records, generated_by) VALUES (?, ?, ?, ?, ?, ?)',
      [batchNumber, submission.period.selectedMonth, submission.period.selectedYear, req.body.branch_id || null, finalTotalRecords, req.user.id]
    );

    await dbRun(
      'INSERT INTO tblCICSubmissionRecord (batch_id, customer_id, loan_id, record_type, raw_data) VALUES (?, ?, ?, ?, ?)',
      [batchRes.lastID, 0, 0, 'CSV_FILE', finalCsvData]
    );

    res.json({
      message: 'CIC CSV generated',
      batch_number: batchNumber,
      total_records: finalTotalRecords,
      csv_data: finalCsvData,
      file_name: submission.fileName
    });
  } catch (error) {
    console.error('CIC Generate Error:', error);
    res.status(500).json({ error: 'Failed to generate CIC batch' });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const batches = await dbAll('SELECT * FROM tblCICSubmissionBatch ORDER BY generated_at DESC');
    res.json(batches);
  } catch (error) {
    console.error('CIC History Error:', error);
    res.status(500).json({ error: 'Failed to fetch CIC history' });
  }
});

router.get('/readiness/:customerId', authenticateToken, async (req, res) => {
  try {
    const customer = await dbGet('SELECT * FROM tblCustomer WHERE id = ?', [req.params.customerId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const missingFields = [];
    if (!customer.first_name) missingFields.push('First Name');
    if (!customer.last_name) missingFields.push('Last Name');
    if (!genderCode(customer.gender)) missingFields.push('Gender');
    if (!customer.birth_date) missingFields.push('Date of Birth');
    if (!customer.civil_status) missingFields.push('Civil Status');
    if (!customer.address) missingFields.push('Full Address');
    if (digits(customer.contact).length !== 11) missingFields.push('Valid 11-digit Contact Number');
    if (!idTypeCode(customer.id_type) || !customer.id_number) missingFields.push('Valid ID');
    res.json({ status: missingFields.length > 0 ? 'Incomplete' : 'Ready', missingFields });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check readiness' });
  }
});

module.exports = router;
