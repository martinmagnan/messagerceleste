import rss from '@astrojs/rss';
import { SITE, u, galerie, carnets } from '../lib/site.js';

export function GET(context) {
  const items = [
    ...galerie.map((g) => ({
      title: `${g.designation} — ${g.name}`,
      link: u(g.url),
      pubDate: g.date,
      description: g.subtitle,
    })),
    ...carnets.map((p) => ({ title: p.title, link: u(p.url), pubDate: p.date, description: p.excerpt })),
  ]
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, 40);

  return rss({
    title: `${SITE.title} · ${SITE.tagline}`,
    description: SITE.description,
    site: context.site,
    items,
    customData: '<language>fr-ca</language>',
  });
}
