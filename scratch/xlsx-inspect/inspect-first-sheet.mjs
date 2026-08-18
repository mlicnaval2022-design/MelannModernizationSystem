import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
import fs from 'node:fs/promises';

const workbookPath = 'D:/Users/Mel Rodriguez/Downloads/Tabulation of 2026 Expenses-Ormoc.xlsx';
const input = await FileBlob.load(workbookPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheets = await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 4000 });
console.log(sheets.ndjson);
const firstSheet = workbook.worksheets.getItemAt(0);
const overview = await workbook.inspect({
  kind: 'workbook,sheet,table,region',
  sheetId: firstSheet.name,
  range: 'A1:Z80',
  maxChars: 18000,
  tableMaxRows: 80,
  tableMaxCols: 26,
  tableMaxCellChars: 100,
});
console.log(overview.ndjson);
const formulas = await workbook.inspect({
  kind: 'formula',
  sheetId: firstSheet.name,
  range: 'A1:Z120',
  maxChars: 12000,
  options: { maxResults: 200 },
});
console.log(formulas.ndjson);
const headers = firstSheet.getRange('A1:CB2').values;
const columnName = index => {
  let name = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  return name;
};
for (let col = 0; col < headers[0].length; col += 1) {
  if (headers[0][col] || headers[1][col]) console.log(`${columnName(col)}: ${headers[0][col] || ''} | ${headers[1][col] || ''}`);
}
const preview = await workbook.render({ sheetName: firstSheet.name, range: 'A1:CB24', scale: 1, format: 'png' });
await fs.writeFile('first-sheet-preview.png', new Uint8Array(await preview.arrayBuffer()));
