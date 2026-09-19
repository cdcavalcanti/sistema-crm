# Sistema CRM

Blueprint **white-label** de CRM comercial B2B: funil de vendas + WhatsApp + tarefas + calendário.

Não é ERP de pedidos/delivery. Fork/clone, renomeie a marca, aponte Supabase/WAHA/Chatwoot e adapte segmentos/pipeline para o cliente.

Este repositório é o **template**. Instâncias de produto (ex.: um CRM de um cliente específico) nascem a partir daqui — não misture commits com o produto de um cliente.

## Stack

- **Frontend**: Vite + React 18 + TypeScript + shadcn/ui + Tailwind + TanStack Query
- **Backend**: Supabase (Postgres + RLS + Edge Functions em Deno)
- **Charts**: Recharts
- **Kanban**: @dnd-kit
- **Calendar**: Google Calendar API (OAuth 2.0)

## O que vem pronto

- Auth **invite-only** (`VITE_ALLOW_SIGNUP` desligado por padrão)
- Contatos, oportunidades (lista/kanban), tarefas, calendário
- Chat WhatsApp (WAHA) + templates/disparos Meta (Chatwoot Cloud)
- Remarketing, dashboard (KPIs da manhã + onboarding do 1º dia)
- Carteira `profiles.responsavel_crm` + RLS
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
2. Troque logo (`src/components/branding/Logos.tsx`), cores (`src/index.css`) e nome do produto (sidebar, `index.html`, Auth).
3. Crie um **projeto Supabase novo** e aplique as migrations.
4. Preencha `.env.local` a partir de `.env.example` (sem copiar secrets de outro cliente).
5. Ajuste `SEGMENTOS_CRM`, `ETAPAS_CRM`, `PORTES_CRM` e `RESPONSAVEIS_CRM` em `src/lib/constants.ts` (e o seed em `supabase/migrations/20260517_0001_init.sql` se ainda não aplicou).
6. Deploy das edge functions + secrets (WAHA, Chatwoot, Google, Meta, SDR).
7. Desligue signups no Dashboard Supabase (`Authentication → Email → Enable Signups` off).
8. Convide usuários e preencha `responsavel_crm`.
9. Conecte WhatsApp e teste um template oficial.
10. Aponte webhooks do site/Meta para `lp-intake` / `meta-leads` / `leads`.

Preview de UI sem backend: `VITE_UI_PREVIEW=true` (documentado, **nunca** default em produção). Usuário de preview: `preview@crm.local`.

## Setup inicial

### 1. Dependências

```bash
npm install
```

### 2. Variáveis de ambiente

Copie `.env.example` → `.env.local`. Nunca commite `.env.local`.

### 3. Rodar migrations no Supabase

A migration inicial está em `supabase/migrations/20260517_0001_init.sql`.

**A) Via SQL Editor do dashboard Supabase** (mais simples para projeto novo):
1. Abra o SQL Editor do seu projeto
2. Cole o conteúdo do arquivo e execute (depois as demais migrations em ordem).

**B) Via Supabase CLI**:
```bash
npx supabase link --project-ref <SEU_PROJECT_REF>
npx supabase db push
```

Em `supabase/config.toml`, substitua `YOUR_PROJECT_REF` pelo projeto do cliente.

### 4. Deploy das edge functions

```bash
npx supabase functions deploy leads --no-verify-jwt
npx supabase functions deploy lp-intake --no-verify-jwt
npx supabase functions deploy meta-leads --no-verify-jwt
npx supabase functions deploy create-user
npx supabase functions deploy update-user-role
npx supabase functions deploy google-calendar-sync --no-verify-jwt
npx supabase functions deploy agenda-sync --no-verify-jwt
npx supabase functions deploy whatsapp-webhook --no-verify-jwt
npx supabase functions deploy whatsapp-send
npx supabase functions deploy whatsapp-templates
npx supabase functions deploy whatsapp-send-template
npx supabase functions deploy sdr-handoff --no-verify-jwt
npx supabase functions deploy sdr-pausar --no-verify-jwt
```

> `--no-verify-jwt` em `leads` / `lp-intake` permite chamadas anônimas do site. A função valida o payload.
> `--no-verify-jwt` em `google-calendar-sync` é necessário para o callback do Google.
> `--no-verify-jwt` em `whatsapp-webhook` permite o POST da WAHA; a função valida `?secret=`.

Secrets:

```bash
npx supabase secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… GOOGLE_REDIRECT_URI=…
npx supabase secrets set WAHA_URL=… WAHA_API_KEY=… WAHA_SESSION=… WHATSAPP_WEBHOOK_SECRET=…
npx supabase secrets set CHATWOOT_URL=… CHATWOOT_ACCOUNT_ID=… CHATWOOT_TOKEN=…
npx supabase secrets set AGENDA_SYNC_SECRET=… AGENDA_CALENDAR_ID=agenda@empresa.example.com
```

(`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pelo Supabase.)

### 5. Redirect URI no Google Cloud

Authorized redirect URIs:

```
https://<SEU_PROJECT_REF>.supabase.co/functions/v1/google-calendar-sync/callback
```

### 6. Subir o frontend

```bash
npm run dev
```

### 7. Primeiro super_admin (bootstrap)

O signup público está off — `/auth` só permite login. Para o primeiro usuário:

1. Crie o usuário no Supabase Dashboard (`Authentication → Users → Add user`, Auto Confirm).
2. Promova no SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'voce@empresa.com';
```

3. Desligue signups públicos: `Authentication → Providers → Email → desmarcar "Enable Signups"`.

Daí em diante, novos usuários saem de `/admin/usuarios`.

## Endpoints públicos (webhooks)

```
POST https://<SEU_PROJECT_REF>.supabase.co/functions/v1/leads
Content-Type: application/json
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

## Comandos

```bash
npm run dev              # porta 8080
npm run build            # produção
npm run lint
npm run test             # vitest
```
