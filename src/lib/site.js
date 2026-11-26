// Données et utilitaires partagés par les pages.
import { createHash } from 'node:crypto';
import { traducteur } from './i18n.js';
import etiquettesEn from '../data/etiquettes-en.json';

export const SITE = {
  title: 'Messager Céleste',
  tagline: "Carnets d'observations",
  description: 'Une description libre de mes séances de photographie du ciel et un peu plus.',
  author: 'Martin Magnan',
};

// Dépôt GitHub du site (« compte/nom »), utilisé par le mode édition.
export const REPO = import.meta.env.PUBLIC_REPO || 'martinmagnan/messagerceleste';

// Google Analytics 4 (propriété « Messager Céleste », flux Web www.messagerceleste.com).
// Chargé seulement après accord du visiteur : voir src/components/Statistiques.astro.
export const GA_ID = 'G-P0L2V172KC';

export const BASE =import.meta.env.BASE_URL.replace(/\/$/, '');

const externe = (p) => /^([a-z]+:|\/\/|#)/i.test(p);
const chemin = (p) => (p.startsWith('/') ? p : '/' + p);

/** Adresse d'un fichier du site (image, flux, icône) : jamais préfixée par la langue. */
export const asset = (p = '/') => (externe(p) ? p : BASE + chemin(p));

/** Adresse d'une page du site, dans la langue voulue (l'anglais vit sous /en/). */
export const u = (p = '/', lang = 'fr') => (externe(p) ? p : BASE + (lang === 'en' ? '/en' : '') + chemin(p));

/** Préfixe les src/href internes d'un fragment HTML : base du site, et /en pour les liens vers des pages. */
export const rebase = (html, lang = 'fr') =>
  html.replace(/\b(src|href)="\/(?!\/)([^"]*)"/g, (_, attr, reste) => {
    const p = '/' + reste;
    const fichier = attr === 'src' || /\.(jpe?g|png|gif|webp|svg|pdf|xml)([?#]|$)/i.test(p) || p.startsWith('/archives/');
    return `${attr}="${BASE}${!fichier && lang === 'en' ? '/en' : ''}${p}"`;
  });

export const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const dates = {
  fr: new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeZone: 'America/Toronto' }),
  en: new Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeZone: 'America/Toronto' }),
};
export const formatDate = (d, lang = 'fr') => (dates[lang] || dates.fr).format(d);

const parNom = (glob) => Object.fromEntries(Object.entries(glob).map(([f, v]) => [f.split('/').pop().replace(/\.json$/, ''), v]));

// ── Traductions ────────────────────────────────────────────────────────────
// Les traductions anglaises sont dans src/data/carnets-en et src/data/galerie-en. Chacune porte
// l'empreinte du texte français dont elle est tirée (« source ») : si le français change, la
// traduction est signalée comme périmée.
const empreinte = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
export const empreinteBillet = (p) => empreinte(p.title + '\n' + p.html);
export const empreinteFiche = (g) => empreinte(g.name + '\n' + g.subtitle + '\n' + JSON.stringify(g.sections));

const carnetsEn = parNom(import.meta.glob('../data/carnets-en/*.json', { eager: true, import: 'default' }));
const galerieEn = parNom(import.meta.glob('../data/galerie-en/*.json', { eager: true, import: 'default' }));

/** Nom d'une étiquette dans la langue voulue. */
export const nomEtiquette = (name, lang = 'fr') => (lang === 'en' && typeof etiquettesEn[name] === 'string' ? etiquettesEn[name] : name);

// ── Galerie ────────────────────────────────────────────────────────────────
const couverture = (g) => g.images.find((i) => i.kind === 'image') || g.images[0];
// Les fiches sont générées par scripts/import-images.mjs. Ce qui est changé dans le mode édition
// (src/data/galerie-modifs/<slug>.json) se superpose à la fiche générée : titres, textes, agrandis
// masqués ou renommés, image masquée.
const galerieModifs = parNom(import.meta.glob('../data/galerie-modifs/*.json', { eager: true, import: 'default' }));
const cleImage = (i) => i.web.split('/').pop();
const avecModifs = (g) => {
  const m = galerieModifs[g.slug];
  if (!m) return g;
  const images = g.images
    .filter((i) => !(i.kind === 'detail' && m.details?.[cleImage(i)]?.hidden))
    .map((i) => {
      const d = i.kind === 'detail' ? m.details?.[cleImage(i)] : null;
      return d?.label ? { ...i, label: d.label, labelBase: i.label } : i;
    });
  return {
    ...g,
    name: m.name ?? g.name, designation: m.designation ?? g.designation,
    constellation: m.constellation ?? g.constellation, subtitle: m.subtitle ?? g.subtitle,
    sections: m.sections ?? g.sections,
    images, hidden: !!m.hidden,
  };
};
export const galerie = Object.values(import.meta.glob('../data/galerie/*.json', { eager: true, import: 'default' }))
  .map(avecModifs)
  .filter((g) => !g.hidden)
  .map((g) => ({ ...g, date: new Date(g.date), url: `/galerie/${g.slug}/`, cover: couverture(g) }))
  .sort((a, b) => b.date - a.date);

const galerieAnglaise = galerie.map((g) => {
  const e = galerieEn[g.slug];
  if (!e) return { ...g, traduit: false };
  const images = g.images.map((i) => (i.kind === 'detail' && e.details?.[i.labelBase ?? i.label] ? { ...i, label: e.details[i.labelBase ?? i.label] } : i));
  return {
    ...g,
    name: e.name, designation: e.designation, constellation: e.constellation, subtitle: e.subtitle,
    integration: e.integration ?? g.integration,
    facts: { ...g.facts, ...(e.facts || {}) },
    sections: e.sections,
    images, cover: couverture({ images }),
    traduit: true,
    perime: !!e.source && e.source !== empreinteFiche(g),
  };
});
export const galeriePour = (lang = 'fr') => (lang === 'en' ? galerieAnglaise : galerie);

// ── Carnets ────────────────────────────────────────────────────────────────
// Billets en JSON (ancien blog et billets récents, adresse /AAAA/MM/slug.html, modifiables dans
// le mode édition) + billets en Markdown dans src/content/carnets/.
// Un billet marqué « hidden » (mode édition) n'est pas publié : ni page, ni liste, ni flux.
const enJson = Object.entries(import.meta.glob('../data/carnets/*.json', { eager: true, import: 'default' }))
  .filter(([, p]) => !p.hidden)
  .map(([file, p]) => ({
    ...p,
    date: new Date(p.date),
    url: p.path,
    ancien: p.ancien !== false,
    fichier: file.split('/').pop().replace(/\.json$/, ''),
  }));

const enMarkdown = Object.entries(import.meta.glob('../content/carnets/*.md', { eager: true }))
  .filter(([, m]) => !m.frontmatter.draft)
  .map(([file, m]) => ({
    title: m.frontmatter.title,
    date: new Date(m.frontmatter.date),
    labels: m.frontmatter.labels || [],
    excerpt: m.frontmatter.description || '',
    cover: m.frontmatter.cover || null,
    slug: file.split('/').pop().replace(/\.md$/, ''),
    comments: [],
    compiled: m.compiledContent,
    ancien: false,
  }))
  .map((p) => ({ ...p, url: `/carnets/${p.slug}/` }));

export const carnets = [...enJson, ...enMarkdown].sort((a, b) => b.date - a.date);

const carnetsAnglais = carnets.map((p) => {
  const e = p.fichier && carnetsEn[p.fichier];
  if (!e) return { ...p, traduit: false };
  return { ...p, title: e.title, excerpt: e.excerpt, html: e.html, traduit: true, perime: !!e.source && e.source !== empreinteBillet(p) };
});
export const carnetsPour = (lang = 'fr') => (lang === 'en' ? carnetsAnglais : carnets);

const construireEtiquettes = (liste) => {
  const map = new Map();
  for (const p of liste)
    for (const name of p.labels) {
      const slug = slugify(name);
      if (!slug) continue;
      if (!map.has(slug)) map.set(slug, { slug, name, names: new Set(), posts: [] });
      const t = map.get(slug);
      t.names.add(name);
      t.posts.push(p);
    }
  return [...map.values()]
    .map((t) => ({ ...t, names: [...t.names], url: `/carnets/etiquettes/${t.slug}/` }))
    .sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name, 'fr'));
};
export const etiquettes = construireEtiquettes(carnets);
const etiquettesAnglaises = construireEtiquettes(carnetsAnglais);
export const etiquettesPour = (lang = 'fr') => (lang === 'en' ? etiquettesAnglaises : etiquettes);

export const etiquetteUrl = (name) => `/carnets/etiquettes/${slugify(name)}/`;

export { traducteur };
