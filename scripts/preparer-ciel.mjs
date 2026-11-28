#!/usr/bin/env node
// Prépare le fond de la carte du ciel (src/data/ciel.json) à partir des données de d3-celestial
// (© Olaf Frohn, licence BSD-3, https://github.com/ofrohn/d3-celestial) : étoiles jusqu'à la
// magnitude 5, lignes et noms des constellations, Voie lactée. À ne relancer que pour changer le fond.
//
//   npm pack d3-celestial@0.7.35 && tar xzf d3-celestial-0.7.35.tgz
//   node scripts/preparer-ciel.mjs package/data

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('usage : node scripts/preparer-ciel.mjs <dossier data de d3-celestial>'); process.exit(1); }
const lire = (f) => JSON.parse(readFileSync(path.join(src, f), 'utf8'));
const r = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
const pt = ([a, d], n) => [r(a, n), r(d, n)];

// Étoiles : [ascension droite (°, -180..180), déclinaison, magnitude]
const etoiles = lire('stars.6.json').features
  .filter((f) => f.properties.mag <= 5)
  .map((f) => [...pt(f.geometry.coordinates, 2), r(f.properties.mag, 1)]);

const lignes = lire('constellations.lines.json').features
  .map((f) => f.geometry.coordinates.map((l) => l.map((p) => pt(p, 2))));

const noms = lire('constellations.json').features.map((f) => ({
  id: f.id, fr: f.properties.fr, en: f.properties.en, rang: Number(f.properties.rank), pos: pt(f.geometry.coordinates, 1),
}));

// Voie lactée : cinq niveaux de densité ; on allège les tracés (un point sur deux, 1 décimale).
const allege = (anneau) => {
  const out = anneau.filter((_, i) => i % 2 === 0 || i === anneau.length - 1).map((p) => pt(p, 1));
  if (out.length < 4) return null;
  out[out.length - 1] = out[0];
  return out;
};
const voieLactee = lire('mw.json').features.map((f) =>
  f.geometry.coordinates.map((poly) => poly.map(allege).filter(Boolean)).filter((poly) => poly.length));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sortie = path.join(ROOT, 'src/data/ciel.json');
writeFileSync(sortie, JSON.stringify({ source: 'd3-celestial 0.7.35 (© Olaf Frohn, BSD-3)', etoiles, lignes, noms, voieLactee }));
console.log(`${etoiles.length} étoiles, ${lignes.length} constellations, ${noms.length} noms → ${path.relative(ROOT, sortie)}`);
