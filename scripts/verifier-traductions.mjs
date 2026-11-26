#!/usr/bin/env node
// Vérifie les traductions anglaises (src/data/carnets-en, src/data/galerie-en) :
// fichier présent, JSON valide, champs attendus, et surtout même squelette HTML que le français
// (mêmes balises et mêmes attributs, dans le même ordre : seuls les textes changent).
//
//   node scripts/verifier-traductions.mjs [carnets|galerie] [fichier1 fichier2 ...]
// Sans liste, tous les fichiers du type sont vérifiés. Code de sortie 1 s'il y a un problème.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [type = 'carnets', ...only] = process.argv.slice(2);
const SRC = path.join(ROOT, 'src/data', type);
const DST = path.join(ROOT, 'src/data', type + '-en');
// Le texte des attributs alt et title se traduit : il n'entre pas dans la comparaison.
const squelette = (html) => (html.match(/<[^>]+>/g) || []).map((t) => t.replace(/\b(alt|title)="[^"]*"/g, '$1=""').replace(/\s+/g, ' ')).join('');
const lire = async (p) => JSON.parse(await readFile(p, 'utf8'));
let erreurs = 0, ok = 0;
const fail = (f, m) => { erreurs++; console.log(`✗ ${f} : ${m}`); };

const files = (only.length ? only.map((f) => (f.endsWith('.json') ? f : f + '.json')) : (await readdir(SRC)).filter((f) => f.endsWith('.json'))).sort();
for (const f of files) {
  let fr, en;
  try { fr = await lire(path.join(SRC, f)); } catch { fail(f, 'source française introuvable'); continue; }
  try { en = await lire(path.join(DST, f)); } catch (e) { fail(f, 'traduction absente ou JSON invalide (' + e.message.slice(0, 60) + ')'); continue; }
  const avant = erreurs;
  if (type === 'carnets') {
    for (const k of ['title', 'excerpt', 'html']) if (typeof en[k] !== 'string' || (!en[k].trim() && (fr[k] || '').trim())) fail(f, `champ « ${k} » manquant ou vide`);
    if (typeof en.html === 'string' && squelette(en.html) !== squelette(fr.html)) {
      const a = fr.html.match(/<[^>]+>/g) || [], b = en.html.match(/<[^>]+>/g) || [];
      let i = 0; while (i < a.length && i < b.length && a[i].replace(/\s+/g, ' ') === b[i].replace(/\s+/g, ' ')) i++;
      fail(f, `squelette HTML différent à la balise n° ${i + 1} : attendu ${a[i] ?? '(fin)'} — trouvé ${b[i] ?? '(fin)'} (${a.length} balises attendues, ${b.length} trouvées)`);
    }
  } else {
    for (const k of ['name', 'designation', 'constellation', 'subtitle']) if (typeof en[k] !== 'string' || !en[k].trim()) fail(f, `champ « ${k} » manquant ou vide`);
    if (!Array.isArray(en.sections) || en.sections.length !== fr.sections.length) fail(f, `sections : ${fr.sections.length} attendues`);
    else fr.sections.forEach((s, i) => {
      if (!en.sections[i].title) fail(f, `section ${i + 1} sans titre`);
      if (squelette(en.sections[i].html || '') !== squelette(s.html)) fail(f, `section ${i + 1} (${s.title}) : squelette HTML différent`);
    });
    for (const k of ['Optique', 'Caméra', 'Champ', 'Période']) if (fr.facts[k] && !(en.facts && en.facts[k])) fail(f, `facts["${k}"] manquant`);
    for (const d of fr.images.filter((i) => i.kind === 'detail')) if (!(en.details && en.details[d.label])) fail(f, `details["${d.label}"] manquant`);
  }
  if (erreurs === avant) ok++;
}
console.log(`${ok}/${files.length} traductions conformes` + (erreurs ? ` — ${erreurs} problème(s)` : ''));
process.exit(erreurs ? 1 : 0);
