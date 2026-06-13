// crypto.js — chiffrement local via WebCrypto (AES-GCM + PBKDF2)
// Le mot de passe ne quitte jamais l'appareil : il sert uniquement à
// dériver une clé qui chiffre/déchiffre les données.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(len) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function fromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Dérive une clé AES-GCM à partir du mot de passe et d'un sel.
export async function deriveKey(password, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: 200000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Chiffre un objet JS -> { iv, ct } (base64).
export async function encryptJSON(key, obj) {
  const iv = randomBytes(12);
  const data = enc.encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: toB64(iv), ct: toB64(ct) };
}

// Déchiffre { iv, ct } -> objet JS. Lève une erreur si la clé est mauvaise.
export async function decryptJSON(key, payload) {
  const iv = fromB64(payload.iv);
  const ct = fromB64(payload.ct);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(dec.decode(plain));
}

// Chiffre une chaîne (ex: le token GitHub).
export async function encryptString(key, str) {
  return encryptJSON(key, { v: str });
}

export async function decryptString(key, payload) {
  const obj = await decryptJSON(key, payload);
  return obj.v;
}
