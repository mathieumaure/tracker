# Suivi 🌸

Petite application web privée pour suivre un cycle menstruel, dans une démarche
de conception. Vue calendrier avec **début des règles**, **fin des règles**,
**ovulation** et **rapports**, plus des **estimations** (prochaines règles,
fenêtre de fertilité, ovulation).

L'app est volontairement **anonyme** (aucun prénom nulle part) et **privée**.

---

## Comment la confidentialité est assurée

GitHub Pages est public : **le code** est visible par tous, mais **jamais vos données**.

- Les données ne sont **pas** dans le site. Elles vivent dans un **Gist GitHub privé**.
- Avant d'être envoyées, elles sont **chiffrées** (AES-GCM) avec une clé dérivée de
  **votre mot de passe** (PBKDF2, 200 000 itérations, WebCrypto). Sans le mot de
  passe, le Gist ne contient que du charabia.
- Le mot de passe n'est **jamais** stocké en clair ni publié.
- Le token GitHub est gardé **uniquement en local** sur chaque appareil, lui aussi
  chiffré. Il n'est jamais présent dans le code publié.

> ⚠️ Le mot de passe **est** la clé. Si vous l'oubliez, les données chiffrées sont
> définitivement illisibles. Choisissez-en un que vous retiendrez tous les deux.

---

## Mise en route

### 1. Activer GitHub Pages
Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
À chaque push, le workflow `.github/workflows/pages.yml` déploie le site.
L'URL ressemblera à `https://<votre-user>.github.io/tracker/`.

### 2. Créer un token GitHub (une fois)
1. github.com → **Settings → Developer settings → Personal access tokens → Tokens (classic)**.
2. **Generate new token (classic)**, cochez **uniquement** la case `gist`.
3. Choisissez une expiration longue. Copiez le token (`ghp_…`).

### 3. Premier appareil
1. Ouvrez l'app, écran **Configuration**.
2. Identifiant + mot de passe (le mot de passe sert au chiffrement).
3. Collez le token. Laissez **« Identifiant du Gist » vide**.
4. « Démarrer » → l'app crée un Gist privé et affiche son **identifiant**.
   **Notez-le** : il servira pour le second appareil.

### 4. Second appareil (votre conjoint·e)
1. Même app, écran **Configuration**.
2. **Même mot de passe** (indispensable pour déchiffrer).
3. Token (le même, ou un autre token `gist` du même compte).
4. Collez l'**identifiant du Gist** noté à l'étape 3.
5. « Démarrer » → les données se synchronisent.

### 5. Installer sur le téléphone
Ouvrez l'URL dans le navigateur, puis « Ajouter à l'écran d'accueil ».
L'app s'ouvre en plein écran et fonctionne hors-ligne (synchro au retour du réseau).

---

## Utilisation

- Touchez un jour pour ouvrir l'éditeur et activer/désactiver les marqueurs.
- Les règles confirmées sont ombrées en rose ; les **prévisions** apparaissent en
  teintes plus claires (règles à venir, fenêtre fertile, ovulation estimée).
- Le bandeau du haut indique l'état de la **synchronisation**.
- 🔒 verrouille l'app (il faudra ressaisir le mot de passe).

---

## Détails techniques

- 100 % statique : HTML/CSS/JS (modules ES), sans étape de build.
- PWA installable, hors-ligne via service worker (ne met en cache **que** l'app).
- Synchronisation : `pull` au déverrouillage, `push` (avec fusion) à chaque
  modification. La fusion réapplique vos changements locaux par-dessus la version
  distante (« dernière modification gagne » au niveau du jour).
- Icônes générées par `icons/make_icons.py` (pur Python, sans dépendance).

### Lancer en local
```bash
python3 -m http.server 8000
# puis http://localhost:8000
```
Un serveur (et non `file://`) est nécessaire pour les modules ES et le service worker.
