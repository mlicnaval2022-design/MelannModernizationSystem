const fs = require('fs');
const path = require('path');

function searchClient(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      searchClient(fullPath);
    } else if (entry.isFile() && /\.(jsx|js)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('Collection Details') || content.includes('collection-details') || content.includes('collector-collections')) {
        console.log(`Found in: ${fullPath}`);
      }
    }
  }
}

searchClient(path.resolve(__dirname, '../client/src'));
