# Serviço de catálogo PS4

Serviço Docker que coleta **metadados** de posts de uma categoria WordPress autorizada, gera um `catalog.json` persistente e o atualiza automaticamente. Não extrai ou publica links de download.

## Saída

- `GET /catalog.json` — catálogo atual.
- `GET /health` — estado e progresso da atualização (`count`, `pagesFetched` e `totalPages`).
- `POST /refresh` — atualização manual pública.

Cada item traz `id`, `title`, `platform`, `description`, `cover` e a URL de origem do post. O arquivo também tem `checksum`, `generatedAt` e `count`.

## Desenvolvimento local

```sh
cp .env.example .env
# defina SOURCE_BASE_URL para o WordPress que você controla/tem permissão de consultar
npm test
docker compose up --build
```

Depois, abra `http://localhost:3000/health`. O catálogo estará em `http://localhost:3000/catalog.json` assim que a primeira coleta terminar.

## EasyPanel

1. Suba este repositório em Git ou envie-o como projeto Dockerfile.
2. Crie um serviço a partir do `Dockerfile` e adicione um volume persistente montado em `/app/data`.
3. Configure as variáveis de `.env.example`, principalmente `SOURCE_BASE_URL`, `SOURCE_CATEGORY=ps4` e `UPDATE_INTERVAL_MINUTES`.
4. Exponha a porta `3000` e aponte o Pegasus para `https://seu-dominio/catalog.json`.

Use `UPDATE_INTERVAL_MINUTES=720` para duas atualizações diárias. A escrita do arquivo é atômica, portanto uma leitura nunca recebe JSON parcial. `SOURCE_PAGE_CONCURRENCY=4` acelera a primeira sincronização sem disparar todas as páginas de uma vez. Como `/refresh` é público, não o exponha caso não queira que terceiros antecipem uma atualização.

## Fonte WordPress

O coletor utiliza a API pública padrão do WordPress (`/wp-json/wp/v2`), resolve a categoria pelo slug e pagina todos os posts. Para uma fonte que não seja WordPress, substitua somente `src/wordpress-source.mjs`, preservando o retorno `{ games, sourceUrl }`.
