// store.js — état de l'application : configuration locale (chiffrée),
// déchiffrement, et synchronisation avec le Gist.

import { deriveKey, encryptJSON, decryptJSON, encryptString, decryptString,
  randomBytes, toB64, fromB64 } from './crypto.js';
import { createGist, fetchGist, updateGist } from './gist.js';

const CONFIG_KEY = 'cyclo.config.v1';
const GIST_VERSION = 1;

// État vivant en mémoire pendant la session.
const session = {
  key: null,          // CryptoKey AES-GCM
  token: null,        // token GitHub déchiffré
  gistId: null,
  salt: null,         // Uint8Array
  data: emptyData(),  // données déchiffrées
  remoteUpdatedAt: 0, // updatedAt de la dernière version distante connue
  changedDays: new Set(), // jours modifiés localement (pour la fusion)
};

export function emptyData() {
  return { updatedAt: 0, days: {} };
}

export function getData() {
  return session.data;
}

export function isConfigured() {
  return !!localStorage.getItem(CONFIG_KEY);
}

function readConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
}

function writeConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

// Empaquette les données chiffrées pour le Gist.
async function buildGistFile() {
  const enc = await encryptJSON(session.key, session.data);
  return JSON.stringify({
    version: GIST_VERSION,
    salt: toB64(session.salt),
    updatedAt: session.data.updatedAt,
    iv: enc.iv,
    ct: enc.ct,
  });
}

// Met à jour le cache local chiffré + l'identité (token, gist, sel).
async function persistConfig() {
  const tokenEnc = await encryptString(session.key, session.token);
  const cache = await encryptJSON(session.key, session.data);
  writeConfig({
    gistId: session.gistId,
    salt: toB64(session.salt),
    tokenEnc,
    cache,
  });
}

// --- Mise en place initiale -------------------------------------------------

// Première installation OU rejoindre un Gist existant.
// Renvoie { gistId, created } .
export async function setup({ password, token, gistId }) {
  if (gistId) {
    // Rejoindre : on lit le sel depuis le Gist, on vérifie le mot de passe.
    const content = await fetchGist(token, gistId.trim());
    if (!content) throw new Error("Gist introuvable ou vide pour cet identifiant.");
    const payload = JSON.parse(content);
    const salt = fromB64(payload.salt);
    const key = await deriveKey(password, salt);
    let data;
    try {
      data = await decryptJSON(key, { iv: payload.iv, ct: payload.ct });
    } catch (_) {
      throw new Error("Mot de passe incorrect pour ce Gist.");
    }
    session.key = key;
    session.token = token;
    session.gistId = gistId.trim();
    session.salt = salt;
    session.data = normalizeData(data);
    session.remoteUpdatedAt = payload.updatedAt || 0;
    await persistConfig();
    return { gistId: session.gistId, created: false };
  }

  // Première installation : on génère un sel, on crée le Gist.
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  session.key = key;
  session.token = token;
  session.salt = salt;
  session.data = emptyData();
  session.data.updatedAt = Date.now();
  const file = await buildGistFile();
  const newId = await createGist(token, file);
  session.gistId = newId;
  session.remoteUpdatedAt = session.data.updatedAt;
  await persistConfig();
  return { gistId: newId, created: true };
}

// --- Déverrouillage (utilisateur déjà configuré sur cet appareil) -----------

export async function unlock(password) {
  const cfg = readConfig();
  if (!cfg) throw new Error('Aucune configuration sur cet appareil.');
  const salt = fromB64(cfg.salt);
  const key = await deriveKey(password, salt);
  let data;
  try {
    data = await decryptJSON(key, cfg.cache);
  } catch (_) {
    throw new Error('Mot de passe incorrect.');
  }
  session.key = key;
  session.salt = salt;
  session.gistId = cfg.gistId;
  session.token = await decryptString(key, cfg.tokenEnc);
  session.data = normalizeData(data);
  session.remoteUpdatedAt = session.data.updatedAt || 0;
}

export function lock() {
  session.key = null;
  session.token = null;
  session.data = emptyData();
}

// --- Synchronisation --------------------------------------------------------

// Récupère la version distante et fusionne. Renvoie true si des données ont changé.
export async function pull() {
  if (!navigator.onLine) return false;
  const content = await fetchGist(session.token, session.gistId);
  if (!content) return false;
  const payload = JSON.parse(content);
  if (!payload.iv) return false;
  const remote = normalizeData(await decryptJSON(session.key, { iv: payload.iv, ct: payload.ct }));
  if ((payload.updatedAt || 0) <= session.remoteUpdatedAt && session.changedDays.size === 0) {
    return false; // rien de neuf
  }
  session.data = mergeData(remote, session.data, session.changedDays);
  session.remoteUpdatedAt = payload.updatedAt || 0;
  return true;
}

// Pousse l'état local vers le Gist, après fusion avec une éventuelle
// version distante plus récente. Renvoie true si la sauvegarde a réussi.
export async function push() {
  session.data.updatedAt = Date.now();
  await persistConfig(); // on garde toujours le cache local à jour
  if (!navigator.onLine) return false;

  // Fusion avant écriture si le distant a bougé.
  const content = await fetchGist(session.token, session.gistId);
  if (content) {
    const payload = JSON.parse(content);
    if (payload.iv && (payload.updatedAt || 0) > session.remoteUpdatedAt) {
      const remote = normalizeData(await decryptJSON(session.key, { iv: payload.iv, ct: payload.ct }));
      session.data = mergeData(remote, session.data, session.changedDays);
      session.data.updatedAt = Date.now();
    }
  }
  const file = await buildGistFile();
  await updateGist(session.token, session.gistId, file);
  session.remoteUpdatedAt = session.data.updatedAt;
  session.changedDays.clear();
  await persistConfig();
  return true;
}

// --- Édition des jours ------------------------------------------------------

const FLAGS = ['periodStart', 'periodEnd', 'ovulation', 'sex'];

export function toggleFlag(dayKey, flag) {
  if (!FLAGS.includes(flag)) return;
  const days = session.data.days;
  const cur = days[dayKey] || {};
  const next = { ...cur, [flag]: !cur[flag] };
  // on nettoie : un jour sans aucun marqueur est supprimé
  if (!FLAGS.some((f) => next[f])) {
    delete days[dayKey];
  } else {
    days[dayKey] = next;
  }
  session.changedDays.add(dayKey);
}

export function getDay(dayKey) {
  return session.data.days[dayKey] || {};
}

export function hasPendingChanges() {
  return session.changedDays.size > 0;
}

// --- Helpers ----------------------------------------------------------------

function normalizeData(data) {
  const out = emptyData();
  out.updatedAt = data && data.updatedAt ? data.updatedAt : 0;
  out.days = data && data.days ? data.days : {};
  return out;
}

// Fusion : base distante, on réapplique nos jours modifiés localement.
function mergeData(remote, local, changedDays) {
  const out = emptyData();
  out.days = { ...remote.days };
  for (const day of changedDays) {
    if (local.days[day]) out.days[day] = local.days[day];
    else delete out.days[day]; // suppression locale
  }
  out.updatedAt = Math.max(remote.updatedAt || 0, local.updatedAt || 0);
  return out;
}
