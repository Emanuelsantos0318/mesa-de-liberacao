# Checklist de entrada em producao

## Supabase Auth (Dashboard)

- [x] Desabilitar cadastro publico; contas devem ser convidadas/provisionadas pelo administrador.
- [x] Ativar pelo menos um metodo MFA adequado a politica da unidade.
- [x] Usar MFA TOTP basico; manter MFA por telefone/SMS desativado no plano Free.
- [x] Registrar a decisao da unidade de nao habilitar leaked password protection neste incremento.
- Conferir Site URL e Redirect URLs para o dominio HTTPS oficial e `/reset-password`.
- Confirmar expiracao/refresh de sessao conforme a politica de seguranca.

### Decisao de risco

A unidade optou por nao habilitar a protecao contra senhas vazadas neste incremento. Essa escolha nao impede o funcionamento do sistema, mas deve permanecer registrada na revisao de seguranca e ser reavaliada periodicamente.

## Banco e recuperacao

- Confirmar a rotina de dump externo do plano Free antes da primeira carga real (seguir [BACKUP_RESTORE.md](./BACKUP_RESTORE.md)).
- Executar `supabase db query --linked --file supabase/tests/rls_policy_inventory.sql`.
- Confirmar `supabase migration list --linked` sem migracoes locais pendentes.
- Fazer o teste documentado de restauração em projeto Free de homologacao; nunca restaurar a producao apenas para testar.
- Guardar exports JSON apenas em cofre ou armazenamento criptografado.

## Aplicacao

- Publicar somente com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` configuradas.
- Nunca habilitar `VITE_E2E_MODE` em build de producao.
- Usar HTTPS e dominio oficial.
- Validar a Elgin L42 Pro Full com etiqueta 70 x 40 mm no computador do posto.
- Executar `npm test -- --run`, `npm run test:e2e -- --workers=1` e `npm run build` antes do deploy.

## Operacao assistida

- Criar usuarios reais e revisar papeis/turnos.
- Simular queda de rede e confirmar sincronizacao posterior.
- Conferir auditoria de uma transferencia, suspensao, alta e obito.
- Registrar responsavel, data e resultado da homologacao.
