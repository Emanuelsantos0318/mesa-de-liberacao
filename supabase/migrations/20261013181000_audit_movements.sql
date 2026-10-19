-- Registra transferências, suspensões, reativações e altas no mesmo trilho de auditoria.
-- Movements é append-only; somente o trigger de inserção é necessário.
drop trigger if exists audit_movements on public.movements;
create trigger audit_movements
  after insert on public.movements
  for each row execute function private.audit_row();
