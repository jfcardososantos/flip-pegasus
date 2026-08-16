import { normalisePost } from './catalog.mjs';
import { JSDOM } from 'jsdom';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ao acessar ${url}`);
  return response.text();
}

function extractPostId(url) {
  // Exemplo: https://dlpsgame.com/blood-omen-legacy-of-kain-ps4-pkg/
  const match = url.match(/\/([^\/]+)\/$/);
  return match?.[1] || null;
}

function extractTitleId(description) {
  const match = description.match(/\b(CUSA|PCAS|PLAS|PPSA)\d{5}\b/i);
  return match?.[0]?.toUpperCase() || null;
}

function parsePostHtml(html, postUrl) {
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

  // Links de download - procura padrões comuns
  const downloadLinks = [];
  const links = doc.querySelectorAll('a[href*="download"], a[href*="mega.nz"], a[href*="1fichier"], a[href*="mediafire"], a[href*="gdrive"], a[href*="drive.google"]');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    const text = link.textContent?.trim() || '';
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      // Tentar identificar a qualidade/label
      let label = text || 'Download';
      let quality = null;
      if (/\b(1080|720|4k|hd|fullhd)\b/i.test(label)) quality = label.match(/\b(1080|720|4k|hd|fullhd)\b/i)[0];
      
      downloadLinks.push({
        url: href,
        label: label,
        quality: quality || null,
        language: null
      });
    }
  });

  // Se não encontrou links de download, tenta extrair do conteúdo
  if (downloadLinks.length === 0) {
    const content = doc.querySelector('.entry-content, .post-body, .post-content');
    if (content) {
      const allLinks = content.querySelectorAll('a');
      allLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href && (href.includes('http') || href.includes('//')) && !href.includes('dlpsgame.com')) {
          downloadLinks.push({
            url: href,
            label: link.textContent?.trim() || 'Download',
            quality: null,
            language: null
          });
        }
      });
    }
  }

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
  return parsePostHtml(html, postUrl);
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
      downloadLinks: [], // Será preenchido quando acessar a página do post
      needsDetail: true
    });
  });

  // Se não encontrou com os seletores acima, tenta um fallback mais genérico
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

// Função para paginação
function getNextPageUrl(html, currentUrl) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  // Tenta encontrar link "Próxima" ou número da página
  const nextLink = doc.querySelector('a.next, a[rel="next"], .blog-pager-older-link, a:contains("Next"), a:contains("Próxima")');
  if (nextLink) {
    const href = nextLink.getAttribute('href');
    if (href && href !== '#') return href;
  }

  // Tenta construir manualmente baseado no padrão de URL
  const urlObj = new URL(currentUrl);
  const pageMatch = currentUrl.match(/[?&]page=(\d+)/);
  if (pageMatch) {
    const currentPage = parseInt(pageMatch[1]);
    const nextPage = currentPage + 1;
    return currentUrl.replace(/[?&]page=\d+/, `?page=${nextPage}`);
  }

  return null;
}

export async function fetchDlpsgameCatalog({ baseUrl, perPage = 50, onProgress }) {
  if (!baseUrl) throw new Error('SOURCE_BASE_URL não foi configurada.');
  
  // Garantir que a URL termine com /
  const url = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  
  console.log(`🔍 Buscando catálogo de ${url}...`);
  
  // Buscar primeira página
  const html = await fetchHtml(url);
  let posts = parsePostListHtml(html);
  let totalPages = 1;
  let currentPage = 1;
  
  // Tentar descobrir total de páginas
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const pageLinks = doc.querySelectorAll('.blog-pager a, .pagination a');
  const pageNumbers = [];
  pageLinks.forEach(link => {
    const num = parseInt(link.textContent);
    if (!isNaN(num)) pageNumbers.push(num);
  });
  if (pageNumbers.length > 0) {
    totalPages = Math.max(...pageNumbers);
  }
  
  await onProgress?.({ totalPages, pagesFetched: 1, gamesFetched: posts.length });
  
  // Buscar posts de páginas adicionais
  let allPosts = [...posts];
  let nextUrl = getNextPageUrl(html, url);
  let page = 2;
  
  while (nextUrl && page <= perPage && allPosts.length < 500) {
    try {
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
      console.warn(`⚠️ Erro ao buscar página ${page}: ${error.message}`);
      break;
    }
  }
  
  console.log(`✅ Encontrados ${allPosts.length} jogos no total.`);
  
  // Buscar detalhes dos posts (se necessário)
  const postsWithDetails = [];
  for (let i = 0; i < allPosts.length; i++) {
    const post = allPosts[i];
    if (post.needsDetail && post.url) {
      try {
        console.log(`🔎 Buscando detalhes de: ${post.title}`);
        const detail = await fetchPostPage(post.url);
        postsWithDetails.push({
          ...post,
          cover: detail.cover || post.cover,
          description: detail.description || post.description,
          downloadLinks: detail.downloadLinks || [],
          titleId: detail.titleId || post.titleId
        });
        // Delay para não sobrecarregar o servidor
        if (i % 10 === 0) await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.warn(`⚠️ Erro ao buscar detalhes de ${post.title}: ${error.message}`);
        postsWithDetails.push(post);
      }
    } else {
      postsWithDetails.push(post);
    }
  }
  
  return { games: postsWithDetails };
}

// Função para converter o formato do dlpsgame para o formato esperado pelo catálogo
export function normaliseDlpsgamePost(post) {
  const title = post.title || 'Sem título';
  const image = post.cover || null;
  const description = post.description || '';
  const downloadLinks = post.downloadLinks || [];
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
      url: post.url || null,
      publishedAt: post.date || null,
      updatedAt: post.modified || null
    }
  };
}

// Re-export makeCatalog from catalog.mjs
export { makeCatalog } from './catalog.mjs';
