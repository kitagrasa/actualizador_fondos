/**
 * Actualización desde Financial Times
 */
import fetch from 'node-fetch';
import { FUNDS, DATA_DIR } from './config.js';
import { 
  upsertDay, 
  readIndex, 
  writeIndex,
  enforceRetention,
  saveHealthStatus,
  readHealthStatus
} from './utils.js';

function extractFTHistoricalRowsFromHTML(html) {
  const tableRe = /<table[^>]*class="[^"]*mod-tearsheet-historical-prices__results[^"]*"[^>]*>[\s\S]*?<\/table>/i;
  const tableM = html.match(tableRe);
  if (!tableM) return [];

  const table = tableM[0];
  const tbodyRe = /<tbody[^>]*>[\s\S]*?<\/tbody>/i;
  const tbodyM = table.match(tbodyRe);
  if (!tbodyM) return [];

  const tbody = tbodyM[0];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const out = [];

  let tr;
  while ((tr = trRe.exec(tbody)) !== null) {
    const row = tr[1];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const tds = [];
    
    let td;
    while ((td = tdRe.exec(row)) !== null) {
      tds.push(td[1]);
    }

    if (tds.length < 5) continue;

    const dateText = stripTags(tds[0]);
    const closeText = stripTags(tds[4]);

    const date = parseFTDateToYMD(dateText);
    const close = parseFTNumber(closeText);

    if (!date) continue;
    if (!Number.isFinite(close) || close <= 0) continue;

    out.push({ date, close });
  }

  const map = new Map();
  for (const r of out) {
    map.set(r.date, r.close);
  }

  return Array.from(map.entries()).map(([date, close]) => ({ date, close }));
}

function stripTags(s) {
  if (!s) return '';
  
  let text = String(s);
  
  // Eliminar scripts y styles completos (incluyendo contenido)
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  
  // Eliminar comentarios HTML
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  
  // Eliminar todas las etiquetas HTML
  text = text.replace(/<\/?[^>]+(>|$)/g, ' ');
  
  // Decodificar entidades HTML comunes
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Normalizar espacios en blanco
  text = text.replace(/\s+/g, ' ');
  
  return text.trim();
}

function parseFTDateToYMD(text) {
  const m = 
    text.match(/([A-Za-z]{3},\s+[A-Za-z]{3}\s+\d{2},\s+\d{4})/) ||
    text.match(/([A-Za-z]+,\s+[A-Za-z]+\s+\d{2},\s+\d{4})/);
  
  if (!m) return null;

  const d = new Date(m[1] + ' UTC');
  if (!Number.isFinite(d.getTime())) return null;
  
  return d.toISOString().slice(0, 10);
}

function parseFTNumber(text) {
  const t = String(text || '').trim();
  return Number(t.replace(/\s/g, '').replace(/,/g, ''));
}

async function syncFTVisibleWindow(fund) {
  const { isin, ft } = fund;
  const ftUrl = `https://markets.ft.com/data/funds/tearsheet/historical?s=${encodeURIComponent(ft)}`;

  try {
    console.log(`[FT] Fetching ${isin}...`);

    const res = await fetch(ftUrl, {
      headers: {
        'accept': 'text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    if (!res.ok) {
      console.error(`[FT] HTTP ${res.status} for ${isin}`);
      return { success: false, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const rows = extractFTHistoricalRowsFromHTML(html);

    if (rows.length === 0) {
      console.log(`[FT] No data extracted for ${isin}`);
      return { success: false, error: 'No data extracted' };
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));

    let updated = 0;
    const index = readIndex(isin, DATA_DIR);
    const dates = index.dates || [];
    const dateSet = new Set(dates);

    for (const row of rows) {
      const result = upsertDay(isin, row.date, {
        date: row.date,
        close: row.close,
        src: 'ft'
      }, DATA_DIR);

      if (result.changed) {
        updated++;
        if (result.insertedNewDate && !dateSet.has(row.date)) {
          dates.push(row.date);
          dateSet.add(row.date);
        }
      }
    }

    if (updated > 0) {
      console.log(`[FT] ✓ Updated ${updated} prices for ${isin}`);
      writeIndex(isin, dates, DATA_DIR);
    } else {
      console.log(`[FT] = No changes for ${isin}`);
    }

    return { success: true, updated, total: rows.length };

  } catch (error) {
    console.error(`[FT] Error fetching ${isin}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('=== Financial Times Update Started ===');
  console.log(`Time: ${new Date().toISOString()}`);

  let successCount = 0;
  const results = [];

  for (const fund of FUNDS) {
    const result = await syncFTVisibleWindow(fund);
    results.push({ isin: fund.isin, ...result });
    if (result.success) successCount++;
    enforceRetention(fund.isin, DATA_DIR);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const health = readHealthStatus(DATA_DIR);
  health.last_ft = {
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
      source: 'ft'
    };
  }
  
  saveHealthStatus(health, DATA_DIR);

  console.log(`=== Financial Times Update Completed (${successCount}/${FUNDS.length} successful) ===\n`);

  if (successCount === 0) {
    console.error('❌ CRITICAL: No funds were updated from Financial Times');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
