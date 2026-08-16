const stripHtml = (value = '') => value
  .replace(/<[^>]*>/g, ' ')
  .replace(/https?:\/\/[^\s<]+/gi, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#8217;/g, "'")
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?])/g, '$1')
  .trim();

export function normalisePost(post, mediaById = new Map()) {
  const title = stripHtml(post.title?.rendered || 'Sem título');
  const image = mediaById.get(post.featured_media)?.source_url || null;
  return {
    id: `wp-${post.id}`,
    title,
    platform: 'PS4',
    description: stripHtml(post.excerpt?.rendered || post.content?.rendered || ''),
    cover: image,
    source: {
      url: post.link,
      publishedAt: post.date || null,
      updatedAt: post.modified || null
    }
  };
}

function titleIdFrom(game) {
  const match = `${game.title}\n${game.description}`.match(/\b(?:CUSA|PCAS|PLAS|PPSA)\d{5}\b/i);
  return match?.[0].toUpperCase();
}

function packageFromGame(game) {
  const titleId = titleIdFrom(game);
  return {
    ...(titleId ? { titleId } : {}),
    title: game.title,
    downloadLinks: [],
    category: /\b(dlc|add[ -]?on)\b/i.test(game.title) ? 'dlc' : 'game',
    posterUrl: game.cover,
    description: game.description,
    downloadSource: null
  };
}

export function makeCatalog(games, name = 'PS4 Catalog') {
  const sorted = [...games].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  return { name, version: 1, packages: sorted.map(packageFromGame) };
}
