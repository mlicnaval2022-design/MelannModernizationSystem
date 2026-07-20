const fs = require('fs');
const path = 'client/src/pages/PromissoryDisclosure.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = `    const dateFiltered = releaseDate
      ? loans.filter(loan => String(loan.date_released || '').slice(0, 10) === releaseDate)
      : loans`;

const replacement = `    const dateFiltered = releaseDate
      ? loans.filter(loan => {
          const isRecon = ['recon', 'reconstruct', 'reconstructed'].includes(String(loan.loan_type || '').toLowerCase());
          // DCR puts recon loans on their creation date instead of release date
          const dateToMatch = isRecon ? loan.created_at : loan.date_released;
          return String(dateToMatch || '').slice(0, 10) === releaseDate;
        })
      : loans`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content, 'utf8');
    console.log('Fixed PromissoryDisclosure.jsx');
} else {
    console.log('Target not found in PromissoryDisclosure.jsx');
}
