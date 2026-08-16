import { JSDOM } from 'jsdom';
import { makeCatalog } from './catalog.mjs';
import { fetchWordpressCatalog } from './wordpress-source.mjs';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchHtml(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ao acessar ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.warn(`⚠️ Tentativa ${attempt}/${attempts} falhou em ${url}; tentando novamente.`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw lastError;
}

function extractPostId(url) {
  const match = url.match(/\/([^\/]+)\/$/);
  return match?.[1] || null;
}

function extractTitleId(description) {
  const match = description.match(/\b(CUSA|PCAS|PLAS|PPSA)\d{5}\b/i);
  return match?.[0]?.toUpperCase() || null;
}

function normaliseHttpUrl(value, baseUrl) {
  if (!value || value.startsWith('#') || value.startsWith('javascript:')) return null;
  try {
    const url = new URL(value, baseUrl);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function nameForDownloadLink(link, fallbackUrl) {
  // Sites desse formato frequentemente colocam a descrição (região, versão e
  // parte) no parágrafo/linha que contém o botão, e deixam no <a> apenas o
  // nome do provedor. Mantemos a descrição completa quando ela existe.
  const container = link?.closest?.('p, li, tr, .download, .su-spoiler-content, .su-spoiler') || link;
  const anchorText = link?.textContent?.replace(/\s+/g, ' ').trim();
  let text = container?.textContent?.replace(/\s+/g, ' ').trim();
  if (text && container !== link && /^(?:link|download|clique aqui)$/i.test(anchorText || '')) {
    text = text.replace(/\s+(?:link|download|clique aqui)$/i, '').trim();
  }
  if (text) return text;

  try { return `Download - ${new URL(fallbackUrl).hostname}`; }
  catch { return 'Download'; }
}

export function parseDlpsgamePostHtml(html, postUrl) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Título
  const titleEl = doc.querySelector('h1.entry-title, h1.post-title, h1.title');
  const title = titleEl?.textContent?.trim() || 'Sem título';

  // Imagem destacada
  const imgEl = doc.querySelector('.entry-content img, .post-body img, .post-content img');
  const cover = imgEl?.getAttribute('src') || null;

  // Descrição (excerpt)
  const descEl = doc.querySelector('.entry-content p, .post-body p, .post-content p');
  let description = descEl?.textContent?.trim() || '';
  if (description.length > 500) description = description.substring(0, 500) + '...';

  // Todo link HTTP/HTTPS publicado dentro do conteúdo entra no catálogo. Isso
  // cobre hosts novos, redirecionamentos internos, botões e URLs em data-* sem
  // precisar manter uma lista de provedores conhecidos.
  const downloadLinks = [];
  const seenUrls = new Set();
  const content = doc.querySelector('.entry-content, .post-body, .post-content, article, main') || doc.body;
  const addDownloadLink = (link, rawUrl) => {
    const href = normaliseHttpUrl(rawUrl, postUrl);
    if (!href || seenUrls.has(href)) return;

    seenUrls.add(href);
    downloadLinks.push({ name: nameForDownloadLink(link, href), url: href });
  };

  content.querySelectorAll('a[href], [data-url], [data-href], [data-link], [data-download]').forEach(link => {
    addDownloadLink(link, link.getAttribute('href') || link.getAttribute('data-url') || link.getAttribute('data-href') || link.getAttribute('data-link') || link.getAttribute('data-download'));
  });

  // Há posts que exibem a URL como texto em vez de uma âncora.
  const urlsInText = content.textContent.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  urlsInText.forEach(rawUrl => {
    const virtualLink = { getAttribute: () => null, textContent: rawUrl, closest: () => null };
    addDownloadLink(virtualLink, rawUrl);
  });

  // Extrair titleId da descrição
  const fullDescription = doc.querySelector('.entry-content, .post-body, .post-content')?.textContent || description;
  const titleId = extractTitleId(fullDescription) || null;

  return {
    title,
    cover,
    description,
    downloadLinks,
    titleId,
    url: postUrl,
    id: extractPostId(postUrl)
  };
}

async function fetchPostPage(postUrl) {
  const html = await fetchHtml(postUrl);
  return parseDlpsgamePostHtml(html, postUrl);
}

function parsePostListHtml(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const posts = [];

  // Busca todos os posts na listagem
  const postElements = doc.querySelectorAll('.post.bar.hentry, .post.hentry, article.post');
  
  postElements.forEach(el => {
    const titleLink = el.querySelector('h2.post-title a, h2.entry-title a, h3.post-title a');
    if (!titleLink) return;
    
    const url = titleLink.getAttribute('href');
    const title = titleLink.textContent?.trim() || 'Sem título';
    
    // Imagem na listagem
    const img = el.querySelector('img');
    const cover = img?.getAttribute('src') || null;
    
    // Descrição curta
    const descEl = el.querySelector('.post-body, .entry-content');
    const description = descEl?.textContent?.trim()?.substring(0, 300) || '';
    
    // Tenta extrair titleId do título ou descrição
    const titleId = extractTitleId(`${title} ${description}`) || null;
    
    posts.push({
      id: extractPostId(url) || url,
      title,
      cover,
      description,
      url,
      titleId,
      downloadLinks: [],
      needsDetail: true
    });
  });

  // Fallback mais genérico
  if (posts.length === 0) {
    const genericLinks = doc.querySelectorAll('h2 a, h3 a, .post-title a');
    genericLinks.forEach(link => {
      const url = link.getAttribute('href');
      if (url && url.includes('/') && !url.includes('#')) {
        posts.push({
          id: extractPostId(url) || url,
          title: link.textContent?.trim() || 'Sem título',
          cover: null,
          description: '',
          url,
          titleId: null,
          downloadLinks: [],
          needsDetail: true
        });
      }
    });
  }

  return posts;
}

function pageNumberFromUrl(url) {
  const match = url.match(/(?:\/page\/|[?&]page=)(\d+)/i);
  return match ? Number(match[1]) : 1;
}

export function getNextPageUrl(html, currentUrl) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const candidates = [...doc.querySelectorAll('a[href]')];
  const nextLink = candidates.find((link) =>
    link.matches('a.next, a[rel="next"], .blog-pager-older-link') ||
    /^(?:next|older|próxim[ao]|seguinte|›|»)/i.test(link.textContent.trim())
  );
  if (nextLink) {
    const href = nextLink.getAttribute('href');
    if (href && href !== '#') return new URL(href, currentUrl).href;
  }

  const currentPage = pageNumberFromUrl(currentUrl);
  const numberedNext = candidates.find((link) => {
    try { return pageNumberFromUrl(new URL(link.getAttribute('href'), currentUrl).href) === currentPage + 1; }
    catch { return false; }
  });
  if (numberedNext) return new URL(numberedNext.getAttribute('href'), currentUrl).href;

  return null;
}

export async function fetchDlpsgameCatalog({ baseUrl, categorySlug = 'ps4', onProgress }) {
  if (!baseUrl) throw new Error('SOURCE_BASE_URL não foi configurada.');

  // O DLPSGame expõe sua própria API WordPress. Ela informa a quantidade
  // total de posts e evita a limitação agressiva aplicada à navegação HTML.
  // A busca é sequencial para respeitar o limite da origem. O parser HTML só
  // fica disponível como contingência explícita para diagnóstico.
  if (process.env.DLPSGAME_USE_HTML !== 'true') {
    console.log(`🔍 Buscando catálogo via API pública do DLPSGame (${categorySlug})...`);
    return fetchWordpressCatalog({
      baseUrl,
      categorySlug,
      perPage: 100,
      pageConcurrency: 1,
      onProgress
    });
  }
  console.warn('⚠️ Usando coletor HTML legado por DLPSGAME_USE_HTML=true.');
  
  // Monta a URL: baseUrl + /category/ + categorySlug + /
  const url = baseUrl.endsWith('/') 
    ? `${baseUrl}category/${categorySlug}/` 
    : `${baseUrl}/category/${categorySlug}/`;
  
  console.log(`🔍 Buscando catálogo de ${url}...`);
  
  // Buscar primeira página
  const html = await fetchHtml(url);
  let posts = parsePostListHtml(html);
  let totalPages = 1;
  
  // Tentar descobrir total de páginas
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const pageLinks = doc.querySelectorAll('.blog-pager a, .pagination a');
  const pageNumbers = [];
  pageLinks.forEach(link => {
    const num = parseInt(link.textContent);
    if (!isNaN(num)) pageNumbers.push(num);
  });
  if (pageNumbers.length > 0) totalPages = Math.max(...pageNumbers);
  const pageIndicator = doc.querySelector('.pages')?.textContent.match(/\bof\s+(\d+)\b/i);
  if (pageIndicator) totalPages = Math.max(totalPages, Number(pageIndicator[1]));
  
  await onProgress?.({ totalPages, pagesFetched: 1, gamesFetched: posts.length });
  
  // Buscar posts de páginas adicionais
  let allPosts = [...posts];
  let nextUrl = getNextPageUrl(html, url);
  let page = 2;
  const visitedPageUrls = new Set([url]);
  
  while (nextUrl && !visitedPageUrls.has(nextUrl)) {
    try {
      visitedPageUrls.add(nextUrl);
      console.log(`📄 Buscando página ${page}...`);
      const pageHtml = await fetchHtml(nextUrl);
      const pagePosts = parsePostListHtml(pageHtml);
      allPosts = allPosts.concat(pagePosts);
      await onProgress?.({ 
        totalPages, 
        pagesFetched: page, 
        gamesFetched: allPosts.length 
      });
      nextUrl = getNextPageUrl(pageHtml, nextUrl);
      page++;
    } catch (error) {
      // Não gera um catálogo aparentemente completo, porém truncado. A próxima
      // atualização recomeça a coleta e mantém o catálogo anterior intacto.
      throw new Error(`Não foi possível buscar a página ${page} da categoria: ${error.message}`);
    }
  }

  // A paginação pode repetir posts em páginas consecutivas. O JSON final tem
  // um único registro por página de jogo, sem limite de quantidade.
  allPosts = [...new Map(allPosts.map((post) => [post.url, post])).values()];
  
  console.log(`✅ Encontrados ${allPosts.length} jogos no total.`);
  
  // A página de listagem já contém título, capa e a URL pública do jogo. Como
  // o catálogo entrega essa URL diretamente, não precisamos abrir milhares de
  // páginas individuais antes de publicar o resultado.
  return { games: allPosts };
}

// Função para converter o formato do dlpsgame para o formato esperado pelo catálogo
export function normaliseDlpsgamePost(post) {
  const title = post.title || 'Sem título';
  const image = post.cover || null;
  const description = post.description || '';
  const downloadLinks = (post.downloadLinks || []).map(link => ({
    name: link.name || link.label || 'Download',
    url: link.url
  })).filter(link => link.url);
  const titleId = post.titleId || null;
  
  return {
    id: post.id || `dlps-${Date.now()}`,
    title,
    platform: 'PS4',
    description,
    cover: image,
    downloadLinks,
    titleId,
    source: {
      url: post.source?.url || post.url || null,
      publishedAt: post.source?.publishedAt || post.date || null,
      updatedAt: post.source?.updatedAt || post.modified || null
    }
  };
}

// Re-export makeCatalog from catalog.mjs
export { makeCatalog } from './catalog.mjs';
