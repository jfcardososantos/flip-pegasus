import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalisePost, makeCatalog } from '../src/catalog.mjs';

describe('catalog', () => {
  it('extrai imagem do featured_media', () => {
    const post = {
      id: 1,
      title: { rendered: 'Game Test' },
      content: { rendered: '<p>Test</p>' },
      excerpt: { rendered: 'Excerpt' },
      featured_media: 42,
      link: 'https://example.com/game',
      date: '2024-01-01'
    };
    const media = new Map([[42, { source_url: 'https://example.com/image.jpg' }]]);
    const result = normalisePost(post, media);
    assert.strictEqual(result.cover, 'https://example.com/image.jpg');
    assert.strictEqual(result.title, 'Game Test');
  });

  it('extrai links de download do ACF', () => {
    const post = {
      id: 2,
      title: { rendered: 'Download Game' },
      content: { rendered: '<p>Content</p>' },
      excerpt: { rendered: 'Excerpt' },
      featured_media: 0,
      link: 'https://example.com/game',
      acf: {
        download_links: [
          { url: 'https://example.com/download1', label: 'Link 1' },
          { url: 'https://example.com/download2', label: 'Link 2' }
        ],
        title_id: 'CUSA12345'
      }
    };
    const result = normalisePost(post, new Map());
    assert.strictEqual(result.downloadLinks.length, 2);
    assert.strictEqual(result.downloadLinks[0].url, 'https://example.com/download1');
    assert.strictEqual(result.downloadLinks[0].name, 'Link 1');
    assert.strictEqual(result.titleId, 'CUSA12345');
  });

  it('fallback para link_download simples', () => {
    const post = {
      id: 3,
      title: { rendered: 'Simple Game' },
      content: { rendered: '<p>Content</p>' },
      excerpt: { rendered: 'Excerpt' },
      featured_media: 0,
      link: 'https://example.com/game',
      acf: { link_download: 'https://example.com/download.zip' }
    };
    const result = normalisePost(post, new Map());
    assert.strictEqual(result.downloadLinks.length, 1);
    assert.strictEqual(result.downloadLinks[0].url, 'https://example.com/download.zip');
    assert.strictEqual(result.downloadLinks[0].name, 'Download');
  });

  it('extrai titleId da descrição se não houver ACF', () => {
    const post = {
      id: 4,
      title: { rendered: 'Game' },
      content: { rendered: '<p>CUSA98765 is the ID</p>' },
      excerpt: { rendered: 'Excerpt' },
      featured_media: 0,
      link: 'https://example.com/game'
    };
    const result = normalisePost(post, new Map());
    assert.strictEqual(result.titleId, 'CUSA98765');
  });

  it('makeCatalog mantém posterUrl e downloadLinks', () => {
    const games = [
      {
        title: 'Z Game',
        cover: 'https://example.com/cover.jpg',
        description: 'Description',
        downloadLinks: [{ url: 'https://example.com/link', label: 'Download' }],
        titleId: 'CUSA11111'
      }
    ];
    const catalog = makeCatalog(games, 'Test Catalog');
    assert.strictEqual(catalog.packages.length, 1);
    assert.strictEqual(catalog.packages[0].title, 'Z Game');
    assert.strictEqual(catalog.packages[0].posterUrl, 'https://example.com/cover.jpg');
    assert.strictEqual(catalog.packages[0].downloadLinks.length, 1);
    assert.strictEqual(catalog.packages[0].downloadLinks[0].url, 'https://example.com/link');
    assert.strictEqual(catalog.packages[0].titleId, 'CUSA11111');
  });
});
