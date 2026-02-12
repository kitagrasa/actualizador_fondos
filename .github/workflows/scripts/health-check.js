/**
 * Verificación de salud del sistema
 * Crea un flag si los datos tienen más de 20 horas de antigüedad
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR, STALE_HOURS } from './config.js';
import { readHealthStatus } from './utils.js';

function checkHealthAndCreateFlag() {
  console.log('=== Health Check Started ===');
  console.log(`Time: ${new Date().toISOString()}`);

  const health = readHealthStatus(DATA_DIR);
  const now = Date.now();

  console.log('Current health status:', JSON.stringify(health, null, 2));

  // Verificar si hay última actualización OK
  if (!health.last_ok || !health.last_ok.timestamp) {
    console.log('⚠️ No successful updates recorded yet (this is normal on first run)');
    return;
  }

  const lastOkTimestamp = Number(health.last_ok.timestamp);
  const ageMs = now - lastOkTimestamp;
  const ageHours = ageMs / (60 * 60 * 1000);

  console.log(`Last OK: ${health.last_ok.iso}`);
  console.log(`Age: ${ageHours.toFixed(2)} hours`);
  console.log(`Threshold: ${STALE_HOURS} hours`);

  // Verificar si los datos están obsoletos
  if (ageHours >= STALE_HOURS) {
    console.log(`❌ Data is STALE (${ageHours.toFixed(2)} hours old, threshold: ${STALE_HOURS}h)`);
    
    // Crear flag file para que el workflow falle
    const flagPath = path.join(DATA_DIR, 'health_alert_needed.flag');
    const alertData = {
      timestamp: now,
      iso: new Date().toISOString(),
      last_ok: health.last_ok,
      age_hours: ageHours,
      threshold_hours: STALE_HOURS,
      last_fundsquare: health.last_fundsquare,
      last_ft: health.last_ft
    };
    
    fs.writeFileSync(flagPath, JSON.stringify(alertData, null, 2), 'utf-8');
    console.log(`Created alert flag: ${flagPath}`);
    
    // Mostrar resumen de estado
    console.log('\n📊 Status Summary:');
    console.log(`• Last successful update: ${health.last_ok.iso}`);
    console.log(`• Hours since last update: ${ageHours.toFixed(2)}h`);
    console.log(`• Alert threshold: ${STALE_HOURS}h`);
    
    if (health.last_fundsquare) {
      console.log(`\n🔷 Fundsquare (last run: ${health.last_fundsquare.iso})`);
      console.log(`  • Success: ${health.last_fundsquare.success_count}/${health.last_fundsquare.total_funds}`);
      if (health.last_fundsquare.results) {
        health.last_fundsquare.results.forEach(r => {
          console.log(`  • ${r.isin}: ${r.success ? '✓' : '✗'} ${r.error || ''}`);
        });
      }
    }
    
    if (health.last_ft) {
      console.log(`\n🔶 Financial Times (last run: ${health.last_ft.iso})`);
      console.log(`  • Success: ${health.last_ft.success_count}/${health.last_ft.total_funds}`);
      if (health.last_ft.results) {
        health.last_ft.results.forEach(r => {
          console.log(`  • ${r.isin}: ${r.success ? '✓' : '✗'} ${r.error || ''}`);
        });
      }
    }
    
    console.log('\n⚠️ This flag will cause the workflow to fail and send an email notification');
    
  } else {
    console.log(`✅ Data is FRESH (${ageHours.toFixed(2)} hours old, threshold: ${STALE_HOURS}h)`);
    
    // Eliminar flag si existe (datos ya están frescos)
    const flagPath = path.join(DATA_DIR, 'health_alert_needed.flag');
    if (fs.existsSync(flagPath)) {
      fs.unlinkSync(flagPath);
      console.log(`Removed alert flag (data is now fresh)`);
    }
  }

  console.log('=== Health Check Completed ===\n');
}

checkHealthAndCreateFlag();
