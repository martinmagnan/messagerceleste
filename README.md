# Messager Céleste

Site statique de [messagerceleste.com](https://www.messagerceleste.com) : une galerie d'astrophotographie et des carnets d'observation. Construit avec [Astro](https://astro.build), publié sur GitHub Pages à chaque `git push`.

## Au quotidien

### Ajouter ou mettre à jour une image de la galerie

1. Déposer l'image finale et sa fiche `.txt` dans `../images_finales/` (même format que les fiches existantes : titre en majuscules, ligne `Fichier :`, sections `DESCRIPTION`, `ACQUISITION`, `IMAGE FINALE`, `TRAITEMENT`).
2. Inscrire la fiche dans `src/data/galerie-titres.json` (adresse et titre soigné). **Seules les fiches inscrites sont publiées** : une image déposée dans `images_finales/` reste hors ligne tant qu'elle n'y figure pas, et `"publier": false` retire une image de la galerie.
3. Lancer :

   ```bash
   npm run import:images
   ```

   Le script crée les versions allégées (vignette, 2200 px, 4000 px) dans `public/galerie/` et la fiche dans `src/data/galerie/`. Les originaux ne sont jamais copiés dans le dépôt.

### Ajouter des agrandis à une image

Chaque fiche peut montrer de 1 à 4 agrandis à pleine résolution. Ils sont décrits dans `src/data/galerie-details.json` : pour chaque fiche, une liste de zones avec un nom, le centre de la zone en fraction de l'image (`cx`, `cy`, de 0 à 1) et sa taille en pixels (`largeur`, `hauteur`). `npm run import:images` découpe ces zones dans l'image d'origine ; si l'image est retraitée avec le même cadrage, les agrandis se refont tout seuls. Les extraits listés dans la fiche `.txt` elle-même (`NOM_detail_xxx.jpg`) sont repris aussi.

### Carte de repérage et image annotée

Chaque fiche montre une image annotée (script AnnotateImage) et une carte de repérage (processus FindingChart). Elles sont faites dans PixInsight, sur le Mac, par deux scripts gardés dans `scripts/pixinsight/` :

1. `carte_solve.js` ouvre la version 2200 px de chaque image (`public/galerie/<slug>/…-2200.jpg`, à copier dans le dossier d'entrée indiqué en tête du script), en résout l'astrométrie à partir du centre et de la taille du champ inscrits dans la liste `CIBLES`, enregistre l'image résolue et produit la carte.
2. `carte_annot.js` annote les images résolues avec les réglages retenus (variante `H`, décrite dans le script).

Les résultats se rangent dans `public/galerie/<slug>/` sous les noms `annotee.jpg`, `annotee-1100.webp`, `carte-reperage.png` et `carte-reperage-900.webp`, et `src/data/galerie-cartes.json` note l'image source de chacun. Quand une image est retraitée, `npm run import:images` signale que sa carte et son annotation sont à refaire.

### Écrire un nouveau carnet

Créer un fichier Markdown dans `src/content/carnets/`, par exemple `premiere-lumiere-texas.md` :

```markdown
---
title: Première lumière au Texas
date: 2026-12-01
labels: [Technique, SharpStar 94EDPH]
description: Une phrase de résumé, affichée dans les listes.
cover: /galerie/wr134/wr134-sho-900.webp
---

Le texte de l'article, en Markdown.
```

L'article paraît à l'adresse `/carnets/premiere-lumiere-texas/`. Ajouter `draft: true` pour le garder hors ligne.

### Modifier ou masquer un billet ou une image depuis le site

Le site a un mode édition à l'adresse `/edition/` (lien « Édition » en pied de page). Il permet de modifier le titre, la date, les étiquettes et le texte d'un billet, d'y ajouter une image, et de le masquer ou de le rendre visible. Une fois connecté, un lien « Modifier ce billet » apparaît aussi sur chaque billet.

L'onglet **Images** du mode édition fait la même chose pour la galerie : désignation, nom, constellation, sous-titre, textes des sections, libellé des agrandis, et cases pour masquer un agrandi ou l'image entière. Comme les fiches de la galerie sont régénérées par `npm run import:images`, ces changements sont rangés à part, dans `src/data/galerie-modifs/<image>.json`, et se superposent à la fiche générée : rien n'est perdu quand la galerie est régénérée. Les fichiers d'images eux-mêmes ne se changent pas depuis le site.

Chaque enregistrement est un commit dans ce dépôt ; le site se met à jour tout seul en une minute environ. Avant de reprendre le travail en local, faire `git pull`.

La connexion se fait avec un jeton d'accès GitHub, à créer une fois :

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
2. Repository access : « Only select repositories », choisir `messagerceleste`.
3. Repository permissions → Contents : « Read and write ».

Le jeton reste dans le navigateur de l'appareil et n'est envoyé qu'à GitHub. Un billet masqué (`"hidden": true` dans son fichier) n'est plus publié sur le site, mais son texte reste lisible dans ce dépôt, qui est public.

### Le site en deux langues

Le français est la langue d'origine et garde les adresses habituelles. L'anglais vit sous `/en/` (mêmes adresses, précédées de `/en`), et un bouton dans l'en-tête passe d'une langue à l'autre sur la même page.

- Les textes d'interface sont dans `src/lib/i18n.js`, les étiquettes dans `src/data/etiquettes-en.json`.
- Les traductions du contenu sont dans `src/data/carnets-en/` (titre, extrait, texte) et `src/data/galerie-en/` (nom, sous-titre, sections, agrandis), un fichier par billet ou par image, du même nom que le fichier français.
- Chaque traduction porte l'empreinte du texte français dont elle est tirée. Si le français change (mode édition, fiche retraitée), la page anglaise signale que la traduction est en retard ; un billet ou une image sans traduction s'affiche en français.
- Après avoir ajouté ou corrigé des traductions : `node scripts/verifier-traductions.mjs carnets` (ou `galerie`) vérifie que la mise en forme est identique au français, puis `node scripts/sceller-traductions.mjs` inscrit les empreintes (`--tout` pour tout resceller après relecture).

### Voir et publier

```bash
npm run dev      # aperçu local sur http://localhost:4321
npm run build    # construit le site dans dist/
npm run check    # vérifie les liens et les anciennes adresses
git add -A && git commit -m "…" && git push   # publie
```

## Organisation

| Dossier | Contenu |
| --- | --- |
| `src/data/carnets/` | Les 89 articles de l'ancien blog Blogger (2007–2011), un fichier JSON par article |
| `src/content/carnets/` | Les nouveaux carnets, en Markdown |
| `src/data/galerie/` | Les fiches de la galerie, générées par `import:images` |
| `public/archives/img/` | Les images des anciens articles, copiées depuis Blogger et Flickr |
| `public/galerie/` | Les versions allégées des images de la galerie |
| `src/pages/` | Les pages du site |
| `scripts/` | Imports et contrôle |

## Anciennes adresses

Les articles de l'ancien blog gardent leur adresse d'origine (`/AAAA/MM/slug.html`), ce qui évite de casser les liens existants. Les adresses d'archives et d'étiquettes de Blogger (`/2008_01_01_archive.html`, `/search/label/Messier`) redirigent vers les pages équivalentes.

`npm run import:blog` a servi à la migration initiale. Il n'a pas à être relancé : il relit le flux public du blog, qui n'est plus à cette adresse depuis la bascule du domaine.
