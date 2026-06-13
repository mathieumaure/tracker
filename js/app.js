// app.js — orchestration de l'interface.

import * as store from './store.js';
import { predict, periodRanges } from './predict.js';
import { ymd, parseYmd, todayKey, monthLabel, formatLong } from './dates.js';

const $ = (sel) => document.querySelector(sel);

const el = {
  auth: $('#auth-screen'),
  app: $('#app-screen'),
  loginForm: $('#login-form'),
  setupForm: $('#setup-form'),
  loginError: $('#login-error'),
  setupError: $('#setup-error'),
  setupSuccess: $('#setup-success'),
  monthLabel: $('#month-label'),
  calendar: $('#calendar'),
  syncStatus: $('#sync-status'),
  summary: $('#summary-panel'),
  dayModal: $('#day-modal'),
  dayTitle: $('#day-title'),
};

let viewYear, viewMonth; // mois affiché
let activeDay = null;     // jour ouvert dans l'éditeur
let saveTimer = null;

// --- Démarrage --------------------------------------------------------------

function init() {
  const now = new Date();
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();

  if (store.isConfigured()) {
    showLogin();
    el.loginForm.classList.remove('hidden');
  } else {
    showSetup();
  }

  bindEvents();
  registerServiceWorker();
}

function showLogin() {
  el.loginForm.classList.remove('hidden');
  el.setupForm.classList.add('hidden');
  $('#login-username').value = store.getUsername();
  $('#login-password').focus();
}

function showSetup() {
  el.setupForm.classList.remove('hidden');
  el.loginForm.classList.add('hidden');
  // bouton retour visible seulement si une config existe déjà
  $('#show-login').classList.toggle('hidden', !store.isConfigured());
}

// --- Événements -------------------------------------------------------------

function bindEvents() {
  el.loginForm.addEventListener('submit', onLogin);
  el.setupForm.addEventListener('submit', onSetup);
  $('#show-setup').addEventListener('click', showSetup);
  $('#show-login').addEventListener('click', showLogin);

  $('#prev-month').addEventListener('click', () => changeMonth(-1));
  $('#next-month').addEventListener('click', () => changeMonth(1));
  $('#logout').addEventListener('click', onLogout);

  $('#day-close').addEventListener('click', closeDayModal);
  el.dayModal.addEventListener('click', (e) => {
    if (e.target === el.dayModal) closeDayModal();
  });
  document.querySelectorAll('.toggle').forEach((btn) => {
    btn.addEventListener('click', () => onToggle(btn.dataset.flag));
  });

  window.addEventListener('online', () => syncNow());
}

async function onLogin(e) {
  e.preventDefault();
  el.loginError.textContent = '';
  const password = $('#login-password').value;
  try {
    await store.unlock(password);
    enterApp();
    syncNow();
  } catch (err) {
    el.loginError.textContent = err.message;
  }
}

async function onSetup(e) {
  e.preventDefault();
  el.setupError.textContent = '';
  el.setupSuccess.textContent = '';
  const btn = el.setupForm.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Connexion à GitHub…';
  try {
    const res = await store.setup({
      username: $('#setup-username').value.trim(),
      password: $('#setup-password').value,
      token: $('#setup-token').value.trim(),
      gistId: $('#setup-gist').value.trim(),
    });
    if (res.created) {
      el.setupSuccess.innerHTML =
        `✅ Gist créé. <b>Reportez cet identifiant sur l'autre appareil :</b><br>` +
        `<code class="gistid">${res.gistId}</code>`;
      // On laisse l'utilisateur lire l'ID avant d'entrer dans l'app.
      btn.disabled = false;
      btn.textContent = 'Continuer';
      btn.type = 'button'; // évite de re-soumettre le formulaire
      btn.addEventListener('click', () => { enterApp(); syncNow(); }, { once: true });
    } else {
      enterApp();
      syncNow();
    }
  } catch (err) {
    el.setupError.textContent = err.message;
    btn.disabled = false;
    btn.textContent = 'Démarrer';
  }
}

function onLogout() {
  if (store.hasPendingChanges()) {
    // on force une dernière sauvegarde silencieuse
    store.push().catch(() => {});
  }
  store.lock();
  location.reload();
}

// --- Application ------------------------------------------------------------

function enterApp() {
  el.auth.classList.add('hidden');
  el.app.classList.remove('hidden');
  render();
}

function changeMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  render();
}

function render() {
  el.monthLabel.textContent = monthLabel(viewYear, viewMonth);
  renderCalendar();
  renderSummary();
}

function renderCalendar() {
  const data = store.getData();
  const { predicted } = predict(data.days);
  const ranges = periodRanges(data.days);
  const periodSet = new Set();
  for (const r of ranges) {
    let d = r.start;
    while (true) {
      periodSet.add(d);
      if (d === r.end) break;
      d = ymd(new Date(parseYmd(d).getTime() + 86400000));
    }
  }

  el.calendar.innerHTML = '';
  const first = new Date(viewYear, viewMonth, 1);
  // lundi = 0
  let lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today = todayKey();

  for (let i = 0; i < lead; i++) {
    const blank = document.createElement('div');
    blank.className = 'cell blank';
    el.calendar.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key = ymd(new Date(viewYear, viewMonth, day));
    const cell = document.createElement('button');
    cell.className = 'cell';
    if (key === today) cell.classList.add('today');

    const flags = store.getDay(key);
    const pred = predicted[key];

    if (periodSet.has(key)) cell.classList.add('is-period');
    else if (pred && pred.type === 'period') cell.classList.add('is-pred-period');
    else if (pred && pred.type === 'fertile') cell.classList.add('is-fertile');

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = day;
    cell.appendChild(num);

    const dots = document.createElement('span');
    dots.className = 'dots';
    if (flags.periodStart) dots.appendChild(dot('period'));
    if (flags.periodEnd) dots.appendChild(dot('period-end'));
    if (flags.ovulation) dots.appendChild(dot('ovulation'));
    if (flags.sex) dots.appendChild(dot('sex'));
    if (!flags.ovulation && pred && pred.type === 'ovulation') dots.appendChild(dot('pred-ovulation'));
    cell.appendChild(dots);

    cell.addEventListener('click', () => openDayModal(key));
    el.calendar.appendChild(cell);
  }
}

function dot(cls) {
  const s = document.createElement('i');
  s.className = `dot ${cls}`;
  return s;
}

function renderSummary() {
  const data = store.getData();
  const { stats, summary } = predict(data.days);
  if (!summary) {
    el.summary.innerHTML = `<p class="muted">Ajoutez un premier « début des règles » pour activer les estimations.</p>`;
    return;
  }
  el.summary.innerHTML = `
    <div class="stat"><span class="big">${stats.avgCycle}</span><span>jours de cycle (moy.)</span></div>
    <div class="stat"><span class="big">${stats.avgPeriod}</span><span>jours de règles (moy.)</span></div>
    <div class="stat wide">
      <span>Prochaines règles : <b>${formatLong(summary.nextPeriod)}</b></span>
      <span>Fenêtre fertile : <b>${formatLong(summary.fertileStart)}</b> → <b>${formatLong(summary.fertileEnd)}</b></span>
      <span>Ovulation estimée : <b>${formatLong(summary.nextOvulation)}</b></span>
    </div>`;
}

// --- Éditeur de jour --------------------------------------------------------

function openDayModal(key) {
  activeDay = key;
  el.dayTitle.textContent = formatLong(key);
  refreshToggles();
  el.dayModal.classList.remove('hidden');
}

function refreshToggles() {
  const flags = store.getDay(activeDay);
  document.querySelectorAll('.toggle').forEach((btn) => {
    btn.classList.toggle('on', !!flags[btn.dataset.flag]);
  });
}

function onToggle(flag) {
  if (!activeDay) return;
  store.toggleFlag(activeDay, flag);
  refreshToggles();
  renderCalendar();
  renderSummary();
  scheduleSave();
}

function closeDayModal() {
  el.dayModal.classList.add('hidden');
  activeDay = null;
}

// --- Synchronisation --------------------------------------------------------

function scheduleSave() {
  clearTimeout(saveTimer);
  setSync('Modifications en attente…');
  saveTimer = setTimeout(saveNow, 1200);
}

async function saveNow() {
  try {
    setSync('Sauvegarde…');
    const ok = await store.push();
    setSync(ok ? 'Sauvegardé ✓' : 'Hors ligne — sera synchronisé', ok ? 'ok' : 'warn');
  } catch (err) {
    setSync('Échec sauvegarde : ' + err.message, 'err');
  }
}

async function syncNow() {
  if (!navigator.onLine) { setSync('Hors ligne', 'warn'); return; }
  try {
    setSync('Synchronisation…');
    const changed = await store.pull();
    if (store.hasPendingChanges()) await store.push();
    if (changed) { renderCalendar(); renderSummary(); }
    setSync('À jour ✓', 'ok');
  } catch (err) {
    setSync('Sync impossible : ' + err.message, 'err');
  }
}

function setSync(text, cls = '') {
  el.syncStatus.textContent = text;
  el.syncStatus.className = 'sync-status ' + cls;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

init();
