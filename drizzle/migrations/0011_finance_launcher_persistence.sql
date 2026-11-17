-- User-authorized Git implementation. Additive ledger; no existing financial rows removed.
CREATE TABLE IF NOT EXISTS public.finance_launcher_accounts (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, account_id text NOT NULL,
 name text NOT NULL, account_type text NOT NULL CHECK(account_type IN ('BANK','CREDIT')),
 verified_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,account_id));
CREATE TABLE IF NOT EXISTS public.finance_launches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL, payload jsonb NOT NULL, kind text NOT NULL,
 title text NOT NULL, operation_date date NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 status text NOT NULL DEFAULT 'forecast' CHECK(status IN ('forecast','settled','reconciled','undone')),
 account_id text, destination_account_id text, direction text CHECK(direction IN ('debit','credit')),
 entity_key text, entity_kind text, entity_id text, entity_number integer, before_json jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), undone_at timestamptz,
 UNIQUE(user_id,request_id));
CREATE UNIQUE INDEX IF NOT EXISTS finance_launch_active_entity ON public.finance_launches(user_id,entity_key)
 WHERE entity_key IS NOT NULL AND status<>'undone';
CREATE TABLE IF NOT EXISTS public.finance_launch_requests (
 user_id uuid NOT NULL REFERENCES auth.users(id), request_id uuid NOT NULL, fingerprint text NOT NULL,
 launch_id uuid NOT NULL REFERENCES public.finance_launches(id), PRIMARY KEY(user_id,request_id));
CREATE TABLE IF NOT EXISTS public.finance_launch_parts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),
 launch_id uuid NOT NULL REFERENCES public.finance_launches(id), number integer NOT NULL,
 period text NOT NULL, due_date date NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>0),
 account_id text,annual_expense_id uuid REFERENCES public.annual_expenses(id),
 included_in_baseline boolean NOT NULL DEFAULT false, UNIQUE(launch_id,number));
CREATE INDEX IF NOT EXISTS finance_launch_parts_period ON public.finance_launch_parts(user_id,account_id,period);
CREATE TABLE IF NOT EXISTS public.finance_card_initial_balances (
 user_id uuid NOT NULL REFERENCES auth.users(id),account_id text NOT NULL,period text NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>=0),launch_id uuid REFERENCES public.finance_launches(id),
 PRIMARY KEY(user_id,account_id,period));
CREATE TABLE IF NOT EXISTS public.finance_launch_provider_evidence (
 user_id uuid NOT NULL REFERENCES auth.users(id),transaction_id text NOT NULL,account_id text NOT NULL,
 operation_date date NOT NULL,amount_cents bigint NOT NULL,description text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,transaction_id));
CREATE TABLE IF NOT EXISTS public.finance_launch_matches (
 user_id uuid NOT NULL REFERENCES auth.users(id),launch_id uuid NOT NULL REFERENCES public.finance_launches(id),
 transaction_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,transaction_id),UNIQUE(user_id,launch_id));
DO $rls$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_launcher_accounts','finance_launches','finance_launch_requests','finance_launch_parts','finance_card_initial_balances','finance_launch_provider_evidence','finance_launch_matches'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_owner_read') THEN
   EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(user_id=auth.uid())',t||'_owner_read',t);
  END IF;
 END LOOP;
END $rls$;

CREATE OR REPLACE FUNCTION public.finance_launcher_check_account(p_account text,p_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.finance_launcher_accounts WHERE user_id=auth.uid() AND account_id=p_account AND account_type=p_type) THEN
  RAISE EXCEPTION 'Conta não verificada para este usuário. Atualize a Carteira e tente novamente.';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.finance_launcher_note(p_account text,p_direction text,p_note text,p_max int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result text; BEGIN
 SELECT coalesce(p_note,'')||E'\n[ÓRION_MOVIMENTO_V1]'||jsonb_build_object('version',1,'accountId',p_account,'accountName',name,'direction',p_direction)::text INTO result
 FROM finance_launcher_accounts WHERE user_id=auth.uid() AND account_id=p_account AND account_type='BANK';
 IF result IS NULL OR length(result)>p_max THEN RAISE EXCEPTION 'Conta inválida ou observação longa: reduza a observação';END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.finance_launcher_annual_row(p_account text,p_year int,p_due date,p_creditor uuid DEFAULT NULL,p_name text DEFAULT NULL,p_contract text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); root uuid; rid uuid; src text; label text; BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
 IF EXISTS(SELECT 1 FROM annual_years WHERE user_id=u AND year=p_year AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'Exercício arquivado'; END IF;
 INSERT INTO annual_years(user_id,year) VALUES(u,p_year) ON CONFLICT DO NOTHING;
 IF p_account IS NOT NULL THEN
  PERFORM public.finance_launcher_check_account(p_account,'CREDIT');
  SELECT annual_expense_id INTO root FROM finance_account_profiles WHERE user_id=u AND account_id=p_account FOR UPDATE;
  SELECT coalesce(display_name,p_name) INTO label FROM finance_account_profiles WHERE user_id=u AND account_id=p_account;
  IF label IS NULL THEN SELECT name INTO label FROM finance_launcher_accounts WHERE user_id=u AND account_id=p_account; END IF;
  src:='card';
 ELSE root:=p_creditor;label:=p_name;src:=CASE WHEN p_contract IS NULL THEN 'manual' ELSE 'contract' END;
 END IF;
 IF root IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM annual_expenses WHERE id=root AND user_id=u) THEN RAISE EXCEPTION 'Credor inválido'; END IF;
  SELECT id INTO rid FROM annual_expenses WHERE user_id=u AND year=p_year AND(id=root OR source_template_id=root) ORDER BY (id=root) DESC LIMIT 1 FOR UPDATE;
 END IF;
 IF rid IS NULL THEN
  INSERT INTO annual_expenses(user_id,year,creditor,due_day,position,expense_source,expense_kind,source_template_id,source_contract_id)
  VALUES(u,p_year,coalesce(label,'Compromisso'),extract(day FROM p_due)::int,coalesce((SELECT max(position)+1 FROM annual_expenses WHERE user_id=u AND year=p_year),0),src,'debt',root,p_contract) RETURNING id INTO rid;
 ELSE
  IF p_contract IS NOT NULL AND EXISTS(SELECT 1 FROM annual_expenses WHERE id=rid AND source_contract_id IS NOT NULL AND source_contract_id<>p_contract) THEN
   RAISE EXCEPTION 'Credor já vinculado a outro contrato. Cadastre um novo compromisso.';
  END IF;
  IF p_account IS NULL AND p_contract IS NULL AND EXISTS(SELECT 1 FROM annual_expenses WHERE id=rid AND source_contract_id IS NOT NULL) THEN RAISE EXCEPTION 'Registre a parcela no contrato existente';END IF;
  IF p_contract IS NOT NULL THEN UPDATE annual_expenses SET source_contract_id=p_contract,expense_source='contract' WHERE id=rid; END IF;
 END IF;
 IF p_account IS NOT NULL AND root IS NULL THEN
  INSERT INTO finance_account_profiles(user_id,account_id,display_name,annual_expense_id) VALUES(u,p_account,label,rid)
  ON CONFLICT(user_id,account_id) DO UPDATE SET annual_expense_id=EXCLUDED.annual_expense_id;
 END IF;
 RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.finance_launcher_rebuild_invoice(p_account text,p_period text,p_due date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); rid uuid; base bigint; final bigint; BEGIN
 rid:=public.finance_launcher_annual_row(p_account,split_part(p_period,'-',1)::int,p_due);
 IF EXISTS(SELECT 1 FROM finance_bills WHERE user_id=u AND source_annual_id=rid AND source_period=p_period AND paid_date IS NOT NULL) THEN RAISE EXCEPTION 'Fatura já paga: use correção ou estorno'; END IF;
 SELECT amount_cents INTO final FROM finance_card_closed_invoices WHERE user_id=u AND account_id=p_account AND period=p_period;
 IF final IS NULL THEN
  INSERT INTO finance_card_initial_balances(user_id,account_id,period,amount_cents)
   SELECT u,p_account,p_period,coalesce((SELECT expected_cents FROM annual_expense_months WHERE annual_expense_id=rid AND month=split_part(p_period,'-',2)::int),0)
   ON CONFLICT DO NOTHING;
  SELECT amount_cents INTO base FROM finance_card_initial_balances WHERE user_id=u AND account_id=p_account AND period=p_period;
  SELECT coalesce(base,0)+coalesce(sum(p.amount_cents) FILTER(WHERE NOT p.included_in_baseline),0) INTO final
   FROM finance_launch_parts p JOIN finance_launches l ON l.id=p.launch_id
   WHERE p.user_id=u AND p.account_id=p_account AND p.period=p_period AND l.status<>'undone';
 END IF;
 INSERT INTO annual_expense_months(annual_expense_id,month,expected_cents) VALUES(rid,split_part(p_period,'-',2)::int,final)
 ON CONFLICT(annual_expense_id,month) DO UPDATE SET expected_cents=EXCLUDED.expected_cents;
 UPDATE finance_launch_parts SET annual_expense_id=rid WHERE user_id=u AND account_id=p_account AND period=p_period;
 UPDATE finance_bills SET expected_cents=final,due_date=p_due WHERE user_id=u AND source_annual_id=rid AND source_period=p_period AND paid_date IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.finance_launch_transaction(p_version int,p_launch jsonb,p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); lid uuid; request uuid; hashed text; oldhash text; k text; title text; amt bigint; net bigint; n int; firstn int; d date; due date; partdue date; part bigint; i int; acct text; dst text; creditor uuid; root uuid; rid uuid; cid text; eid uuid; sid uuid; existing bigint; settled boolean; inc boolean; p jsonb; existing_bill text; bill_count int;
BEGIN
 IF u IS NULL OR p_version<>1 THEN RAISE EXCEPTION 'Autenticação ou versão inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,17));
 request:=(p_launch->>'requestId')::uuid; hashed:=md5(p_launch::text);
 SELECT launch_id,fingerprint INTO lid,oldhash FROM finance_launch_requests WHERE user_id=u AND request_id=request;
 IF FOUND THEN IF oldhash<>hashed THEN RAISE EXCEPTION 'Solicitação já utilizada com outros dados'; END IF;RETURN jsonb_build_object('id',lid,'duplicate',true); END IF;
 k:=p_launch->>'kind';title:=trim(p_launch->>'title');amt:=(p_launch->>'totalCents')::bigint;net:=nullif(p_launch->>'receivedCents','')::bigint;
 n:=(p_launch->>'installments')::int;firstn:=(p_launch->>'startingInstallment')::int;d:=(p_launch->>'date')::date;due:=(p_launch->>'firstDue')::date;
 acct:=p_launch->>'accountId';dst:=p_launch->>'destinationAccountId';creditor:=nullif(p_launch->>'creditorId','')::uuid;
 settled:=coalesce((p_launch->>'alreadySettled')::boolean,false);inc:=coalesce((p_launch->>'baselineIncludesFirst')::boolean,false);
 IF k IS NULL OR k NOT IN ('expense','income','contract','card_credit','invoice_baseline') OR coalesce(length(title),0) NOT BETWEEN 1 AND 200 OR amt IS NULL OR amt<1 OR amt>999999999999 OR n IS NULL OR n<1 OR n>120 OR firstn IS NULL OR firstn<1 OR firstn>n OR amt<n OR d IS NULL OR due IS NULL THEN RAISE EXCEPTION 'Lançamento inválido'; END IF;
 IF length(coalesce(p_launch->>'note',''))>1000 OR due<d AND k<>'invoice_baseline' THEN RAISE EXCEPTION 'Observação ou vencimento inválido'; END IF;
 IF p_launch->>'medium' NOT IN ('bank','card','creditor') OR p_launch->>'medium' IS NULL THEN RAISE EXCEPTION 'Forma inválida'; END IF;
 IF p_launch->>'medium'='card' THEN PERFORM finance_launcher_check_account(acct,'CREDIT');
 ELSIF p_launch->>'medium'='bank' THEN PERFORM finance_launcher_check_account(acct,'BANK'); END IF;
 IF p_launch->>'medium'<>'card' AND(firstn<>1 OR inc) THEN RAISE EXCEPTION 'Parcelas iniciais inválidas'; END IF;
 IF k='card_credit' THEN
  IF p_launch->>'medium'<>'card' OR net IS NULL OR net<1 OR net>amt OR dst IS NULL OR dst=acct THEN RAISE EXCEPTION 'Crédito do cartão inválido';END IF;
  PERFORM finance_launcher_check_account(dst,'BANK');title:='Pix Cartão Parcelado';
 ELSIF dst IS NOT NULL OR net IS NOT NULL THEN RAISE EXCEPTION 'Destino e valor líquido só se aplicam ao crédito do cartão'; END IF;
 IF k='income' AND(p_launch->>'medium'<>'bank' OR n<>1 OR length(trim(coalesce(p_launch->>'source','')))=0) THEN RAISE EXCEPTION 'Receita inválida';END IF;
 IF k='contract' AND p_launch->>'medium'<>'creditor' THEN RAISE EXCEPTION 'Contrato deve usar credor'; END IF;
 IF k='invoice_baseline' AND(p_launch->>'medium'<>'card' OR n<>1 OR settled) THEN RAISE EXCEPTION 'Fatura inicial inválida'; END IF;
 IF settled AND k<>'card_credit' AND(p_launch->>'medium'<>'bank' OR n<>1) THEN RAISE EXCEPTION 'Confirme parcelas individualmente'; END IF;
 IF creditor IS NOT NULL AND(k NOT IN ('expense','contract') OR p_launch->>'medium'='card') THEN RAISE EXCEPTION 'Credor incompatível'; END IF;
 IF jsonb_typeof(p_plan)<>'array' OR jsonb_array_length(p_plan)<>n-firstn+1 THEN RAISE EXCEPTION 'Plano inválido'; END IF;
 FOR i IN firstn..n LOOP
  part:=amt/n+CASE WHEN i<=amt%n THEN 1 ELSE 0 END;
  partdue:=(date_trunc('month',due)+make_interval(months=>i-firstn))::date;
  partdue:=partdue+least(extract(day FROM due)::int,extract(day FROM(partdue+interval '1 month - 1 day'))::int)-1;
  p:=p_plan->(i-firstn);
  IF (p->>'number')::int IS DISTINCT FROM i OR (p->>'cents')::bigint IS DISTINCT FROM part OR (p->>'dueDate')::date IS DISTINCT FROM partdue OR p->>'period' IS DISTINCT FROM to_char(partdue,'YYYY-MM') OR (p->>'includedInBaseline')::boolean IS DISTINCT FROM (inc AND i=firstn) THEN RAISE EXCEPTION 'Plano diverge do cálculo validado';END IF;
 END LOOP;
 INSERT INTO finance_launches(user_id,request_id,payload,kind,title,operation_date,amount_cents,status,account_id,destination_account_id,direction)
 VALUES(u,request,p_launch,k,title,d,CASE WHEN k='card_credit' THEN net ELSE amt END,CASE WHEN settled THEN 'settled' ELSE 'forecast' END,acct,dst,CASE WHEN k IN('income','card_credit') THEN 'credit' WHEN p_launch->>'medium'='bank' THEN 'debit' ELSE NULL END) RETURNING id INTO lid;
 IF k='invoice_baseline' THEN
  IF EXISTS(SELECT 1 FROM finance_card_closed_invoices WHERE user_id=u AND account_id=acct AND period=to_char(due,'YYYY-MM')) THEN RAISE EXCEPTION 'Fatura já fechada';END IF;
  IF EXISTS(SELECT 1 FROM finance_card_initial_balances WHERE user_id=u AND account_id=acct AND period=to_char(due,'YYYY-MM') AND launch_id IS NOT NULL) THEN RAISE EXCEPTION 'Fatura inicial já cadastrada nesta competência'; END IF;
  SELECT amount_cents INTO existing FROM finance_card_initial_balances WHERE user_id=u AND account_id=acct AND period=to_char(due,'YYYY-MM');
  rid:=finance_launcher_annual_row(acct,extract(year FROM due)::int,due);
  IF existing IS NULL THEN SELECT expected_cents INTO existing FROM annual_expense_months WHERE annual_expense_id=rid AND month=extract(month FROM due)::int;END IF;
  UPDATE finance_launches SET before_json=jsonb_build_object('baseline',coalesce(existing,0)) WHERE id=lid;
  INSERT INTO finance_card_initial_balances(user_id,account_id,period,amount_cents,launch_id) VALUES(u,acct,to_char(due,'YYYY-MM'),amt,lid)
  ON CONFLICT(user_id,account_id,period) DO UPDATE SET amount_cents=EXCLUDED.amount_cents,launch_id=EXCLUDED.launch_id;
  PERFORM finance_launcher_rebuild_invoice(acct,to_char(due,'YYYY-MM'),due);
 ELSE
  IF k IN('income','card_credit') THEN
   sid:=nullif(p_launch->>'sourceId','')::uuid;
   IF sid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM revenue_sources WHERE id=sid AND user_id=u) THEN RAISE EXCEPTION 'Fonte pagadora inválida'; END IF;
   IF k='card_credit' AND sid IS NOT NULL THEN RAISE EXCEPTION 'Crédito não é renda ordinária'; END IF;
   INSERT INTO revenue_entries(user_id,source_id,title,category,expected_cents,due_date,received_date,received_cents,adjustment,note)
    VALUES(u,sid,title,CASE WHEN k='card_credit' THEN 'Crédito recebido' ELSE 'Renda Extra' END,CASE WHEN k='card_credit' THEN net ELSE amt END,CASE WHEN k='card_credit' THEN d ELSE due END,CASE WHEN settled THEN d END,CASE WHEN settled THEN CASE WHEN k='card_credit' THEN net ELSE amt END END,jsonb_build_object('finance_launch_override',true),finance_launcher_note(CASE WHEN k='card_credit' THEN dst ELSE acct END,'credit',p_launch->>'note',2000)) RETURNING id INTO eid;
   UPDATE finance_launches SET entity_kind='revenue',entity_id=eid::text,entity_key='revenue:'||eid::text WHERE id=lid;
  END IF;
  IF k<>'income' THEN
   IF p_launch->>'medium'='creditor' OR(p_launch->>'medium'='bank' AND n>1) THEN
    cid:='launch-'||lid::text;
    INSERT INTO installment_contracts(id,user_id,name,description,details_json) VALUES(cid,u,title,coalesce(p_launch->>'note',''),jsonb_build_object('launchId',lid));
    UPDATE finance_launches SET entity_kind='contract',entity_id=cid,entity_key='contract:'||cid WHERE id=lid;
   END IF;
   root:=creditor;
   FOR i IN firstn..n LOOP
    p:=p_plan->(i-firstn);part:=(p->>'cents')::bigint;partdue:=(p->>'dueDate')::date;
    IF p_launch->>'medium'='card' THEN
     rid:=NULL;
     IF inc AND i=firstn THEN
      rid:=finance_launcher_annual_row(acct,extract(year FROM partdue)::int,partdue);
      SELECT amount_cents INTO existing FROM finance_card_initial_balances WHERE user_id=u AND account_id=acct AND period=p->>'period';
      IF existing IS NULL THEN SELECT expected_cents INTO existing FROM annual_expense_months WHERE annual_expense_id=rid AND month=extract(month FROM partdue)::int;END IF;
      IF coalesce(existing,0)<part THEN RAISE EXCEPTION 'Cadastre a fatura inicial que já inclui esta parcela antes de marcá-la como incluída';END IF;
     END IF;
    ELSE
     rid:=finance_launcher_annual_row(NULL,extract(year FROM partdue)::int,partdue,root,title,cid);
     IF root IS NULL THEN root:=rid; END IF;
     IF EXISTS(SELECT 1 FROM finance_bills WHERE user_id=u AND source_annual_id=rid AND source_period=to_char(partdue,'YYYY-MM') AND paid_date IS NOT NULL) THEN RAISE EXCEPTION 'Compromisso já pago nesta competência';END IF;
     INSERT INTO annual_expense_months(annual_expense_id,month,expected_cents) VALUES(rid,extract(month FROM partdue)::int,part)
      ON CONFLICT(annual_expense_id,month) DO UPDATE SET expected_cents=coalesce(annual_expense_months.expected_cents,0)+EXCLUDED.expected_cents;
     IF cid IS NOT NULL THEN
      INSERT INTO installment_entries(user_id,contract_id,number,due_date,expected_cents,note) VALUES(u,cid,i,partdue,part,coalesce(p_launch->>'note',''));
     ELSE
      SELECT count(*),min(id) INTO bill_count,existing_bill FROM finance_bills WHERE user_id=u AND source_annual_id=rid AND source_period=to_char(partdue,'YYYY-MM') AND expected_cents>0;
      IF bill_count>1 THEN RAISE EXCEPTION 'Há vários compromissos para este credor no mês. Escolha o registro existente antes de lançar';END IF;
      IF existing_bill IS NOT NULL THEN
       IF settled THEN RAISE EXCEPTION 'Use Registrar pagamento para dar baixa no compromisso já existente';END IF;
       UPDATE finance_bills SET expected_cents=expected_cents+part WHERE user_id=u AND id=existing_bill;
      ELSE
       existing_bill:='launch:'||lid::text;
       INSERT INTO finance_bills(id,user_id,creditor,description,due_date,expected_cents,paid_date,paid_cents,paid_note,source_annual_id,source_period,expense_kind,is_settled)
       VALUES(existing_bill,u,title,'Lançamento',partdue,part,CASE WHEN settled THEN d END,CASE WHEN settled THEN part END,finance_launcher_note(acct,'debit',p_launch->>'note',1000),rid,to_char(partdue,'YYYY-MM'),'debt',settled);
      END IF;
      UPDATE finance_launches SET entity_kind='bill',entity_id=existing_bill,entity_key=CASE WHEN settled THEN 'bill:'||existing_bill END WHERE id=lid;
     END IF;
    END IF;
    INSERT INTO finance_launch_parts(user_id,launch_id,number,period,due_date,amount_cents,account_id,annual_expense_id,included_in_baseline)
    VALUES(u,lid,i,p->>'period',partdue,part,CASE WHEN p_launch->>'medium'='card' THEN acct END,rid,(p->>'includedInBaseline')::boolean);
    IF p_launch->>'medium'='card' THEN PERFORM finance_launcher_rebuild_invoice(acct,p->>'period',partdue);END IF;
   END LOOP;
  END IF;
 END IF;
 INSERT INTO finance_launch_requests VALUES(u,request,hashed,lid);
 PERFORM audit_append('create_launch','finance_launch',lid::text,NULL,p_launch,jsonb_build_object('requestId',request));
 RETURN jsonb_build_object('id',lid,'duplicate',false);
END $$;

CREATE OR REPLACE FUNCTION public.finance_record_settlement(p_version int,p_settlement jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); req uuid; hash text; lid uuid; oldhash text; k text; eid text; num int; acct text; d date; amt bigint; rev boolean; quits boolean; beforedata jsonb; note text; key text; contract text; period text; cnt int;
BEGIN
 IF u IS NULL OR p_version<>1 THEN RAISE EXCEPTION 'Autenticação ou versão inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,17));
 req:=(p_settlement->>'requestId')::uuid;hash:=md5(p_settlement::text);
 SELECT launch_id,fingerprint INTO lid,oldhash FROM finance_launch_requests WHERE user_id=u AND request_id=req;
 IF FOUND THEN IF oldhash<>hash THEN RAISE EXCEPTION 'Solicitação já utilizada com outros dados'; END IF;RETURN jsonb_build_object('ok',true);END IF;
 k:=p_settlement->>'kind';eid:=p_settlement->>'id';num:=nullif(p_settlement->>'number','')::int;acct:=p_settlement->>'accountId';
 d:=(p_settlement->>'date')::date;amt:=(p_settlement->>'cents')::bigint;rev:=(p_settlement->>'revision')::boolean;quits:=(p_settlement->>'quits')::boolean;
 IF k IS NULL OR k NOT IN('bill','installment','revenue') OR eid IS NULL OR amt IS NULL OR amt<1 OR amt>999999999999 OR d IS NULL OR rev IS NULL OR quits IS NULL THEN RAISE EXCEPTION 'Pagamento ou recebimento inválido';END IF;
 PERFORM finance_launcher_check_account(acct,'BANK');
 IF k='bill' THEN
  SELECT to_jsonb(b) INTO beforedata FROM finance_bills b WHERE b.user_id=u AND b.id=eid FOR UPDATE;
  IF beforedata IS NULL THEN RAISE EXCEPTION 'Conta não encontrada'; END IF;
  contract:=beforedata->>'contract_id';num:=nullif(beforedata->>'installment_number','')::int;
  IF contract IS NULL AND beforedata->>'source_annual_id' IS NOT NULL THEN
   SELECT source_contract_id INTO contract FROM annual_expenses WHERE user_id=u AND id=(beforedata->>'source_annual_id')::uuid;
   IF contract IS NOT NULL THEN
    period:=coalesce(beforedata->>'source_period',substring(beforedata->>'due_date',1,7));
    SELECT count(*),min(number) INTO cnt,num FROM installment_entries WHERE user_id=u AND contract_id=contract AND to_char(due_date,'YYYY-MM')=period;
    IF cnt<>1 THEN RAISE EXCEPTION 'Escolha a parcela correta no contrato';END IF;
   END IF;
  END IF;
  IF contract IS NOT NULL THEN k:='installment';eid:=contract;END IF;
 END IF;
 IF k='installment' THEN
  SELECT to_jsonb(i) INTO beforedata FROM installment_entries i WHERE i.user_id=u AND i.contract_id=eid AND i.number=num FOR UPDATE;
 ELSIF k='revenue' THEN
  SELECT to_jsonb(r) INTO beforedata FROM revenue_entries r WHERE r.user_id=u AND r.id=eid::uuid AND r.category<>'Cancelado' FOR UPDATE;
 END IF;
 IF beforedata IS NULL THEN RAISE EXCEPTION 'Compromisso não encontrado';END IF;
 IF rev AND coalesce(beforedata->>'paid_date',beforedata->>'received_date') IS NULL THEN
  IF k='installment' THEN rev:=false;ELSE RAISE EXCEPTION 'Não há registro anterior para corrigir';END IF;
 ELSIF NOT rev AND coalesce(beforedata->>'paid_date',beforedata->>'received_date') IS NOT NULL THEN RAISE EXCEPTION 'Já registrado: use a correção'; END IF;
 SELECT coalesce(p_settlement->>'note','')||E'\n[ÓRION_MOVIMENTO_V1]'||jsonb_build_object('version',1,'accountId',acct,'accountName',name,'direction',CASE WHEN k='revenue' THEN 'credit' ELSE 'debit' END)::text INTO note FROM finance_launcher_accounts WHERE user_id=u AND account_id=acct;
 IF length(note)>(CASE WHEN k='revenue' THEN 2000 ELSE 1000 END) THEN RAISE EXCEPTION 'Reduza a observação para guardar também a conta vinculada';END IF;
 IF k='revenue' THEN PERFORM revenue_receive(eid::uuid,d,amt,note,coalesce(p_settlement->>'reason',''));
 ELSE PERFORM record_expense_payment(CASE WHEN k='bill' THEN eid END,CASE WHEN k='installment' THEN eid END,CASE WHEN k='installment' THEN num END,d,amt,note,quits,rev);END IF;
 key:=k||':'||eid||CASE WHEN k='installment' THEN ':'||num::text ELSE '' END;
 SELECT id INTO lid FROM finance_launches WHERE user_id=u AND (entity_key=key OR (p_settlement->>'kind'='bill' AND entity_key='bill:'||(p_settlement->>'id'))) AND status<>'undone' ORDER BY (entity_key=key) DESC LIMIT 1 FOR UPDATE;
 IF lid IS NULL THEN
  INSERT INTO finance_launches(user_id,request_id,payload,kind,title,operation_date,amount_cents,status,account_id,direction,entity_key,entity_kind,entity_id,entity_number,before_json)
  VALUES(u,req,jsonb_build_object('settlement',p_settlement),CASE WHEN k='revenue' THEN 'income' ELSE 'expense' END,coalesce(beforedata->>'creditor',beforedata->>'title',(SELECT name FROM installment_contracts WHERE user_id=u AND id=eid),'Pagamento'),d,amt,'settled',acct,CASE WHEN k='revenue' THEN 'credit' ELSE 'debit' END,key,k,eid,num,beforedata) RETURNING id INTO lid;
 ELSE
  UPDATE finance_launches SET operation_date=d,amount_cents=amt,status='settled',entity_key=key,entity_kind=k,entity_id=eid,entity_number=num,
   account_id=CASE WHEN kind='card_credit' THEN account_id ELSE acct END,
   destination_account_id=CASE WHEN kind='card_credit' THEN acct ELSE destination_account_id END,
   direction=CASE WHEN k='revenue' THEN 'credit' ELSE 'debit' END,
   payload=payload||jsonb_build_object('lastSettlement',p_settlement),before_json=coalesce(before_json,beforedata)
   WHERE id=lid;
 END IF;
 INSERT INTO finance_launch_requests VALUES(u,req,hash,lid);
 PERFORM audit_append('account_settlement','finance_launch',lid::text,beforedata,p_settlement,jsonb_build_object('account_id',acct));
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.finance_launch_undo(p_version int,p_launch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); l public.finance_launches; partrow record; b jsonb; v_period text; due date; BEGIN
 IF u IS NULL OR p_version<>1 THEN RAISE EXCEPTION 'Autenticação ou versão inválida';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,17));
 SELECT * INTO l FROM finance_launches WHERE id=p_launch_id AND user_id=u FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado';END IF;
 IF l.status='undone' THEN RETURN jsonb_build_object('id',l.id,'undone',true);END IF;
 IF l.status='reconciled' THEN RAISE EXCEPTION 'Movimentação conciliada: desfaça a conciliação antes de estornar';END IF;
 IF EXISTS(SELECT 1 FROM finance_launch_parts p JOIN annual_years y ON y.user_id=u AND y.year=split_part(p.period,'-',1)::int WHERE p.launch_id=l.id AND y.archived_at IS NOT NULL) THEN RAISE EXCEPTION 'Exercício arquivado: reabra para desfazer';END IF;
 IF EXISTS(SELECT 1 FROM finance_launch_parts p JOIN finance_card_closed_invoices f ON f.user_id=u AND f.account_id=p.account_id AND f.period=p.period WHERE p.launch_id=l.id) THEN RAISE EXCEPTION 'Fatura fechada: use um estorno identificado';END IF;
 IF l.kind='invoice_baseline' THEN
  v_period:=substring(l.payload->>'firstDue',1,7);due:=(l.payload->>'firstDue')::date;
  IF EXISTS(SELECT 1 FROM finance_card_closed_invoices WHERE user_id=u AND account_id=l.account_id AND finance_card_closed_invoices.period=v_period) THEN RAISE EXCEPTION 'Fatura fechada: use um estorno identificado';END IF;
  UPDATE finance_card_initial_balances SET amount_cents=coalesce((l.before_json->>'baseline')::bigint,0),launch_id=NULL WHERE user_id=u AND account_id=l.account_id AND finance_card_initial_balances.period=v_period;
 ELSIF l.entity_kind='contract' THEN
  IF EXISTS(SELECT 1 FROM installment_entries WHERE user_id=u AND contract_id=l.entity_id AND paid_date IS NOT NULL) THEN RAISE EXCEPTION 'Desfaça os pagamentos das parcelas antes de cancelar o contrato';END IF;
  UPDATE installment_contracts SET archived_at=now() WHERE user_id=u AND id=l.entity_id;
  UPDATE installment_entries SET expected_cents=0,note='[ÓRION CANCELADO]' WHERE user_id=u AND contract_id=l.entity_id;
  UPDATE finance_bills SET expected_cents=0,description='[ÓRION CANCELADO]' WHERE user_id=u AND contract_id=l.entity_id AND paid_date IS NULL;
 ELSIF l.entity_kind IN('bill','installment','revenue') THEN
  IF l.entity_kind='bill' AND l.payload ? 'kind' AND NOT coalesce((l.payload->>'alreadySettled')::boolean,false) AND EXISTS(SELECT 1 FROM finance_bills WHERE user_id=u AND id=l.entity_id AND paid_date IS NOT NULL) THEN RAISE EXCEPTION 'Desfaça o pagamento antes de cancelar o compromisso';END IF;
  b:=l.before_json;
  IF l.entity_kind='revenue' THEN
   IF b IS NULL OR l.payload ? 'kind' THEN
    UPDATE revenue_entries SET category='Cancelado',expected_cents=0,received_date=NULL,received_cents=NULL,note='Operação desfeita' WHERE user_id=u AND id=l.entity_id::uuid;
   ELSE
    UPDATE revenue_entries SET received_date=(b->>'received_date')::date,received_cents=(b->>'received_cents')::bigint,note=coalesce(b->>'note',''),adjustment=b->'adjustment' WHERE user_id=u AND id=l.entity_id::uuid;
   END IF;
   INSERT INTO revenue_events(user_id,entry_id,kind,reason,before_data,after_data) VALUES(u,l.entity_id::uuid,'estorno','Desfazer lançamento',to_jsonb(l),jsonb_build_object('undone',true));
  ELSIF l.entity_kind='bill' THEN
   IF b IS NULL OR l.payload ? 'kind' THEN
    UPDATE finance_bills SET expected_cents=greatest(0,expected_cents-(SELECT coalesce(sum(amount_cents),0) FROM finance_launch_parts WHERE launch_id=l.id)),paid_date=NULL,paid_cents=NULL,paid_note=NULL,is_settled=false,description=CASE WHEN expected_cents<=(SELECT coalesce(sum(amount_cents),0) FROM finance_launch_parts WHERE launch_id=l.id) THEN '[ÓRION CANCELADO]' ELSE description END WHERE user_id=u AND id=l.entity_id;
   ELSE
    UPDATE finance_bills SET paid_date=(b->>'paid_date')::date,paid_cents=(b->>'paid_cents')::bigint,paid_note=b->>'paid_note',is_settled=coalesce((b->>'is_settled')::boolean,false) WHERE user_id=u AND id=l.entity_id;
   END IF;
  ELSE
   UPDATE installment_entries SET paid_date=(b->>'paid_date')::date,paid_cents=(b->>'paid_cents')::bigint,note=b->>'note',is_settled=coalesce((b->>'is_settled')::boolean,false) WHERE user_id=u AND contract_id=l.entity_id AND number=l.entity_number;
   UPDATE finance_bills SET paid_date=(b->>'paid_date')::date,paid_cents=(b->>'paid_cents')::bigint,paid_note=b->>'note',is_settled=coalesce((b->>'is_settled')::boolean,false) WHERE user_id=u AND contract_id=l.entity_id AND installment_number=l.entity_number;
  END IF;
 END IF;
 -- Any subsequent payment on an invoice must be undone explicitly before changing its composition.
 FOR partrow IN SELECT * FROM finance_launch_parts WHERE launch_id=l.id LOOP
  IF EXISTS(SELECT 1 FROM finance_bills WHERE user_id=u AND source_annual_id=partrow.annual_expense_id AND source_period=partrow.period AND paid_date IS NOT NULL) THEN RAISE EXCEPTION 'Compromisso ou fatura já pago: desfaça o pagamento primeiro';END IF;
 END LOOP;
 UPDATE finance_launches SET status='undone',undone_at=now() WHERE id=l.id;
 FOR partrow IN SELECT * FROM finance_launch_parts WHERE launch_id=l.id LOOP
  IF partrow.account_id IS NOT NULL THEN PERFORM finance_launcher_rebuild_invoice(partrow.account_id,partrow.period,partrow.due_date);
  ELSE UPDATE annual_expense_months SET expected_cents=nullif(greatest(0,coalesce(expected_cents,0)-partrow.amount_cents),0) WHERE annual_expense_id=partrow.annual_expense_id AND month=extract(month FROM partrow.due_date)::int;END IF;
 END LOOP;
 IF l.kind='invoice_baseline' THEN PERFORM finance_launcher_rebuild_invoice(l.account_id,v_period,due);END IF;
 PERFORM audit_append('undo_launch','finance_launch',l.id::text,to_jsonb(l),jsonb_build_object('undone',true),'{}');
 RETURN jsonb_build_object('id',l.id,'undone',true);
END $$;

CREATE OR REPLACE FUNCTION public.finance_launch_reconcile(p_version int,p_launch_id uuid,p_transaction_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); l public.finance_launches; t public.finance_launch_provider_evidence; acct text; delta bigint; BEGIN
 IF u IS NULL OR p_version<>1 THEN RAISE EXCEPTION 'Autenticação ou versão inválida';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,17));
 SELECT * INTO l FROM finance_launches WHERE user_id=u AND id=p_launch_id FOR UPDATE;
 IF NOT FOUND OR l.status='undone' THEN RAISE EXCEPTION 'Lançamento indisponível';END IF;
 SELECT * INTO t FROM finance_launch_provider_evidence WHERE user_id=u AND transaction_id=p_transaction_id AND verified_at>now()-interval '15 minutes';
 acct:=CASE WHEN l.kind='card_credit' THEN l.destination_account_id ELSE l.account_id END;
 delta:=CASE WHEN l.direction='credit' THEN l.amount_cents ELSE -l.amount_cents END;
 IF t.transaction_id IS NULL OR t.account_id IS DISTINCT FROM acct OR t.amount_cents IS DISTINCT FROM delta OR abs(t.operation_date-l.operation_date)>3 THEN RAISE EXCEPTION 'Transação bancária não corresponde ao lançamento';END IF;
 IF l.entity_kind NOT IN('bill','installment','revenue') OR l.status='forecast' THEN RAISE EXCEPTION 'Confirme o pagamento ou recebimento antes de conciliar';END IF;
 IF EXISTS(SELECT 1 FROM finance_launch_matches WHERE user_id=u AND transaction_id=p_transaction_id AND launch_id<>l.id) THEN RAISE EXCEPTION 'Movimentação já utilizada';END IF;
 INSERT INTO finance_launch_matches(user_id,launch_id,transaction_id) VALUES(u,l.id,p_transaction_id) ON CONFLICT(user_id,launch_id) DO NOTHING;
 UPDATE finance_launches SET status='reconciled' WHERE id=l.id;
 PERFORM audit_append('reconcile_launch','finance_launch',l.id::text,NULL,jsonb_build_object('transaction_id',p_transaction_id),'{}');
 RETURN jsonb_build_object('id',l.id,'reconciled',true);
END $$;

CREATE OR REPLACE FUNCTION public.finance_launcher_state(p_version int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u uuid:=auth.uid(); rows jsonb; used jsonb; BEGIN
 IF u IS NULL OR p_version<>1 THEN RAISE EXCEPTION 'Autenticação ou versão inválida';END IF;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(q)) ORDER BY q.created DESC),'[]') INTO rows FROM (
  SELECT l.id,l.title,l.kind,l.operation_date AS date,l.amount_cents AS "totalCents",l.status,
   coalesce(CASE WHEN l.kind='card_credit' THEN l.destination_account_id ELSE l.account_id END,'') AS "accountId",
   coalesce(a.name,'') AS "accountName",l.direction,l.created_at AS created,
   l.status<>'undone' AND l.status<>'reconciled' AS "canUndo"
  FROM finance_launches l LEFT JOIN finance_launcher_accounts a ON a.user_id=u AND a.account_id=CASE WHEN l.kind='card_credit' THEN l.destination_account_id ELSE l.account_id END
  WHERE l.user_id=u ORDER BY l.created_at DESC LIMIT 100
 )q;
 SELECT coalesce(jsonb_agg(transaction_id),'[]') INTO used FROM finance_launch_matches WHERE user_id=u;
 RETURN jsonb_build_object('version',1,'capabilities',jsonb_build_array('atomic_launch','settlement_accounts','card_invoices','reconciliation','undo'),'launches',rows,'usedTransactionIds',used);
END $$;

-- Helper functions are not public write APIs.
REVOKE ALL ON FUNCTION public.finance_launcher_note(text,text,text,int),public.finance_launcher_check_account(text,text),public.finance_launcher_annual_row(text,int,date,uuid,text,text),public.finance_launcher_rebuild_invoice(text,text,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finance_launch_transaction(int,jsonb,jsonb),public.finance_record_settlement(int,jsonb),public.finance_launch_undo(int,uuid),public.finance_launch_reconcile(int,uuid,text),public.finance_launcher_state(int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_launch_transaction(int,jsonb,jsonb),public.finance_record_settlement(int,jsonb),public.finance_launch_undo(int,uuid),public.finance_launch_reconcile(int,uuid,text),public.finance_launcher_state(int) TO authenticated;
NOTIFY pgrst,'reload schema';

-- Official closed invoices override the forecast in the matching year, never another exercise.
CREATE OR REPLACE FUNCTION public.apply_closed_card_invoice(
  p_account_id text, p_period text, p_closed_at date, p_due_date date,
  p_amount_cents bigint, p_origin text, p_provider_reference text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_annual uuid;
  v_year integer;
  v_old public.finance_card_closed_invoices%ROWTYPE;
  v_bills_paid boolean;
  v_before jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF p_account_id IS NULL OR length(p_account_id) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Conta inválida'; END IF;
  IF p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Competência inválida'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 0 OR p_amount_cents > 999999999999 THEN RAISE EXCEPTION 'Valor de fatura inválido'; END IF;
  IF p_closed_at IS NULL OR p_due_date IS NULL OR p_closed_at > current_date
      OR p_closed_at > p_due_date OR to_char(p_due_date, 'YYYY-MM') <> p_period THEN
    RAISE EXCEPTION 'Datas inconsistentes com a competência';
  END IF;
  IF p_origin NOT IN ('manual', 'provider') THEN RAISE EXCEPTION 'Fonte inválida'; END IF;
  IF p_origin = 'provider' AND (p_provider_reference IS NULL OR length(p_provider_reference) < 3) THEN
    RAISE EXCEPTION 'Fatura bancária sem referência';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,17));
  v_year:=split_part(p_period,'-',1)::integer;
  v_annual:=public.finance_launcher_annual_row(p_account_id,v_year,p_due_date);
  IF EXISTS (SELECT 1 FROM public.annual_years y WHERE y.user_id = v_user AND y.year = v_year AND y.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Exercício arquivado';
  END IF;
  PERFORM b.id FROM public.finance_bills b
    WHERE b.user_id = v_user AND b.source_annual_id = v_annual AND b.source_period = p_period FOR UPDATE;
  SELECT EXISTS(SELECT 1 FROM public.finance_bills b
    WHERE b.user_id = v_user AND b.source_annual_id = v_annual
      AND b.source_period = p_period AND b.paid_date IS NOT NULL) INTO v_bills_paid;
  IF v_bills_paid THEN RAISE EXCEPTION 'Pagamento existente: requer revisão manual'; END IF;
  SELECT * INTO v_old FROM public.finance_card_closed_invoices i
    WHERE i.user_id = v_user AND i.account_id = p_account_id AND i.period = p_period FOR UPDATE;
  IF FOUND THEN
    IF v_old.amount_cents = p_amount_cents AND v_old.closed_at = p_closed_at
       AND v_old.due_date = p_due_date AND v_old.origin = p_origin
       AND v_old.provider_reference IS NOT DISTINCT FROM p_provider_reference THEN
       RETURN 'unchanged';
    END IF;
    v_before := to_jsonb(v_old);
  ELSE
    v_before := NULL;
  END IF;
  INSERT INTO public.finance_card_closed_invoices
    (user_id, account_id, period, closed_at, due_date, amount_cents, origin, provider_reference, annual_expense_id, updated_at)
  VALUES (v_user, p_account_id, p_period, p_closed_at, p_due_date, p_amount_cents, p_origin, p_provider_reference, v_annual, now())
  ON CONFLICT (user_id, account_id, period) DO UPDATE SET
    closed_at = EXCLUDED.closed_at, due_date = EXCLUDED.due_date, amount_cents = EXCLUDED.amount_cents,
    origin = EXCLUDED.origin, provider_reference = EXCLUDED.provider_reference,
    annual_expense_id = EXCLUDED.annual_expense_id, updated_at = now();
  INSERT INTO public.annual_expense_months (annual_expense_id, month, expected_cents)
    VALUES (v_annual, split_part(p_period, '-', 2)::integer, p_amount_cents)
    ON CONFLICT (annual_expense_id, month) DO UPDATE SET expected_cents = EXCLUDED.expected_cents;
  UPDATE public.finance_bills SET expected_cents = p_amount_cents, due_date = p_due_date
    WHERE user_id = v_user AND source_annual_id = v_annual AND source_period = p_period AND paid_date IS NULL;
  PERFORM public.audit_append(
    CASE WHEN p_origin = 'provider' THEN 'sync_closed_card_invoice' ELSE 'closed_card_invoice' END,
    'annual_expense', v_annual::text, v_before,
    jsonb_build_object('period', p_period, 'amount_cents', p_amount_cents),
    jsonb_build_object('origin', p_origin, 'account_id', p_account_id, 'provider_reference', p_provider_reference)
  );
  RETURN 'updated';
END;
$$;
REVOKE ALL ON FUNCTION public.apply_closed_card_invoice(text,text,date,date,bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_closed_card_invoice(text,text,date,date,bigint,text,text) TO authenticated;

-- Carry forward account links recorded before the dedicated ledger existed.
DO $import$
DECLARE r record; marker text:=E'\n[ÓRION_MOVIMENTO_V1]'; m jsonb; body text; beforedata jsonb; rid uuid; BEGIN
 FOR r IN
  SELECT b.user_id,'bill'::text AS entity_kind,b.id AS entity_id,NULL::int AS entity_number,b.creditor AS title,b.paid_date AS paid_date,b.paid_cents AS paid_cents,b.paid_note AS note,to_jsonb(b) AS snapshot,
   CASE WHEN b.contract_id IS NOT NULL AND b.installment_number IS NOT NULL THEN 'installment:'||b.contract_id||':'||b.installment_number::text ELSE 'bill:'||b.id END AS entity_key
  FROM finance_bills b WHERE b.paid_date IS NOT NULL AND position(marker IN coalesce(b.paid_note,''))>0
  AND NOT EXISTS(SELECT 1 FROM installment_entries x WHERE x.user_id=b.user_id AND x.contract_id=b.contract_id AND x.number=b.installment_number AND x.paid_date IS NOT NULL AND position(marker IN coalesce(x.note,''))>0)
  UNION ALL
  SELECT i.user_id,'installment',i.contract_id,i.number,c.name,i.paid_date,i.paid_cents,i.note,to_jsonb(i),'installment:'||i.contract_id||':'||i.number::text
  FROM installment_entries i JOIN installment_contracts c ON c.user_id=i.user_id AND c.id=i.contract_id WHERE i.paid_date IS NOT NULL AND position(marker IN coalesce(i.note,''))>0
  UNION ALL
  SELECT e.user_id,'revenue',e.id::text,NULL,e.title,e.received_date,e.received_cents,e.note,to_jsonb(e),'revenue:'||e.id::text
  FROM revenue_entries e WHERE e.received_date IS NOT NULL AND position(marker IN coalesce(e.note,''))>0
 LOOP
  BEGIN m:=substring(r.note FROM position(marker IN r.note)+length(marker))::jsonb;EXCEPTION WHEN invalid_text_representation THEN CONTINUE;END;
  IF m->>'version'<>'1' OR m->>'accountId' IS NULL OR m->>'accountName' IS NULL OR m->>'direction' IS DISTINCT FROM (CASE WHEN r.entity_kind='revenue' THEN 'credit' ELSE 'debit' END) THEN CONTINUE;END IF;
  INSERT INTO finance_launcher_accounts(user_id,account_id,name,account_type) VALUES(r.user_id,m->>'accountId',m->>'accountName','BANK') ON CONFLICT DO NOTHING;
  IF EXISTS(SELECT 1 FROM finance_launches WHERE user_id=r.user_id AND entity_key=r.entity_key AND status<>'undone') THEN CONTINUE;END IF;
  body:=substring(r.note,1,position(marker IN r.note)-1);
  beforedata:=r.snapshot||CASE WHEN r.entity_kind='revenue' THEN jsonb_build_object('received_date',NULL,'received_cents',NULL,'note',body) ELSE jsonb_build_object('paid_date',NULL,'paid_cents',NULL,'paid_note',body,'note',body,'is_settled',false) END;
  rid:=md5('legacy:'||r.user_id::text||':'||r.entity_key)::uuid;
  INSERT INTO finance_launches(id,user_id,request_id,payload,kind,title,operation_date,amount_cents,status,account_id,direction,entity_key,entity_kind,entity_id,entity_number,before_json)
  VALUES(rid,r.user_id,rid,jsonb_build_object('migrated',true),CASE WHEN r.entity_kind='revenue' THEN 'income' ELSE 'expense' END,r.title,r.paid_date,coalesce(r.paid_cents,0),'settled',m->>'accountId',m->>'direction',r.entity_key,r.entity_kind,r.entity_id,r.entity_number,beforedata)
  ON CONFLICT(user_id,request_id) DO NOTHING;
 END LOOP;
END $import$;
NOTIFY pgrst,'reload schema';
