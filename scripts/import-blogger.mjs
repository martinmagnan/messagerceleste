#!/usr/bin/env node
// Importe l'ancien blog Blogger vers src/data/carnets/*.json et public/archives/img/.
//
//   node scripts/import-blogger.mjs            réutilise archive/blogger-*.json s'ils existent
//   node scripts/import-blogger.mjs --refresh  relit le flux public du blog
//
// Chaque article garde son adresse d'origine (/AAAA/MM/slug.html) et son HTML,
// nettoyé des styles Blogger. Les images sont copiées localement.

import { mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = process.env.BLOG_ORIGIN || 'http://www.messagerceleste.com';
const RAW = path.join(ROOT, 'archive');
const OUT = path.join(ROOT, 'src/data/carnets');
const IMG = path.join(ROOT, 'public/archives/img');
const IMG_URL = '/archives/img';
const DISPLAY_MAX = 1600;
const REFRESH = process.argv.includes('--refresh');

const exists = (p) => stat(p).then(() => true, () => false);

async function feed(name, url) {
  const file = path.join(RAW, `blogger-${name}.json`);
  if (!REFRESH && (await exists(file))) return JSON.parse(await readFile(file, 'utf8'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const json = await res.json();
  await mkdir(RAW, { recursive: true });
  await writeFile(file, JSON.stringify(json, null, 1));
  return json;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)(\?.*)?$/i;
const BLOGGER_HOST = /(blogger\.googleusercontent\.com|\.bp\.blogspot\.com|\.ggpht\.com)/i;
const isImageUrl = (u) => IMAGE_EXT.test(u) || (BLOGGER_HOST.test(u) && /\/s\d+(-[a-z0-9]+)*\//.test(u));

// Blogger sert plusieurs tailles de la même image : on prend l'originale.
function bestUrl(u) {
  if (u.startsWith('//')) u = 'https:' + u;
  if (BLOGGER_HOST.test(u)) return u.replace(/\/s\d+(-[a-z0-9]+)*\//, '/s0/');
  return u;
}

const downloads = new Map(); // url d'origine → { full, display } | null
let failed = [];

async function localize(url) {
  const src = bestUrl(url);
  if (downloads.has(src)) return downloads.get(src);
  const p = (async () => {
    const hash = createHash('sha1').update(src).digest('hex').slice(0, 8);
    let base = decodeURIComponent(path.basename(new URL(src).pathname))
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    if (!IMAGE_EXT.test(base)) base += '.jpg';
    const name = `${hash}-${base}`.toLowerCase();
    const file = path.join(IMG, name);
    if (!(await exists(file))) {
      const res = await fetch(src, { redirect: 'follow' });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) {
        failed.push(`${src} (HTTP ${res.status}, ${type})`);
        return null;
      }
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
    }
    const out = { full: `${IMG_URL}/${name}`, display: `${IMG_URL}/${name}` };
    try {
      const meta = await sharp(file, { limitInputPixels: false }).metadata();
      out.width = meta.width;
      out.height = meta.height;
      if (meta.format !== 'gif' && meta.width > DISPLAY_MAX) {
        const small = name.replace(/\.[^.]+$/, '') + `.${DISPLAY_MAX}.jpg`;
        if (!(await exists(path.join(IMG, small)))) {
          await sharp(file, { limitInputPixels: false })
            .resize({ width: DISPLAY_MAX }).jpeg({ quality: 86, mozjpeg: true })
            .toFile(path.join(IMG, small));
        }
        out.display = `${IMG_URL}/${small}`;
      }
    } catch {
      /* format non lu par sharp : on sert le fichier tel quel */
    }
    return out;
  })().catch((e) => { failed.push(`${src} (${e.cause?.code || e.message})`); return null; });
  downloads.set(src, p);
  return p;
}

const internal = (href) => href.replace(/^https?:\/\/(www\.)?messagerceleste\.com/i, '') || '/';

async function clean(html) {
  const $ = cheerio.load(html, null, false);
  $('script, style, link, meta').remove();

  // Images : copie locale, attributs Blogger retirés.
  for (const el of $('img').toArray()) {
    const $el = $(el);
    const src = $el.attr('src');
    if (!src) { $el.remove(); continue; }
    if (/\/(icon18_|img\/blank\.gif)/.test(src)) { $el.remove(); continue; }
    const local = await localize(src);
    for (const a of ['width', 'height', 'border', 'style', 'id', 'class', 'data-original-width', 'data-original-height', 'hspace', 'vspace', 'align'])
      $el.removeAttr(a);
    if (local) {
      $el.attr('src', local.display);
      if (local.width) { $el.attr('width', String(Math.min(local.width, DISPLAY_MAX))); $el.attr('height', String(Math.round(local.height * Math.min(local.width, DISPLAY_MAX) / local.width))); }
      $el.attr('data-full', local.full);
    } else {
      // Image disparue à la source : on la retire plutôt que d'afficher une icône cassée.
      const parent = $el.parent('a');
      $el.remove();
      if (parent.length && !parent.text().trim() && !parent.children().length) parent.remove();
      continue;
    }
    $el.attr('loading', 'lazy');
    if ($el.attr('alt') === undefined) $el.attr('alt', '');
  }

  // Liens : images agrandies en local, liens internes relatifs.
  for (const el of $('a').toArray()) {
    const $el = $(el);
    for (const a of ['imageanchor', 'onblur', 'onclick', 'target', 'rel']) $el.removeAttr(a);
    let href = $el.attr('href');
    if (!href) continue;
    if (/^https?:\/\/(www\.)?messagerceleste\.com/i.test(href)) { $el.attr('href', internal(href)); continue; }
    const img = $el.find('img').first();
    if (img.length && img.attr('data-full') && (isImageUrl(href) || BLOGGER_HOST.test(href))) {
      $el.attr('href', img.attr('data-full'));
    } else if (isImageUrl(href) && BLOGGER_HOST.test(href)) {
      const local = await localize(href);
      if (local) $el.attr('href', local.full);
    }
  }
  $('img').removeAttr('data-full');

  // Styles en ligne → quelques classes sobres.
  for (const el of $('[style]').toArray()) {
    const $el = $(el);
    const style = ($el.attr('style') || '').toLowerCase();
    $el.removeAttr('style');
    if (/text-align:\s*center/.test(style)) $el.addClass('centre');
    if (/float:\s*left/.test(style)) $el.addClass('flotte-g');
    if (/float:\s*right/.test(style)) $el.addClass('flotte-d');
    if (/font-weight:\s*bold/.test(style)) $el.addClass('gras');
    if (/font-style:\s*italic/.test(style)) $el.addClass('italique');
  }
  $('[class]').each((_, el) => {
    const keep = ($(el).attr('class') || '').split(/\s+/)
      .filter((c) => ['centre', 'flotte-g', 'flotte-d', 'gras', 'italique', 'tr-caption', 'tr-caption-container'].includes(c));
    keep.length ? $(el).attr('class', keep.join(' ')) : $(el).removeAttr('class');
  });
  for (const a of ['id', 'align', 'bgcolor', 'color', 'face', 'size', 'cellpadding', 'cellspacing', 'border', 'lang', 'dir', 'trbidi'])
    $(`[${a}]`).removeAttr(a);
  $('font').each((_, el) => $(el).replaceWith($(el).contents()));
  $('span').each((_, el) => { if (!Object.keys(el.attribs || {}).length) $(el).replaceWith($(el).contents()); });

  $('iframe, embed').each((_, el) => {
    const s = $(el).attr('src');
    if (s) $(el).attr('src', s.replace(/^http:\/\//, 'https://').replace(/^\/\//, 'https://'));
    $(el).attr('loading', 'lazy');
  });

  const text = $.root().text().replace(/\s+/g, ' ').trim();
  const cover = $('img').first().attr('src') || null;
  return { html: $.html().trim(), text, cover };
}

function excerpt(text, max = 220) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 120)).replace(/[\s,;:.]+$/, '') + '…';
}

const posts = (await feed('posts', `${ORIGIN}/feeds/posts/default?alt=json&max-results=500`)).feed.entry || [];
const comments = (await feed('comments', `${ORIGIN}/feeds/comments/default?alt=json&max-results=500`)).feed.entry || [];

await mkdir(OUT, { recursive: true });
await mkdir(IMG, { recursive: true });
for (const f of await readdir(OUT)) if (f.endsWith('.json')) await rm(path.join(OUT, f));

const commentsByPost = new Map();
for (const c of comments) {
  const ref = c['thr$in-reply-to']?.href || c.link?.find((l) => l.rel === 'alternate')?.href || '';
  const key = new URL(ref, ORIGIN).pathname;
  const { html } = await clean(c.content?.$t || c.summary?.$t || '');
  if (!commentsByPost.has(key)) commentsByPost.set(key, []);
  commentsByPost.get(key).push({ author: c.author?.[0]?.name?.$t || 'Anonyme', date: c.published.$t, html });
}

let n = 0;
for (const e of posts) {
  const url = e.link.find((l) => l.rel === 'alternate').href;
  const pathname = new URL(url).pathname; // /2011/11/messier-33.html
  const m = pathname.match(/^\/(\d{4})\/(\d{2})\/(.+)\.html$/);
  if (!m) { console.warn('adresse inattendue, ignorée :', url); continue; }
  const [, year, month, slug] = m;
  const { html, text, cover } = await clean(e.content.$t);
  const post = {
    title: e.title.$t.trim() || '(sans titre)',
    date: e.published.$t,
    updated: e.updated.$t,
    year, month, slug,
    path: pathname,
    labels: (e.category || []).map((c) => c.term).sort((a, b) => a.localeCompare(b, 'fr')),
    excerpt: excerpt(text),
    cover,
    comments: (commentsByPost.get(pathname) || []).sort((a, b) => a.date.localeCompare(b.date)),
    html,
  };
  await writeFile(path.join(OUT, `${year}-${month}-${slug}.json`), JSON.stringify(post, null, 1) + '\n');
  n++;
}

const done = (await Promise.all(downloads.values())).filter(Boolean);
console.log(`${n} articles, ${comments.length} commentaires, ${done.length} images locales`);
if (failed.length) console.log(`${failed.length} image(s) non récupérée(s), retirée(s) des articles (déjà disparues à la source) :\n  ` + failed.join('\n  '));
