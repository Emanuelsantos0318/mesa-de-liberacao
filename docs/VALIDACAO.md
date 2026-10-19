# Validacao automatizada

## Comandos

- `npm test -- --run`: testes unitarios e regras de negocio.
- `npm run test:e2e -- --workers=1`: smoke tests com Vite isolado e encerramento automatico no Windows.
- `npm run build`: compilacao TypeScript e bundle de producao.
- `npm run lint`: analise estatica.
- `supabase db query --linked --file supabase/tests/rls_policy_inventory.sql`: RLS e trigger de auditoria remoto.

## Metas verificadas

- Busca normalizada por nome, prontuario, enfermaria, ala e leito.
- Busca com 10.000 pacientes abaixo de 300 ms no teste local.
- Cadastro, dieta vigente e nova liberacao no fluxo E2E.
- Destino de acompanhante e lanche reforcado no fluxo E2E.
- RLS ativo nas tabelas operacionais e auditoria de `movements` presente.

Impressora termica homologada na unidade: **Elgin L42 Pro Full**. O teste fisico ja foi confirmado pela unidade; novas trocas de rolo, calibracao ou driver devem preservar o formato 70 x 40 mm.

Administradores podem exportar um backup JSON emergencial pela tela Configuracao. Esse arquivo nao substitui o dump lógico externo do Supabase e deve ser guardado em local protegido.

O plano de continuidade foi ajustado para o Supabase Free: usar `npm run backup:free` para gerar dump lógico externo e `npm run restore:free -- -BackupDirectory <pasta>` somente contra um projeto Free de homologacao. PITR não é utilizado.

Status de autenticacao homologado pela unidade: MFA habilitado e cadastro publico desabilitado. A protecao contra senhas vazadas nao sera habilitada neste incremento por decisao da unidade e permanece como risco aceito/documentado.

O modo E2E exige `import.meta.env.DEV`; mesmo que `VITE_E2E_MODE=true` seja configurado por engano em um build de producao, o bypass de autenticacao permanece desativado. Sem as variaveis do Supabase, o build de producao exibe uma tela de configuracao incompleta e nao inicia uma base local.

## Auditoria funcional mais recente

- Testes unitarios: **41 aprovados**.
- Fluxos E2E: **6 aprovados**, incluindo abertura da janela de impressao, filtros de pacientes/navegacao para o painel e abertura do relatorio PDF.
- Build de producao: aprovado; permanece apenas o alerta de bundle acima de 500 kB.
- Migrações remotas: locais e remotas alinhadas ate `20261013181000`.
- Inventario remoto: `rls_policy_inventory_ok`.
- Advisor remoto: permanece somente o aviso de leaked password protection, mantido como risco aceito pela unidade.
- Correcoes aplicadas: dietas do modal de paciente agora sincronizam a prescricao ativa sem duplicar o indice `one_active_diet_per_admission`; timestamps e autores de status de liberacao sao persistidos; leitos encerrados deixam de bloquear transferencias; cards KPI receberam semantica de botao, foco e reducao de movimento; a aba de pacientes ganhou filtros laterais e navegacao direta para o painel; relatorios completos podem ser abertos para salvar como PDF e continuam disponiveis em CSV; datas e turnos usam o fuso de Salvador; conteudo inserido nas etiquetas e escapado antes da impressao; dados demo ficam bloqueados quando o Supabase esta configurado.
