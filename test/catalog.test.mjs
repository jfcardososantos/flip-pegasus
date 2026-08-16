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
  const catalog = makeCatalog([{ title: 'Zelda' }, { title: 'Astro' }], 'https://example.test');
  assert.equal(catalog.games[0].title, 'Astro');
  assert.equal(catalog.count, 2);
  assert.match(catalog.checksum, /^[a-f0-9]{64}$/);
});
