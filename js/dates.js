// dates.js — petits utilitaires de dates, travaillant en clés "YYYY-MM-DD".

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmd(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const dt = parseYmd(key);
  dt.setDate(dt.getDate() + n);
  return ymd(dt);
}

export function diffDays(a, b) {
  // nombre de jours entre a et b (b - a)
  const MS = 86400000;
  return Math.round((parseYmd(b) - parseYmd(a)) / MS);
}

export function todayKey() {
  return ymd(new Date());
}

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export function monthLabel(year, month) {
  return `${MONTHS[month]} ${year}`;
}

export function formatLong(key) {
  const dt = parseYmd(key);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
