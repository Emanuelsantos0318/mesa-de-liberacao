# Mesa de Liberação — decisões iniciais

## Incremento atual

Central operacional React/TypeScript com cadastro de pacientes, liberação, fila, alteração de situação, auditoria local e impressão pelo navegador. A persistência atual é `localStorage`, exclusivamente como contingência demonstrável; não é apropriada para produção ou dado clínico real.

## Arquitetura alvo

`UI React` → `serviços de domínio e validação` → `Supabase (Auth, PostgreSQL, Realtime)`.

Componentes não consultam o banco diretamente. Migrações, RLS e políticas ficam versionadas no backend.

## Modelo de dados

- `profiles`: usuário, função e turno.
- `patients`: identificadores mínimos.
- `admissions`: vínculo ativo e histórico de enfermaria, ala, leito e situação.
- `diet_prescriptions`: dieta, restrições, vigência, solicitante e versão.
- `releases`: refeição, horário, estado e versão da prescrição usada.
- `movements`: admissão, transferência, suspensão, reativação, alta e óbito.
- `audit_events`: ator, instante, ação, entidade, antes/depois e justificativa.

Paciente possui internações; internação possui prescrições, movimentações e liberações.

## Regras e riscos

- Eventos clínico-operacionais não são apagados: correções geram novo evento auditável.
- Alta e óbito bloqueiam novas liberações; suspensão requer confirmação explícita.
- Alergias e restrições são alertas, não interpretação clínica: a definição é da nutricionista.
- Impressão deve usar registro já persistido e registrar operador, data e resultado.
- LGPD exige mínimo necessário, RLS, HTTPS, logs sem excesso de dados sensíveis e retenção aprovada por HGRS/LBGS.

## Autorização e testes planejados

Supabase Auth com perfis `operador`, `supervisor` e `administrador`; RLS por perfil. Vitest para regras e validações, Playwright para cadastro/liberação/impressão, testes de RLS no banco e medição de busca/gravação sob massa definida.

## Dependências pendentes

Dimensões e impressora de etiquetas, identificador mestre do HGRS, catálogo autorizado de dietas/restrições, acesso Supabase/hospedagem, dados de importação e matriz de permissões. Nenhuma integração hospitalar foi ativada.

## Estado da infraestrutura

Falhas temporárias de rede deixam a última versão local em uma fila de sincronização no navegador. A fila é reprocessada ao abrir o painel e no evento `online`; conflitos entre dispositivos ainda exigem a política de reconciliação da próxima etapa.

Na Fase 2, o banco passou a impedir duas internações abertas no mesmo leito (considerando enfermaria, ala e leito) e rejeita liberações cuja prescrição não pertença à internação informada ou cuja internação já esteja encerrada. Essas regras ficam no PostgreSQL para proteger também gravações concorrentes e integrações futuras.

As ações de liberação, transferência e dieta usam modal centralizado com rolagem interna. Etiquetas usam mídia individual de 70 × 40 mm; o destino (`patient`/`companion`) e a quantidade (`label_copies`) são persistidos em `releases`. Lanche Reforçado gera três cópias e a impressão manual de uma liberação não depende mais da fila pendente após a atualização de status.

A verificação reproduzível de RLS está em `supabase/tests/rls_policy_inventory.sql` e confirmou que as sete tabelas expostas possuem RLS e que as políticas críticas de auditoria e perfis estão presentes.

Os smoke tests E2E estão em `e2e/auth.spec.ts`. Eles usam `VITE_E2E_MODE=true` apenas no servidor de testes para criar um perfil operador fictício, sem credenciais reais ou escrita no Supabase. O fluxo cobre abertura do painel, cadastro de paciente, salvamento de dieta e registro de nova liberação em modal. Execute com `npm run test:e2e`.

O projeto Supabase foi vinculado e as migrações versionadas em `supabase/migrations/` estão aplicadas, incluindo endurecimento de RLS, índices de liberação, provisionamento seguro de perfis e publicação Realtime das tabelas operacionais. Novas contas Auth recebem sempre o papel `operador`; promoções devem ser feitas por administrador.

A aplicação exibe falhas de sincronização, adapta `timestamptz` para o fuso de Salvador e registra até 100 eventos recentes de auditoria para supervisores e administradores. MFA está habilitado e o cadastro público foi desabilitado pela unidade. A proteção contra senhas vazadas permanece como risco aceito neste incremento.

O contrato de persistência foi alinhado ao schema remoto: `diet_prescriptions.notes` e `admissions.updated_at` agora existem e os campos de dieta do paciente são enviados em `patients`. Isso evita que um `upsert` de dieta interrompa a gravação posterior de liberações.

O trigger `audit_movements` foi aplicado à tabela append-only `movements`, completando a trilha de auditoria para admissÃ£o, transferÃªncia, suspensÃ£o, reativaÃ§Ã£o, alta e Ã³bito. O inventÃ¡rio RLS tambÃ©m verifica a presenÃ§a desse trigger. O cabeÃ§alho agora mostra Online/Offline e o horÃ¡rio da Ãºltima sincronizaÃ§Ã£o remota.

PendÃªncias de entrada em produÃ§Ã£o: executar a rotina de dump externo do plano Free e o teste de restauraÃ§Ã£o em projeto isolado, executar teste de carga com metas de busca e gravaÃ§Ã£o e concluir a publicaÃ§Ã£o HTTPS. ImportaÃ§Ã£o controlada de legado, reconciliaÃ§Ã£o entre dispositivos e CI/CD continuam fora do incremento atual.
