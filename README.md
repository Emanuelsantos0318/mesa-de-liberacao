# Mesa de Liberação

Sistema operacional para o fluxo de liberação de dietas e acompanhamento de pacientes em ambiente hospitalar. O projeto foi estruturado para apoiar dashboard, filtros por turno/usuário, gestão de usuários, relatórios e rastreio de auditoria.

Consulte também a arquitetura geral em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
Consulte a auditoria funcional mais recente em [docs/AUDITORIA_COMPLETA.md](docs/AUDITORIA_COMPLETA.md).
Consulte o roteiro de publicação gratuita em [docs/DEPLOY_NETLIFY.md](docs/DEPLOY_NETLIFY.md).

## Funcionalidades principais

- autenticação com Supabase Auth
- criação e gestão de perfis por papel (operador, supervisor, administrador)
- visão de pacientes com filtros por status, usuário e turno
- fila de liberações por status: pendente, impresso, entregue, cancelado
- ações operacionais de imprimir, entregar e cancelar
- painel de pendências com foco por sem dieta, pendentes, impressos e entregues
- relatórios com mapa de consumo e exportação CSV
- convite seguro de usuários por Edge Function administrativa (sem expor `service_role`)
- painel de auditoria com filtros por categoria e exportação em CSV
- armazenamento persistido em Supabase com RLS e migrações versionadas

## Requisitos

- Node.js 20+
- npm
- projeto Supabase ativo com Auth e PostgreSQL

## Configuração local

1. Copie o arquivo de exemplo:

```bash
cp .env.example .env.local
```

2. Preencha com as variáveis do projeto Supabase:

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
# alternativa antiga
# VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

3. Instale dependências:

```bash
npm install
```

4. Inicie a aplicação:

```bash
npm run dev
```

## Scripts disponíveis

```bash
npm run dev
npm run build
npm run test
npm run test:watch
npm run test:e2e
npm run lint
npm run backup:free
npm run restore:free -- -BackupDirectory backups/supabase-YYYYMMDD-HHMMSS
```

O teste E2E usa um perfil fictício isolado (`VITE_E2E_MODE`) e nunca deve ser habilitado no build de produção.
Os scripts de cenário real exigem credenciais fornecidas por variáveis de ambiente e devem apontar somente para homologação.

## Banco e Supabase

O banco impede leitos ocupados por duas internações abertas e valida o vínculo entre liberação, prescrição e internação.

Formulários operacionais são exibidos em modais. Etiquetas usam formato 70 × 40 mm; refeições de acompanhante são identificadas e Lanche Reforçado gera três etiquetas.

A sincronização grava em sequência pacientes, internações, dietas, liberações e movimentações; falhas agora informam a tabela afetada e entram na fila local de reprocessamento.

A checagem de políticas RLS pode ser executada com `supabase db query --linked --file supabase/tests/rls_policy_inventory.sql`.

- Variáveis do cliente ficam em `.env.local` e não devem ser comitadas.
- O projeto usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- As migrações ficam em `supabase/migrations/`.
- Novas contas recebem perfil `operador` automaticamente por trigger seguro; a promoção para supervisor/administrador deve ser feita por administrador.
- O planejamento de produção usa somente o plano Free: dumps lógicos externos e restauração em projeto Free de homologação. PITR e backups gerenciados pagos não são requisitos.

## Validação

Falhas temporárias de conexão são mantidas em uma fila local e reprocessadas automaticamente quando a sessão volta a ficar online.

Antes de produção, é importante validar:

- autenticação real com Supabase Auth (com cadastro público desabilitado em produção)
- perfis e roles dos usuários
- políticas RLS em ambiente de homologação
- uso em turno real com impressora de etiquetas
- backup e retenção de auditoria
- MFA habilitado e cadastro público desabilitado; proteção contra senhas vazadas registrada como risco aceito pela unidade

## Observação

Este projeto foi construído para uso real em ambiente hospitalar e não deve depender apenas de armazenamento local em desenvolvimento.
