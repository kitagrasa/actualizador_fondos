/**
 * Actualización desde Fundsquare
 */
import fetch from 'node-fetch';
import { FUNDS, DATA_DIR } from './config.js';
import { 
  dateYMDMadridFromMs, 
  upsertDay, 
  readIndex, 
  writeIndex,
  enforceRetention,
  saveHealthStatus,
  readHealthStatus
} from './utils.js';

async function updateFromFundsquare(fund) {
  const { isin, idInstr } = fund;
  const url = `https://www.fundsquare.net/Fundsquare/application/vni/${idInstr}`;

  try {
    console.log(`[Fundsquare] Fetching ${isin}...`);

    const res = await fetch(url, {
      headers: {
        'accept': 'application/json,text/plain,*/*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'referer': 'https://www.fundsquare.net/',
      },
      timeout: 30000
    });

    if (!res.ok) {
      console.error(`[Fundsquare] HTTP ${res.status} for ${isin}`);
      return { success: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const eur = data?.EUR;

    if (!Array.isArray(eur) || eur.length === 0) {
      console.log(`[Fundsquare] No EUR data for ${isin}`);
      return { success: false, error: 'No EUR data' };
    }

    const item = eur.reduce((a, b) => 
      (Number(b.dtHrCalcVni) > Number(a.dtHrCalcVni) ? b : a)
    );

    const ms = Number(item.dtHrCalcVni);
    const close = Number(item.pxVniPart);

    if (!Number.isFinite(ms) || !Number.isFinite(close) || close <= 0) {
      console.log(`[Fundsquare] Invalid data for ${isin}`);
      return { success: false, error: 'Invalid data' };
    }

    const date = dateYMDMadridFromMs(ms);
    const result = upsertDay(isin, date, {
      date,
      close,
      src: 'fundsquare',
      ms
    }, DATA_DIR);

    if (result.changed) {
      console.log(`[Fundsquare] ✓ Updated ${isin} ${date}: ${close}`);
      
      if (result.insertedNewDate) {
        const index = readIndex(isin, DATA_DIR);
        const dates = index.dates || [];
        dates.push(date);
        writeIndex(isin, dates, DATA_DIR);
      }
    } else {
      console.log(`[Fundsquare] = No change for ${isin} ${date}`);
    }

    return { success: true, date, close };

  } catch (error) {
    console.error(`[Fundsquare] Error fetching ${isin}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('=== Fundsquare Update Started ===');
  console.log(`Time: ${new Date().toISOString()}`);

  let successCount = 0;
  const results = [];

  for (const fund of FUNDS) {
    const result = await updateFromFundsquare(fund);
    results.push({ isin: fund.isin, ...result });
    if (result.success) successCount++;
    enforceRetention(fund.isin, DATA_DIR);
  }

  const health = readHealthStatus(DATA_DIR);
  health.last_fundsquare = {
    timestamp: Date.now(),
    iso: new Date().toISOString(),
    success_count: successCount,
    total_funds: FUNDS.length,
    results: results
  };
  
  if (successCount > 0) {
    health.last_ok = {
      timestamp: Date.now(),
      iso: new Date().toISOString(),
      source: 'fundsquare'
    };
  }
  
  saveHealthStatus(health, DATA_DIR);

  console.log(`=== Fundsquare Update Completed (${successCount}/${FUNDS.length} successful) ===\n`);

  // Si ningún fondo se actualizó, fallar el workflow para notificar
  if (successCount === 0) {
    console.error('❌ CRITICAL: No funds were updated from Fundsquare');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
