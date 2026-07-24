const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../client/../server/src/routes/dcr.js'); // just to be safe
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/const lParams = \[date, date\];/g, 'const lParams = [date];');
fs.writeFileSync(file, c);
console.log('Fixed lParams');
