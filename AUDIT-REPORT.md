# GrowthOS — Relatório de Auditoria Completa

> Auditoria realizada em 2026-03-17 por Claude (Auditor Sênior de Software)
> Escopo: 100% dos arquivos do projeto (~18.500 linhas TypeScript)

---

## FASE 1 — RAIO-X DO PROJETO

### 1.1 Identidade

| Item | Detalhe |
|------|---------|
| **Sistema** | Plataforma SaaS de gestão de tráfego pago e marketing digital com IA |
| **Problema** | Centralizar Google Ads + vendas reais para calcular ROAS verdadeiro |
| **Público** | Gestores de tráfego e agências de marketing digital no Brasil |
| **Diferencial** | "ROAS Real" — vendas confirmadas via webhook, não conversões do Google |
| **Idade** | ~1.5 dias (16-17 Mar 2026, 17 commits) |

### 1.2 Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | Next.js (App Router) | 14.2.35 |
| UI | React + TypeScript | 18.x + 5.x |
| Styling | Tailwind CSS + Radix UI (shadcn) | 3.4 |
| State | Zustand + TanStack React Query | 5.x + 5.90 |
| Backend | Supabase (Edge Functions, Deno) | — |
| Banco | PostgreSQL (Supabase managed) | — |
| IA | Claude API (Anthropic) | claude-sonnet-4-6 |
| Charts | Recharts | 3.8 |
| Animations | Framer Motion | 12.36 |
| Forms | React Hook Form + Zod | 7.71 + 4.3 |
| DnD | @dnd-kit | 6.3 |
| Deploy | Vercel + Supabase | — |

### 1.3 Mapa de Arquivos

```
TOTAL: ~120 arquivos TypeScript (excl. node_modules)

src/                          # Frontend Next.js
├── app/(app)/               # 38 páginas protegidas
│   ├── dashboard/           # Dashboard principal + custom dashboards
│   ├── campaigns/           # CRUD + detalhe + create
│   ├── sales/               # Vendas do checkout
│   ├── crm/                 # Contatos + pipeline + detalhe
│   ├── funnel/              # Funil + jornada
│   ├── insights/            # IA insights + chat
│   ├── integrations/        # Google Ads, Utmify, SellX
│   ├── analytics/           # 6 sub-páginas (geo, ltv, placements, etc.)
│   ├── automations/         # Email, WhatsApp, regras
│   └── [12 outras páginas]  # reports, financial, goals, settings, etc.
├── app/(auth)/              # 3 páginas (login, register, forgot-password)
├── app/api/                 # 3 rotas (cron, auth callback, Google callback)
├── components/              # 28 componentes (2 layout + 11 shared + 12 ui + 3 providers)
└── lib/                     # 10 módulos (4 hooks + 2 services + 3 supabase + 1 utils)

supabase/functions/           # Backend Edge Functions
├── _shared/                 # 4 módulos (auth, cors, claude-client, google-ads-api)
└── [26 edge functions]      # Sync, webhooks, IA, scoring, etc.
```

### 1.4 Fluxo do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                      ENTRY POINTS                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Browser ──→ Next.js Middleware ──→ Supabase Auth ──→ Pages │
│                                                              │
│  Webhooks ──→ Edge Functions ──→ PostgreSQL                  │
│    (SellX, Utmify, Hotmart, Stripe, etc.)                   │
│                                                              │
│  Vercel Cron ──→ /api/cron ──→ Edge Functions                │
│    (sync, alerts, analysis, scoring, funnel, email)          │
│                                                              │
│  Google OAuth ──→ /connections/callback ──→ Token saved      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                      DATA FLOW                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Google Ads API ──→ google-ads-sync ──→ campaigns,           │
│                      metrics_daily, ad_groups, keywords      │
│                                                              │
│  Webhook (venda) ──→ utmify_sales ──→ campaign matching      │
│                       ──→ real_roas, real_cpa recalculados   │
│                                                              │
│  Dashboard ──→ React Query ──→ supabase-queries.ts           │
│                ──→ Supabase ──→ PostgreSQL                   │
│                                                              │
│  IA ──→ Claude API ──→ Decisões/Insights ──→ PostgreSQL      │
│         ──→ Google Ads API (execução automática)             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## FASE 2 — O QUE FUNCIONA ✅

### 2.1 Arquitetura

| Item | Evidência | Por que é bom |
|------|-----------|---------------|
| Separação de camadas | `hooks/` → `services/` → `supabase/` | Fácil de testar e manter; cada camada tem responsabilidade clara |
| Padrão de hooks | `use-supabase-data.ts` wraps `supabase-queries.ts` | Desacopla React Query da lógica de fetch |
| Edge functions modulares | `_shared/` com auth, cors, claude-client | DRY — reutilizados em 30 functions |
| Multi-tenant | `organization_id` em todas as queries (exceto 1 bug) | Isolamento de dados entre orgs |

### 2.2 Auth (auth-provider.tsx)

| Item | Linha | Por que é bom |
|------|-------|---------------|
| Multi-org com switch | 155-165 | Persistência via localStorage, switch sem reload |
| Memoização correta | 167-184 | `useMemo` no value, `useCallback` em todos os métodos |
| Timeout fallback | 62 | 3s timeout previne loading infinito se auth falhar |
| Sign-up completo | 103-131 | Cria profile + org + member + ai_settings + utmify_config atomicamente |
| Auth state listener | 74-87 | `onAuthStateChange` mantém estado sincronizado |

### 2.3 Dashboard (dashboard/page.tsx)

| Item | Linha | Por que é bom |
|------|-------|---------------|
| Auto-refresh 30s | via React Query | Dados sempre atualizados sem reload |
| Auto-sync Google Ads 60s | 113-147 | Verifica `last_sync_at` antes de sincronizar (eficiente) |
| Health Score client-side | 70-90 | Cálculo rápido sem edge function |
| Vendas do checkout inline | 29-68 | Query dedicada com `refetchInterval: 30s` |
| Métricas derivadas | 36-39 | CTR, CPC, CPA, ROAS calculados corretamente |

### 2.4 Webhook Receivers

| Item | Arquivo | Por que é bom |
|------|---------|---------------|
| HMAC-SHA256 validation | sellx-webhook:54-69 | `crypto.subtle` para validação segura (quando funciona) |
| Multi-gateway normalização | payment-webhooks | 7 plataformas → 1 interface `NormalisedPayment` |
| Campaign matching 3 estratégias | sellx-webhook:226-265 | sck/src (95%), utm_campaign (70-85%), utm_source (20%) |
| ROAS recálculo automático | sellx-webhook:280-312 | Toda venda paga recalcula `real_roas` da campanha |
| Contact lifecycle | sellx-webhook:316-341 | Promove contato para "customer" automaticamente |

### 2.5 Google Ads Integration

| Item | Arquivo | Por que é bom |
|------|---------|---------------|
| Token refresh automático | google-ads-api:67-114 | Renova token expirado e atualiza status |
| Timeout de 30s | google-ads-api:128-129 | `AbortController` previne requests pendentes |
| Sync scope parcial | google-ads-sync:24 | `campaigns_only` para dashboard rápido |
| 7 tipos de dados sync | google-ads-sync | Campanhas, ad groups, keywords, search terms, geo, placements, device, hourly |
| Mutations completas | google-ads-api:228-332 | Pause, activate, budget, negative keywords |

### 2.6 IA (Claude)

| Item | Arquivo | Por que é bom |
|------|---------|---------------|
| Guardrails no execute | ai-execute | Confidence threshold, daily limit (20), budget limit (30%) |
| System prompt com dados reais | ai-chat:76-94 | Campanhas + vendas + decisões anteriores no contexto |
| Traffic Manager prompt | claude-client:64-119 | Regras claras de ROAS real vs. conversões Google |
| 8 funções de IA | edge functions | Analysis, chat, execute, budget, creative, report, ROI, audience |

### 2.7 Cron & Scoring

| Item | Arquivo | Por que é bom |
|------|---------|---------------|
| 6 jobs configurados | vercel.json | Frequências adequadas (alerts/15min, sync/2h, etc.) |
| Alert cooldown 60min | alert-checker | Evita spam de alertas |
| Lead scoring com decay | lead-scoring | Eventos antigos perdem peso |
| Health score ponderado | health-score | CTR(25%) + CPA(30%) + ROAS(25%) + Conv(10%) + Trend(10%) |

---

## FASE 3 — O QUE NÃO FUNCIONA ❌

### 3.1 Bugs Críticos

#### BUG #1 — Vazamento de dados cross-org em keywords
- **Arquivo:** `src/lib/services/supabase-queries.ts`
- **Linha:** 415-424
- **Código problemático:**
  ```typescript
  export async function fetchKeywords(orgId: string) {
    const { data, error } = await supabase
      .from("keywords")
      .select("*")
      .order("cost", { ascending: false })  // ← FALTA .eq("organization_id", orgId)
      .limit(500);
  ```
- **Impacto:** Qualquer usuário logado vê keywords de TODAS as organizações. Vazamento de dados competitivos.
- **Correção:** Adicionar `.eq("organization_id", orgId)` antes do `.order()`.

#### BUG #2 — HMAC bypass no sellx-webhook
- **Arquivo:** `supabase/functions/sellx-webhook/index.ts`
- **Linha:** 53
- **Código problemático:**
  ```typescript
  if (webhookSecret && signature) {
    // Validação HMAC só acontece se AMBOS existem
    // Se o atacante não enviar x-webhook-signature, BYPASS total
  }
  ```
- **Impacto:** Qualquer pessoa pode enviar vendas falsas para qualquer org via POST direto.
- **Correção:** Se `webhookSecret` está configurado, EXIGIR signature. Rejeitar com 401 se ausente.

#### BUG #3 — Cron jobs sem autenticação
- **Arquivo:** `src/app/api/cron/route.ts`
- **Linha:** 112-119
- **Código problemático:**
  ```typescript
  if (CRON_SECRET) {                    // Se CRON_SECRET não definido...
    const isAuthorized = ...;           // ...este bloco é PULADO
    if (!isAuthorized) return 401;
  }
  // Continua sem auth!
  ```
- **Impacto:** Se `CRON_SECRET` não está no `.env`, qualquer um pode executar TODOS os jobs (sync, analysis, scoring, etc.) via GET `/api/cron?job=all`.
- **Correção:** Inverter: se `!CRON_SECRET`, retornar 500 ("CRON_SECRET not configured").

#### BUG #4 — Sem webhook signature no payment-webhooks
- **Arquivo:** `supabase/functions/payment-webhooks/index.ts`
- **Linha:** Todo o handler
- **Problema:** Aceita payloads de qualquer origem sem nenhuma validação de assinatura. Stripe, Hotmart, Kiwify, etc. todos fornecem signatures — nenhuma é verificada.
- **Impacto:** Vendas falsas podem ser injetadas por qualquer IP.
- **Correção:** Implementar verificação de signature por plataforma.

#### BUG #5 — RLS não verificado
- **Problema:** Toda segurança de dados multi-tenant depende de RLS (Row Level Security) do Supabase estar ativo. O código client-side usa `anon` key e queries diretas. Se RLS não estiver configurado, o Supabase retorna dados de TODAS as orgs.
- **Impacto:** Potencial vazamento total de dados.
- **Correção:** Verificar/ativar RLS em todas as tabelas com policy `organization_id = auth.uid()` ou via `organization_members`.

### 3.2 Bugs Médios

#### BUG #6 — Detecção ambígua de centavos vs. reais
- **Arquivo:** `supabase/functions/sellx-webhook/index.ts`
- **Linha:** 154-155
- **Código:** `revenue = rawAmount > 1000 ? rawAmount / 100 : rawAmount;`
- **Problema:** Um produto de R$15,00 enviado como 1500 centavos seria corretamente dividido. Mas R$999 ficaria R$999 (correto se já é reais, errado se é 999 centavos = R$9,99). Ambíguo para valores 100-999.

#### BUG #7 — Tokens OAuth sem criptografia
- **Arquivo:** `supabase/functions/_shared/google-ads-api.ts`
- **Linha:** 86-88
- **Problema:** Campos `access_token_encrypted` e `refresh_token_encrypted` sugerem criptografia, mas o código usa os valores diretamente como tokens. Armazenados em texto puro.

#### BUG #8 — Auto-sync duplicado
- **Arquivo:** `src/app/(app)/dashboard/page.tsx`
- **Linha:** 142-143
- **Problema:** `syncGoogleAds()` é chamado imediatamente no mount (linha 142) E depois a cada 60s (linha 145). Se o componente re-monta (navigation), dispara sync desnecessário.

#### BUG #9 — CORS permissivo
- **Arquivo:** `supabase/functions/_shared/cors.ts`
- **Linha:** 23
- **Código:** `origin.endsWith('.vercel.app')`
- **Problema:** Aceita requests de QUALQUER subdomain `.vercel.app` — qualquer app deployada no Vercel pode fazer requests.

#### BUG #10 — Secret em query params
- **Arquivo:** `src/app/api/cron/route.ts`
- **Linha:** 114
- **Código:** `cronSecret === CRON_SECRET` (via `searchParams.get("secret")`)
- **Problema:** Secrets em URLs aparecem em logs de acesso, Vercel dashboard, browser history, referrer headers.

#### BUG #11 — Ref não utilizada
- **Arquivo:** `src/app/(app)/dashboard/page.tsx`
- **Linha:** 110
- **Código:** `const autoSyncDone = useRef(false);`
- **Problema:** Declarada mas nunca lida ou escrita. Código morto.

#### BUG #12 — Supabase client module-level
- **Arquivo:** `src/lib/services/supabase-queries.ts` (linha 3) e `src/lib/services/edge-functions.ts` (linha 3)
- **Código:** `const supabase = createClient();`
- **Problema:** Cria client browser uma vez no import do módulo. Se o token de sessão expirar durante uso prolongado, o client continua com credenciais stale.

---

## FASE 4 — ANÁLISE CÓDIGO POR CÓDIGO 🔬

### Arquivos Core

#### src/lib/services/supabase-queries.ts
- **Propósito:** Todas as queries Supabase client-side
- **Status:** ⚠️ Parcial (bug crítico)
- **Qualidade:** 6/10
- **Problemas:** Bug #1 (fetchKeywords sem org filter), `select("*")` em todas as queries, sem paginação
- **Bom:** Padrão consistente, fácil de manter, queries bem organizadas por domínio

#### src/lib/hooks/use-supabase-data.ts
- **Propósito:** React Query hooks wrapping supabase-queries
- **Status:** ✅ Funcional
- **Qualidade:** 8/10
- **Bom:** `enabled: !!orgId`, `refetchInterval` configurável, query keys consistentes

#### src/lib/services/edge-functions.ts
- **Propósito:** Invokers de edge functions
- **Status:** ⚠️ Parcial (client module-level)
- **Qualidade:** 7/10
- **Bom:** Tipagem genérica no `invoke<T>`, funções bem nomeadas

#### src/components/providers/auth-provider.tsx
- **Propósito:** Provider de autenticação + multi-org
- **Status:** ✅ Funcional
- **Qualidade:** 8/10
- **Bom:** Memoização correta, sign-up completo, multi-org

#### src/app/(app)/dashboard/page.tsx
- **Propósito:** Dashboard principal
- **Status:** ✅ Funcional
- **Qualidade:** 7/10
- **Problemas:** `autoSyncDone` não usado, sync duplicado, muitos `any`
- **Bom:** Auto-refresh, health score, vendas reais, gráficos

#### src/app/(app)/integrations/page.tsx
- **Propósito:** Gestão de integrações (Google Ads, Utmify, SellX)
- **Status:** ✅ Funcional
- **Qualidade:** 5/10
- **Problemas:** 835 linhas (deveria ser dividido), 15+ `any`, muitos useState
- **Bom:** Funcionalidade completa, UX boa

### Edge Functions Core

#### supabase/functions/google-ads-sync/index.ts
- **Propósito:** Sync completo Google Ads → Supabase
- **Status:** ✅ Funcional
- **Qualidade:** 8/10
- **Problemas:** 436 linhas, upserts sequenciais (N+1)
- **Bom:** 7 tipos de sync, scope parcial, métricas históricas

#### supabase/functions/sellx-webhook/index.ts
- **Propósito:** Receiver de webhooks SellX
- **Status:** ⚠️ HMAC bypass
- **Qualidade:** 7/10
- **Problemas:** Bug #2 (HMAC bypass), Bug #6 (centavos ambíguo)
- **Bom:** Campaign matching 3 estratégias, ROAS recálculo

#### supabase/functions/payment-webhooks/index.ts
- **Propósito:** Multi-gateway webhook normalizer
- **Status:** ⚠️ Sem signature validation
- **Qualidade:** 8/10
- **Problemas:** Bug #4 (sem HMAC)
- **Bom:** 7 parsers, normalização elegante, contact matching

#### supabase/functions/_shared/google-ads-api.ts
- **Propósito:** Google Ads API helpers + GAQL queries
- **Status:** ✅ Funcional
- **Qualidade:** 7/10
- **Problemas:** String interpolation em GAQL, tokens sem criptografia
- **Bom:** Token refresh, timeout, mutations completas

#### supabase/functions/_shared/claude-client.ts
- **Propósito:** Claude API wrapper
- **Status:** ✅ Funcional
- **Qualidade:** 8/10
- **Bom:** Interface limpa, Traffic Manager prompt detalhado

#### supabase/functions/ai-execute/index.ts
- **Propósito:** Executa decisões da IA no Google Ads
- **Status:** ✅ Funcional
- **Qualidade:** 8/10
- **Bom:** Guardrails (confidence, daily limit, budget limit), rollback tracking

---

## FASE 5 — SEGURANÇA 🔒

| # | Severidade | Vulnerabilidade | Arquivo:Linha | Detalhe |
|---|-----------|----------------|---------------|---------|
| 1 | 🔴 CRÍTICA | Vazamento cross-org | supabase-queries.ts:418 | `fetchKeywords` sem `organization_id` filter |
| 2 | 🔴 CRÍTICA | HMAC bypass | sellx-webhook/index.ts:53 | Sem signature = sem validação |
| 3 | 🔴 CRÍTICA | Cron sem auth | cron/route.ts:112 | `CRON_SECRET` vazio = acesso livre |
| 4 | 🔴 CRÍTICA | Sem webhook HMAC | payment-webhooks/index.ts | 7 gateways sem verificação |
| 5 | 🔴 CRÍTICA | RLS não verificado | Supabase | Multi-tenant depende disso |
| 6 | 🟡 MÉDIA | Secret em URL | cron/route.ts:114 | Query params vazam em logs |
| 7 | 🟡 MÉDIA | Tokens sem crypto | google-ads-api.ts:86 | OAuth tokens em texto puro |
| 8 | 🟡 MÉDIA | CORS permissivo | cors.ts:23 | Qualquer `.vercel.app` aceito |
| 9 | 🟡 MÉDIA | GAQL interpolation | google-ads-api.ts:364 | String interpolation em queries |
| 10 | 🟢 BAIXA | Console.log dados | Vários edge functions | Logs expõem UTMs, emails |
| 11 | 🟢 BAIXA | `any` types | Eslint desativado | Erros de tipo não detectados |

---

## FASE 6 — PERFORMANCE ⚡

| # | Problema | Arquivo | Impacto | Sugestão |
|---|---------|---------|---------|----------|
| 1 | Sem paginação | supabase-queries.ts (todas) | Com 10k+ registros = timeout | Adicionar `.range(from, to)` |
| 2 | `select("*")` | supabase-queries.ts (todas) | Over-fetching em todas as queries | Selecionar campos necessários |
| 3 | Auto-sync por tab | dashboard/page.tsx:145 | N tabs = N syncs simultâneos | Usar `BroadcastChannel` ou lock |
| 4 | N+1 queries no sync | google-ads-sync/index.ts:79 | 100 campanhas = 100 upserts | Batch upsert |
| 5 | Sem cache de função | edge-functions.ts | Health score recalculado sempre | Cache de 5min |
| 6 | Sem useMemo | dashboard/page.tsx:158-162 | 5 arrays recriados a cada render | Memoizar sparkData |
| 7 | Bundle pesado | package.json | framer-motion(100KB) + recharts(150KB) | Lazy import / dynamic |
| 8 | Sem indexação | Inferido | Queries com `.order("cost")` | Criar índices compostos |

---

## FASE 7 — QUALIDADE DE CÓDIGO 📐

| Aspecto | Nota | Detalhe |
|---------|------|---------|
| Consistência de nomes | 8/10 | snake_case banco, camelCase código — consistente |
| DRY | 6/10 | `_shared/` bom, mas campaign matching duplicado 3x |
| SOLID | 5/10 | SRP violado em google-ads-sync (436L) e integrations (835L) |
| Tipagem | 3/10 | ~50+ `any`, eslint `no-explicit-any: off` |
| Testes | 0/10 | Zero testes |
| Tratamento de erros | 5/10 | Edge functions logam + 500; frontend swallows erros |
| Complexidade | 6/10 | Poucas funções muito complexas |
| Consistência de estilo | 8/10 | Padrão uniforme em todo o projeto |
| Tamanho de arquivos | 5/10 | integrations(835L), google-ads-sync(436L), supabase-queries(436L) |
| Código morto | 7/10 | Apenas `autoSyncDone` ref + ~25 placeholders |

---

## FASE 8 — BANCO DE DADOS 🗄️

| Aspecto | Status | Detalhe |
|---------|--------|---------|
| Tabelas | ~50+ | Inferidas das queries (não temos acesso direto ao schema) |
| Migrations | ❌ | Nenhuma no repositório (provavelmente via Supabase dashboard) |
| Upserts | ✅ | `onConflict` usado corretamente em syncs |
| Constraints | ✅ | Unique constraints implícitos pelos `onConflict` |
| RLS | ❓ | Não verificado — CRÍTICO para multi-tenant |
| Transações | ❌ | Sign-up cria 4 registros sem transação |
| Índices | ❓ | Sem visibilidade — queries com `.order()` podem ser lentas |
| Soft delete | ❌ | Hard delete implícito (sem `deleted_at` em queries) |
| Timestamps | ✅ | `created_at` em todas as tabelas (inferido) |

---

## FASE 9 — INFRAESTRUTURA 🏗️

| Aspecto | Status | Detalhe |
|---------|--------|---------|
| package.json | ✅ | Deps atualizadas, sem vulnerabilidades óbvias |
| .gitignore | ✅ | `.env*.local` e `.claude/` excluídos |
| .env.example | ✅ | 14 variáveis documentadas |
| .env.local | ⚠️ | Existe mas NÃO commitado (correto) |
| CI/CD | ❌ | Apenas deploy Vercel via git push, sem pipeline |
| Testes | ❌ | Zero. Nem framework configurado |
| Linting | ⚠️ | ESLint ativo mas `no-explicit-any: off` |
| Docker | ❌ | Não existe |
| Monitoramento | ❌ | Apenas `console.error`, sem Sentry/LogRocket |
| README | ❌ | Padrão Create Next App (não customizado) |
| API docs | ❌ | Nenhuma documentação de API |
| Cron | ✅ | 6 jobs em vercel.json com frequências adequadas |

---

## FASE 10 — DIAGNÓSTICO FINAL 🏥

### Scorecard

| Categoria | Nota (1-10) | Status |
|-----------|-------------|--------|
| Funcionalidade | 7 | ✅ Core funciona |
| Arquitetura | 7 | ✅ Bem estruturado |
| Segurança | 3 | 🔴 Crítico |
| Performance | 5 | 🟡 Aceitável para MVP |
| Qualidade de Código | 5 | 🟡 Dívida técnica alta |
| Banco de Dados | 5 | 🟡 Sem visibilidade de RLS |
| Infraestrutura | 4 | 🔴 Sem testes/CI/monitoramento |
| Documentação | 2 | 🔴 Inexistente |
| **NOTA GERAL** | **4.7** | **NÃO pronto para produção** |

### Veredito

**Estado:** MVP funcional com bugs de segurança críticos e dívida técnica significativa.

**Pronto para produção?** **NÃO.** 5 vulnerabilidades críticas impedem deploy com dados reais de clientes. Estimo 2-3h para fixes urgentes, 1-2 dias para estabilização completa.

### Top 10 Problemas Críticos

| # | Prioridade | Problema | Esforço |
|---|-----------|----------|---------|
| 1 | 🔴 P0 | fetchKeywords vaza dados cross-org | 5 min |
| 2 | 🔴 P0 | HMAC bypass no sellx-webhook | 15 min |
| 3 | 🔴 P0 | Cron sem auth quando secret vazio | 10 min |
| 4 | 🔴 P0 | payment-webhooks sem HMAC | 1h |
| 5 | 🔴 P0 | RLS não verificado no Supabase | 30 min |
| 6 | 🟡 P1 | Zero testes automatizados | 1 dia |
| 7 | 🟡 P1 | ~50+ any types | 4h |
| 8 | 🟡 P1 | Sem paginação | 2h |
| 9 | 🟡 P1 | Campaign matching duplicado 3x | 1h |
| 10 | 🟡 P1 | Sem monitoramento de erros | 30 min |

### Plano de Ação

#### 🔴 Sprint 1 — URGENTE (corrigir AGORA) — ~2-3h
1. Adicionar `.eq("organization_id", orgId)` em `fetchKeywords`
2. Rejeitar webhook sem signature quando secret configurado
3. Retornar 500 se `CRON_SECRET` não definido
4. Adicionar HMAC validation por plataforma em payment-webhooks
5. Verificar RLS em todas as tabelas do Supabase
6. Remover `?secret=` query param do cron

#### 🟡 Sprint 2 — IMPORTANTE (esta semana) — ~1-2 dias
7. Gerar tipos TypeScript com `supabase gen types`
8. Adicionar paginação (contacts, sales, keywords, search terms)
9. Extrair campaign matching para `_shared/campaign-matching.ts`
10. Fix amount detection (campo explícito no webhook)
11. Configurar Sentry/monitoramento
12. Limitar CORS a domínios específicos

#### 🟢 Sprint 3 — MELHORIA (próximas 2 semanas) — ~3-5 dias
13. Testes para webhooks e campaign matching
14. Substituir `any` por tipos reais
15. Dividir `integrations/page.tsx` em componentes
16. Otimizar queries (`select` campos específicos)
17. Implementar ou remover páginas placeholder
18. Criptografar tokens OAuth
19. Documentação (README, API docs)
20. CI/CD pipeline com lint + test

---

*Auditoria concluída. 120 arquivos analisados, ~18.500 linhas de código revisadas.*
