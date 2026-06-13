// predict.js — calculs de cycle : longueur moyenne, prochaines règles,
// fenêtre de fertilité et ovulation estimée.

import { addDays, diffDays } from './dates.js';

const DEFAULT_CYCLE = 28;   // longueur de cycle par défaut
const DEFAULT_PERIOD = 5;   // durée des règles par défaut
const LUTEAL = 14;          // phase lutéale ~constante : ovulation ≈ règles - 14j

// Renvoie les dates de début de règles, triées croissant.
function periodStarts(days) {
  return Object.keys(days)
    .filter((k) => days[k] && days[k].periodStart)
    .sort();
}

// Calcule des statistiques à partir de l'historique.
export function computeStats(days) {
  const starts = periodStarts(days);
  const cycles = [];
  for (let i = 1; i < starts.length; i++) {
    const len = diffDays(starts[i - 1], starts[i]);
    if (len > 10 && len < 60) cycles.push(len); // on ignore les valeurs aberrantes
  }
  const avgCycle = cycles.length
    ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length)
    : DEFAULT_CYCLE;

  // durée moyenne des règles (début -> fin le plus proche après)
  const ends = Object.keys(days).filter((k) => days[k] && days[k].periodEnd).sort();
  const lengths = [];
  for (const s of starts) {
    const end = ends.find((e) => diffDays(s, e) >= 0 && diffDays(s, e) < 15);
    if (end) lengths.push(diffDays(s, end) + 1);
  }
  const avgPeriod = lengths.length
    ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    : DEFAULT_PERIOD;

  return {
    avgCycle,
    avgPeriod,
    cyclesCount: cycles.length,
    lastStart: starts.length ? starts[starts.length - 1] : null,
  };
}

// Prédit les prochains repères à partir de la dernière date de règles connue.
export function predict(days) {
  const stats = computeStats(days);
  if (!stats.lastStart) return { stats, predicted: {} };

  const predicted = {}; // clé date -> { type }
  // On projette les 3 prochains cycles.
  for (let c = 1; c <= 3; c++) {
    const nextStart = addDays(stats.lastStart, stats.avgCycle * c);
    // jours de règles prévus
    for (let i = 0; i < stats.avgPeriod; i++) {
      mark(predicted, addDays(nextStart, i), 'period');
    }
    // ovulation prévue ≈ prochain début - 14j
    const ovu = addDays(nextStart, -LUTEAL);
    mark(predicted, ovu, 'ovulation');
    // fenêtre fertile : ovulation -5 à ovulation +1
    for (let i = -5; i <= 1; i++) {
      const d = addDays(ovu, i);
      if (!predicted[d]) mark(predicted, d, 'fertile');
    }
    mark(predicted, ovu, 'ovulation'); // l'ovulation a priorité sur "fertile"
  }

  const nextPeriod = addDays(stats.lastStart, stats.avgCycle);
  const nextOvulation = addDays(nextPeriod, -LUTEAL);
  return {
    stats,
    predicted,
    summary: {
      nextPeriod,
      nextOvulation,
      fertileStart: addDays(nextOvulation, -5),
      fertileEnd: addDays(nextOvulation, 1),
    },
  };
}

function mark(map, key, type) {
  map[key] = { type };
}

// Calcule les plages de règles confirmées (début -> fin) pour l'ombrage.
export function periodRanges(days) {
  const starts = Object.keys(days).filter((k) => days[k] && days[k].periodStart).sort();
  const ends = Object.keys(days).filter((k) => days[k] && days[k].periodEnd).sort();
  const ranges = [];
  for (const s of starts) {
    const end = ends.find((e) => diffDays(s, e) >= 0 && diffDays(s, e) < 15);
    ranges.push({ start: s, end: end || s });
  }
  return ranges;
}
