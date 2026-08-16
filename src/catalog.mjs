import { createHash } from 'node:crypto';

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

export function makeCatalog(games, sourceUrl) {
  const sorted = [...games].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  const generatedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    platform: 'PS4',
    generatedAt,
    source: sourceUrl,
    count: sorted.length,
    games: sorted
  };
  const digestInput = JSON.stringify({ ...payload, generatedAt: undefined });
  return { ...payload, checksum: createHash('sha256').update(digestInput).digest('hex') };
}
