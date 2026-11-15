-- Agenda: horários e escalas de trabalho personalizadas.
-- Aplicar no banco antes de publicar a nova interface.
ALTER TABLE public.agenda_records
  ADD COLUMN IF NOT EXISTS work_details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.agenda_records DROP CONSTRAINT IF EXISTS agenda_records_recurrence_check;
ALTER TABLE public.agenda_records ADD CONSTRAINT agenda_records_recurrence_check
  CHECK (recurrence IN ('none','daily','weekly','monthly','yearly','12x36','custom'));

COMMENT ON COLUMN public.agenda_records.work_details IS
  'Horários de saída e intervalo, nome da escala e datas escolhidas para escalas personalizadas.';
