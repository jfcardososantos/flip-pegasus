import { normalisePost } from './catalog.mjs';

function apiUrl(base, path, params = {}) {
  const url = new URL(`/wp-json/wp/v2/${path}`, base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'ps4-catalog-service/1.0' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`Fonte respondeu ${response.status} em ${url}`);
  return response;
}

export async function fetchWordpressCatalog({ baseUrl, categorySlug, perPage }) {
  if (!baseUrl) throw new Error('SOURCE_BASE_URL não foi configurada.');
  const categoryResponse = await requestJson(apiUrl(baseUrl, 'categories', { slug: categorySlug, per_page: 100 }));
  const categories = await categoryResponse.json();
  if (!categories.length) throw new Error(`Categoria WordPress não encontrada: ${categorySlug}`);

  const categoryId = categories[0].id;
  const first = await requestJson(apiUrl(baseUrl, 'posts', {
    categories: categoryId, per_page: Math.min(perPage, 100), page: 1, _embed: true
  }));
  const totalPages = Number(first.headers.get('x-wp-totalpages') || 1);
  const pages = [await first.json()];
  for (let page = 2; page <= totalPages; page += 1) {
    const response = await requestJson(apiUrl(baseUrl, 'posts', {
      categories: categoryId, per_page: Math.min(perPage, 100), page, _embed: true
    }));
    pages.push(await response.json());
  }

  const games = pages.flat().map((post) => {
    const embeddedMedia = post._embedded?.['wp:featuredmedia']?.[0];
    const media = new Map(embeddedMedia ? [[post.featured_media, embeddedMedia]] : []);
    return normalisePost(post, media);
  });
  return { games, sourceUrl: new URL(`/category/${categorySlug}/`, baseUrl).toString() };
}
