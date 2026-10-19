-- O cliente já suporta observações na prescrição; alinhar o schema remoto.
alter table public.diet_prescriptions
  add column if not exists notes text not null default '';
