# Revolution Imper — Gestão 360

**Controle total da sua operação.** ERP web/PWA da Revolution Imper para gestão de obras de impermeabilização: comercial, obras, técnica, qualidade, equipe, suprimentos, financeiro, pós-venda e portal do cliente — em um só sistema, responsivo e instalável no celular.

---

## Sumário

1. [O que o sistema faz](#o-que-o-sistema-faz)
2. [Stack e arquitetura](#stack-e-arquitetura)
3. [Primeiros passos (desenvolvimento)](#primeiros-passos-desenvolvimento)
4. [Variáveis de ambiente](#variáveis-de-ambiente)
5. [Banco, migrations e seed](#banco-migrations-e-seed)
6. [Usuários e perfis](#usuários-e-perfis)
7. [Testes e verificações](#testes-e-verificações)
8. [Build e deploy](#build-e-deploy)
9. [Backup e restauração](#backup-e-restauração)
10. [Integrações e modo mock](#integrações-e-modo-mock)
11. [Regras de negócio importantes](#regras-de-negócio-importantes)
12. [Segurança e LGPD](#segurança-e-lgpd)
13. [Decisões técnicas](#decisões-técnicas)
14. [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

---

## O que o sistema faz

| Área | Funcionalidades |
| --- | --- |
| **Visão do dono** | Dashboard executivo, Central do Dono (os 5 maiores problemas agora), central de alertas, Revolution Insights (regras; pronto para IA), busca global |
| **Comercial** | Funil de leads (kanban), visitas técnicas, orçamentos com itens, versões, desconto com aprovação, PDF/impressão. **Aprovar orçamento → gera contrato → gera obra** automaticamente |
| **Obras** | Cadastro completo, status configuráveis, **semáforo de saúde** (verde/amarelo/vermelho com o motivo), cronograma/Gantt, linha do tempo, curva S, aditivos, medições (prevista → executada → aprovada → faturada → recebida) |
| **Técnico** | Áreas/fichas técnicas, sistemas de impermeabilização, aplicações por área, rastreabilidade de material (lote × área × funcionário), testes de estanqueidade (reprovado ⇒ NC automática) |
| **Qualidade** | Checklists configuráveis (itens com foto obrigatória), não conformidades, inspeções, diário de obra digital, galeria antes/durante/depois |
| **Equipe** | Funcionários, equipes, ponto digital (custo de mão de obra lançado na obra), produtividade (ranking não punitivo), segurança: EPI com CA, treinamentos e vencimentos |
| **Suprimentos** | Fornecedores, produtos, lotes (validade/bloqueio), estoque central/obra/veículo, movimentações com custo médio, etiquetas QR |
| **Patrimônio** | Equipamentos, movimentações, manutenções |
| **Financeiro** | Contas a receber/pagar, fluxo de caixa (hoje → 12 meses), DRE gerencial, centros de custo, **alçadas de aprovação configuráveis**, exportação CSV |
| **Pós-venda** | Termo de entrega (bloqueado com NC crítica aberta), garantias geradas automaticamente, chamados |
| **Portal do cliente** | Progresso, fotos, documentos e relatório da própria obra — **sem custos internos** |
| **Campo (mobile)** | Botões grandes para diário, checklist, foto, ponto e ocorrência; **funciona offline** e sincroniza sem duplicar |
| **Administração** | Usuários, 12 perfis com permissões editáveis, alçadas, parâmetros, status, modelos de checklist, integrações, trilha de auditoria |

Relatórios exportáveis em CSV (abre no Excel), impressão/PDF pelo navegador (orçamento, relatório final da obra, termo de entrega, etiquetas QR).

---

## Stack e arquitetura

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`) + **React 19** + **TypeScript**
- **Tailwind CSS v4** com tokens da marca (cores derivadas do logotipo)
- **PostgreSQL 16** + **Drizzle ORM** (migrations SQL versionadas em `drizzle/`)
- **Zod** para validação no servidor; **bcrypt** para senhas; sessões com token opaco
- **Recharts** para gráficos; **qrcode** para etiquetas; **nodemailer** para e-mail; **AWS SDK S3** para storage compatível com S3
- **Vitest** para testes; **Docker** multi-stage (`output: "standalone"`)

```
src/
  domain/            Regras de negócio puras (sem banco): dinheiro, saúde da obra,
                     previsão de custo, medições, estoque, fluxo de caixa, DRE,
                     ponto, alçadas, permissões, validadores BR, insights
  server/
    db/schema/       Tabelas (core, comercial, obras, pessoas, suprimentos,
                     qualidade, financeiro, pós-venda)
    services/        Casos de uso e automações (transações): aprovar orçamento,
                     faturar medição, receber, pagar, movimentar estoque, ponto…
    auth/            Senhas, sessões, rate limit, RBAC
    storage.ts       Upload seguro (local ou S3); só metadados no banco
    notifications.ts Adaptadores in-app / e-mail / WhatsApp
    integrations/    CEP, CNPJ, NF-e, cobrança (interfaces + mock)
  app/
    (auth)/          Login
    (app)/           Sistema interno (todas as telas)
    (portal)/        Portal do cliente
    (print)/         Documentos para impressão/PDF
    api/             Exportações, arquivos, CEP, rotina de alertas
  components/        UI (primitivos, formulários, gráficos, Gantt, shell)
  lib/               Formatação pt-BR, CSV, rótulos
scripts/             seed, reset, migrate (produção), backup
tests/               unit/ (regras) e integration/ (automações no Postgres)
```

Princípios: telas não falam com o banco diretamente para gravar — chamam *server actions* que validam (Zod), checam permissão e delegam a um *service*; cálculos ficam em `src/domain` e são testados isoladamente.

---

## Primeiros passos (desenvolvimento)

Pré-requisitos: Node.js ≥ 20.9, Docker (ou um PostgreSQL 16 local).

```bash
npm install
cp .env.example .env              # preencha ADMIN_PASSWORD e DEMO_PASSWORD
docker compose up -d db           # sobe só o PostgreSQL
npm run db:migrate                # cria as tabelas
npm run db:seed                   # dados base + admin + demonstração
npm run dev                       # http://localhost:3000
```

Entre com `ADMIN_EMAIL` / `ADMIN_PASSWORD` do seu `.env`. Se deixar a senha vazia, o seed gera uma aleatória e mostra **uma única vez** no terminal.

---

## Variáveis de ambiente

Todas documentadas em `.env.example`. **Nunca versione o `.env`** (já está no `.gitignore`).

| Variável | Uso |
| --- | --- |
| `DATABASE_URL`, `DATABASE_POOL_MAX` | Conexão PostgreSQL |
| `APP_URL` | URL pública (links em e-mails/QR) |
| `SESSION_TTL_HOURS` | Duração da sessão (padrão 12 h) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Administrador criado pelo seed |
| `DEMO_PASSWORD` | Senha dos usuários de demonstração |
| `SEED_DEMO` | `false` para semear só a base (produção) |
| `STORAGE_DRIVER` (`local`/`s3`), `STORAGE_LOCAL_DIR`, `S3_*` | Arquivos e fotos |
| `NOTIFY_EMAIL_DRIVER` (`mock`/`smtp`), `SMTP_URL` | E-mail |
| `NOTIFY_WHATSAPP_DRIVER` (`mock`/`meta`), `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp Cloud API |
| `CEP_PROVIDER` (`viacep`/`mock`) | Autopreenchimento de endereço |
| `CRON_SECRET` | Protege `POST /api/cron/alertas` |

---

## Banco, migrations e seed

| Comando | O que faz |
| --- | --- |
| `npm run db:generate` | Gera nova migration a partir do schema (`src/server/db/schema`) |
| `npm run db:migrate` | Aplica migrations (dev, via drizzle-kit) |
| `npm run db:migrate:prod` | Aplica migrations com Node puro (usado no container) |
| `npm run db:seed` | Base (empresa, perfis, status, categorias, sistemas, checklists) + admin + demo |
| `npm run db:reset` | Apaga e recria tudo (bloqueado em produção, exceto `ALLOW_DB_RESET=yes`) |
| `npm run db:studio` | Drizzle Studio |

**Dados de demonstração** (`SEED_DEMO` diferente de `false`): 5 clientes, 8 obras em estágios diferentes (em dia, atrasada, com perda de material, aguardando cliente, em garantia, subcontratada, recém-contratada pelo fluxo de orçamento), 10 funcionários, 3 equipes, 10 fornecedores, 30 produtos com lotes, medições, contas, ponto, diários, checklists, NCs, testes de estanqueidade, equipamentos, leads, visitas e orçamentos. Tudo é gerado pelas mesmas automações usadas no sistema, então os números batem.

---

## Usuários e perfis

12 perfis padrão (editáveis em **Configurações → Perfis**): Administrador, Diretoria, Financeiro, Comercial, Engenheiro, Supervisor, Encarregado, Aplicador, Compras, Estoque, Cliente, Contador.

Usuários de demonstração (senha = `DEMO_PASSWORD`):

| E-mail | Perfil |
| --- | --- |
| `diretoria@demo.revolutionimper.com.br` | Diretoria |
| `financeiro@demo.revolutionimper.com.br` | Financeiro |
| `engenharia@demo.revolutionimper.com.br` | Engenheiro |
| `comercial@demo.revolutionimper.com.br` | Comercial |
| `encarregado@demo.revolutionimper.com.br` | Encarregado (app de campo) |
| `aplicador@demo.revolutionimper.com.br` | Aplicador (app de campo) |
| `cliente@demo.revolutionimper.com.br` | Cliente (portal) |

> Em produção rode o seed com `SEED_DEMO=false` — nenhum usuário de demonstração é criado.

---

## Testes e verificações

```bash
npm run lint
npm run typecheck
npm test                     # regras de negócio (unitários)
npm run test:integration     # automações contra um Postgres de teste
npm run check                # lint + typecheck + testes + build
npm run build
```

`test:integration` usa `TEST_DATABASE_URL` (ex.: `postgresql://revolution:revolution_dev@localhost:5432/revolution_imper_test`) e **apaga os dados desse banco** a cada execução — nunca aponte para produção.

Cobertura das regras críticas: saúde da obra, custo projetado e estouro, medições, saldo e custo médio de estoque, recebíveis/atrasos, fluxo de caixa, ponto e horas extras, alçadas de aprovação, DRE, validadores CPF/CNPJ/CEP/telefone, insights; e de ponta a ponta: orçamento → contrato → obra, faturamento de medição, pagamento com alçada, consumo de estoque → custo da obra, idempotência offline, teste de estanqueidade → NC, termo de entrega bloqueado por NC crítica.

---

## Build e deploy

### Docker (recomendado)

```bash
cp .env.example .env                     # configure senhas fortes e APP_URL
docker compose up -d db
docker compose run --rm -e SEED_DEMO=false setup   # migrations + seed base + admin
docker compose up -d app                 # http://servidor:3000
```

O container `app` aplica migrations pendentes ao iniciar, roda como usuário sem privilégios e tem healthcheck. Coloque um proxy reverso com HTTPS na frente (Caddy, Nginx, Traefik). Cookies de sessão são `Secure` em produção.

### Netlify (em uso)

Repositório ligado à Netlify: cada push na branch `main` gera um deploy automático.
- Banco: **Netlify Database** (provisionado sozinho). As migrations ficam em `netlify/database/migrations/` e são aplicadas antes de publicar. Nunca edite uma migration já aplicada: crie outra.
- Arquivos/fotos: **Netlify Blobs** (privados, servidos só pela rota autenticada `/api/files`).
- Variáveis no painel: `APP_URL`, `CRON_SECRET`.
- Fotos são reduzidas no navegador antes do envio, por causa do limite de tamanho por requisição das funções.

### Sem Docker (qualquer VPS / PaaS com Node)

```bash
npm ci && npm run build
npm run db:migrate:prod
SEED_DEMO=false npm run db:seed
node .next/standalone/server.js          # copie public/ e .next/static para dentro de standalone/
```

### Rotina de alertas

Agende uma vez por dia (cron do servidor, GitHub Actions etc.):

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU_DOMINIO/api/cron/alertas
```

Ela envia à diretoria e aos administradores (no sistema e por e-mail) o resumo dos 5 maiores problemas do dia — contas vencidas, obras em risco, estoque mínimo, EPIs/treinamentos a vencer etc. — sem duplicar no mesmo dia.

---

## Backup e restauração

`scripts/backup.sh` faz `pg_dump` + compactação da pasta de arquivos e mantém os 30 últimos:

```bash
DATABASE_URL=... STORAGE_LOCAL_DIR=./storage ./scripts/backup.sh /caminho/backups
```

Restaurar: `pg_restore -d "$DATABASE_URL" --clean arquivo.dump` e extrair o `.tar.gz` do storage. Com S3, use o versionamento/replicação do bucket.

---

## Integrações e modo mock

Toda integração externa passa por um adaptador; sem credenciais, roda em **modo mock** (registra no log e, quando aplicável, mostra em **Configurações → Integrações**). Nenhuma chave fica no código.

| Integração | Status | Como ativar |
| --- | --- | --- |
| E-mail | Pronto (SMTP) | `NOTIFY_EMAIL_DRIVER=smtp`, `SMTP_URL=smtp://user:pass@host:587` |
| WhatsApp | Pronto (Meta Cloud API) | `NOTIFY_WHATSAPP_DRIVER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |
| Storage S3 | Pronto (AWS, R2, MinIO, Wasabi…) | `STORAGE_DRIVER=s3` + `S3_*` |
| CEP | Pronto (ViaCEP) | `CEP_PROVIDER=viacep` |
| CNPJ, NF-e, boleto/PIX, assinatura eletrônica | Interfaces + mock | Implementar o adaptador em `src/server/integrations/br.ts` com o provedor escolhido |
| Push no celular | Não implementado | Notificações in-app já funcionam |

---

## Regras de negócio importantes

- **Saúde da obra** (`src/domain/health.ts`): combina prazo × progresso, custo consumido × progresso, NCs abertas, testes reprovados, recebíveis atrasados e status bloqueante. Sempre mostra o motivo.
- **Custo projetado** = maior entre (realizado + orçamento restante) e (realizado ÷ progresso, quando progresso ≥ 15%). Alerta de estouro quando custo consumido supera o progresso físico em mais de 10 pontos.
- **Custo da obra** vem de um razão único (`project_cost_entries`): consumo/perda de estoque (custo médio), mão de obra do ponto, contas a pagar vinculadas à obra (só depois de aprovadas) e lançamentos manuais. Devolução ao estoque estorna o custo.
- **DRE gerencial**: receita por competência das medições faturadas; impostos pela alíquota configurada (`finance.taxRatePct`, padrão 6%); custos diretos do razão de obras (compras de estoque e folha de campo não entram em dobro); despesas por grupo de categoria.
- **Alçadas** (Configurações → Aprovações): ex. despesa até R$ 500 aprova supervisor, acima disso diretoria. Desconto em orçamento acima do limite exige aprovação antes de fechar.
- **Estoque**: não permite saldo negativo, lote vencido ou bloqueado; toda saída registra obra, área e funcionário (rastreabilidade).
- **Offline**: cada registro de campo leva um `clientUuid`; reenviar não duplica.
- **Normas técnicas**: o sistema guarda referências (código/título/link) cadastradas pela empresa; **não reproduz textos de normas** nem cria requisitos técnicos por conta própria.

---

## Segurança e LGPD

- Senhas com bcrypt (custo 12); bloqueio após 5 tentativas (15 min) e rate limit por IP+e-mail no login
- Sessão por token aleatório (só o hash SHA-256 fica no banco), cookie `httpOnly`/`SameSite=Lax`/`Secure`
- RBAC em toda action e página (`modulo:acao`), verificado no servidor
- Portal do cliente restrito à própria obra e sem custos/margens
- Validação Zod em todas as entradas; consultas parametrizadas (Drizzle)
- Upload: limite de tamanho, tipo verificado pelo conteúdo (magic bytes), nome aleatório, download só autenticado
- Trilha de auditoria (quem, quando, o quê, IP) com segredos mascarados
- Cabeçalhos de segurança (nosniff, frame DENY, referrer, permissions policy)
- LGPD: dados pessoais mínimos, acesso por perfil, auditoria, backup; exclusão/anonimização sob demanda pelo administrador

---

## Decisões técnicas

- **Drizzle em vez de Prisma**: SQL explícito, sem binário de engine, migrations em SQL legível e deploy mais leve.
- **Server Actions + services**: menos API para manter; regras em um único lugar, executadas em transação.
- **Valores em centavos nos cálculos** (`src/domain/money.ts`) para evitar erro de arredondamento; `numeric` no banco.
- **Datas** em ISO; exibição DD/MM/AAAA, fuso `America/Sao_Paulo`.
- **PWA**: service worker próprio (`public/sw.js`) + fila em IndexedDB para os registros de campo.

---

## Limitações conhecidas e próximos passos

- **Compras**: tabelas de solicitação, cotação e pedido existem; as telas do fluxo completo ainda não.
- **Central de documentos**: fotos já têm upload; anexos gerais (contratos assinados, ARTs) entram na próxima etapa.
- **Conciliação bancária** (OFX) e **push notifications** ainda não implementadas.
- Logotipo recebido em baixa resolução: para ícones nítidos do app, substituir `public/brand/logo.png` e `public/icons/*` por versões em alta (SVG ou PNG ≥ 1024 px).
