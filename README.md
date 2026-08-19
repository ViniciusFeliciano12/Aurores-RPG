# Wyrdcall

Stack: [Astro](https://astro.build) (SSR) + [React](https://react.dev) (islands interativas) + [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) (componentes) + [Supabase](https://supabase.com) (backend), publicado como Cloudflare Worker via [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

## Estrutura do projeto

```text
/
├── public/                    # assets estáticos (favicon, etc.), copiados 1:1 no build
├── src/
│   ├── pages/                 # rotas do site (roteamento por sistema de arquivos)
│   │   ├── index.astro        # home: hero + login/cadastro + grade de áreas do sistema
│   │   └── personagens.astro  # scaffold da área de fichas (protegida por sessão)
│   ├── layouts/
│   │   └── Layout.astro       # <html>/<head> base, importa global.css
│   ├── components/
│   │   ├── App.tsx            # decide sessão: mostra AuthForm ou redireciona logado
│   │   ├── AuthForm.tsx        # formulário de login/cadastro (Supabase Auth)
│   │   ├── PasswordInput.tsx  # input de senha com toggle mostrar/ocultar
│   │   └── ui/                 # componentes shadcn/ui (button, input, card, label...)
│   ├── styles/
│   │   └── global.css         # entrada do Tailwind + tokens de tema (CSS variables)
│   └── lib/
│       ├── supabase.ts        # client do Supabase (usa PUBLIC_SUPABASE_URL/ANON_KEY)
│       └── utils.ts           # helper `cn()` (clsx + tailwind-merge) usado pelo shadcn/ui
├── components.json            # config do shadcn/ui (estilo, aliases, ícones)
├── astro.config.mjs           # integrações: react, tailwind, adapter cloudflare
├── wrangler.toml               # config do Worker (nome, assets, observability)
├── supabase/
│   └── migrations/
│       ├── 0000_reset.sql     # apaga o schema (uso só em dev, para reaplicar 0001 do zero)
│       └── 0001_init.sql      # schema real: tabelas, triggers e policies de RLS
└── .env.example                # modelo das env vars necessárias
```

Componentes React ficam em `src/components/` e só rodam JS no client quando usados com
uma diretiva `client:*` (ex.: `client:load`), mantendo o restante do site como HTML
estático. Os componentes de UI genéricos (botão, input, card...) vivem em
`src/components/ui/` e são gerados pelo shadcn/ui — código seu, editável, não uma
dependência escondida em `node_modules`.

### Adicionando componentes do shadcn/ui

```sh
npx shadcn@latest add <componente>   # ex.: npx shadcn@latest add dialog
```

O tema (cores, raio de borda, fontes) é definido como CSS variables em
`src/styles/global.css`; o site roda sempre no tema escuro definido em `:root`.

## Configuração inicial

1. Instale as dependências:
   ```sh
   npm install
   ```
2. Copie `.env.example` para `.env` e preencha com as credenciais do seu projeto Supabase
   (Project Settings → API Keys → Project URL e Publishable key):
   ```sh
   cp .env.example .env
   ```
3. No SQL Editor do dashboard do Supabase, rode o conteúdo de
   `supabase/migrations/0001_init.sql` inteiro, numa única execução, para criar as
   tabelas, triggers e policies de RLS.

## Modelo de dados (Supabase)

- **`profiles`** — um perfil por usuário autenticado, criado automaticamente por um
  trigger quando alguém se cadastra pelo Supabase Auth.
- **`campaigns`** — campanhas de RPG. Visíveis (nome/existência) a qualquer usuário
  logado; quem participa e as fichas vinculadas ficam restritas a membros.
- **`campaign_members`** — vínculo jogador↔campanha, com `role` (`master`, único por
  campanha, ou `player`) e `status` (`pending`/`accepted`). É aqui que o fluxo
  "jogador pede para entrar → mestre aceita" acontece.
- **`characters`** — cada personagem tem um dono obrigatório e uma campanha opcional.
  Um trigger garante que um personagem só pode ser vinculado a uma campanha se o dono
  for membro aceito dela; outro trigger desvincula (sem apagar) os personagens de um
  jogador quando ele é removido da campanha.

Toda a segurança de acesso (quem vê/edita o quê) vive nas RLS policies do
`0001_init.sql`, não no frontend — o client fala direto com o Postgres via
`anon`/publishable key.

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
