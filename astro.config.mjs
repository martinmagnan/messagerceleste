import { defineConfig } from 'astro/config';

// SITE_BASE sert uniquement à l'aperçu sur <compte>.github.io/messagerceleste ;
// sur le domaine messagerceleste.com le site est servi à la racine.
export default defineConfig({
  site: process.env.SITE_URL || 'https://www.messagerceleste.com',
  base: process.env.SITE_BASE || '/',
  // « preserve » : index.astro → dossier/index.html, autre.astro → autre.html.
  // C'est ce qui permet aux anciens articles de garder /AAAA/MM/slug.html.
  build: { format: 'preserve' },
  trailingSlash: 'ignore',
});
