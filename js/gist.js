// gist.js — synchronisation avec un Gist GitHub privé.
// Le Gist ne contient QUE des données chiffrées : illisibles sans le mot de passe.

const API = 'https://api.github.com/gists';
const FILE = 'cyclo-data.json';

function headers(token) {
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

// Crée un nouveau Gist privé et renvoie son id.
export async function createGist(token, fileContent) {
  const res = await fetch(API, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      description: 'data', // volontairement anonyme
      public: false,
      files: { [FILE]: { content: fileContent } },
    }),
  });
  if (!res.ok) throw new Error(await describeError(res, 'création du Gist'));
  const data = await res.json();
  return data.id;
}

// Récupère le contenu (chaîne) du fichier de données du Gist.
// Renvoie null si le Gist n'existe pas / fichier absent.
export async function fetchGist(token, gistId) {
  const res = await fetch(`${API}/${gistId}`, { headers: headers(token), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await describeError(res, 'lecture du Gist'));
  const data = await res.json();
  const file = data.files && data.files[FILE];
  if (!file) return null;
  // Les très gros fichiers sont tronqués : on relit via raw_url.
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url, { cache: 'no-store' });
    return await raw.text();
  }
  return file.content;
}

// Met à jour le fichier de données du Gist.
export async function updateGist(token, gistId, fileContent) {
  const res = await fetch(`${API}/${gistId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ files: { [FILE]: { content: fileContent } } }),
  });
  if (!res.ok) throw new Error(await describeError(res, 'sauvegarde du Gist'));
}

async function describeError(res, action) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body.message ? ` (${body.message})` : '';
  } catch (_) { /* ignore */ }
  if (res.status === 401) return `Token GitHub invalide ou expiré${detail}.`;
  if (res.status === 403) return `Accès refusé — le token a-t-il le droit "gist" ?${detail}`;
  if (res.status === 404) return `Gist introuvable — vérifie l'identifiant${detail}.`;
  return `Échec de la ${action} : ${res.status}${detail}`;
}
