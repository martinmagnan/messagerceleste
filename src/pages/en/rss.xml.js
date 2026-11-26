import rss from '@astrojs/rss';
import { SITE, u, galeriePour, carnetsPour, traducteur } from '../../lib/site.js';

const lang = 'en';

export function GET(context) {
  const t = traducteur(lang);
  const items = [
    ...galeriePour(lang).map((g) => ({
      title: `${g.designation} — ${g.name}`,
      link: u(g.url, lang),
      pubDate: g.date,
      description: g.subtitle,
    })),
    ...carnetsPour(lang).map((p) => ({ title: p.title, link: u(p.url, lang), pubDate: p.date, description: p.excerpt })),
  ]
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, 40);

  return rss({
    title: `${SITE.title} · ${t('site.tagline')}`,
    description: t('site.description'),
    site: context.site,
    items,
    customData: '<language>en-ca</language>',
  });
}
