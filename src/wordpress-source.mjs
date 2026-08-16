import { normalisePost } from './catalog.mjs';

function apiUrl(base, path, params = {}) {
  const url = new URL(`/wp-json/wp/v2/${path}`, base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
}

async function requestJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'ps4-catalog-service/1.0' },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        const error = new Error(`Fonte respondeu ${response.status} em ${url}`);
        error.retryAfterMs = Number(response.headers.get('retry-after') || 0) * 1_000;
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const waitMs = error.retryAfterMs || attempt * 5_000;
        console.warn(`⚠️ Tentativa ${attempt}/${attempts} falhou em ${url}; aguardando ${Math.ceil(waitMs / 1_000)}s.`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastError;
}

// Campos padrão + campos ACF (se existirem)
const postFields = 'id,date,modified,link,title,excerpt,content,featured_media,_embedded,acf,meta';

export async function fetchWordpressCatalog({ baseUrl, categorySlug, perPage, pageConcurrency = 4, onProgress }) {
  if (!baseUrl) throw new Error('SOURCE_BASE_URL não foi configurada.');
  const categoryResponse = await requestJson(apiUrl(baseUrl, 'categories', { slug: categorySlug, per_page: 100 }));
  const categories = await categoryResponse.json();
  if (!categories.length) throw new Error(`Categoria WordPress não encontrada: ${categorySlug}`);

  const categoryId = categories[0].id;
  const first = await requestJson(apiUrl(baseUrl, 'posts', {
    categories: categoryId, per_page: Math.min(perPage, 100), page: 1, _embed: true, _fields: postFields
  }));
  const totalPages = Number(first.headers.get('x-wp-totalpages') || 1);
  const pages = [await first.json()];
  let gamesFetched = pages[0].length;
  await onProgress?.({ totalPages, pagesFetched: 1, gamesFetched });
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  const concurrency = Math.max(1, Math.min(Number(pageConcurrency) || 1, 10));
  for (let index = 0; index < pageNumbers.length; index += concurrency) {
    const batch = pageNumbers.slice(index, index + concurrency);
    const results = await Promise.all(batch.map(async (page) => {
      const response = await requestJson(apiUrl(baseUrl, 'posts', {
        categories: categoryId, per_page: Math.min(perPage, 100), page, _embed: true, _fields: postFields
      }));
      return response.json();
    }));
    pages.push(...results);
    gamesFetched += results.reduce((total, posts) => total + posts.length, 0);
    await onProgress?.({
      totalPages,
      pagesFetched: Math.min(index + concurrency + 1, totalPages),
      gamesFetched
    });
  }

  const games = pages.flat().map((post) => {
    const embeddedMedia = post._embedded?.['wp:featuredmedia']?.[0];
    const media = new Map(embeddedMedia ? [[post.featured_media, embeddedMedia]] : []);
    return normalisePost(post, media);
  });
  return { games };
}
