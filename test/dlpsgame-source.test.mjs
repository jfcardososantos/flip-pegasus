import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextPageUrl, normaliseDlpsgamePost, parseDlpsgamePostHtml } from '../src/dlpsgame-source.mjs';

test('extrai botões de download, inclusive redirecionamentos internos', () => {
  const post = parseDlpsgamePostHtml(`
    <main class="entry-content">
      <h1 class="entry-title">Jogo de teste CUSA12345</h1>
      <p>Descrição do jogo.</p>
      <a class="button" href="/go/abc123">Download — Parte 1</a>
      <a href="https://mega.nz/file/xyz">Mega — Parte 2</a>
      <a href="https://example.org/about">Sobre o site</a>
      <a href="javascript:void(0)">Download falso</a>
    </main>
  `, 'https://dlpsgame.com/game-de-teste/');

  assert.deepEqual(post.downloadLinks, [
    {
      name: 'Download — Parte 1',
      url: 'https://dlpsgame.com/go/abc123'
    },
    {
      name: 'Mega — Parte 2',
      url: 'https://mega.nz/file/xyz'
    },
    {
      name: 'Sobre o site',
      url: 'https://example.org/about'
    }
  ]);
  assert.equal(post.titleId, 'CUSA12345');
});

test('extrai URLs de qualquer domínio em atributos e no texto do post', () => {
  const post = parseDlpsgamePostHtml(`
    <article class="entry-content">
      <p>USA 11.xx Base - host novo part 1 <a href="https://host-novo.example/f/371AU0MaJW">Link</a></p>
      <p data-url="https://outro-host.example/d/2CwV3Q">EUR 7.xx Game - host novo part 2</p>
    </article>
  `, 'https://dlpsgame.com/nhl-26-ps5/');

  assert.deepEqual(post.downloadLinks, [
    { name: 'USA 11.xx Base - host novo part 1', url: 'https://host-novo.example/f/371AU0MaJW' },
    { name: 'EUR 7.xx Game - host novo part 2', url: 'https://outro-host.example/d/2CwV3Q' }
  ]);
});

test('não duplica links nem importa a navegação fora do conteúdo', () => {
  const post = parseDlpsgamePostHtml(`
    <nav><a href="https://mega.nz/file/menu">Mega menu</a></nav>
    <article class="post-content">
      <a title="Baixar" href="https://host.example/file">Download</a>
      <a title="Baixar" href="https://host.example/file">Download</a>
    </article>
  `, 'https://dlpsgame.com/post/');

  assert.equal(post.downloadLinks.length, 1);
  assert.equal(post.downloadLinks[0].url, 'https://host.example/file');
});

test('encontra a próxima página em paginação por caminho', () => {
  const nextUrl = getNextPageUrl(`
    <nav class="pagination">
      <a href="/category/ps4/">1</a>
      <a href="/category/ps4/page/2/">2</a>
      <a href="/category/ps4/page/2/" rel="next">Next</a>
    </nav>
  `, 'https://dlpsgame.com/category/ps4/');
  assert.equal(nextUrl, 'https://dlpsgame.com/category/ps4/page/2/');
});

test('usa a contagem total indicada pela categoria, não só os links visíveis', () => {
  const nextUrl = getNextPageUrl(`
    <span class="pages">1 of 321</span>
    <a class="nextpostslink" rel="next" href="/category/ps4/page/2/">»</a>
  `, 'https://dlpsgame.com/category/ps4/');
  assert.equal(nextUrl, 'https://dlpsgame.com/category/ps4/page/2/');
});

test('preserva a página pública do jogo retornada pela API', () => {
  const game = normaliseDlpsgamePost({
    title: 'Jogo',
    source: { url: 'https://dlpsgame.com/jogo/', publishedAt: '2026-01-01T00:00:00Z' }
  });
  assert.equal(game.source.url, 'https://dlpsgame.com/jogo/');
});
