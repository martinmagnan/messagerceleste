#!/usr/bin/env node
// Inscrit dans chaque traduction anglaise l'empreinte du texte français dont elle est tirée
// (champ « source »). Le site s'en sert pour signaler une traduction périmée quand le français
// change. À lancer après avoir créé ou mis à jour des traductions :
//
//   node scripts/sceller-traductions.mjs            scelle les traductions sans empreinte
//   node scripts/sceller-traductions.mjs --tout     rescelle tout (après relecture des traductions)
//
// Les empreintes doivent rester identiques à celles de src/lib/site.js.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOUT = process.argv.includes('--tout');
const empreinte = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const calcul = {
  carnets: (p) => empreinte(p.title + '\n' + p.html),
  galerie: (g) => empreinte(g.name + '\n' + g.subtitle + '\n' + JSON.stringify(g.sections)),
};

for (const type of ['carnets', 'galerie']) {
  const dst = path.join(ROOT, 'src/data', type + '-en');
  let scelles = 0, perimes = 0, total = 0;
  for (const f of (await readdir(dst)).filter((x) => x.endsWith('.json'))) {
    let fr;
    try { fr = JSON.parse(await readFile(path.join(ROOT, 'src/data', type, f), 'utf8')); } catch { console.log(`${type}-en/${f} : pas de source française`); continue; }
    const en = JSON.parse(await readFile(path.join(dst, f), 'utf8'));
    const h = calcul[type](fr);
    total++;
    if (!en.source || TOUT) {
      if (en.source !== h) { en.source = h; await writeFile(path.join(dst, f), JSON.stringify(en, null, 1) + '\n'); scelles++; }
    } else if (en.source !== h) { perimes++; console.log(`périmée : ${type}-en/${f} (le français a changé)`); }
  }
  console.log(`${type} : ${total} traductions, ${scelles} scellée(s), ${perimes} périmée(s)`);
}
