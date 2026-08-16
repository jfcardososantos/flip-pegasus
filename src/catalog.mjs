const stripHtml = (value = '') => value
  .replace(/<[^>]*>/g, ' ')
  .replace(/https?:\/\/[^\s<]+/gi, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
  .replace(/&#8217;/g, "'")
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?])/g, '$1')
  .trim();

const imageFromHtml = (value = '') => {
  const match = value.match(/<img\b[^>]*\b(?:src|data-src)=["']([^"']+)["']/i);
  return match?.[1]?.replace(/&amp;/g, '&') || null;
};

export function normalisePost(post, mediaById = new Map()) {
  const title = stripHtml(post.title?.rendered || 'Sem título');
  // Prioridade: featured_media -> ACF custom field -> imagem no conteúdo
  const featuredImage = mediaById.get(post.featured_media)?.source_url || null;
  const acfImage = post.acf?.poster || post.acf?.imagem_destaque || null;
  const image = featuredImage || acfImage || imageFromHtml(post.content?.rendered);
  
  // Extrai links de download do ACF
  let downloadLinks = [];
  if (post.acf?.download_links && Array.isArray(post.acf.download_links)) {
    downloadLinks = post.acf.download_links
      .filter(link => link?.url)
      .map(link => ({
        url: link.url,
        label: link.label || 'Download',
        quality: link.quality || null,
        language: link.language || null
      }));
  } else if (post.acf?.link_download) {
    downloadLinks = [{ url: post.acf.link_download, label: 'Download', quality: null, language: null }];
  } else if (post.meta?.download_link) {
    downloadLinks = [{ url: post.meta.download_link, label: 'Download', quality: null, language: null }];
  }

  // Tenta extrair titleId (CUSA, PCAS, etc.) da descrição ou do ACF
  const titleIdMatch = `${title}\n${post.excerpt?.rendered || ''}\n${post.content?.rendered || ''}`.match(/\b(?:CUSA|PCAS|PLAS|PPSA)\d{5}\b/i);
  const titleId = titleIdMatch?.[0]?.toUpperCase() || post.acf?.title_id || null;

  return {
    id: `wp-${post.id}`,
    title,
    platform: 'PS4',
    description: stripHtml(post.excerpt?.rendered || post.content?.rendered || ''),
    cover: image,
    downloadLinks,
    titleId,
    source: {
      url: post.link,
      publishedAt: post.date || null,
      updatedAt: post.modified || null
    }
  };
}

function titleIdFrom(game) {
  // Primeiro tenta usar o titleId extraído do normalisePost
  if (game.titleId) return game.titleId;
  // Fallback: extrai da descrição
  const match = `${game.title}\n${game.description}`.match(/\b(?:CUSA|PCAS|PLAS|PPSA)\d{5}\b/i);
  return match?.[0]?.toUpperCase() || null;
}

function packageFromGame(game) {
  const titleId = titleIdFrom(game);
  return {
    ...(titleId ? { titleId } : {}),
    title: game.title,
    downloadLinks: game.downloadLinks || [],
    category: /\b(dlc|add[ -]?on)\b/i.test(game.title) ? 'dlc' : 'game',
    posterUrl: game.cover || null,
    description: game.description,
    downloadSource: null
  };
}

export function makeCatalog(games, name = 'PS4 Catalog') {
  const sorted = [...games].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  return { name, version: 1, packages: sorted.map(packageFromGame) };
}
