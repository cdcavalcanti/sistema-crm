# VORTEX — CRM

Blueprint **white-label** de CRM comercial B2B: funil de vendas + WhatsApp + tarefas + calendário.

Visual de referência: **Manual VORTEX** (Void, Graphite, Bone, Violet só como acento, Michroma + Inter, símbolo V). No fork do cliente, troque `frontend/src/lib/brand.ts`, `frontend/src/components/branding/Logos.tsx` e os tokens em `frontend/src/index.css`.

Não é ERP de pedidos/delivery. Fork/clone por contrato, renomeie a marca, aponte o backend Nest + WAHA/Chatwoot e **troque segmentos/pipeline pelos do cliente**. A demonstração usa só placeholders (`Empresa exemplo A`) — não é um CRM de um nicho.

Este repositório é o **template**. Instâncias de produto (CRM de um cliente) nascem a partir daqui — não misture commits com o produto de um cliente. Um CRM seu, para acompanhar os contratos que você fecha, é outro fork.

## Pastas

```
frontend/   Vite + React (UI)
backend/    Nest.js + Prisma + Postgres (API)
```

## Stack

- **Frontend**: Vite + React 18 + TypeScript + shadcn/ui + Tailwind + TanStack Query
- **Backend**: Nest.js 11 (TypeScript) — módulos por domínio, JWT invite-only, Prisma
- **Banco**: PostgreSQL 16
- **Charts**: Recharts
- **Kanban**: @dnd-kit

O Nest.js casa com o CRM: o mesmo TypeScript do front, um módulo por área (identidade, funil, ingest) e guards de papel (`super_admin` / `admin` / `usuario`) no lugar do RLS no browser.

Camadas no `backend/src`:

- `core/` — config, Prisma, JWT, filtros
- `modules/identity` — login, convite, papéis
- `modules/crm` — query autenticada das tabelas do CRM + carteira
- `modules/ingest` — webhooks públicos (leads, ads)
- `modules/functions` — aliases das antigas edge functions

O legado `backend/supabase/` (SQL + Deno) fica como referência até as integrações de WhatsApp/Google serem portadas por completo.

## O que vem pronto

- Auth **invite-only** (`VITE_ALLOW_SIGNUP` desligado por padrão)
- Contatos, oportunidades (lista/kanban), tarefas, calendário
- Chat WhatsApp (WAHA) + templates/disparos Meta (Chatwoot Cloud)
- Remarketing, dashboard (KPIs da manhã + onboarding do 1º dia)
- IA no tenant logado: **Pergunte ao CRM** (leitura com citação) na ficha e no funil; **ação na ficha** só grava depois de confirmar; persona em `/admin/ia`. Gateway = o mesmo `OPENAI_API_KEY` do assistente. Cron `crm-ia-eventos` cria follow-up (sem enviar mensagem).
- Carteira `profiles.responsavel_crm` (filtro no Nest; admins vêem tudo)
- Saúde/auditoria (WhatsApp + disparos + demais checks)
- Usuários/roles, logs, pipeline admin
- Webhooks de leads / `lp-intake` (aliases de campos)
- Módulo opcional de **IA SDR** (`sdr-handoff`) — ver `INTEGRACAO_SDR.md`

Arquitetura de canais:

- Chat cotidiano = sessão WhatsApp (WAHA)
- Templates oficiais = API Meta via Chatwoot Cloud
- Na UI do usuário final: **nunca** jargão WAHA/Chatwoot

## Como adaptar para um cliente

1. Clone este repo para `sistema-crm-<cliente>` (privado).
2. Troque logo (`frontend/src/components/branding/Logos.tsx`), cores (`frontend/src/index.css`) e nome do produto (sidebar, `index.html`, Auth).
3. Suba Postgres + Nest (`docker compose up --build`) ou aponte `DATABASE_URL` para o Postgres do cliente.
4. Preencha `backend/.env` e `frontend/.env.local` a partir dos `.env.example` (sem copiar secrets de outro cliente).
5. Ajuste `SEGMENTOS_CRM`, `ETAPAS_CRM`, `PORTES_CRM` e `RESPONSAVEIS_CRM` em `frontend/src/lib/constants.ts`.
6. O primeiro super_admin nasce de `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` se a tabela `users` estiver vazia.
7. Convide o restante em `/admin/usuarios` e preencha `responsavel_crm`.
8. Aponte webhooks do site/Meta para `POST /api/v1/ingest/leads` e `POST /api/v1/ingest/indicadores-ads`.

Preview de UI sem backend: no `npm run dev` na pasta `frontend` sem `VITE_API_URL`, o login mostra **Demonstração (sem dados reais)**. Força com `VITE_UI_PREVIEW=true`. **Nunca** ligue isso em produção. Usuário: `preview@crm.local`.

## Setup inicial

### 1. Dependências

**npm** (CI, Docker e o restante do time):

```bash
npm install --prefix backend
npm install --prefix frontend
```

**Bun** (quem já usa Bun no dia a dia, ex. Lucas):

```bash
bun run bun:install
```

Os scripts `vite`, `nest` e `prisma` são os mesmos. O Bun só instala e dispara; o lockfile que vale no GitHub é o `package-lock.json`. Não commitar `bun.lock`.

| tarefa | npm | Bun |
| --- | --- | --- |
| Instalar | `npm install --prefix frontend` (e `backend`) | `bun run bun:install` |
| Front | `npm run dev:frontend` | `bun run bun:dev` |
| API | `npm run dev:backend` | `bun run bun:backend` |
| Prisma | `npx prisma migrate deploy` | `bunx prisma migrate deploy` |

`docker compose` e o CI continuam em **npm** — não precisa o Lucas ter npm no laptop, nem o resto do time ter Bun.

### 2. Variáveis de ambiente

- Backend: `backend/.env.example` → `backend/.env`
- Frontend: `frontend/.env.example` → `frontend/.env.local` (para falar com o Nest: `VITE_API_URL=/api/v1` e `VITE_USE_API=true`)

Nunca commite `.env` / `.env.local`.

### 3. Banco + API

```bash
docker compose up db -d
cd backend
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

API: `http://localhost:3000/api/v1/health`

### 4. Frontend

```bash
cd frontend
# .env.local com VITE_API_URL=/api/v1 e VITE_USE_API=true
npm run dev
```

Ou tudo junto:

```bash
docker compose up --build
```

UI em `http://localhost:8080`. Login = `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`.

### 5. Edge functions legadas (opcional, WhatsApp/Google ainda no Deno)

As funções antigas estão em `backend/supabase/functions`. Enquanto não forem portadas para Nest:

```bash
npx supabase functions deploy leads --no-verify-jwt
```

O primeiro usuário é o bootstrap do Nest (`BOOTSTRAP_ADMIN_*`). Depois, convites saem de `/admin/usuarios`.

## Endpoints públicos (webhooks)

```
POST https://seu-crm.example.com/api/v1/ingest/leads
Content-Type: application/json
# opcional: ?secret= ou header x-ingest-secret
```

Campos padrão (todos opcionais exceto `nome`):

| Campo | Onde grava | Descrição |
| --- | --- | --- |
| `nome` | `contatos.nome` | Nome do contato / responsável (obrigatório) |
| `email` | `contatos.email` | E-mail |
| `telefone` | `contatos.telefone` | Celular |
| `nome_aluno` / `nome_estabelecimento` | contato + oportunidade | Nome da empresa / organização (legado do schema) |
| `serie_interesse` | interesse / plano | Segmento ou oferta |

### Formulário do site

```json
{
  "origem": "formulario_site",
  "nome": "Maria da Silva",
  "email": "maria@example.com",
  "telefone": "11 99999-0000",
  "mensagem": "Gostaria de saber mais",
  "utm_source": "instagram",
  "utm_campaign": "campanha_2026",
  "pagina": "/contato"
}
```

→ **Lead novo**

### Agendamento de demo

```json
{
  "origem": "agendamento_site",
  "nome": "Maria da Silva",
  "email": "maria@example.com",
  "telefone": "11 99999-0000",
  "data_visita": "2026-05-20T14:00:00-03:00",
  "google_event_id": "abcd1234"
}
```

### Meta Ads

```json
{
  "origem": "meta_ads",
  "nome": "Maria da Silva",
  "email": "maria@example.com",
  "telefone": "11 99999-0000",
  "campaign_name": "Campanha 2026",
  "ad_name": "Vídeo produto",
  "form_name": "Lead form empresas",
  "lead_id": "1234567890"
}
```

Captação em código: `lp-intake` (site) e `meta-leads` (Lead Ads), reusando `_shared/criarLead.ts`. Cada submissão vai para `entradas_log`.

### Plataforma de indicadores (Meta Ads + Google Ads)

A aba **Indicadores** (`/indicadores`) cruza o funil deste tenant com um snapshot de mídia. A plataforma de indicadores **empurra** gasto/cliques; o CRM **devolve** leads e ganhos reais da origem `meta_ads` / `google_ads`.

```bash
npx supabase secrets set INDICADORES_ADS_SECRET=…
npx supabase functions deploy indicadores-ads --no-verify-jwt
```

POST (plataforma → CRM):

```json
{
  "plataforma": "meta_ads",
  "periodo_inicio": "2026-10-07",
  "periodo_fim": "2026-10-13",
  "conta_nome": "Conta Meta",
  "investimento": 3850,
  "impressoes": 142000,
  "cliques": 1980,
  "ctr": 1.39,
  "cpc": 1.94,
  "cpl": 38.5,
  "campanhas": [
    { "campanha_nome": "Leads B2B", "investimento": 2400, "cliques": 1260, "leads": 67, "cpl": 36 }
  ]
}
```

`POST /functions/v1/indicadores-ads?secret=…` — também aceita `google_ads`.  
`GET` no mesmo endpoint devolve `{ crm, ads }` para a plataforma calcular CPL/ROAS com a verdade do funil.

## Agenda (Google Calendar → CRM)

A função `agenda-sync` (cron) lê `AGENDA_CALENDAR_ID` e cria oportunidade para eventos novos (`google_event_id`). Diagnóstico: `GET …/agenda-sync?secret=…&dryRun=1`.

## Chat de WhatsApp (WAHA)

Menu **Chat** (`/chat`). Use instância/sessão/número/secret **exclusivos desta instância**.

- Entrada: WAHA → `whatsapp-webhook?secret=WHATSAPP_WEBHOOK_SECRET`
- Saída: front → `whatsapp-send`
- Tempo real: Realtime em `conversas` / `mensagens`

## Estrutura

```
sistema-crm/
├── src/
│   ├── pages/                Auth, Dashboard, Contatos, Oportunidades,
│   │                         Pipeline, Tarefas, Chat, Relatorios, Calendario,
│   │                         Usuarios, Logs, Saude, NotFound
│   ├── components/           ui, layout, branding, chat, oportunidades, …
│   ├── hooks/                useAuth, useSdrLead, useSdrHandoffWatcher
│   ├── lib/                  constants, format, origem
│   └── integrations/supabase/
├── supabase/
│   ├── config.toml           # project_id = YOUR_PROJECT_REF
│   ├── migrations/
│   └── functions/            leads, lp-intake, whatsapp-*, sdr-handoff, …
└── scripts/
```

## Papéis

| Papel | Pode |
| --- | --- |
| `super_admin` | Tudo. Vê `audit_logs`, conecta Google Calendar, gerencia super_admins |
| `admin` | Gerencia usuários (exceto super), edita pipeline, edita/deleta dados |
| `usuario` | Lê contatos, oportunidades, calendário; cria e edita seus dados |

## Checklist go-live

- [ ] Projeto Supabase novo + migrations
- [ ] `.env.local` e secrets das functions (sem reusar de outro cliente)
- [ ] Logo, cores, nome do produto
- [ ] `SEGMENTOS` / `ETAPAS` / `RESPONSAVEIS` do cliente
- [ ] Signup público desligado
- [ ] Primeiro super_admin + convites + `responsavel_crm`
- [ ] WhatsApp conectado + 1 template oficial testado
- [ ] Webhooks do site/Meta apontando para este projeto
- [ ] `VITE_ALLOW_SIGNUP` e `VITE_UI_PREVIEW` **não** true em produção
- [ ] LGPD: preencher DPO em `/admin/lgpd`, adaptar `src/lib/lgpd.ts`, aplicar migration `20260919_0035_lgpd.sql`
- [ ] CI: secrets `SUPABASE_ACCESS_TOKEN` e `PROJECT_REF` se for usar deploy automático do backend

## Docker + Nginx

Frontend em container (build Vite → `nginx:1.27`). Supabase/WAHA/Chatwoot continuam externos.

```bash
docker compose up --build
# http://localhost:8080  (CRM_PORT para mudar a porta)
```

Build direto:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... \
  -t sistema-crm .
```

Healthcheck: `GET /healthz`. Config: `docker/nginx.conf` (SPA, headers, cache de `/assets/`).

## CI/CD

Workflows em `.github/workflows/`:

- **CI** (`ci.yml`): lint, testes, `npm run build` e build da imagem Docker em push/PR para `main`.
- **Deploy backend** (`deploy-backend.yml`): aplica migrations e publica edge functions no merge em `main` (ou `workflow_dispatch`). Sem os secrets, o job só avisa e não falha o restante do CI.

## LGPD

- Política pública: `/privacidade` (texto em `src/lib/lgpd.ts` — troque o controlador)
- Aceite obrigatório da equipe após o login
- Banner de analytics (Vercel) com aceite/recusa
- Painel admin: `/admin/lgpd` (DPO, retenção, solicitações, exportação JSON, anonimização)

## Comandos

```bash
npm run dev              # porta 8080
npm run build            # produção
npm run lint
npm run test             # vitest
```
