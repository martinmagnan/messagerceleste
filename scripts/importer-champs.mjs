#!/usr/bin/env node
// Remplace les champs de src/data/galerie-champs.json par les contours exacts mesurés dans PixInsight.
//
// 1. Sur le Mac, dans la console de PixInsight :
//      run "/Volumes/Cassini/PixInsight_claude/champs_galerie.js"
//    (copie de scripts/pixinsight/champs_galerie.js ; lit les images résolues par carte_solve.js
//    dans /Volumes/AstroWire/PixInsight_Processing/_site_cartes et écrit champs_galerie.json sur Cassini).
// 2. Ici : node scripts/importer-champs.mjs [/Volumes/Cassini/PixInsight_claude/champs_galerie.json]

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entree = process.argv[2] || '/Volumes/Cassini/PixInsight_claude/champs_galerie.json';
const sortie = path.join(ROOT, 'src/data/galerie-champs.json');
const { champs: mesures } = JSON.parse(readFileSync(entree, 'utf8'));
const actuels = JSON.parse(readFileSync(sortie, 'utf8'));

// PixInsight nomme les images « c_<slug avec _ à la place des tirets> ».
const slugs = readdirSync(path.join(ROOT, 'src/data/galerie')).map((f) => f.replace(/\.json$/, ''));
const parCle = Object.fromEntries(slugs.map((s) => [s.replace(/[^A-Za-z0-9]/g, '_'), s]));

let n = 0;
for (const [cle, m] of Object.entries(mesures)) {
  const slug = parCle[cle];
  if (!slug) { console.log(`? ${cle} : aucune fiche de ce nom`); continue; }
  actuels[slug] = { centre: m.centre, coins: m.coins, contour: m.contour };
  n++;
}
const restants = slugs.filter((s) => actuels[s]?.provisoire);
writeFileSync(sortie, JSON.stringify(actuels, null, 1) + '\n');
console.log(`${n} champs exacts importés.` + (restants.length ? ` Encore provisoires : ${restants.join(', ')}` : ''));
