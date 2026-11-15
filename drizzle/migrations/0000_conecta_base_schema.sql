CREATE TABLE public.annual_years (
  user_id uuid NOT NULL, year int NOT NULL, source_name text, archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, year));
CREATE TABLE public.annual_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, year int NOT NULL,
  creditor text NOT NULL, due_day int, position int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX annual_expenses_user_year ON public.annual_expenses(user_id, year);
CREATE TABLE public.annual_expense_months (
  annual_expense_id uuid NOT NULL REFERENCES public.annual_expenses(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12), expected_cents bigint,
  PRIMARY KEY (annual_expense_id, month));
CREATE TABLE public.audit_log (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL, actor uuid,
  action text NOT NULL, entity_type text, entity_id text, before_json jsonb, after_json jsonb,
  details_json jsonb, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_log_user ON public.audit_log(user_id, at DESC);
CREATE TABLE public.installment_contracts (
  id text NOT NULL, user_id uuid NOT NULL, name text NOT NULL, description text,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb, source_sheet text, archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, id));
CREATE TABLE public.installment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, contract_id text NOT NULL,
  number int NOT NULL, due_date date NOT NULL, expected_cents bigint NOT NULL,
  paid_cents bigint, paid_date date, note text, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, contract_id, number),
  FOREIGN KEY (user_id, contract_id) REFERENCES public.installment_contracts(user_id, id) ON DELETE CASCADE);
CREATE TABLE public.finance_bills (
  id text NOT NULL, user_id uuid NOT NULL, creditor text NOT NULL, description text,
  due_date date NOT NULL, expected_cents bigint NOT NULL, paid_cents bigint, paid_date date, paid_note text,
  source_annual_id uuid REFERENCES public.annual_expenses(id) ON DELETE SET NULL, source_period text,
  contract_id text, installment_number int, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id));
CREATE INDEX finance_bills_user_due ON public.finance_bills(user_id, due_date);
CREATE TABLE public.finance_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, entity_type text NOT NULL,
  entity_id text NOT NULL, storage_path text NOT NULL, original_name text NOT NULL, mime_type text NOT NULL,
  size_bytes bigint NOT NULL, created_by uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.finance_adjustment_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, payment_kind text NOT NULL,
  payment_id text NOT NULL, paid_cents bigint, paid_date date, note text, reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending', decided_by uuid, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.finance_contract_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, contract_id text NOT NULL,
  text text NOT NULL, author text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.revenue_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL,
  category text NOT NULL, expected_cents bigint NOT NULL, first_due date NOT NULL,
  recurring boolean NOT NULL DEFAULT false, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.revenue_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL,
  buyer text NOT NULL, cpf text NOT NULL DEFAULT '', rg text NOT NULL DEFAULT '',
  total_cents bigint NOT NULL, count int NOT NULL, first_due date NOT NULL,
  interest_percent numeric NOT NULL DEFAULT 0, fine_percent numeric NOT NULL DEFAULT 0,
  correction_index text NOT NULL DEFAULT 'Sem correção', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  source_id uuid REFERENCES public.revenue_sources(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.revenue_contracts(id) ON DELETE CASCADE,
  number int, title text NOT NULL, category text NOT NULL, expected_cents bigint NOT NULL,
  due_date date NOT NULL, received_cents bigint, received_date date, note text NOT NULL DEFAULT '',
  adjustment jsonb);
CREATE INDEX revenue_entries_user_due ON public.revenue_entries(user_id, due_date);
CREATE INDEX revenue_entries_source ON public.revenue_entries(source_id);
CREATE TABLE public.revenue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  entry_id uuid NOT NULL REFERENCES public.revenue_entries(id) ON DELETE CASCADE,
  kind text NOT NULL, reason text NOT NULL DEFAULT '', before_data jsonb, after_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.revenue_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  entry_id uuid REFERENCES public.revenue_entries(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.revenue_contracts(id) ON DELETE CASCADE,
  name text NOT NULL, path text NOT NULL);
CREATE TABLE public.pluggy_credentials (
  user_id uuid PRIMARY KEY, client_id text NOT NULL, client_secret text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.pluggy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(),
  item_id text NOT NULL, connector_name text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_years, public.annual_expenses, public.annual_expense_months,
  public.installment_contracts, public.installment_entries, public.finance_bills, public.finance_attachments,
  public.finance_adjustment_proposals, public.finance_contract_comments, public.revenue_sources,
  public.revenue_entries, public.revenue_files, public.pluggy_items TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.revenue_contracts TO authenticated;
GRANT SELECT, INSERT ON public.revenue_events, public.audit_log TO authenticated;
GRANT ALL ON public.annual_years, public.annual_expenses, public.annual_expense_months, public.audit_log,
  public.installment_contracts, public.installment_entries, public.finance_bills, public.finance_attachments,
  public.finance_adjustment_proposals, public.finance_contract_comments, public.revenue_sources,
  public.revenue_contracts, public.revenue_entries, public.revenue_events, public.revenue_files,
  public.pluggy_credentials, public.pluggy_items TO service_role;
REVOKE ALL ON public.pluggy_credentials FROM PUBLIC, anon, authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['annual_years','annual_expenses','installment_contracts','installment_entries',
    'finance_bills','finance_attachments','finance_adjustment_proposals','finance_contract_comments',
    'revenue_sources','revenue_entries','revenue_files','pluggy_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t||'_own', t);
  END LOOP; END $$;
ALTER TABLE public.annual_expense_months ENABLE ROW LEVEL SECURITY;
CREATE POLICY annual_expense_months_own ON public.annual_expense_months FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.annual_expenses a WHERE a.id = annual_expense_id AND a.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.annual_expenses a WHERE a.id = annual_expense_id AND a.user_id = auth.uid()));
ALTER TABLE public.revenue_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_contracts_select_own ON public.revenue_contracts FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY revenue_contracts_insert_own ON public.revenue_contracts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY revenue_contracts_delete_own ON public.revenue_contracts FOR DELETE TO authenticated USING (user_id = auth.uid());
ALTER TABLE public.revenue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY revenue_events_select_own ON public.revenue_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY revenue_events_insert_own ON public.revenue_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.revenue_entries e WHERE e.id = entry_id AND e.user_id = auth.uid()));
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_select_own ON public.audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY audit_log_insert_own ON public.audit_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
ALTER TABLE public.pluggy_credentials ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.audit_append(p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb, p_after jsonb, p_details jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  INSERT INTO public.audit_log(user_id, actor, action, entity_type, entity_id, before_json, after_json, details_json)
  VALUES (auth.uid(), auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, p_details);
END $f$;

CREATE OR REPLACE FUNCTION public.pay_bill(p_bill_id text, p_paid_date date, p_paid_cents bigint, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  UPDATE public.finance_bills SET paid_cents=p_paid_cents, paid_date=p_paid_date, paid_note=p_note
   WHERE user_id=auth.uid() AND id=p_bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'conta não encontrada'; END IF;
  PERFORM public.audit_append('pay_bill','finance_bills',p_bill_id,NULL::jsonb,
    jsonb_build_object('paid_cents',p_paid_cents,'paid_date',p_paid_date,'paid_note',p_note),'{}'::jsonb);
END $f$;

CREATE OR REPLACE FUNCTION public.pay_installment(p_contract_id text, p_number integer, p_paid_date date, p_paid_cents bigint, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  UPDATE public.installment_entries SET paid_cents=p_paid_cents, paid_date=p_paid_date, note=p_note, updated_at=now()
   WHERE user_id=auth.uid() AND contract_id=p_contract_id AND number=p_number;
  IF NOT FOUND THEN RAISE EXCEPTION 'parcela não encontrada'; END IF;
  PERFORM public.audit_append('pay_installment','installment_entries',p_contract_id||':'||p_number,NULL::jsonb,
    jsonb_build_object('paid_cents',p_paid_cents,'paid_date',p_paid_date,'note',p_note),'{}'::jsonb);
END $f$;

CREATE OR REPLACE FUNCTION public.revise_bill(p_bill_id text, p_paid_date date, p_paid_cents bigint, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE before_row jsonb;
BEGIN
  SELECT to_jsonb(b) INTO before_row FROM public.finance_bills b WHERE user_id=auth.uid() AND id=p_bill_id FOR UPDATE;
  IF before_row IS NULL THEN RAISE EXCEPTION 'conta não encontrada'; END IF;
  UPDATE public.finance_bills SET paid_cents=p_paid_cents, paid_date=p_paid_date, paid_note=p_note
   WHERE user_id=auth.uid() AND id=p_bill_id;
  PERFORM public.audit_append('revise_bill','finance_bills',p_bill_id,before_row,
    jsonb_build_object('paid_cents',p_paid_cents,'paid_date',p_paid_date,'paid_note',p_note),'{}'::jsonb);
END $f$;

CREATE OR REPLACE FUNCTION public.revise_installment(p_contract_id text, p_number integer, p_paid_date date, p_paid_cents bigint, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE before_row jsonb;
BEGIN
  SELECT to_jsonb(e) INTO before_row FROM public.installment_entries e
   WHERE user_id=auth.uid() AND contract_id=p_contract_id AND number=p_number FOR UPDATE;
  IF before_row IS NULL THEN RAISE EXCEPTION 'parcela não encontrada'; END IF;
  UPDATE public.installment_entries SET paid_cents=p_paid_cents, paid_date=p_paid_date, note=p_note, updated_at=now()
   WHERE user_id=auth.uid() AND contract_id=p_contract_id AND number=p_number;
  PERFORM public.audit_append('revise_installment','installment_entries',p_contract_id||':'||p_number,before_row,
    jsonb_build_object('paid_cents',p_paid_cents,'paid_date',p_paid_date,'note',p_note),'{}'::jsonb);
END $f$;

CREATE OR REPLACE FUNCTION public.revenue_sync(p_month date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE s public.revenue_sources; m date; last_m date; due date; lim int; k int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  last_m := date_trunc('month', p_month)::date;
  FOR s IN SELECT * FROM public.revenue_sources WHERE user_id=auth.uid() LOOP
    IF s.category='Empréstimo Devolvido' THEN
      lim := greatest(1, least(600, coalesce(nullif(s.details->>'installments','')::int, 1)));
    ELSIF s.recurring THEN lim := 1200; ELSE lim := 1; END IF;
    m := date_trunc('month', s.first_due)::date; k := 0;
    WHILE m <= last_m AND k < lim LOOP
      due := m + least(extract(day FROM s.first_due)::int,
                       extract(day FROM (m + interval '1 month - 1 day'))::int) - 1;
      IF NOT EXISTS (SELECT 1 FROM public.revenue_entries e WHERE e.source_id=s.id
                      AND date_trunc('month', e.due_date)=m) THEN
        INSERT INTO public.revenue_entries(user_id, source_id, title, category, expected_cents, due_date, number)
        VALUES (auth.uid(), s.id, s.title, s.category, s.expected_cents, due,
                CASE WHEN s.category='Empréstimo Devolvido' THEN k+1 ELSE NULL END);
      END IF;
      m := (m + interval '1 month')::date; k := k + 1;
    END LOOP;
  END LOOP;
END $f$;

CREATE OR REPLACE FUNCTION public.revenue_receive(p_id uuid, p_date date, p_cents bigint, p_note text, p_reason text DEFAULT '')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE oldrow public.revenue_entries; is_fix boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO oldrow FROM public.revenue_entries WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
  IF p_date IS NULL OR p_cents IS NULL OR p_cents < 0 OR p_cents > 999999999999 OR length(coalesce(p_note,'')) > 2000 THEN
    RAISE EXCEPTION 'Recebimento inválido'; END IF;
  is_fix := oldrow.received_date IS NOT NULL;
  IF is_fix AND length(trim(coalesce(p_reason,''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo da correção'; END IF;
  UPDATE public.revenue_entries SET received_date=p_date, received_cents=p_cents, note=coalesce(p_note,'') WHERE id=p_id;
  INSERT INTO public.revenue_events(user_id, entry_id, kind, reason, before_data, after_data)
  VALUES (auth.uid(), p_id, CASE WHEN is_fix THEN 'correção' ELSE 'recebimento' END, coalesce(p_reason,''),
          CASE WHEN is_fix THEN to_jsonb(oldrow) ELSE NULL END,
          jsonb_build_object('received_date',p_date,'received_cents',p_cents,'note',coalesce(p_note,'')));
END $f$;

CREATE OR REPLACE FUNCTION public.revenue_adjust(p_id uuid, p_adjustment jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE oldrow public.revenue_entries;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  SELECT * INTO oldrow FROM public.revenue_entries WHERE id=p_id AND user_id=auth.uid() AND contract_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR oldrow.received_date IS NOT NULL THEN RAISE EXCEPTION 'Parcela indisponível para atualização'; END IF;
  IF jsonb_typeof(p_adjustment) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Atualização inválida'; END IF;
  UPDATE public.revenue_entries SET adjustment=p_adjustment WHERE id=p_id;
  INSERT INTO public.revenue_events(user_id, entry_id, kind, before_data, after_data)
  VALUES (auth.uid(), p_id, 'atualização', to_jsonb(oldrow), jsonb_build_object('adjustment', p_adjustment));
END $f$;

REVOKE ALL ON FUNCTION public.audit_append(text,text,text,jsonb,jsonb,jsonb), public.pay_bill(text,date,bigint,text),
  public.pay_installment(text,integer,date,bigint,text), public.revise_bill(text,date,bigint,text),
  public.revise_installment(text,integer,date,bigint,text), public.revenue_sync(date),
  public.revenue_receive(uuid,date,bigint,text,text), public.revenue_adjust(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_append(text,text,text,jsonb,jsonb,jsonb), public.pay_bill(text,date,bigint,text),
  public.pay_installment(text,integer,date,bigint,text), public.revise_bill(text,date,bigint,text),
  public.revise_installment(text,integer,date,bigint,text), public.revenue_sync(date),
  public.revenue_receive(uuid,date,bigint,text,text), public.revenue_adjust(uuid,jsonb) TO authenticated, service_role;

CREATE POLICY "comprovantes own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='comprovantes' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "comprovantes own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='comprovantes' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "comprovantes own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='comprovantes' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "cloud-docs own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='cloud-docs' AND owner_id=auth.uid()::text);
CREATE POLICY "cloud-docs own write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='cloud-docs');
CREATE POLICY "cloud-docs own update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='cloud-docs' AND owner_id=auth.uid()::text);
CREATE POLICY "cloud-docs own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='cloud-docs' AND owner_id=auth.uid()::text);