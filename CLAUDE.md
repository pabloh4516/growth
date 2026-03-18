# GrowthOS — CLAUDE.md

## Projeto

GrowthOS é uma plataforma SaaS de gestão de tráfego pago e marketing digital com IA. Centraliza dados de Google Ads + vendas reais de plataformas brasileiras (SellX, Utmify, Hotmart, Kiwify, Eduzz, Stripe, MercadoPago, PagSeguro, Asaas) para calcular ROAS real (vendas confirmadas, não conversões do Google).

## Stack

- **Frontend:** Next.js 14.2 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS 3.4, Radix UI (shadcn/ui), Framer Motion
- **State:** Zustand (period store), TanStack React Query (server state)
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Edge Functions:** Deno (Supabase Functions) — 30 functions + 4 shared modules
- **IA:** Claude API (Anthropic) via `_shared/claude-client.ts`
- **Deploy:** Vercel (frontend) + Supabase (backend)
- **Cron:** Vercel Cron Jobs → `/api/cron` → Edge Functions

## Estrutura de Diretórios

```
src/
├── app/
│   ├── (app)/          # Páginas protegidas (38 rotas)
│   │   ├── dashboard/  # Dashboard principal
│   │   ├── campaigns/  # Campanhas Google Ads
│   │   ├── sales/      # Vendas do checkout
│   │   ├── crm/        # CRM + Pipeline
│   │   ├── funnel/     # Funil de conversão
│   │   ├── insights/   # IA insights + chat
│   │   ├── integrations/ # Conexões com plataformas
│   │   ├── analytics/  # Geo, LTV, placements, quality score, schedule, search terms
│   │   ├── automations/ # Email, WhatsApp, regras
│   │   └── ...         # reports, financial, goals, settings, etc.
│   ├── (auth)/         # Login, register, forgot-password
│   └── api/            # cron, auth callback, Google Ads callback
├── components/
│   ├── layout/         # header.tsx, sidebar.tsx
│   ├── providers/      # auth-provider, query-provider, index
│   ├── shared/         # kpi-card, data-table, health-gauge, etc.
│   └── ui/             # shadcn components (button, card, input, etc.)
└── lib/
    ├── hooks/          # use-auth, use-org, use-period, use-supabase-data
    ├── services/       # supabase-queries.ts, edge-functions.ts
    ├── supabase/       # client.ts, server.ts, middleware.ts
    └── utils.ts        # cn, formatBRL, formatNumber, formatCompact, formatPercent

supabase/functions/
├── _shared/            # auth.ts, cors.ts, claude-client.ts, google-ads-api.ts
├── google-ads-sync/    # Sync campanhas, ad groups, keywords, metrics
├── google-ads-oauth/   # OAuth flow + mutations (pause, budget, negative kw)
├── sellx-webhook/      # Webhook SellxCheckout + SellxPay
├── sellx-sync/         # Pull histórico SellxPay API
├── utmify-webhook/     # Webhook vendas Utmify
├── utmify-sync/        # Pull histórico Utmify API
├── payment-webhooks/   # Multi-gateway (Stripe, Hotmart, Kiwify, Eduzz, etc.)
├── ai-analysis/        # IA autônoma — analisa e decide
├── ai-chat/            # Chat conversacional com IA
├── ai-execute/         # Executa decisões da IA no Google Ads
├── ai-budget-optimizer/ # Otimização de budget com IA
├── ai-creative-gen/    # Geração de criativos com IA
├── ai-audience-recommender/ # Recomendação de públicos
├── ai-report/          # Relatórios executivos com IA
├── ai-roi-prediction/  # Previsão de ROI
├── health-score/       # Score de saúde por campanha
├── lead-scoring/       # Scoring de leads com decay
├── churn-predictor/    # Previsão de churn
├── alert-checker/      # Monitoramento de regras de alerta
├── funnel-snapshot/    # Snapshot diário de funil
├── tracking-script/    # Pixel de tracking JavaScript
├── email-sender/       # Envio de emails via Resend
├── ga4-sync/           # Sync Google Analytics 4
├── search-console-sync/ # Sync Google Search Console
├── create-google-audience/ # Cria lista no Google Ads
└── generate-audiences/ # Gera audiências com IA
```

## Padrões do Código

### Queries Supabase (client-side)
- Todas em `src/lib/services/supabase-queries.ts`
- Cada query recebe `orgId` como primeiro parâmetro e filtra por `organization_id`
- Hooks wrapper em `src/lib/hooks/use-supabase-data.ts` usando React Query
- React Query com `enabled: !!orgId` para evitar queries sem org

### Edge Functions
- Padrão: `serve(async (req) => { ... })` do Deno
- CORS via `_shared/cors.ts`
- Auth via `_shared/auth.ts` — `validateAuth(req)` para user, `validateCronSecret(req)` para cron
- Supabase client via `_shared/auth.ts` — `getSupabaseClient()` (service role)
- IA via `_shared/claude-client.ts` — `callClaude({ system, messages, maxTokens })`

### Componentes
- UI primitivos: shadcn/ui em `components/ui/`
- Shared: `components/shared/` (KPICard, DataTable, HealthGauge, InsightCard, etc.)
- Todas as páginas são `"use client"` com hooks de dados

### Conceito Core: ROAS Real
- Conversões do Google Ads NÃO são vendas reais
- Vendas reais vêm de webhooks (Utmify, SellX, etc.) → tabela `utmify_sales`
- Campaign matching vincula venda → campanha por UTM/sck/src
- `real_roas`, `real_cpa`, `real_revenue`, `real_sales_count` nas campanhas

## Comandos

```bash
npm run dev      # Dev server (localhost:3000)
npm run build    # Build de produção
npm run lint     # ESLint
npx supabase functions serve  # Edge functions local
npx supabase db diff          # Ver mudanças no schema
```

## Variáveis de Ambiente

Ver `.env.example` para a lista completa. Mínimo para dev:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

Edge functions usam secrets do Supabase:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`
- `ANTHROPIC_API_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY`

## Regras Importantes

1. **NUNCA confie em conversões do Google como vendas** — sempre use dados da Utmify/SellX
2. **Toda query client-side DEVE filtrar por `organization_id`** — multi-tenant
3. **Edge functions de webhook usam `getWebhookCorsHeaders()` (CORS: *)** — são públicas
4. **Edge functions autenticadas usam `getCorsHeaders(req)`** — validam origin
5. **Cron jobs passam por `/api/cron` que valida `CRON_SECRET`** antes de chamar edge functions
6. **Supabase RLS é a camada final de segurança** — deve estar ativo em todas as tabelas
7. **Componentes UI seguem shadcn/ui** — não reinventar primitivos
8. **Idioma da UI é português brasileiro** — código e variáveis em inglês
