# Backend VORTEX (Nest.js)

API do CRM. O frontend não fala mais com o banco: autentica em JWT e consulta `/api/v1/query`.

```
src/
  core/                 JWT, Prisma, filtros
  modules/
    identity/           login, convite, papéis
    crm/                tabelas do CRM + carteira
    ingest/             leads e indicadores de ads
    functions/          aliases das edge functions antigas
    health/
prisma/                 schema + migrations + seed
```

```bash
cp .env.example .env
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

Com Bun: `bun install`, `bunx prisma migrate deploy`, `bunx prisma db seed`, `bun run start:dev`.
