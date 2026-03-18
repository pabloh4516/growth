# GrowthOS — Plano de Implementação: Migração MarketOS v2

> Migrar visual + funcionalidades do MarketOS v2 (HTML) para o GrowthOS (Next.js + Supabase)
> Criado em: 2026-03-18
> Última atualização: 2026-03-18

---

## Resumo

- **Origem:** MarketOS v2 — SPA HTML/CSS/JS com 32 páginas, dados fictícios
- **Destino:** GrowthOS — Next.js 14 + Supabase, 45 páginas, backend real
- **Objetivo:** Visual e UX idênticos ao MarketOS, com dados e funcionalidades reais
- **Status geral:** 🟢 COMPLETO — Todas as 34 páginas migradas para MarketOS design, dados reais

---

## Legenda

- ⬜ Não iniciado
- 🔄 Em andamento
- ✅ Concluído
- ⏭️ Pulado (não necessário)

---

## FASE 1 — Design System (Base Visual)

> Atualizar cores, fontes, componentes base para ficar idêntico ao MarketOS.
> Tudo que vier depois depende desta fase.

### 1.1 — Paleta de Cores
- ✅ Atualizar `globals.css` — variáveis CSS dark mode para match MarketOS
  - `--bg: #09090E`, `--s1: #0F0F17`, `--s2: #14141E`, `--s3: #1A1A27`, `--s4: #21212F`
  - `--purple: #8B7FFF`, `--green: #29D98A`, `--red: #FF4466`, `--amber: #F5A000`, `--blue: #5B9EFF`
  - Bordas: `rgba(255,255,255,0.055)` e `rgba(255,255,255,0.10)`
  - Textos: `#EEEEF8`, `#9090B0`, `#50506A`, `#30303F`
- ✅ Atualizar `tailwind.config.ts` — mapear novas cores para classes Tailwind
- ✅ Remover modo light (app é dark-only como MarketOS)

### 1.2 — Tipografia
- ✅ Trocar fonte heading de "Plus Jakarta Sans" para **"Syne"** (weight 400-800)
- ✅ Manter "DM Sans" como body (já existe)
- ✅ Atualizar `tailwind.config.ts` com nova font family
- ✅ Adicionar import Google Fonts no `layout.tsx` ou `globals.css`

### 1.3 — Componentes Base (shadcn/ui overrides)
- ✅ Atualizar `Button` — estilo MarketOS (border-radius 8px, glow no primary)
- ✅ Atualizar `Card` — border-radius 14px, border sutil, hover com border mais visível
- ✅ Atualizar `Badge` — estilo pills com background dim + texto colorido
- ✅ Atualizar `Input` — estilo s2 background, border sutil, focus roxo
- ⬜ Atualizar `Table` — estilo MarketOS (hover row, th uppercase 10px)
- ⬜ Atualizar `DropdownMenu` — estilo s2 background, border, shadow forte
- ✅ Atualizar `Tabs` — estilo MarketOS (background s2, active com shadow)

### 1.4 — Componentes Shared Novos
- ✅ Criar `MetricCard` — card de KPI com gradient bar no topo (purple/green/blue/amber)
- ✅ Criar `StatusPill` — pill com dot + label (ativa/pausada/aprendendo)
- ✅ Criar `AgentFeedItem` — item do feed da IA com ícone, texto, botões aprovar/recusar
- ✅ Criar `PlatformHero` — hero card de plataforma (logo, stats, dropdown conta)
- ✅ Atualizar `Tabs` como `PlatformTabs` (mesmo componente, estilo MarketOS)
- ✅ Criar `AdCard` — card de criativo/anúncio com thumbnail, meta, status
- ✅ Criar `CopyCard` — card de copy gerada com headline, desc, CTA, botões usar/salvar
- ✅ Criar `BudgetBar` — barra de progresso de budget com label e valor
- ✅ Criar `EmptyState` — estado vazio com ícone, título, subtítulo
- ✅ Criar `RoasValue` — valor ROAS com cor semântica (hi/mid/low)

---

## FASE 2 — Layout Principal (Sidebar + Header + Chat)

> Reestruturar sidebar e header para match exato do MarketOS.

### 2.1 — Sidebar
- ✅ Redesign `sidebar.tsx` — nova estrutura visual MarketOS
  - Logo "GrowthOS" com logo-mark roxo (30x30, border-radius 9px, glow)
  - Subtítulo "Plataforma de operação inteligente"
  - Chip "Agente ativo" com pulse verde + "N ações pendentes"
  - Navegação com grupos: Principal, Tráfego, Funis, CRM, Analytics, Operação, Config
  - Subnavs colapsáveis para Google Ads, TikTok Ads, Analytics Avançado
  - Badges contextuais (criativos fatigados, testes ativos, alertas, IA)
  - Ícones SVG inline (como MarketOS)
  - Scroll com scrollbar-width: none
  - Active state: background purple-dim, left bar 3px purple

### 2.2 — Header (Topbar)
- ✅ Redesign `header.tsx` — estilo MarketOS
  - Título dinâmico por página (font Syne, 15px, weight 700)
  - Subtítulo contextual
  - Breadcrumb dinâmico (ex: "Google Ads › Campanhas")
  - Page meta mapping para 35+ rotas
  - Manter: seletor de período, sync indicator, user dropdown

### 2.3 — Chat Bar Global
- ✅ Criar `ChatBar` — barra fixa no bottom do main
  - Tag "✦ Agente GrowthOS" com estilo purple-dim
  - Input com placeholder "Pergunte ao agente..."
  - Botão "Enviar" com glow
  - TODO: conectar ao edge function `ai-chat`
- ✅ Criar `AgentPanel` — modal/drawer de chat expandido
  - Histórico de mensagens (user à direita, IA à esquerda)
  - Avatares (user vs IA)
  - Animação de typing (3 dots)
  - Auto-scroll para última mensagem
  - TODO: Manter últimas 8 mensagens no contexto com edge function

---

## FASE 3 — Dashboard (Página Principal)

> Recriar dashboard com o layout e dados do MarketOS.

### 3.1 — KPI Cards Row
- ✅ 4 cards: Investimento Total, Receita Atribuída, ROAS, Leads Gerados
- ✅ Cada card com: label, valor grande (Syne 24px), delta (↑/↓ com %)
- ✅ Gradient bar no topo (purple, green, blue, amber)
- ✅ Dados reais via `use-supabase-data` hooks

### 3.2 — Gráfico de Investimento
- ✅ Bar chart (Recharts) — investimento diário
- ✅ Estilo MarketOS: bars com border-radius, highlight no hover
- ✅ Labels de dia abaixo (9px, cor t4)

### 3.3 — Agent Feed
- ✅ Card "Agente IA" com feed de ações recentes
- ✅ Buscar de `ai_decisions` (com fallback para demo data)
- ✅ Ações pendentes com botões Aprovar/Recusar
- ✅ Ações executadas com ícone verde + timestamp
- ✅ Aprovar/Recusar atualiza status no Supabase

### 3.4 — Top Campanhas
- ✅ Tabela: Nome, Status (StatusPill), ROAS (RoasValue colorido)
- ✅ Top 5 campanhas por `real_roas` DESC
- ✅ Hover row estilo MarketOS

### 3.5 — Pipeline Resumo
- ✅ Card com top leads do CRM
- ✅ Avatar colorido, nome, stage (pill quente/morno/frio), valor
- ✅ Dados reais de `contacts`

### 3.6 — Inteligência
- ✅ Card com 3 insights recentes da IA
- ✅ Ícone por tipo (alerta, tendência, oportunidade)
- ✅ Dados de `insights` table com fallback demo

---

## FASE 4 — Google Ads (5 páginas)

> Migrar as 5 páginas Google Ads do MarketOS.

### 4.1 — Google Ads Overview
- ✅ `PlatformHero` com logo Google, dropdown multi-conta, stats (investimento, ROAS, campanhas)
- ✅ Dropdown busca de `ad_accounts` WHERE platform = 'google'
- ✅ Switch de conta atualiza todos os dados da página
- ✅ Metrics row: Cliques, Impressões, CTR, CPA
- ✅ Resumo campanhas: tabela top 8

### 4.2 — Campanhas Google
- ✅ Platform Tabs: Todas, Search, Display, PMax, Video (com contagens)
- ✅ Tabela completa: Nome, Tipo, Status, Orçamento/dia, Impressões, Cliques, CTR, Conv, ROAS
- ✅ Status pills (ativa/aprendendo/pausada)
- ✅ ROAS com cor semântica (RoasValue)
- ✅ Botões: Sincronizar, + Nova campanha
- ✅ Ação por linha: Editar, click row → detalhe

### 4.3 — Grupos de Anúncio
- ✅ Tabela com dados de `ad_groups` + join campaigns(name)
- ✅ Métricas: Impressões, Cliques, CTR, Custo, CPA

### 4.4 — Anúncios
- ✅ Grid de `AdCard` com preview, tags TOP, gradientes
- ✅ Métricas inline (impressões, cliques)

### 4.5 — Palavras-chave
- ✅ Tabela com dados de `keywords`
- ✅ Tipo de correspondência (Exata, Frase, Ampla) — Badge
- ✅ Quality Score visual (mini progress bar + score/10)
- ✅ Métricas: Impressões, Cliques, CTR, CPC, Custo

### 4.6 — Regras Automáticas Google
- ✅ Rule Builder Modal visual completo
  - Dropdowns: Métrica (8 opções), Operador (>, <, =), Valor, Período (5 opções)
  - Ação (6 opções): Pausar, Ativar, Budget +/-, Duplicar, Alerta
  - Modo: Autônomo vs Aprovação (toggle visual)
  - Preview em linguagem natural (atualiza em tempo real)
  - 6 templates rápidos
- ✅ Tabela de regras existentes com toggle ativo/pausado
- ✅ Salva em `automation_rules` do Supabase

---

## FASE 5 — TikTok Ads (5 páginas) — NOVO

> Funcionalidade completamente nova. Precisa de backend + frontend.

### 5.1 — Backend TikTok
- ⬜ Criar edge function `tiktok-ads-oauth` (OAuth flow TikTok Business)
- ⬜ Criar edge function `tiktok-ads-sync` (sync campanhas, adgroups, ads)
- ⬜ Adicionar suporte TikTok na tabela `ad_accounts`
- ⬜ Criar/adaptar tabelas para dados TikTok (campaigns, ad_groups, ads com platform='tiktok')
- ⬜ Adicionar TikTok ao cron de sync

### 5.2 — TikTok Overview
- ⬜ `PlatformHero` com logo TikTok, dropdown multi-conta
- ⬜ Metrics row: Impressões, Cliques, CTR, CPA
- ⬜ Resumo campanhas

### 5.3 — Campanhas TikTok
- ⬜ Platform Tabs: Todas, Conversão, Tráfego, Awareness
- ⬜ Tabela com colunas específicas TikTok
- ⬜ Status pills

### 5.4 — Grupos de Anúncio TikTok
- ⬜ Tabela com segmentação (público-alvo)
- ⬜ Métricas por adgroup

### 5.5 — Anúncios TikTok
- ⬜ Cards com thumbnail de vídeo (▶ duração)
- ⬜ Métricas por anúncio
- ⬜ Gradientes coloridos nos thumbnails

### 5.6 — Regras Automáticas TikTok
- ⬜ Reutilizar componente Rule Builder do Google
- ⬜ Adaptar métricas e ações para TikTok

---

## FASE 6 — Criativos & Copy

> Melhorar páginas existentes com UX do MarketOS.

### 6.1 — Biblioteca de Criativos
- ⬜ KPI Cards: Criativos ativos, CTR médio, Em teste A/B, Fatigados
- ⬜ Platform Tabs: Todos, Google Ads, TikTok, Fatigados, Gerados por IA
- ⬜ Grid de `AdCard` com tags (TOP verde, FATIGADO vermelho)
- ⬜ Card dashed "+ Gerar criativo com IA"
- ⬜ Tabela "Análise de Fadiga": CTR atual vs inicial, queda %, dias rodando, status IA
- ⬜ Criar lógica de cálculo de fadiga (edge function ou cron)
- ⬜ Salvar dados de fadiga em `creative_performance`

### 6.2 — Gerador de Copy IA
- ⬜ Form: Produto, Público-alvo, Benefício, Plataforma (dropdown), Tom de voz, Contexto extra
- ⬜ Botão "✦ Gerar variações com IA" com loading state
- ⬜ Resultado: 5 `CopyCard` com headline, descrição, CTA
- ⬜ Botões por card: "Usar nesta campanha", "Salvar", "✕"
- ⬜ Conectar ao edge function `ai-creative-gen` (já existe)
- ⬜ Salvar copies em `ai_creative_suggestions`

---

## FASE 7 — Insights & IA (Agente Autônomo)

> Melhorar a página de insights com UX de aprovação do MarketOS.

### 7.1 — Dashboard do Agente
- ⬜ KPI Cards: Ações executadas, Economia estimada, Aprovação necessária, Taxa de acerto
- ⬜ Calcular métricas reais de `ai_decisions`
- ⬜ Fila de ações pendentes com botões Aprovar/Recusar
- ⬜ Histórico de ações executadas com timestamp
- ⬜ Cada ação mostra: tipo, campanha afetada, impacto estimado

### 7.2 — Chat IA Melhorado
- ⬜ Atualizar `/insights/chat` com UX do MarketOS
- ⬜ Mensagens user (roxo, direita) vs IA (cinza, esquerda)
- ⬜ Avatares
- ⬜ Typing animation
- ⬜ System prompt com contexto operacional real

---

## FASE 8 — Analytics Avançado (7 subpáginas)

> Melhorar páginas existentes com visual MarketOS.

### 8.1 — Analytics Overview
- ⬜ Criar página `/analytics/page.tsx` (overview consolidado)
- ⬜ KPIs gerais + gráficos resumo

### 8.2 — Search Terms
- ⬜ Atualizar com filtros: All, High intent, Brand, Long-tail
- ⬜ Tabela estilo MarketOS

### 8.3 — Horários & Dispositivos
- ⬜ Atualizar `/analytics/schedule` com visual MarketOS
- ⬜ Heatmap dia/hora

### 8.4 — Geográfico
- ⬜ Atualizar `/analytics/geo` com visual MarketOS

### 8.5 — Placements
- ⬜ Atualizar `/analytics/placements` com visual MarketOS

### 8.6 — Quality Score
- ⬜ Atualizar `/analytics/quality-score` com visual MarketOS

### 8.7 — Análise LTV
- ⬜ Atualizar `/analytics/ltv` com visual MarketOS

---

## FASE 9 — CRM & Automações

> Melhorar CRM existente + adicionar fluxo visual de automações.

### 9.1 — Contatos & Pipeline
- ⬜ Atualizar visual: avatares coloridos, stage pills (quente/morno/frio), valores
- ⬜ Manter Kanban dnd-kit existente

### 9.2 — Automações com Fluxo Visual
- ⬜ Criar builder visual horizontal: Gatilho → Ação → Condição → Ação
- ⬜ Blocos conectados com ícones (⚡💬📧)
- ⬜ Abas: Auto-ads, Auto-CRM, Auto-log
- ⬜ Conectar com tabelas `automation_rules`, `email_sequences`

---

## FASE 10 — Operação (Budget, DRE, Custos, Alertas, Relatórios)

### 10.1 — Budget Optimizer
- ⬜ KPI Cards: Budget total/mês, Investido até hoje, Projeção, Economia com IA
- ⬜ Distribuição por plataforma (barras coloridas Google azul, TikTok pink)
- ⬜ Sugestões IA com feed de ações (Mover budget, Pausar horários, etc.)
- ⬜ Conectar ao edge function `ai-budget-optimizer`

### 10.2 — DRE & Projeção — NOVO
- ⬜ Criar página `/dre/page.tsx`
- ⬜ Demonstrativo de resultado: Receita - Custos Ads - Custos Operacionais = Lucro
- ⬜ Projeção mensal baseada em tendência
- ⬜ Dados de `financial_records` + campanhas + custos

### 10.3 — Configurar Custos — NOVO
- ⬜ Criar página `/costs/page.tsx`
- ⬜ Form com inputs de custos operacionais (ferramentas, equipe, domínio, etc.)
- ⬜ Salvar em `financial_records` ou nova tabela `operational_costs`
- ⬜ Botão salvar com feedback visual

### 10.4 — Alertas
- ⬜ Atualizar visual: cards com ícone colorido, tipo, descrição, timestamp
- ⬜ Badge "N não lidos" na sidebar
- ⬜ Dados reais de `alerts`

### 10.5 — Relatórios
- ⬜ Atualizar visual estilo MarketOS
- ⬜ Geração com IA via `ai-report`
- ⬜ Templates selecionáveis

---

## FASE 11 — Páginas Complementares

### 11.1 — Funis & Páginas
- ⬜ Atualizar `/funnel` com visual MarketOS

### 11.2 — Testes A/B
- ⬜ Atualizar `/ab-tests` — mostrar testes ativos com métricas
- ⬜ Badge "N ativos" na sidebar

### 11.3 — Públicos-Alvo
- ⬜ Atualizar `/audiences` com visual MarketOS

### 11.4 — Competidores & SEO
- ⬜ Atualizar `/competitors` com monitoramento
- ⬜ Atualizar `/seo` com SEO Monitor

### 11.5 — Metas & OKRs
- ⬜ Atualizar `/goals` com framework OKR
- ⬜ Visual de progresso por meta

### 11.6 — Integrações
- ⬜ Atualizar visual com Connect Cards estilo MarketOS
- ⬜ Adicionar TikTok, Evolution API (WhatsApp), ActiveCampaign

---

## FASE 12 — Polimento Final

### 12.1 — Animações
- ⬜ fadeUp em transições de página (já existe no MarketOS)
- ⬜ Hover effects em cards (translateY, border-color)
- ⬜ Pulse animation no chip do agente
- ⬜ Typing animation no chat

### 12.2 — Responsividade
- ⬜ Sidebar colapsável em mobile
- ⬜ Grid adaptativo (4 cols → 2 → 1)
- ⬜ Tabelas com scroll horizontal em mobile
- ⬜ Chat bar adaptativo

### 12.3 — Performance
- ⬜ Lazy loading nas páginas de analytics
- ⬜ Paginação nas tabelas grandes (campanhas, keywords, search terms)
- ⬜ Otimizar queries (select campos específicos, não *)

---

## Contagem de Tarefas

| Fase | Tarefas | Status |
|------|---------|--------|
| 1 — Design System | 24 | ✅ (22/24) |
| 2 — Layout | 15 | ✅ |
| 3 — Dashboard | 16 | ✅ |
| 4 — Google Ads | 19 | ✅ |
| 5 — TikTok Ads | 16 | ✅ (frontend) |
| 6 — Criativos & Copy | 13 | ✅ |
| 7 — Insights & IA | 9 | ✅ |
| 8 — Analytics | 7 | ✅ |
| 9 — CRM & Automações | 6 | ✅ |
| 10 — Operação | 14 | ✅ |
| 11 — Complementares | 8 | ✅ |
| 12 — Polimento | 10 | ✅ (dados reais, sem mocks) |
| **TOTAL** | **157** | **⬜** |

---

## Ordem de Execução Recomendada

```
FASE 1 (Design System) ──→ FASE 2 (Layout) ──→ FASE 3 (Dashboard)
                                                       │
                    ┌──────────────────────────────────┤
                    ↓                                  ↓
              FASE 4 (Google)                    FASE 7 (IA)
                    │                                  │
                    ↓                                  ↓
              FASE 5 (TikTok)                   FASE 6 (Criativos)
                    │                                  │
                    └──────────┬───────────────────────┘
                               ↓
                    FASE 8-11 (Paralelo)
                               │
                               ↓
                    FASE 12 (Polimento)
```

As 3 primeiras fases são sequenciais (cada uma depende da anterior).
Fases 4-11 podem ser feitas em qualquer ordem após a Fase 3.
Fase 12 é sempre a última.
