/**
 * Configuración central del proyecto
 * PERSONALIZA AQUÍ TUS FONDOS
 */

export const FUNDS = [
  { isin: "LU0563745743", idInstr: "87217",  ft: "LU0563745743:EUR" },
  { isin: "LU0524465548", idInstr: "159836", ft: "LU0524465548:EUR" },
  { isin: "LU1598720172", idInstr: "268051", ft: "LU1598720172:EUR" },
  { isin: "LU1372006947", idInstr: "240088", ft: "LU1372006947:EUR" },
  { isin: "LU1598719752", idInstr: "268050", ft: "LU1598719752:EUR" },
  { isin: "LU0223332320", idInstr: "28356",  ft: "LU0223332320:EUR" },
  { isin: "LU1832174962", idInstr: "310815", ft: "LU1832174962:EUR" },
];

export const KEEP_DAYS = 3653; // 10 años
export const DATA_DIR = './data';
export const JSON_DIR = './json';

export const SOURCE_PRIORITY = {
  'ft': 20,
  'fundsquare': 10,
  'unknown': 0
};

// Configuración de alertas
export const STALE_HOURS = 20; // Alertar si no hay actualizaciones en 20 horas
