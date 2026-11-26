#!/usr/bin/env node
// Construit la galerie à partir des images finales et de leurs fiches .txt.
//
//   node scripts/import-images.mjs [dossier]     (défaut : ../images_finales)
//
// Pour chaque fiche NOM.txt : une entrée src/data/galerie/<slug>.json et des
// versions allégées dans public/galerie/<slug>/ (vignette, web, grande taille).
// Les originaux ne sont jamais copiés dans le site. Réexécutable sans risque :
// seules les images nouvelles ou modifiées sont recalculées.

import { mkdir, writeFile, readFile, readdir, rm, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.argv[2] || path.join(ROOT, '..', 'images_finales'));
const OUT = path.join(ROOT, 'src/data/galerie');
const PUB = path.join(ROOT, 'public/galerie');
const TITRES = JSON.parse(await readFile(path.join(ROOT, 'src/data/galerie-titres.json'), 'utf8'));
const DETAILS = JSON.parse(await readFile(path.join(ROOT, 'src/data/galerie-details.json'), 'utf8'));
const CARTES = JSON.parse(await readFile(path.join(ROOT, 'src/data/galerie-cartes.json'), 'utf8'));
const MENTIONS = JSON.parse(await readFile(path.join(ROOT, 'src/data/galerie-mentions.json'), 'utf8'));

const THUMB = 900, WEB = 2200, LARGE = 4000;
const info = (p) => stat(p).catch(() => null);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isUpper = (l) => /[A-ZÀ-Þ]/.test(l) && !/[a-zà-ÿ]/.test(l);
const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// « LA NÉBULEUSE DU CROISSANT » → « La nébuleuse du croissant » (secours quand
// la fiche n'a pas de titre soigné dans galerie-titres.json).
function sentence(s) {
  const low = s.toLowerCase().replace(/\b(ngc|ic|wr|sh2|lbn|ldn|vdb|m)(?=\s?\d)/g, (m) => m.toUpperCase());
  return low.charAt(0).toUpperCase() + low.slice(1);
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

// « du 26 septembre au 22 novembre 2025 » → 2025-11-22 (date de fin d'acquisition,
// qui sert à classer la galerie).
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function endOfPeriod(s) {
  const all = [...(s || '').matchAll(new RegExp(`(\\d{1,2})(?:er)? (${MOIS.join('|')}) (\\d{4})`, 'g'))];
  const m = all.at(-1);
  return m ? new Date(Date.UTC(+m[3], MOIS.indexOf(m[2]), +m[1], 12)) : null;
}

const KV =/^([^\s:][^:.,]{0,21}?)\s+: (\S.*)$/;

// Convertit le corps d'une section (texte à largeur fixe) en HTML.
function render(lines) {
  const blocks = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim() === '') { if (cur.length) blocks.push(cur); cur = []; } else cur.push(l.replace(/\s+$/, ''));
  }
  if (cur.length) blocks.push(cur);

  const facts = {};
  const html = [];
  const list = (ls) => {
    const items = [];
    for (const l of ls) {
      const m = l.match(/^\s+- (.*)$/);
      if (m) items.push(m[1]); else if (items.length) items[items.length - 1] += ' ' + l.trim();
    }
    return '<ul>' + items.map((i) => `<li>${esc(i)}</li>`).join('') + '</ul>';
  };

  for (const b of blocks) {
    const isItem = (l) => /^\s+- /.test(l);
    if (isItem(b[0])) { html.push(list(b)); continue; }
    if (!/^\s/.test(b[0]) && b.length > 1 && isItem(b[1])) {
      html.push(`<h4>${esc(b[0].trim())}</h4>` + list(b.slice(1)));
      continue;
    }
    if (KV.test(b[0])) {
      const rows = [];
      for (const l of b) {
        const m = l.match(KV);
        if (m && !/^\s/.test(l)) rows.push([m[1].trim(), m[2].trim()]);
        else rows[rows.length - 1][1] += ' ' + l.trim();
      }
      for (const [k, v] of rows) facts[k] = v;
      html.push('<dl>' + rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') + '</dl>');
      continue;
    }
    if (b.length > 1 && b.every((l) => /^\s{2,}\S/.test(l))) {
      const cells = b.map((l) => l.trim().split(/\s{2,}/));
      if (cells.every((c) => c.length === cells[0].length && c.length > 1)) {
        html.push('<div class="tableau"><table><thead><tr>' + cells[0].map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>'
          + cells.slice(1).map((r) => '<tr>' + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      } else {
        html.push(`<pre>${esc(b.join('\n'))}</pre>`);
      }
      continue;
    }
    html.push(`<p>${esc(b.map((l) => l.trim()).join(' '))}</p>`);
  }
  return { html: html.join('\n'), facts };
}

function parse(text, base) {
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  const title = [];
  while (i < lines.length && isUpper(lines[i])) title.push(lines[i++].trim());
  const subtitle = [];
  while (i < lines.length && lines[i].trim() && !/^Fichiers? :/.test(lines[i]) && !/^Auteur :/.test(lines[i])) subtitle.push(lines[i++].trim());
  let filesText = '';
  if (/^Fichiers? :/.test(lines[i] || '')) {
    filesText = lines[i++].replace(/^Fichiers? :/, '');
    while (i < lines.length && /^\s+\S/.test(lines[i])) filesText += ' ' + lines[i++].trim();
  }
  let author = '';
  if (/^Auteur :/.test(lines[i] || '')) author = lines[i++].replace(/^Auteur :/, '').trim();

  const sections = [];
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() && !/^\s/.test(l) && isUpper(l) && (lines[i - 1] ?? '').trim() === '') sections.push({ title: l.trim(), lines: [] });
    else if (sections.length) sections[sections.length - 1].lines.push(l);
  }

  const full = title.join(' ');
  const cm = full.match(/\(([^()]+)\)\s*$/);
  const [des, ...rest] = full.replace(/\s*\([^()]+\)\s*$/, '').split(' — ');
  const o = TITRES[base] || {};
  return {
    designation: o.designation || des.trim(),
    name: o.nom || sentence(rest.join(' — ').trim()),
    constellation: o.constellation || (cm ? titleCase(cm[1]) : ''),
    slug: o.slug || slugify(base),
    subtitle: subtitle.join(' '),
    author,
    files: [...filesText.matchAll(/[\w.-]+\.(?:jpe?g|png|tiff?)/gi)].map((m) => m[0]),
    sections,
  };
}

function label(file, base) {
  const stem = file.replace(/\.[^.]+$/, '');
  const d = stem.match(/_detail(?:_(.+))?$/i);
  if (d) return { kind: 'detail', label: 'Détail : ' + (d[1] || stem.replace(/_detail$/i, '')).replace(/_/g, ' ').replace(/\bcoeur\b/g, 'cœur') };
  const p = stem.match(/(SHO|HOO|HaLRGB|HaRGB|LRGB|RGB)(?:_(v\d+))?$/i);
  return { kind: 'image', label: p ? p[1] + (p[2] ? ' ' + p[2] : '') : stem.replace(/_/g, ' ') };
}

async function derive(srcFile, dir, urlBase) {
  const name = slugify(path.basename(srcFile).replace(/\.[^.]+$/, ''));
  const src = await info(srcFile);
  const img = () => sharp(srcFile, { limitInputPixels: false });
  const { width, height } = await img().metadata();
  const out = { width, height };
  const make = async (key, file, build) => {
    const dst = path.join(dir, file);
    const d = await info(dst);
    if (!d || d.mtimeMs < src.mtimeMs) await build(dst);
    out[key] = `${urlBase}/${file}`;
  };
  await make('thumb', `${name}-${THUMB}.webp`, (dst) => img().resize({ width: Math.min(THUMB, width) }).webp({ quality: 80 }).toFile(dst));
  if (width <= WEB) {
    await make('web', `${name}.jpg`, (dst) => copyFile(srcFile, dst));
    out.large = out.web;
    out.largeWidth = width;
  } else {
    const lw = Math.min(LARGE, width);
    await make('web', `${name}-${WEB}.jpg`, (dst) => img().resize({ width: WEB }).jpeg({ quality: 86, mozjpeg: true }).toFile(dst));
    await make('large', `${name}-${lw}.jpg`, (dst) => img().resize({ width: lw }).jpeg({ quality: 88, mozjpeg: true }).toFile(dst));
    out.largeWidth = lw;
  }
  return out;
}

const fiches = (await readdir(SRC)).filter((f) => f.endsWith('.txt')).sort();
if (!fiches.length) {
  // Garde-fou : sans fiche, on ne touche à rien plutôt que de vider la galerie.
  console.error(`Aucune fiche .txt dans ${SRC} : galerie laissée telle quelle.`);
  process.exit(1);
}

// Agrandi à pleine résolution d'une zone de l'image (galerie-details.json).
async function extrait(srcFile, dir, urlBase, d) {
  const src = await info(srcFile);
  const img = () => sharp(srcFile, { limitInputPixels: false });
  const { width: W, height: H } = await img().metadata();
  const width = Math.min(d.largeur, W), height = Math.min(d.hauteur, H);
  const left = Math.max(0, Math.min(W - width, Math.round(d.cx * W - width / 2)));
  const top = Math.max(0, Math.min(H - height, Math.round(d.cy * H - height / 2)));
  const name = `detail-${slugify(d.nom)}-${left}-${top}-${width}x${height}`;
  const zone = () => img().extract({ left, top, width, height });
  const make = async (file, build) => {
    const dst = path.join(dir, file);
    const st = await info(dst);
    if (!st || st.mtimeMs < src.mtimeMs) await build(dst);
    return `${urlBase}/${file}`;
  };
  const web = await make(`${name}.jpg`, (dst) => zone().jpeg({ quality: 88, mozjpeg: true }).toFile(dst));
  const thumb = await make(`${name}-${THUMB}.webp`, (dst) => zone().resize({ width: Math.min(THUMB, width) }).webp({ quality: 80 }).toFile(dst));
  return { file: null, kind: 'detail', label: 'Détail : ' + d.nom, width, height, thumb, web, large: web, largeWidth: width };
}

await mkdir(OUT, { recursive: true });
for (const f of await readdir(OUT)) if (f.endsWith('.json')) await rm(path.join(OUT, f));
const kept = new Set();
for (const fiche of fiches) {
  const base = fiche.replace(/\.txt$/, '');
  // Publication sur inscription : une fiche absente de galerie-titres.json reste hors ligne.
  if (!TITRES[base] || TITRES[base].publier === false) {
    console.log(`non publiée : ${fiche}` + (TITRES[base] ? ' (publier: false)' : ' (absente de galerie-titres.json)'));
    continue;
  }
  const meta = parse(await readFile(path.join(SRC, fiche), 'utf8'), base);
  const dir = path.join(PUB, meta.slug);
  await mkdir(dir, { recursive: true });
  kept.add(meta.slug);

  const images = [];
  let newest = 0;
  const exclues = TITRES[base]?.exclure || [];
  for (const file of meta.files) {
    if (exclues.includes(file)) continue;
    const srcFile = path.join(SRC, file);
    const st = await info(srcFile);
    if (!st) { console.warn(`  ${fiche} : ${file} introuvable, ignoré`); continue; }
    newest = Math.max(newest, st.mtimeMs);
    images.push({ file, ...label(file, base), ...(await derive(srcFile, dir, `/galerie/${meta.slug}`)) });
  }
  if (!images.length) { console.warn(`${fiche} : aucune image, fiche ignorée`); continue; }
  for (const d of DETAILS[base] || []) {
    const source = d.image || images.find((i) => i.kind === 'image')?.file;
    if (!source || !(await info(path.join(SRC, source)))) { console.warn(`  ${fiche} : image introuvable pour le détail « ${d.nom} »`); continue; }
    images.push(await extrait(path.join(SRC, source), dir, `/galerie/${meta.slug}`, d));
  }

  const facts = {};
  const sections = meta.sections.map((s) => {
    const r = render(s.lines);
    Object.assign(facts, r.facts);
    return { title: s.title.charAt(0) + s.title.slice(1).toLowerCase(), html: r.html };
  });
  // Mentions ajoutées selon le lieu d'acquisition (galerie-mentions.json).
  const description = sections.find((s) => s.title === 'Description') || sections[0];
  for (const m of MENTIONS) {
    if (description && (facts['Lieu'] || '').includes(m.lieu)) description.html += `\n<p>${esc(m.texte)}</p>`;
  }

  // Carte de repérage et image annotée, générées dans PixInsight (scripts/pixinsight/) et rangées
  // à côté des versions allégées. Elles ne sont pas recalculées ici : on signale seulement si
  // l'image source a changé depuis.
  const reperage = {};
  for (const [cle, plein, vignette] of [['annotee', 'annotee.jpg', 'annotee-1100.webp'], ['carte', 'carte-reperage.png', 'carte-reperage-900.webp']]) {
    if (!(await info(path.join(dir, plein))) || !(await info(path.join(dir, vignette)))) continue;
    const m = await sharp(path.join(dir, plein)).metadata();
    reperage[cle] = { full: `/galerie/${meta.slug}/${plein}`, thumb: `/galerie/${meta.slug}/${vignette}`, width: m.width, height: m.height };
  }
  const carte = CARTES[meta.slug];
  if (carte && Object.keys(reperage).length) {
    const st = await info(path.join(SRC, carte.source));
    if (!st || st.mtimeMs > Date.parse(carte.sourceModifiee) + 2000)
      console.warn(`  ${meta.slug} : l'image a changé depuis la carte et l'annotation (${carte.generee}) — à refaire dans PixInsight`);
  }

  // Retire les versions allégées qui ne servent plus (image exclue ou renommée).
  const utiles = new Set([...images.flatMap((i) => [i.thumb, i.web, i.large]), ...Object.values(reperage).flatMap((r) => [r.full, r.thumb])].map((u) => path.basename(u)));
  for (const f of await readdir(dir)) if (!utiles.has(f)) await rm(path.join(dir, f));

  const integ = facts["Temps d'intégration"];
  const total = integ ? (integ.match(/=\s*([\d,.]+\s*h)/) || integ.match(/([\d,.]+\s*h)/) || [])[1] : null;

  const entry = {
    slug: meta.slug,
    source: fiche,
    designation: meta.designation,
    name: meta.name,
    constellation: meta.constellation,
    subtitle: meta.subtitle,
    author: meta.author,
    date: (endOfPeriod(facts['Période']) || new Date(newest)).toISOString(),
    integration: total ? total.replace(/\s+/g, ' ') : null,
    facts,
    images,
    reperage: Object.keys(reperage).length ? reperage : null,
    sections,
  };
  await writeFile(path.join(OUT, `${meta.slug}.json`), JSON.stringify(entry, null, 1) + '\n');
  console.log(`${meta.slug} : ${images.map((i) => i.label).join(', ')}${total ? ' — ' + total : ''}`);
}

// Retire les dossiers d'images dont la fiche a disparu.
for (const d of await readdir(PUB).catch(() => [])) {
  if (!kept.has(d)) { await rm(path.join(PUB, d), { recursive: true }); console.log(`retiré : ${d}`); }
}
