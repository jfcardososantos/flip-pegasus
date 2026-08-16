import http from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeCatalog } from './catalog.mjs';
import { fetchWordpressCatalog } from './wordpress-source.mjs';

const config = {
  port: Number(process.env.PORT || 3000),
  dataDir: process.env.DATA_DIR || './data',
  baseUrl: process.env.SOURCE_BASE_URL || '',
  categorySlug: process.env.SOURCE_CATEGORY || 'ps4',
  catalogName: process.env.CATALOG_NAME || 'PS4 Catalog',
  perPage: Number(process.env.SOURCE_PER_PAGE || 100),
  pageConcurrency: Number(process.env.SOURCE_PAGE_CONCURRENCY || 4),
  intervalMs: Math.max(Number(process.env.UPDATE_INTERVAL_MINUTES || 720), 1) * 60_000,
  updateOnStart: process.env.UPDATE_ON_START !== 'false'
};
const catalogPath = path.join(config.dataDir, 'catalog.json');
const statusPath = path.join(config.dataDir, 'catalog-status.json');
let refreshing = false;
let status = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  count: 0,
  pagesFetched: 0,
  totalPages: 0
};

async function writeJsonAtomically(file, value) {
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

async function refresh() {
  if (refreshing) return { skipped: true };
  refreshing = true;
  status = {
    ...status,
    lastAttemptAt: new Date().toISOString(),
    lastError: null,
    count: 0,
    pagesFetched: 0,
    totalPages: 0
  };
  await writeJsonAtomically(statusPath, status);
  try {
    const { games } = await fetchWordpressCatalog({
      ...config,
      onProgress: async (progress) => {
        status = { ...status, ...progress, count: progress.gamesFetched };
        await writeJsonAtomically(statusPath, status);
      }
    });
    const catalog = makeCatalog(games, config.catalogName);
    await writeJsonAtomically(catalogPath, catalog);
    status = {
      ...status,
      lastSuccessAt: new Date().toISOString(),
      count: catalog.packages.length,
      pagesFetched: status.totalPages
    };
    await writeJsonAtomically(statusPath, status);
    console.info(`Catálogo atualizado: ${catalog.packages.length} jogos.`);
    return { count: catalog.packages.length };
  } catch (error) {
    status = { ...status, lastError: error.message };
    await writeJsonAtomically(statusPath, status);
    console.error('Falha ao atualizar catálogo:', error.message);
    throw error;
  } finally { refreshing = false; }
}

function json(response, code, value) {
  response.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (request.method === 'GET' && pathname === '/health') return json(response, 200, { ok: true, refreshing, ...status });
  if (request.method === 'GET' && pathname === '/catalog.json') {
    try { return json(response, 200, JSON.parse(await readFile(catalogPath, 'utf8'))); }
    catch { return json(response, 404, { error: 'Catálogo ainda não foi gerado.', ...status }); }
  }
  if (request.method === 'POST' && pathname === '/refresh') {
    try { return json(response, 200, await refresh()); }
    catch { return json(response, 502, { error: status.lastError }); }
  }
  return json(response, 404, { error: 'Não encontrado.' });
});

await mkdir(config.dataDir, { recursive: true });
try { status = JSON.parse(await readFile(statusPath, 'utf8')); } catch { /* primeira execução */ }
if (process.env.RUN_ONCE === 'true') {
  try { await refresh(); process.exit(0); } catch { process.exit(1); }
}
server.listen(config.port, () => console.info(`Servidor do catálogo na porta ${config.port}.`));
if (config.updateOnStart) refresh().catch(() => {});
setInterval(() => refresh().catch(() => {}), config.intervalMs).unref();
