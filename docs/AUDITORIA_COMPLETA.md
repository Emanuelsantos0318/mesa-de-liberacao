# Auditoria completa — Mesa de Liberação

## Escopo revisado

Foram revisados componentes React, fluxo de autenticação, persistência local/remota, mapeamento para Supabase, migrações, RLS, auditoria, regras de negócio, impressão 70 x 40 mm, responsividade, estados de interface, testes unitários e cenários E2E.

## Correções aplicadas

### Alta prioridade

- Dieta selecionada no modal de paciente agora cria/atualiza a prescrição ativa e é recuperada corretamente após uma nova leitura do Supabase.
- A impressão só altera o status depois que a janela de impressão é aberta; pop-up bloqueado gera orientação ao operador.
- Etiquetas escapam conteúdo digitado antes de serem inseridas na janela de impressão.
- `printed_at`, `printed_by`, `delivered_at`, `delivered_by`, `cancelled_at` e `cancelled_by` são mantidos no modelo local e enviados ao banco.
- Transferências ignoram internações encerradas e comparam enfermaria/leito normalizando espaços, acentos e maiúsculas.
- Situação e transferência deixaram de mutar diretamente objetos do estado React.
- Sincronizações operacionais podem limitar o conjunto de tabelas alteradas, reduzindo atualizações e eventos de auditoria desnecessários.
- Dados de demonstração e restauração local foram bloqueados quando o Supabase está configurado, evitando inserir exemplos na base operacional.
- Scripts de teste real não possuem mais URL, chave ou senha padrão; exigem variáveis explícitas e confirmação de homologação.

### UX/UI e acessibilidade

- KPIs do dashboard passaram a ser botões semânticos, com cursor, foco visível, estados hover/pressionado e feedback de elevação.
- Foi adicionada preferência global de redução de movimento (`prefers-reduced-motion`).
- Toasts passaram a usar `role=status` e `aria-live`.
- Relatórios e turnos passaram a usar o fuso de Salvador; a virada do dia não depende mais do UTC do navegador.
- O botão de backup operacional informa que o JSON não substitui o dump completo do PostgreSQL.

## Validação executada

- 41 testes unitários aprovados.
- 6 testes E2E aprovados: cadastro, dieta/liberação, acompanhante/lanche reforçado, impressão/status, filtros/navegação de pacientes e exportação PDF.
- Build de produção aprovado.
- Lint aprovado com avisos não bloqueantes preexistentes de Fast Refresh, efeitos React e memoização.
- Migrações remotas alinhadas até `20261013181000`.
- Inventário remoto retornou `rls_policy_inventory_ok`.
- Advisors remotos: somente o aviso de proteção contra senhas vazadas, mantido como risco aceito pela unidade.

## Pontos que ainda exigem homologação operacional

- Testar a impressora Elgin L42 Pro Full no computador de cada posto, confirmando rolo 70 x 40 mm e escala 100%.
- Criar um usuário real de cada papel e validar as permissões no Dashboard, sem usar o modo E2E.
- Executar uma rotina de dump Free e restaurá-la em projeto Free separado, conforme `docs/BACKUP_RESTORE.md`.
- Medir desempenho com a massa real de pacientes e liberações.
- Publicar com HTTPS, variáveis `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` e cadastro público desabilitado.
- Revisar periodicamente o limite de 500 MB do banco Free e o risco aceito de leaked password protection.
