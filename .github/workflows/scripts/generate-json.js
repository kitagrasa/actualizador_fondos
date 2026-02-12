/**
 * Genera archivos JSON para Portfolio Performance
 */
import path from 'path';
import { FUNDS, DATA_DIR, JSON_DIR, KEEP_DAYS } from './config.js';
import { readIndex, readDay, ensureDir, writeJSON } from './utils.js';

function generateJSONForFund(fund) {
  const { isin } = fund;
  const index = readIndex(isin, DATA_DIR);
  const dates = index.dates || [];

  const slice = dates.slice(-KEEP_DAYS);

  const out = [];
  for (const date of slice) {
    const dayData = readDay(isin, date, DATA_DIR);
    
    if (dayData.date && Number.isFinite(Number(dayData.close))) {
      out.push({
        date: dayData.date,
        close: Number(dayData.close)
      });
    }
  }

  out.sort((a, b) => a.date.localeCompare(b.date));

  return out;
}

function main() {
  console.log('=== JSON Generation Started ===');
  console.log(`Time: ${new Date().toISOString()}`);

  ensureDir(JSON_DIR);

  for (const fund of FUNDS) {
    const data = generateJSONForFund(fund);
    const outputPath = path.join(JSON_DIR, `${fund.isin}.json`);
    
    writeJSON(outputPath, data);
    
    console.log(`✓ Generated ${fund.isin}.json (${data.length} entries)`);
  }

  const consolidated = {};
  for (const fund of FUNDS) {
    consolidated[fund.isin] = generateJSONForFund(fund);
  }

  const consolidatedPath = path.join(JSON_DIR, 'all-funds.json');
  writeJSON(consolidatedPath, consolidated);
  
  console.log(`✓ Generated all-funds.json (${FUNDS.length} funds)`);
  console.log('=== JSON Generation Completed ===\n');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
