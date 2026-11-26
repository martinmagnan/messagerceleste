# Messager Céleste

Site statique de [messagerceleste.com](https://www.messagerceleste.com) : une galerie d'astrophotographie et des carnets d'observation. Construit avec [Astro](https://astro.build), publié sur GitHub Pages à chaque `git push`.

## Au quotidien

### Ajouter ou mettre à jour une image de la galerie

1. Déposer l'image finale et sa fiche `.txt` dans `../images_finales/` (même format que les fiches existantes : titre en majuscules, ligne `Fichier :`, sections `DESCRIPTION`, `ACQUISITION`, `IMAGE FINALE`, `TRAITEMENT`).
2. Facultatif : ajouter une entrée dans `src/data/galerie-titres.json` pour choisir l'adresse et un titre soigné. Sans entrée, le titre et l'adresse sont déduits de la fiche.
3. Lancer :

   ```bash
   npm run import:images
   ```

   Le script crée les versions allégées (vignette, 2200 px, 4000 px) dans `public/galerie/` et la fiche dans `src/data/galerie/`. Les originaux ne sont jamais copiés dans le dépôt.

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
