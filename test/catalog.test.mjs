import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCatalog, normalisePost } from '../src/catalog.mjs';

test('normaliza post WordPress sem incluir links de download', () => {
  const game = normalisePost({
    id: 42, link: 'https://example.test/game', featured_media: 7,
    title: { rendered: 'Jogo &amp; Teste' }, excerpt: { rendered: '<p>Descrição <strong>curta</strong>. https://host.example/arquivo</p>' }
  }, new Map([[7, { source_url: 'https://example.test/cover.jpg' }]]));
  assert.deepEqual(game, {
    id: 'wp-42', title: 'Jogo & Teste', platform: 'PS4', description: 'Descrição curta.',
    cover: 'https://example.test/cover.jpg',
    source: { url: 'https://example.test/game', publishedAt: null, updatedAt: null }
  });
});

test('ordena o catálogo por título', () => {
  const catalog = makeCatalog([
    { title: 'Zelda', description: '', cover: null },
    { title: 'Astro DLC', description: 'Código CUSA12345', cover: 'https://example.test/astro.jpg' }
  ]);
  assert.deepEqual(catalog, {
    name: 'PS4 Catalog', version: 1,
    packages: [
      {
        titleId: 'CUSA12345', title: 'Astro DLC', downloadLinks: [], category: 'dlc',
        posterUrl: 'https://example.test/astro.jpg', description: 'Código CUSA12345', downloadSource: null
      },
      { title: 'Zelda', downloadLinks: [], category: 'game', posterUrl: null, description: '', downloadSource: null }
    ]
  });
});
