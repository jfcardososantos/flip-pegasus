#!/usr/bin/env node
import { fetchDlpsgameCatalog, normaliseDlpsgamePost, makeCatalog } from './src/dlpsgame-source.mjs';
import { writeFile } from 'node:fs/promises';

const config = {
  baseUrl: 'https://dlpsgame.com/category/ps4/',
  perPage: 2,  // Buscar apenas 2 páginas pra teste
  catalogName: 'DLPSGame PS4 Catalog'
};

console.log('🚀 Testando extrator dlpsgame.com...\n');

const { games } = await fetchDlpsgameCatalog({
  ...config,
  onProgress: ({ totalPages, pagesFetched, gamesFetched }) => {
    console.log(`📊 Progresso: página ${pagesFetched}/${totalPages}, ${gamesFetched} jogos encontrados`);
  }
});

console.log(`\n✅ Encontrados ${games.length} jogos.\n`);
console.log('📦 Amostra dos primeiros 3 jogos:\n');

games.slice(0, 3).forEach((game, i) => {
  console.log(`${i+1}. ${game.title}`);
  console.log(`   🔗 URL: ${game.url}`);
  console.log(`   🖼️  Imagem: ${game.cover || 'N/A'}`);
  console.log(`   🆔 Title ID: ${game.titleId || 'N/A'}`);
  console.log(`   📥 Links de download: ${game.downloadLinks.length}`);
  if (game.downloadLinks.length > 0) {
    game.downloadLinks.slice(0, 2).forEach(link => {
      console.log(`      - ${link.label}: ${link.url}`);
    });
  }
  console.log(`   📝 Descrição: ${game.description?.substring(0, 100)}...\n`);
});

// Converter para o formato do catálogo
const normalisedGames = games.map(normaliseDlpsgamePost);
const catalog = makeCatalog(normalisedGames, config.catalogName);

console.log(`\n📊 Catálogo gerado com ${catalog.packages.length} jogos.`);

// Salvar para ver o resultado completo
await writeFile('test-catalog-dlps.json', JSON.stringify(catalog, null, 2));
console.log('💾 Catálogo salvo em test-catalog-dlps.json');

// Mostrar um exemplo do formato final
console.log('\n🔍 Exemplo do formato final:');
console.log(JSON.stringify(catalog.packages[0] || {}, null, 2));
