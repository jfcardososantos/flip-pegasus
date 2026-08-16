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

function normaliseHttpUrl(value, baseUrl) {
  if (!value) return null;
  try {
    const url = new URL(value.replace(/&amp;/g, '&'), baseUrl);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function extractLinksFromHtml(html = '', baseUrl) {
  const doc = new JSDOM(html).window.document;
  const links = [];
  const seen = new Set();
  const add = (rawUrl, name) => {
    const url = normaliseHttpUrl(rawUrl, baseUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ name: name?.replace(/\s+/g, ' ').trim() || 'Download', url });
  };

  // Não há whitelist de domínios: qualquer URL HTTP/HTTPS publicada no post
  // é incluída, inclusive botões que usam atributos data-*.
  doc.querySelectorAll('a[href], iframe[src], [data-url], [data-href], [data-link], [data-download]').forEach((element) => {
    const rawUrl = element.getAttribute('href') || element.getAttribute('src') || element.getAttribute('data-url') || element.getAttribute('data-href') || element.getAttribute('data-link') || element.getAttribute('data-download');
    const name = element.textContent || element.getAttribute('aria-label') || element.getAttribute('title');
    add(rawUrl, name);
  });

  (doc.body.textContent.match(/https?:\/\/[^\s"'<>]+/gi) || []).forEach((url) => add(url, url));
  return links;
}

export function normalisePost(post, mediaById = new Map()) {
  const title = stripHtml(post.title?.rendered || 'Sem título');
  // Prioridade: featured_media -> ACF custom field -> imagem no conteúdo
  const featuredImage = mediaById.get(post.featured_media)?.source_url || null;
  const acfImage = post.acf?.poster || post.acf?.imagem_destaque || null;
  const image = featuredImage || acfImage || imageFromHtml(post.content?.rendered);
  
  // Mantém os links de ACF e também todos os links presentes no HTML do post.
  // A API do DLPSGame não expõe esses botões como ACF, por isso o HTML é
  // essencial quando a fonte estiver no modo WordPress.
  let acfLinks = [];
  if (post.acf?.download_links && Array.isArray(post.acf.download_links)) {
    acfLinks = post.acf.download_links
      .filter(link => link?.url)
      .map(link => ({
        url: link.url,
        name: link.name || link.label || 'Download'
      }));
  } else if (post.acf?.link_download) {
    acfLinks = [{ url: post.acf.link_download, name: 'Download' }];
  } else if (post.meta?.download_link) {
    acfLinks = [{ url: post.meta.download_link, name: 'Download' }];
  }
  const downloadLinks = [...acfLinks, ...extractLinksFromHtml(post.content?.rendered, post.link)]
    .filter((link, index, links) => link?.url && links.findIndex((candidate) => candidate.url === link.url) === index);

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
    downloadSource: game.source?.url || null
  };
}

export function makeCatalog(games, name = 'PS4 Catalog') {
  const sorted = [...games].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  return { name, version: 1, packages: sorted.map(packageFromGame) };
}
import { JSDOM } from 'jsdom';
