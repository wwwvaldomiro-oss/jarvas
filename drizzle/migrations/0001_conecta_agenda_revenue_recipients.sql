CREATE TABLE public.agenda_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('birthday','work','appointment','event','tasks','shopping')),
 title text NOT NULL, start_date date NOT NULL, time text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '', recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly','yearly','12x36')),
 favorite boolean NOT NULL DEFAULT false, reminder boolean NOT NULL DEFAULT true,
 items jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_records TO authenticated;
GRANT ALL ON public.agenda_records TO service_role;
ALTER TABLE public.agenda_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY agenda_records_own ON public.agenda_records FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX agenda_records_owner ON public.agenda_records(user_id);
CREATE TABLE public.agenda_checks (
 record_id uuid NOT NULL REFERENCES public.agenda_records(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, occurrence_date date NOT NULL, item_key text NOT NULL,
 done boolean NOT NULL DEFAULT false, PRIMARY KEY(record_id, occurrence_date, item_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_checks TO authenticated;
GRANT ALL ON public.agenda_checks TO service_role;
ALTER TABLE public.agenda_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY agenda_checks_own ON public.agenda_checks FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.agenda_records r WHERE r.id = record_id AND r.user_id = auth.uid()));
ALTER TABLE public.revenue_contracts ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS postal_code text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS down_payment_cents bigint NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Em andamento';
GRANT UPDATE ON public.revenue_contracts TO authenticated;
CREATE POLICY revenue_contracts_update_own ON public.revenue_contracts FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.revenue_create_contract(p_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; total bigint; downpay bigint; n int; first_date date; plan jsonb; i int; part bigint; BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
total:=(p_data->>'total_cents')::bigint; downpay:=coalesce((p_data->>'down_payment_cents')::bigint,0); n:=(p_data->>'count')::int; first_date:=(p_data->>'first_due')::date; plan:=p_data->'plan';
IF total<1 OR downpay<0 OR downpay>=total OR n<1 OR n>600 OR total-downpay<n OR length(trim(p_data->>'buyer')) NOT BETWEEN 1 AND 200 OR length(trim(p_data->>'title')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Contrato inválido'; END IF;
IF plan IS NOT NULL AND (jsonb_array_length(plan)<>n OR (SELECT sum(value::bigint) FROM jsonb_array_elements_text(plan))<>total-downpay OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(plan) WHERE value::bigint<1)) THEN RAISE EXCEPTION 'Parcelamento inválido'; END IF;
INSERT INTO public.revenue_contracts(user_id,title,buyer,cpf,rg,total_cents,count,first_due,interest_percent,fine_percent,correction_index,address,postal_code,city,state,phone,email,down_payment_cents,note)
VALUES(auth.uid(),p_data->>'title',p_data->>'buyer',coalesce(p_data->>'cpf',''),coalesce(p_data->>'rg',''),total,n,first_date,(p_data->>'interest_percent')::numeric,(p_data->>'fine_percent')::numeric,p_data->>'correction_index',coalesce(p_data->>'address',''),coalesce(p_data->>'postal_code',''),coalesce(p_data->>'city',''),coalesce(p_data->>'state',''),coalesce(p_data->>'phone',''),coalesce(p_data->>'email',''),downpay,coalesce(p_data->>'note','')) RETURNING id INTO cid;
FOR i IN 0..n-1 LOOP
part:=CASE WHEN plan IS NOT NULL THEN (plan->>i)::bigint ELSE (total-downpay)/n+CASE WHEN i<(total-downpay)%n THEN 1 ELSE 0 END END;
INSERT INTO public.revenue_entries(user_id,contract_id,number,title,category,expected_cents,due_date) VALUES(auth.uid(),cid,i+1,p_data->>'title','Crediário',part,(date_trunc('month',first_date)+(i||' months')::interval)::date+least(extract(day FROM first_date)::int,extract(day FROM (date_trunc('month',first_date)+((i+1)||' months')::interval-interval '1 day'))::int)-1);
END LOOP; RETURN cid; END $$;
CREATE OR REPLACE FUNCTION public.revenue_contract_completion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.contract_id IS NOT NULL THEN
UPDATE public.revenue_contracts c SET status=CASE WHEN NOT EXISTS(SELECT 1 FROM public.revenue_entries e WHERE e.contract_id=c.id AND (e.received_date IS NULL OR coalesce(e.received_cents,0)<coalesce((e.adjustment->>'agreed')::bigint,e.expected_cents))) THEN 'Concluído' WHEN c.status='Concluído' THEN 'Em andamento' ELSE c.status END WHERE c.id=NEW.contract_id;
END IF; RETURN NEW; END $$;
CREATE TRIGGER revenue_contract_completion AFTER UPDATE OF received_date,received_cents,adjustment ON public.revenue_entries FOR EACH ROW EXECUTE FUNCTION public.revenue_contract_completion();
CREATE OR REPLACE FUNCTION public.revenue_edit_installment(p_id uuid,p_due date,p_cents bigint,p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE oldrow public.revenue_entries; BEGIN
SELECT * INTO oldrow FROM public.revenue_entries WHERE id=p_id AND user_id=auth.uid() AND contract_id IS NOT NULL FOR UPDATE;
IF NOT FOUND OR oldrow.received_date IS NOT NULL THEN RAISE EXCEPTION 'Parcela recebida deve ser corrigida pelo recebimento'; END IF;
IF p_due IS NULL OR p_cents<1 OR p_cents>999999999999 OR length(p_note)>2000 THEN RAISE EXCEPTION 'Parcela inválida'; END IF;
UPDATE public.revenue_entries SET due_date=p_due,expected_cents=p_cents,note=p_note,adjustment=NULL WHERE id=p_id;
INSERT INTO public.revenue_events(user_id,entry_id,kind,before_data,after_data) VALUES(auth.uid(),p_id,'edição',to_jsonb(oldrow),jsonb_build_object('due_date',p_due,'expected_cents',p_cents,'note',p_note)); END $$;
REVOKE ALL ON FUNCTION public.revenue_edit_installment(uuid,date,bigint,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.revenue_edit_installment(uuid,date,bigint,text) TO authenticated;
CREATE TABLE public.invoice_recipients (
 user_id uuid PRIMARY KEY,
 key text NOT NULL CHECK (length(key) BETWEEN 1 AND 77),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
 state text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
 city text NOT NULL CHECK (length(city) BETWEEN 1 AND 200),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_recipients TO authenticated;
GRANT ALL ON public.invoice_recipients TO service_role;
ALTER TABLE public.invoice_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_recipients_own ON public.invoice_recipients FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.revenue_edit_source(p_id uuid, p_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE old_source public.revenue_sources; new_source public.revenue_sources; horizon date; first_date date; cents bigint; category_name text;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
SELECT * INTO old_source FROM public.revenue_sources WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Fonte de renda não encontrada'; END IF;
PERFORM id FROM public.revenue_entries WHERE source_id=p_id AND user_id=auth.uid() FOR UPDATE;
first_date := (p_data->>'first_due')::date; cents := (p_data->>'expected_cents')::bigint; category_name := p_data->>'category';
IF first_date IS NULL OR cents IS NULL OR cents < 1 OR cents > 999999999999 OR coalesce(length(trim(p_data->>'title')),0) NOT BETWEEN 1 AND 200 OR category_name IS NULL OR category_name NOT IN ('Salário','Benefício','Empréstimo Devolvido','Renda Extra','Doação','Outros Rendimentos') OR jsonb_typeof(p_data->'details') IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'recurring') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Cadastro de receita inválido'; END IF;
IF category_name='Benefício' AND (coalesce(trim(p_data->'details'->>'source'),'')='' OR coalesce(trim(p_data->'details'->>'benefit'),'')='') THEN RAISE EXCEPTION 'Informe fonte e número do benefício'; END IF;
IF category_name='Empréstimo Devolvido' AND (coalesce(trim(p_data->'details'->>'source'),'')='' OR coalesce(trim(p_data->'details'->>'original'),'')='') THEN RAISE EXCEPTION 'Informe de quem e a data original do empréstimo'; END IF;
SELECT greatest(coalesce(max(due_date),first_date),first_date,(now() AT TIME ZONE 'America/Sao_Paulo')::date) INTO horizon FROM public.revenue_entries WHERE source_id=p_id AND user_id=auth.uid();
UPDATE public.revenue_sources SET title=trim(p_data->>'title'), category=category_name, expected_cents=cents, first_due=first_date, recurring=(p_data->>'recurring')::boolean, details=p_data->'details' WHERE id=p_id AND user_id=auth.uid() RETURNING * INTO new_source;
UPDATE public.revenue_entries e SET title=new_source.title,category=new_source.category,expected_cents=new_source.expected_cents,due_date=CASE WHEN new_source.recurring THEN date_trunc('month',e.due_date)::date + least(extract(day FROM first_date)::int,extract(day FROM (date_trunc('month',e.due_date)+interval '1 month - 1 day'))::int)-1 ELSE first_date END WHERE e.source_id=p_id AND e.user_id=auth.uid() AND e.received_date IS NULL AND date_trunc('month',e.due_date)>=date_trunc('month',first_date) AND (new_source.recurring OR date_trunc('month',e.due_date)=date_trunc('month',first_date)) AND NOT EXISTS(SELECT 1 FROM public.revenue_entries paid WHERE paid.source_id=p_id AND paid.received_date IS NOT NULL AND date_trunc('month',paid.due_date)=date_trunc('month',e.due_date));
DELETE FROM public.revenue_entries e WHERE e.source_id=p_id AND e.user_id=auth.uid() AND e.received_date IS NULL AND (date_trunc('month',e.due_date)<date_trunc('month',first_date) OR (NOT new_source.recurring AND e.due_date<>first_date) OR (new_source.category='Empréstimo Devolvido' AND (extract(year FROM e.due_date)::int-extract(year FROM first_date)::int)*12+extract(month FROM e.due_date)::int-extract(month FROM first_date)::int >= greatest(1,least(600,coalesce(nullif(new_source.details->>'installments',''),'1')::int))));
PERFORM public.revenue_sync(horizon);
DELETE FROM public.revenue_entries e WHERE e.source_id=p_id AND e.user_id=auth.uid() AND e.received_date IS NULL AND EXISTS (SELECT 1 FROM public.revenue_entries paid WHERE paid.source_id=p_id AND paid.user_id=auth.uid() AND paid.received_date IS NOT NULL AND date_trunc('month',paid.due_date)=date_trunc('month',e.due_date));
INSERT INTO public.audit_log(user_id,actor,action,entity_type,entity_id,before_json,after_json) VALUES(auth.uid(),auth.uid(),'editar receita','revenue_source',p_id::text,to_jsonb(old_source),to_jsonb(new_source));
END $function$;
REVOKE ALL ON FUNCTION public.revenue_edit_source(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revenue_edit_source(uuid,jsonb) TO authenticated, service_role;