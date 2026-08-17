# Aurores RPG

Stack: [Astro](https://astro.build) (SSR) + [React](https://react.dev) (islands interativas) + [Tailwind CSS](https://tailwindcss.com) + [Supabase](https://supabase.com) (backend), publicado como Cloudflare Worker via [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

## Estrutura do projeto

```text
/
├── public/                 # assets estáticos (favicon, etc.), copiados 1:1 no build
├── src/
│   ├── pages/              # rotas do site (roteamento por sistema de arquivos)
│   │   └── index.astro
│   ├── styles/
│   │   └── global.css      # entrada do Tailwind
│   └── lib/
│       └── supabase.ts     # client do Supabase (usa PUBLIC_SUPABASE_URL/ANON_KEY)
├── astro.config.mjs        # integrações: react, tailwind, adapter cloudflare
├── wrangler.toml           # config do Worker (nome, assets, observability)
└── .env.example            # modelo das env vars necessárias
```

Componentes React ficam em `src/components/` (crie a pasta quando precisar) e só rodam
JS no client quando usados com uma diretiva `client:*` (ex.: `client:load`), mantendo o
restante do site como HTML estático.

## Configuração inicial

1. Instale as dependências:
   ```sh
   npm install
   ```
2. Copie `.env.example` para `.env` e preencha com as credenciais do seu projeto Supabase
   (Project Settings → API):
   ```sh
   cp .env.example .env
   ```

## Comandos

| Comando               | Ação                                                        |
| :-------------------- | :----------------------------------------------------------- |
| `npm run dev`          | Servidor local em `localhost:4321`                            |
| `npm run build`        | Build de produção em `./dist/`                                |
| `npm run preview`      | Preview do build local antes de publicar                      |
| `npm run generate-types` | Gera tipos das bindings do Worker (`wrangler types`)         |
| `npx wrangler deploy`  | Publica o Worker no Cloudflare (usa `wrangler.toml`)           |

## Deploy

O deploy é feito direto pelo Wrangler, sem precisar do dashboard do Cloudflare:

```sh
npm run build
npx wrangler deploy
```

Pré-requisito: estar logado (`npx wrangler login`, uma vez por máquina).

## Documentação de referência

- [Astro Docs](https://docs.astro.build)
- [Astro + Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- [Supabase JS client](https://supabase.com/docs/reference/javascript/introduction)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
