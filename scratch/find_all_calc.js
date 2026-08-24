const fs = require('fs');
const path = require('path');

function search(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') search(fullPath);
    } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes('maturity date calculator') || content.toLowerCase().includes('maturity calculator') || content.toLowerCase().includes('calculator')) {
        console.log(`Found calculator in: ${fullPath}`);
      }
    }
  }
}

search(path.resolve(__dirname, '../client/src'));
search(path.resolve(__dirname, '../server/src'));
