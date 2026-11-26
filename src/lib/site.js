// Données et utilitaires partagés par les pages.

export const SITE = {
  title: 'Messager Céleste',
  tagline: "Carnets d'observations",
  description: 'Une description libre de mes séances de photographie du ciel et un peu plus.',
  author: 'Martin Magnan',
};

// Dépôt GitHub du site (« compte/nom »), utilisé par le mode édition.
export const REPO = import.meta.env.PUBLIC_REPO || 'martinmagnan/messagerceleste';

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Adresse interne, préfixée par la base du site. */
export const u = (p = '/') => (/^([a-z]+:|\/\/|#)/i.test(p) ? p : BASE + (p.startsWith('/') ? p : '/' + p));

/** Préfixe les src/href internes d'un fragment HTML importé. */
export const rebase = (html) => (BASE ? html.replace(/\b(src|href)="\/(?!\/)/g, `$1="${BASE}/`) : html);

export const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const longDate = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeZone: 'America/Toronto' });
const monthYear = new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric', timeZone: 'America/Toronto' });
export const formatDate = (d) => longDate.format(d);
export const formatMonth = (d) => monthYear.format(d);

// ── Galerie ────────────────────────────────────────────────────────────────
export const galerie = Object.values(import.meta.glob('../data/galerie/*.json', { eager: true, import: 'default' }))
  .map((g) => ({ ...g, date: new Date(g.date), url: `/galerie/${g.slug}/`, cover: g.images.find((i) => i.kind === 'image') || g.images[0] }))
  .sort((a, b) => b.date - a.date);

// ── Carnets ────────────────────────────────────────────────────────────────
// Archives Blogger (JSON, adresse d'origine conservée) + nouveaux articles en
// Markdown dans src/content/carnets/.
// Un billet marqué « hidden » (mode édition) n'est pas publié : ni page, ni liste, ni flux.
const anciens = Object.entries(import.meta.glob('../data/carnets/*.json', { eager: true, import: 'default' }))
  .filter(([, p]) => !p.hidden)
  .map(([file, p]) => ({
    ...p,
    date: new Date(p.date),
    url: p.path,
    ancien: true,
    fichier: file.split('/').pop().replace(/\.json$/, ''),
  }));

const nouveaux = Object.entries(import.meta.glob('../content/carnets/*.md', { eager: true }))
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

export const carnets = [...anciens, ...nouveaux].sort((a, b) => b.date - a.date);

export const etiquettes = (() => {
  const map = new Map();
  for (const p of carnets)
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
})();

export const etiquetteUrl = (name) => `/carnets/etiquettes/${slugify(name)}/`;
