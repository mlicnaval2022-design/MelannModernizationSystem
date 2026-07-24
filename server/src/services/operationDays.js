function isSundayDate(dateValue) {
  if (!dateValue) return false;
  const date = new Date(`${dateValue}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.getDay() === 0;
}

function requireOperationDate(dateValue, label = 'Operation date') {
  if (isSundayDate(dateValue)) {
    const error = new Error(`${label} cannot be Sunday. Operations are Monday to Saturday only.`);
    error.statusCode = 400;
    throw error;
  }
}

const sqlNotSunday = column => `strftime('%w', ${column}) != '0'`;

module.exports = {
  isSundayDate,
  requireOperationDate,
  sqlNotSunday,
};
