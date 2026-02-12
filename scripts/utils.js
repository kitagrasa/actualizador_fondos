/**
 * Utilidades comunes
 */
import fs from 'fs';
import path from 'path';

export function dateYMDMadridFromMs(ms) {
  const date = new Date(ms);
  return date.toLocaleDateString('en-CA', { 
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export function dateYMDMadridToday() {
  return dateYMDMadridFromMs(Date.now());
}

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function readJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
  }
  return {};
}

export function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function srcPriority(src) {
  const priorities = {
    'ft': 20,
    'fundsquare': 10
  };
  return priorities[src] || 0;
}

export function readIndex(isin, dataDir) {
  const indexPath = path.join(dataDir, `idx_${isin}.json`);
  return readJSON(indexPath);
}

export function writeIndex(isin, dates, dataDir) {
  const indexPath = path.join(dataDir, `idx_${isin}.json`);
  const sorted = Array.from(new Set(dates)).sort();
  const trimmed = sorted.length > 3653 ? sorted.slice(-3653) : sorted;
  writeJSON(indexPath, { dates: trimmed });
}

export function readDay(isin, date, dataDir) {
  const dayPath = path.join(dataDir, isin, `${date}.json`);
  return readJSON(dayPath);
}

export function writeDay(isin, date, value, dataDir) {
  const dayDir = path.join(dataDir, isin);
  ensureDir(dayDir);
  const dayPath = path.join(dayDir, `${date}.json`);
  writeJSON(dayPath, value);
}

export function upsertDay(isin, date, value, dataDir) {
  const prev = readDay(isin, date, dataDir);
  const newClose = Number(value.close);

  if (!Number.isFinite(newClose) || newClose <= 0) {
    return { changed: false, insertedNewDate: false };
  }

  if (prev.date) {
    const prevClose = Number(prev.close);
    const prevP = srcPriority(prev.src);
    const newP = srcPriority(value.src);

    if (newP < prevP) {
      return { changed: false, insertedNewDate: false };
    }

    if (Number.isFinite(prevClose) && prevClose === newClose && newP === prevP) {
      return { changed: false, insertedNewDate: false };
    }
  }

  const dataToSave = {
    date,
    close: newClose,
    src: value.src || 'unknown',
    ms: value.ms || null,
    saved_at: prev.saved_at || Date.now(),
    updated_at: Date.now(),
    prev_src: prev.src || null,
    prev_close: prev.close ? Number(prev.close) : null
  };

  writeDay(isin, date, dataToSave, dataDir);

  return { 
    changed: true, 
    insertedNewDate: !prev.date 
  };
}

export function enforceRetention(isin, dataDir, keepDays = 3653) {
  const index = readIndex(isin, dataDir);
  const dates = index.dates || [];

  if (dates.length <= keepDays) {
    return;
  }

  const toDelete = dates.slice(0, dates.length - keepDays);
  const toKeep = dates.slice(-keepDays);

  for (const date of toDelete) {
    const dayPath = path.join(dataDir, isin, `${date}.json`);
    if (fs.existsSync(dayPath)) {
      fs.unlinkSync(dayPath);
      console.log(`Deleted old data: ${isin} ${date}`);
    }
  }

  writeIndex(isin, toKeep, dataDir);
}

export function saveHealthStatus(status, dataDir) {
  const healthPath = path.join(dataDir, 'health.json');
  writeJSON(healthPath, status);
}

export function readHealthStatus(dataDir) {
  const healthPath = path.join(dataDir, 'health.json');
  const defaultStatus = {
    last_ok: null,
    last_fundsquare: null,
    last_ft: null
  };
  
  const data = readJSON(healthPath);
  return Object.keys(data).length > 0 ? data : defaultStatus;
}
