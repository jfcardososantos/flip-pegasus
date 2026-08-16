import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDlpsgamePostHtml } from '../src/dlpsgame-source.mjs';

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
      url: 'https://dlpsgame.com/go/abc123',
      label: 'Download — Parte 1',
      quality: null,
      language: null
    },
    {
      url: 'https://mega.nz/file/xyz',
      label: 'Mega — Parte 2',
      quality: null,
      language: null
    }
  ]);
  assert.equal(post.titleId, 'CUSA12345');
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
