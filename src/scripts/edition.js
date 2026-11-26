// Mode édition des billets.
//
// La page est statique : elle parle directement à l'API GitHub avec un jeton
// personnel saisi par l'auteur et gardé dans son navigateur. Chaque
// enregistrement est un commit dans le dépôt ; le site se reconstruit ensuite
// tout seul (environ une minute).

const racine = document.getElementById('edition');
const REPO = racine.dataset.repo;
const BASE = racine.dataset.base;
const BRANCHE = new URLSearchParams(location.search).get('branche') || 'main';
const DOSSIER = 'src/data/carnets';
const DOSSIER_IMAGES = 'public/carnets/img';
const CLE = 'messagerceleste.jeton';
const API = 'https://api.github.com';

let jeton = localStorage.getItem(CLE) || sessionStorage.getItem(CLE) || '';
let moi = null; // { name, email } pour signer les commits
let billets = []; // [{ nom, chemin, sha, data }]
let filtre = 'tous';
let recherche = '';
let modifie = false;

// ── Petits outils ──────────────────────────────────────────────────────────
const h = (tag, attrs = {}, ...enfants) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const e of enfants.flat()) if (e != null && e !== false) el.append(e);
  return el;
};

const b64 = (octets) => {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64texte = (texte) => b64(new TextEncoder().encode(texte));

const dateLongue = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeZone: 'America/Toronto' });
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function extrait(texte, max = 220) {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  return coupe.slice(0, Math.max(coupe.lastIndexOf(' '), 120)).replace(/[\s,;:.]+$/, '') + '…';
}

async function api(methode, chemin, corps) {
  const rep = await fetch(API + chemin, {
    method: methode,
    headers: {
      Authorization: `Bearer ${jeton}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const json = await rep.json().catch(() => ({}));
  if (!rep.ok) {
    const e = new Error(json.message || `Erreur ${rep.status}`);
    e.status = rep.status;
    throw e;
  }
  return json;
}

function message(texte, type = 'info') {
  const zone = document.getElementById('ed-message');
  if (!zone) return;
  zone.textContent = texte;
  zone.className = `ed-message ${type}`;
  zone.hidden = !texte;
}

const explique = (e) =>
  !e.status ? `Impossible de terminer l'opération : ${e.message}`
  : e.status === 401 ? 'Jeton refusé par GitHub : il est invalide ou expiré.'
  : e.status === 403 || e.status === 404 ? "Ce jeton n'a pas accès en écriture au dépôt du site."
  : e.status === 409 || e.status === 422 ? "Le billet a changé sur GitHub entre-temps. Recharge la page avant de l'enregistrer de nouveau."
  : `GitHub a répondu : ${e.message}`;

// ── Connexion ──────────────────────────────────────────────────────────────
async function connecter(garder) {
  const [utilisateur, depot] = await Promise.all([api('GET', '/user'), api('GET', `/repos/${REPO}`)]);
  if (!depot.permissions?.push) {
    const e = new Error('lecture seule');
    e.status = 403;
    throw e;
  }
  // Adresse « noreply » de GitHub : le courriel personnel n'apparaît pas dans l'historique public.
  moi = { name: utilisateur.name || utilisateur.login, email: `${utilisateur.id}+${utilisateur.login}@users.noreply.github.com` };
  sessionStorage.setItem(CLE, jeton);
  if (garder) localStorage.setItem(CLE, jeton);
}

function deconnecter() {
  localStorage.removeItem(CLE);
  sessionStorage.removeItem(CLE);
  jeton = '';
  ecranConnexion();
}

function ecranConnexion(erreur) {
  const champ = h('input', { type: 'password', id: 'ed-jeton', autocomplete: 'off', placeholder: 'github_pat_…', required: true });
  const garder = h('input', { type: 'checkbox', id: 'ed-garder', checked: true });
  racine.replaceChildren(
    h('form', {
      class: 'ed-connexion',
      onsubmit: async (ev) => {
        ev.preventDefault();
        jeton = champ.value.trim();
        message('Vérification du jeton…');
        try {
          await connecter(garder.checked);
          await ouvrir();
        } catch (e) {
          jeton = '';
          sessionStorage.removeItem(CLE);
          message(explique(e), 'erreur');
        }
      },
    },
      h('p', {}, "Le mode édition enregistre tes changements directement dans le dépôt GitHub du site. Il faut un jeton d'accès GitHub, saisi une seule fois sur cet appareil."),
      h('label', { for: 'ed-jeton' }, "Jeton d'accès GitHub"),
      champ,
      h('label', { class: 'ed-case' }, garder, ' Rester connecté sur cet appareil'),
      h('button', { type: 'submit', class: 'ed-primaire' }, 'Ouvrir le mode édition'),
      h('p', { id: 'ed-message', class: 'ed-message', hidden: true }),
      h('details', {},
        h('summary', {}, 'Comment créer le jeton'),
        h('ol', {},
          h('li', {}, 'Ouvrir ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'GitHub → Fine-grained tokens → Generate new token'), '.'),
          h('li', {}, 'Repository access : « Only select repositories », puis choisir ', h('code', {}, REPO.split('/')[1]), '.'),
          h('li', {}, 'Permissions → Repository permissions → Contents : « Read and write ».'),
          h('li', {}, 'Générer, copier le jeton et le coller ici.'),
        ),
        h('p', { class: 'discret' }, "Le jeton reste dans ce navigateur et n'est envoyé qu'à GitHub. « Se déconnecter » l'efface."),
      ),
    ),
  );
  if (erreur) message(erreur, 'erreur');
}

// ── Chargement des billets ─────────────────────────────────────────────────
async function charger() {
  const [compte, nom] = REPO.split('/');
  const rep = await api('POST', '/graphql', {
    query: `query($o:String!,$n:String!,$e:String!){repository(owner:$o,name:$n){object(expression:$e){... on Tree{entries{name object{... on Blob{oid text isTruncated}}}}}}}`,
    variables: { o: compte, n: nom, e: `${BRANCHE}:${DOSSIER}` },
  });
  if (rep.errors?.length) throw new Error(rep.errors[0].message);
  const entrees = rep.data?.repository?.object?.entries;
  if (!entrees) throw new Error(`dossier ${DOSSIER} introuvable sur la branche ${BRANCHE}`);
  billets = entrees
    .filter((e) => e.name.endsWith('.json') && e.object?.text && !e.object.isTruncated)
    .map((e) => ({ nom: e.name.replace(/\.json$/, ''), chemin: `${DOSSIER}/${e.name}`, sha: e.object.oid, data: JSON.parse(e.object.text) }))
    .sort((a, b) => b.data.date.localeCompare(a.data.date));
}

async function enregistrer(billet, texteCommit) {
  const rep = await api('PUT', `/repos/${REPO}/contents/${billet.chemin}`, {
    message: texteCommit,
    content: b64texte(JSON.stringify(billet.data, null, 1) + '\n'),
    sha: billet.sha,
    branch: BRANCHE,
    author: moi,
    committer: moi,
  });
  billet.sha = rep.content.sha;
}

async function ouvrir() {
  racine.replaceChildren(h('p', { class: 'discret' }, 'Chargement des billets…'));
  await charger();
  const cible = decodeURIComponent(location.hash.slice(1));
  const billet = cible && billets.find((b) => b.nom === cible);
  billet ? ecranEditeur(billet) : ecranListe();
}

// ── Liste ──────────────────────────────────────────────────────────────────
function ecranListe(info) {
  history.replaceState(null, '', location.pathname + location.search);
  const masques = billets.filter((b) => b.data.hidden).length;
  const liste = h('ul', { class: 'ed-liste' });

  const dessiner = () => {
    const q = recherche.toLowerCase();
    const visibles = billets.filter((b) =>
      (filtre === 'tous' || (filtre === 'masques') === !!b.data.hidden) &&
      (!q || b.data.title.toLowerCase().includes(q) || (b.data.labels || []).some((l) => l.toLowerCase().includes(q))));
    liste.replaceChildren(...visibles.map(ligne));
    if (!visibles.length) liste.append(h('li', { class: 'discret' }, 'Aucun billet ne correspond.'));
  };

  const ligne = (b) => {
    const bascule = h('button', {
      type: 'button',
      onclick: async () => {
        bascule.disabled = true;
        const avant = b.data.hidden;
        if (avant) delete b.data.hidden; else b.data.hidden = true;
        try {
          await enregistrer(b, `${avant ? 'Rendre visible' : 'Masquer'} : ${b.data.title}`);
          ecranListe(`« ${b.data.title} » est maintenant ${avant ? 'visible' : 'masqué'}. Le site se met à jour dans environ une minute.`);
        } catch (e) {
          if (avant) b.data.hidden = true; else delete b.data.hidden;
          bascule.disabled = false;
          message(explique(e), 'erreur');
        }
      },
    }, b.data.hidden ? 'Rendre visible' : 'Masquer');
    return h('li', { class: b.data.hidden ? 'masque' : '' },
      h('div', {},
        h('strong', {}, b.data.title),
        h('span', { class: 'discret' }, dateLongue.format(new Date(b.data.date)), b.data.hidden ? ' · ' : '', b.data.hidden ? h('em', { class: 'ed-badge' }, 'Masqué') : ''),
      ),
      h('div', { class: 'ed-actions' },
        h('button', { type: 'button', class: 'ed-primaire', onclick: () => ecranEditeur(b) }, 'Modifier'),
        bascule,
      ),
    );
  };

  const onglet = (cle, texte) => h('button', {
    type: 'button', class: filtre === cle ? 'actif' : '',
    onclick: () => { filtre = cle; ecranListe(); },
  }, texte);

  racine.replaceChildren(
    h('div', { class: 'ed-barre' },
      h('input', { type: 'search', placeholder: 'Chercher un titre ou une étiquette', value: recherche, 'aria-label': 'Chercher', oninput: (ev) => { recherche = ev.target.value; dessiner(); } }),
      h('div', { class: 'ed-onglets' },
        onglet('tous', `Tous (${billets.length})`),
        onglet('visibles', `Visibles (${billets.length - masques})`),
        onglet('masques', `Masqués (${masques})`),
      ),
      h('button', { type: 'button', onclick: deconnecter }, 'Se déconnecter'),
    ),
    h('p', { id: 'ed-message', class: 'ed-message', hidden: true }),
    BRANCHE !== 'main' && h('p', { class: 'ed-message info' }, `Branche d'essai « ${BRANCHE} » : rien n'est publié sur le site.`),
    liste,
  );
  dessiner();
  if (info) message(info, 'ok');
}

// ── Éditeur ────────────────────────────────────────────────────────────────
// Les images du site ont des adresses internes (« /archives/img/… ») : on les
// préfixe pour l'affichage dans l'éditeur et on retire le préfixe à l'enregistrement.
const versEditeur = (html) => (BASE ? html.replace(/\b(src|href)="\/(?!\/)/g, `$1="${BASE}/`) : html);

function versDepot(zone) {
  const copie = zone.cloneNode(true);
  copie.querySelectorAll('script, style').forEach((el) => el.remove());
  copie.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    if (el.dataset.src) { el.setAttribute('src', el.dataset.src); el.removeAttribute('data-src'); }
    for (const a of ['src', 'href']) {
      const v = el.getAttribute(a);
      if (v && BASE && v.startsWith(BASE + '/')) el.setAttribute(a, v.slice(BASE.length));
      if (v && /^\s*javascript:/i.test(v)) el.removeAttribute(a);
    }
  });
  return copie;
}

async function televerser(fichier) {
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, 1600 / image.width);
  const toile = Object.assign(document.createElement('canvas'), { width: Math.round(image.width * echelle), height: Math.round(image.height * echelle) });
  toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height);
  const blob = await new Promise((ok) => toile.toBlob(ok, 'image/jpeg', 0.88));
  const nom = `${new Date().toISOString().slice(0, 10)}-${slug(fichier.name.replace(/\.[^.]+$/, '')) || 'image'}-${Date.now().toString(36)}.jpg`;
  await api('PUT', `/repos/${REPO}/contents/${DOSSIER_IMAGES}/${nom}`, {
    message: `Image : ${nom}`,
    content: b64(new Uint8Array(await blob.arrayBuffer())),
    branch: BRANCHE,
    author: moi,
    committer: moi,
  });
  return { src: `/carnets/img/${nom}`, apercu: URL.createObjectURL(blob), width: toile.width, height: toile.height };
}

function ecranEditeur(billet) {
  history.replaceState(null, '', `${location.pathname}${location.search}#${billet.nom}`);
  const d = billet.data;
  modifie = false;
  const touche = () => { modifie = true; };

  const titre = h('input', { type: 'text', id: 'ed-titre', value: d.title, required: true, oninput: touche });
  const date = h('input', { type: 'date', id: 'ed-date', value: d.date.slice(0, 10), required: true, oninput: touche });
  const etiquettes = h('input', { type: 'text', id: 'ed-etiquettes', value: (d.labels || []).join(', '), oninput: touche });
  const masque = h('input', { type: 'checkbox', id: 'ed-masque', checked: !!d.hidden, onchange: touche });
  const zone = h('div', { class: 'article ed-zone', contenteditable: 'true', oninput: touche });
  zone.innerHTML = versEditeur(d.html);
  const source = h('textarea', { class: 'ed-source', hidden: true, spellcheck: 'false', oninput: touche });
  const choixImage = h('input', { type: 'file', accept: 'image/*', hidden: true });

  const commande = (nom, valeur) => () => { zone.focus(); document.execCommand(nom, false, valeur); touche(); };
  const outil = (texte, titreOutil, action) => h('button', { type: 'button', title: titreOutil, onmousedown: (ev) => ev.preventDefault(), onclick: action }, texte);

  const basculerSource = () => {
    if (source.hidden) {
      source.value = versDepot(zone).innerHTML;
      source.style.height = Math.max(zone.offsetHeight, 240) + 'px';
    } else {
      zone.innerHTML = versEditeur(source.value);
    }
    source.hidden = !source.hidden;
    zone.hidden = !zone.hidden;
  };

  choixImage.addEventListener('change', async () => {
    const fichier = choixImage.files[0];
    choixImage.value = '';
    if (!fichier) return;
    message("Envoi de l'image…");
    try {
      const img = await televerser(fichier);
      if (!source.hidden) basculerSource();
      zone.focus();
      document.execCommand('insertHTML', false, `<img src="${img.apercu}" data-src="${img.src}" width="${img.width}" height="${img.height}" alt="" loading="lazy">`);
      touche();
      message("Image ajoutée. Elle sera en ligne après l'enregistrement du billet.", 'ok');
    } catch (e) {
      message(explique(e), 'erreur');
    }
  });

  const fermer = () => {
    if (modifie && !confirm('Abandonner les changements non enregistrés ?')) return;
    modifie = false;
    ecranListe();
  };

  const boutonEnregistrer = h('button', { type: 'submit', class: 'ed-primaire' }, 'Enregistrer');

  racine.replaceChildren(
    h('form', {
      class: 'ed-editeur',
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (!modifie) return ecranListe('Aucun changement à enregistrer.');
        if (!source.hidden) basculerSource();
        const propre = versDepot(zone);
        const avant = JSON.stringify(d);
        d.title = titre.value.trim();
        if (date.value !== d.date.slice(0, 10)) d.date = date.value + d.date.slice(10);
        d.labels = etiquettes.value.split(',').map((s) => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
        d.html = propre.innerHTML.trim();
        d.excerpt = extrait(propre.textContent.replace(/\s+/g, ' ').trim());
        d.cover = propre.querySelector('img')?.getAttribute('src') || null;
        if (masque.checked) d.hidden = true; else delete d.hidden;
        if (JSON.stringify(d) === avant) { modifie = false; return ecranListe('Aucun changement à enregistrer.'); }
        d.updated = new Date().toISOString();
        boutonEnregistrer.disabled = true;
        message('Enregistrement…');
        try {
          await enregistrer(billet, `Modifier : ${d.title}`);
          modifie = false;
          ecranListe(`« ${d.title} » est enregistré. Le site se met à jour dans environ une minute.`);
        } catch (e) {
          billet.data = JSON.parse(avant);
          boutonEnregistrer.disabled = false;
          message(explique(e), 'erreur');
        }
      },
    },
      h('div', { class: 'ed-barre' },
        h('button', { type: 'button', onclick: fermer }, '← Tous les billets'),
        !d.hidden && h('a', { href: BASE + d.path, target: '_blank', rel: 'noopener' }, 'Voir le billet en ligne'),
      ),
      h('label', { for: 'ed-titre' }, 'Titre'), titre,
      h('div', { class: 'ed-champs' },
        h('div', {}, h('label', { for: 'ed-date' }, 'Date'), date),
        h('div', {}, h('label', { for: 'ed-etiquettes' }, 'Étiquettes, séparées par des virgules'), etiquettes),
      ),
      h('label', { class: 'ed-case' }, masque, ' Masquer ce billet (il disparaît du site, sans être supprimé)'),
      h('div', { class: 'ed-outils' },
        outil('Gras', 'Gras', commande('bold')),
        outil('Italique', 'Italique', commande('italic')),
        outil('Intertitre', 'Intertitre', commande('formatBlock', 'h2')),
        outil('Paragraphe', 'Paragraphe normal', commande('formatBlock', 'p')),
        outil('Liste', 'Liste à puces', commande('insertUnorderedList')),
        outil('Lien', 'Insérer un lien', () => {
          const url = prompt('Adresse du lien :', 'https://');
          if (url) commande('createLink', url)();
        }),
        outil('Retirer le lien', 'Retirer le lien', commande('unlink')),
        outil('Image', 'Insérer une image', () => choixImage.click()),
        outil('Code HTML', 'Afficher ou masquer le code HTML', basculerSource),
      ),
      choixImage, zone, source,
      h('p', { id: 'ed-message', class: 'ed-message', hidden: true }),
      h('div', { class: 'ed-barre' }, boutonEnregistrer, h('button', { type: 'button', onclick: fermer }, 'Annuler')),
    ),
  );
  window.scrollTo(0, 0);
}

window.addEventListener('beforeunload', (ev) => { if (modifie) ev.preventDefault(); });

// ── Démarrage ──────────────────────────────────────────────────────────────
if (!jeton) ecranConnexion();
else {
  racine.replaceChildren(h('p', { class: 'discret' }, 'Connexion…'));
  connecter(!!localStorage.getItem(CLE)).then(ouvrir).catch((e) => {
    if (e.status === 401) { localStorage.removeItem(CLE); sessionStorage.removeItem(CLE); jeton = ''; }
    ecranConnexion(e.status ? explique(e) : `Impossible de charger les billets : ${e.message}`);
  });
}
