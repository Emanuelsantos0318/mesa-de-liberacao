# Backup e restauração no Supabase Free

## Política adotada

O sistema não depende de PITR, backups diários pagos, compute Small, Branching ou qualquer add-on. O projeto `aglxvhsznwbmzithcvbb` será operado no plano gratuito com:

- exportação lógica periódica do PostgreSQL;
- cópia dos arquivos em armazenamento externo protegido;
- restauração testada em um segundo projeto gratuito;
- backup operacional JSON disponível apenas para administradores, como contingência da aplicação.

O JSON da aplicação não substitui o dump do PostgreSQL: ele não contém schema, usuários do Auth, políticas RLS, migrações nem objetos do Storage.

## Limitações do plano gratuito

No Free, o Supabase recomenda exportar regularmente os dados com `supabase db dump` e manter cópia fora do serviço. Os backups diários gerenciados do Dashboard e o PITR não fazem parte deste planejamento. Objetos do Storage também não são incluídos no backup do banco; se o sistema passar a usar Storage, os arquivos deverão ter uma rotina própria de cópia. Consulte a [documentação oficial de backups](https://supabase.com/docs/guides/platform/backups).

O banco Free entra em modo somente leitura ao ultrapassar 500 MB de dados. O checklist deve acompanhar esse limite antes da operação crescer. Não salvar dados clínicos em arquivos locais de backup sem criptografia e controle de acesso.

## Rotina de backup

1. Defina um responsável e uma periodicidade mínima semanal (diária se houver movimentação intensa).
2. Configure `SUPABASE_DB_URL` apenas na sessão do operador; não grave a senha no `.env`, no repositório ou no histórico do shell.
3. Execute `npm run backup:free` ou `scripts/backup-free-supabase.ps1`.
4. Confirme a presença de `roles.sql`, `schema.sql`, `data.sql` e `manifest.json` no diretório criado; o manifesto registra hashes SHA-256 para detectar cópias corrompidas.
5. Copie o diretório para um armazenamento externo protegido e mantenha pelo menos duas versões.
6. Registre data, responsável, tamanho dos arquivos e resultado da verificação.

O dump lógico usa a [rotina oficial de backup/restore por CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). A execução exige o Supabase CLI e o ambiente de banco indicado pela documentação (normalmente Docker ou `pg_dump`/`psql`).

## Teste de restauração sem risco

O teste nunca deve apontar para o projeto de produção.

1. Crie um segundo projeto Supabase no plano Free, destinado a homologação.
2. Use uma cópia do backup mais recente e a connection string do projeto de homologação em `SUPABASE_RESTORE_DB_URL`.
3. Execute `npm run restore:free`; o script exige a confirmação literal `RESTORE_FREE_SUPABASE`.
4. Execute `supabase/tests/rls_policy_inventory.sql` no projeto restaurado.
5. Confirme login, tabelas operacionais, RLS, migrações, leitura/gravação de um registro de teste não sensível e uma etiqueta de teste na Elgin L42 Pro Full.
6. Registre RTO (tempo para voltar a operar) e RPO (idade do último backup recuperável).
7. Exclua o projeto de homologação somente depois de registrar o resultado.

## Critério de aprovação

O plano está aprovado quando existe uma cópia externa recente, o dump contém os três arquivos SQL, o projeto Free de homologação é restaurado com sucesso e as verificações de segurança passam. A recuperação fica limitada ao ponto do último dump; não há garantia de recuperação segundo a segundo.

## Estado atual

- Projeto de produção: PostgreSQL 17.11, ativo.
- PITR: deliberadamente não utilizado.
- Dump automático: scripts preparados, mas ainda depende de instalar/disponibilizar CLI e `pg_dump`/Docker na máquina que executará a rotina.
- Restauração real: pendente da criação de um projeto Free separado e de um dump válido.
