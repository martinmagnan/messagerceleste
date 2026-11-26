#!/usr/bin/env node
// Contrôle du site construit (dist/) :
//  - chaque article de l'ancien blog existe à son adresse d'origine ;
//  - aucun lien ou image interne ne pointe dans le vide ;
//  - plus aucune image n'est servie depuis Blogger ou Flickr.

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const BASE = (process.env.SITE_BASE || '').replace(/\/$/, '');
const isFile = (p) => stat(p).then((s) => s.isFile(), () => false);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// Résout une adresse comme le fait GitHub Pages.
async function resolves(urlPath) {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  if (BASE && !clean.startsWith(BASE + '/') && clean !== BASE) return false;
  const p = path.join(DIST, clean.slice(BASE.length));
  return (await isFile(p)) || (await isFile(path.join(p, 'index.html'))) || (await isFile(p + '.html'));
}

let errors = 0;
const fail = (msg) => { errors++; console.log('✗ ' + msg); };

const carnetsDir = path.join(ROOT, 'src/data/carnets');
const posts = (await readdir(carnetsDir)).filter((f) => f.endsWith('.json'));
let okPosts = 0, masques = 0;
for (const f of posts) {
  const p = JSON.parse(await readFile(path.join(carnetsDir, f), 'utf8'));
  const present = await isFile(path.join(DIST, p.path));
  if (p.hidden) { masques++; if (present) fail(`article masqué mais publié : ${p.path}`); }
  else present ? okPosts++ : fail(`article absent : ${p.path}`);
}

const pages = (await walk(DIST)).filter((f) => f.endsWith('.html'));
const seen = new Map();
let links = 0, remote = 0;
for (const file of pages) {
  const html = await readFile(file, 'utf8');
  const rel = '/' + path.relative(DIST, file);
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const url = m[1].replace(/&amp;/g, '&');
    if (/^(https?:)?\/\//.test(url) || /^(mailto:|#|data:|javascript:)/.test(url)) continue;
    const abs = url.startsWith('/') ? url : path.posix.join(path.posix.dirname(rel), url);
    links++;
    if (!seen.has(abs)) seen.set(abs, await resolves(abs));
    if (!seen.get(abs)) fail(`${rel} → ${url}`);
  }
  for (const m of html.matchAll(/<img[^>]+src="(https?:\/\/[^"]*(?:flickr\.com|blogger\.googleusercontent\.com|blogspot\.com|ggpht\.com)[^"]*)"/g)) {
    remote++;
    fail(`${rel} : image encore distante ${m[1]}`);
  }
  for (const m of html.matchAll(/\b(?:src|srcset)="http:\/\/[^"]+"/g)) fail(`${rel} : ressource non sécurisée ${m[0]}`);
}

console.log(`${okPosts}/${posts.length - masques} anciens articles à leur adresse d'origine` + (masques ? ` (${masques} masqué(s), non publié(s))` : ''));
console.log(`${pages.length} pages, ${links} liens internes vérifiés (${seen.size} cibles distinctes)`);
console.log(`${remote} image(s) encore servie(s) par Blogger/Flickr`);
console.log(errors ? `\n${errors} problème(s)` : '\nTout est en ordre.');
process.exit(errors ? 1 : 0);
