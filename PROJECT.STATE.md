# GrowthOS — PROJECT STATE

> Snapshot do estado do projeto em 2026-03-17 (pós-auditoria completa)

## Status Geral

| Aspecto | Status |
|---------|--------|
| **Fase** | MVP funcional — pré-produção |
| **Nota geral** | 4.7/10 |
| **Pronto para produção?** | NÃO — bugs de segurança críticos |
| **Linhas de código** | ~18.500 TypeScript |
| **Commits** | 17 (construído em ~1.5 dias) |
| **Testes** | ZERO |
| **Branch** | master |

---

## Scorecard

| Categoria | Nota | Status |
|-----------|------|--------|
| Funcionalidade | 7/10 | Dashboard e integrações core funcionam |
| Arquitetura | 7/10 | Bem estruturado para o tamanho |
| Segurança | 3/10 | 3 bugs críticos + 5 médios |
| Performance | 5/10 | Sem paginação, over-fetching |
| Qualidade de Código | 5/10 | ~50+ `any`, zero testes, código duplicado |
| Banco de Dados | 5/10 | Sem migrations no repo, RLS não verificado |
| Infraestrutura | 4/10 | Sem CI/CD, monitoramento, ou testes |
| Documentação | 2/10 | README padrão, sem API docs |

---

## O Que Funciona

### Core (Produção-Ready após fixes de segurança)
- [x] Autenticação Supabase (email/password + Google OAuth)
- [x] Multi-organização com switch
- [x] Dashboard com KPIs reais (impressões, cliques, custo, conversões, ROAS, CPA)
- [x] Auto-refresh a cada 30s (React Query) + sync Google Ads a cada 60s
- [x] Gráfico Receita vs Investimento (Recharts)
- [x] Health Score calculado por campanhas ativas
- [x] Card de vendas do checkout (pagas, pendentes, reembolsos, vinculadas)

### Google Ads Integration
- [x] OAuth flow completo (connect, disconnect, reconnect)
- [x] Multi-account support
- [x] Multilogin link (gerar link para terceiros conectarem)
- [x] Sync completo: campaigns, ad groups, keywords, search terms, geo, placements, device, hourly
- [x] Sync parcial (`campaigns_only`) para dashboard rápido
- [x] Métricas históricas (7 dias) para gráficos
- [x] Mutations: pausar/ativar campanha, alterar budget, adicionar palavra negativa

### Vendas Reais (Utmify/SellX)
- [x] Webhook receiver para SellxCheckout (order.paid, order.refunded, etc.)
- [x] Webhook receiver para SellxPay gateway (transaction.paid, etc.)
- [x] Webhook receiver para Utmify
- [x] Pull API para SellxPay (vendas históricas)
- [x] Pull API para Utmify (vendas históricas)
- [x] Campaign matching por 3 estratégias (sck/src, utm_campaign, utm_source)
- [x] Recálculo automático de real_roas, real_cpa, real_revenue
- [x] HMAC-SHA256 validation (SellX + Utmify)

### Multi-Gateway Webhooks
- [x] Stripe, MercadoPago, PagSeguro, Asaas, Hotmart, Kiwify, Eduzz
- [x] Normalização para interface `NormalisedPayment`
- [x] UTM tracking nas vendas
- [x] Contact matching por email

### IA (Claude API)
- [x] AI Analysis — analisa campanhas e gera decisões autônomas
- [x] AI Chat — interface conversacional com dados reais
- [x] AI Execute — executa decisões no Google Ads com guardrails
- [x] AI Budget Optimizer — otimização de alocação de budget
- [x] AI Creative Gen — geração de criativos por plataforma
- [x] AI Report — relatórios executivos automáticos
- [x] AI ROI Prediction — previsão de ROI com cenários
- [x] AI Audience Recommender — sugestão de públicos

### Scoring & Alerts
- [x] Health Score por campanha (CTR, CPA, ROAS, trend)
- [x] Lead Scoring com recency decay
- [x] Churn Predictor
- [x] Alert Checker com regras configuráveis + cooldown
- [x] Funnel Snapshot diário

### CRM
- [x] Lista de contatos
- [x] Pipeline Kanban (dnd-kit)
- [x] Detalhe de contato com timeline
- [x] Lifecycle stage automático

### Cron Jobs (Vercel)
- [x] sync: cada 2h (Google Ads + Utmify)
- [x] alerts: cada 15min
- [x] analysis: cada 4h (IA)
- [x] scoring: diário 6h (lead scoring + health + churn)
- [x] funnel: diário 5h
- [x] email-queue: cada 5min

---

## O Que NÃO Funciona / Bugs

### CRÍTICOS (impedem produção)

| # | Bug | Arquivo | Linha | Status |
|---|-----|---------|-------|--------|
| 1 | `fetchKeywords` sem filtro `organization_id` — vaza dados cross-org | `supabase-queries.ts` | 418 | ABERTO |
| 2 | HMAC bypass: sem signature header = sem validação | `sellx-webhook/index.ts` | 53 | ABERTO |
| 3 | Cron sem auth quando `CRON_SECRET` não definido | `cron/route.ts` | 112 | ABERTO |
| 4 | Sem webhook signature validation no `payment-webhooks` | `payment-webhooks/index.ts` | — | ABERTO |
| 5 | RLS do Supabase não verificado | Banco | — | ABERTO |

### MÉDIOS

| # | Bug | Arquivo | Status |
|---|-----|---------|--------|
| 6 | `rawAmount > 1000` ambíguo para detectar centavos | `sellx-webhook/index.ts:155` | ABERTO |
| 7 | OAuth tokens armazenados sem criptografia | `google-ads-api.ts:86` | ABERTO |
| 8 | Auto-sync duplicado em mount + interval | `dashboard/page.tsx:142` | ABERTO |
| 9 | CORS aceita qualquer `.vercel.app` | `cors.ts:23` | ABERTO |
| 10 | Secret em query params (vaza em logs) | `cron/route.ts:114` | ABERTO |
| 11 | `autoSyncDone` ref declarado mas nunca usado | `dashboard/page.tsx:110` | ABERTO |
| 12 | Supabase client module-level (token stale) | `supabase-queries.ts:3` | ABERTO |

### DÍVIDA TÉCNICA

| # | Item | Status |
|---|------|--------|
| 13 | Zero testes automatizados | ABERTO |
| 14 | ~50+ tipos `any` no código | ABERTO |
| 15 | Sem paginação em nenhuma query | ABERTO |
| 16 | Campaign matching duplicado em 3 webhooks | ABERTO |
| 17 | `integrations/page.tsx` com 835 linhas | ABERTO |
| 18 | Over-fetching (`select("*")` em todas as queries) | ABERTO |
| 19 | Sem Sentry/monitoramento de erros | ABERTO |
| 20 | README não customizado | ABERTO |
| 21 | ~25 páginas são placeholders "Em breve" | ABERTO |
| 22 | Sem migrations no repositório | ABERTO |
| 23 | GA4 e Search Console sync dependem de credentials não documentados | ABERTO |

---

## Páginas por Status

### Funcionais (dados reais do Supabase)
- `/dashboard` — Dashboard principal
- `/campaigns` — Lista de campanhas
- `/campaigns/[id]` — Detalhe de campanha
- `/sales` — Vendas do checkout
- `/crm` — Contatos + Pipeline
- `/crm/contacts/[id]` — Detalhe do contato
- `/funnel` — Funil de conversão
- `/insights` — Insights da IA
- `/insights/chat` — Chat com IA
- `/integrations` — Gestão de integrações
- `/settings` — Configurações
- `/reports` — Relatórios
- `/financial` — Financeiro
- `/goals` — Metas
- `/alerts` — Alertas
- `/analytics/search-terms` — Termos de busca
- `/analytics/quality-score` — Quality Score
- `/analytics/geo` — Geográfico
- `/analytics/placements` — Posicionamentos
- `/analytics/schedule` — Horários
- `/analytics/ltv` — LTV
- `/audiences` — Públicos
- `/automations` — Automações (overview)
- `/automations/email` — Sequências de email
- `/automations/rules` — Regras
- `/automations/whatsapp` — WhatsApp
- `/budget-optimizer` — Otimizador de budget
- `/creatives` — Biblioteca de criativos
- `/creatives/generate` — Gerador de criativos IA
- `/seo` — SEO keywords

### Placeholders / Em breve
- `/ab-tests` — Funcional mas sem backend real
- `/calendar` — Funcional mas dados locais
- `/call-tracking` — Mockup (depende Twilio)
- `/client-portal` — Mockup
- `/competitors` — Mockup (sem scraper)
- `/dashboard/custom` — Funcional mas simplificado
- `/landing-pages` — Mockup
- `/offline-conversions` — Mockup (CSV upload sem backend)
- `/tasks` — Kanban funcional mas sem persistência real

---

## Tabelas do Banco (inferidas das queries)

### Core
- `user_profiles` — perfis de usuário
- `organizations` — organizações/workspaces
- `organization_members` — user ↔ org (role: owner/admin/analyst/viewer)

### Google Ads
- `ad_accounts` — contas conectadas (tokens, status, last_sync)
- `campaigns` — campanhas (+ real_roas, real_cpa, real_revenue, health_score)
- `ad_groups` — grupos de anúncios
- `keywords` — palavras-chave com quality score
- `search_terms` — termos de busca com suggested_action
- `metrics_daily` — métricas diárias por entidade
- `metrics_by_hour` — métricas por hora/dia da semana
- `metrics_by_geo` — métricas geográficas
- `metrics_by_placement` — métricas por posicionamento
- `metrics_by_device` — métricas por dispositivo

### Vendas
- `utmify_sales` — vendas reais (todas as fontes)
- `sales` — vendas normalizadas (payment-webhooks)
- `utmify_config` — configuração Utmify por org

### CRM
- `contacts` — contatos com lead_score, lifecycle_stage, churn_risk_score
- `deals` — negócios
- `pipelines` — pipelines de venda
- `contact_timeline` — eventos do contato

### IA
- `ai_decisions` — decisões geradas pela IA
- `ai_analyses` — análises da IA
- `ai_chat_messages` — mensagens do chat
- `ai_reports` — relatórios gerados
- `ai_settings` — configurações da IA por org
- `ai_creative_suggestions` — criativos gerados
- `insights` — insights da IA

### Tracking & Analytics
- `tracking_events` — eventos do pixel
- `funnel_snapshots` — snapshots diários de funil
- `page_metrics_daily` — métricas GA4

### SEO
- `seo_keywords` — keywords orgânicas
- `seo_metrics_daily` — métricas SEO
- `seo_vs_paid` — cruzamento pago vs orgânico

### Automações
- `email_sequences` — sequências de email
- `email_sequence_steps` — passos da sequência
- `email_sends` — emails enviados
- `whatsapp_templates` — templates WhatsApp
- `automation_rules` — regras de automação
- `alert_rules` — regras de alerta
- `alerts` — alertas disparados

### Outros
- `audiences` — públicos
- `goals` — metas
- `goal_milestones` — marcos das metas
- `financial_records` — registros financeiros
- `tasks` — tarefas
- `calendar_events` — eventos do calendário
- `competitors` — concorrentes
- `competitor_ads` — anúncios de concorrentes
- `creative_library` — biblioteca de criativos
- `creative_performance` — performance de criativos
- `integrations` — integrações ativas
- `activity_log` — log de atividades

---

## Plano de Correção (Priorizado)

### Sprint 1 — Segurança (2-3h)
1. Fix `fetchKeywords` — adicionar filtro `organization_id`
2. Fix HMAC bypass — rejeitar request se secret configurado mas signature ausente
3. Fix cron auth — retornar 500 se `CRON_SECRET` não definido
4. Verificar/ativar RLS em todas as tabelas do Supabase
5. Remover `?secret=` query param do cron

### Sprint 2 — Estabilidade (4-6h)
6. Gerar tipos TypeScript com `supabase gen types`
7. Adicionar paginação nas queries principais (contacts, sales, keywords)
8. Extrair campaign matching para módulo shared
9. Fix amount detection (centavos vs reais) com campo explícito
10. Configurar Sentry para monitoramento

### Sprint 3 — Qualidade (1-2 dias)
11. Adicionar testes para webhooks e campaign matching
12. Substituir `any` por tipos reais
13. Dividir `integrations/page.tsx` em componentes
14. Otimizar queries (select campos específicos)
15. Documentar API e README
