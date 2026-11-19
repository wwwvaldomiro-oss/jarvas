-- Run in a transaction and roll back. Only synthetic values are used.
DO $fixture$
DECLARE u uuid; purchase_id uuid; annual uuid; p jsonb; parts jsonb; result jsonb; bill text;
BEGIN
  SELECT users.id INTO u FROM auth.users ORDER BY created_at LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  INSERT INTO finance_launcher_accounts(user_id,account_id,name,account_type) VALUES
    (u,'__trace_card','Cartão de teste','CREDIT'),(u,'__trace_bank','Conta de teste','BANK');
  p:=jsonb_build_object('kind','expense','title','Celular','merchant','Loja de teste','requestId',gen_random_uuid(),
    'date','2088-11-19','firstDue','2088-12-10','totalCents',100000,'medium','card','accountId','__trace_card',
    'installments',10,'startingInstallment',1,'baselineIncludesFirst',false,'alreadySettled',false);
  SELECT jsonb_agg(jsonb_build_object('number',n,'period',to_char(d,'YYYY-MM'),'dueDate',d::date,'cents',10000,'includedInBaseline',false) ORDER BY n)
    INTO parts FROM generate_series(1,10) n CROSS JOIN LATERAL (SELECT date '2088-12-10'+make_interval(months=>n-1) d) days;
  purchase_id:=(finance_launch_transaction(1,p,parts)->>'id')::uuid;
  SELECT a.annual_expense_id INTO annual FROM finance_launch_parts a WHERE a.launch_id=purchase_id AND a.number=1;
  p:=p||jsonb_build_object('title','Cabo','requestId',gen_random_uuid(),'totalCents',2000,'installments',1);
  PERFORM finance_launch_transaction(1,p,jsonb_build_array((parts->0)||jsonb_build_object('cents',2000)));
  bill:='trace-'||purchase_id;
  INSERT INTO finance_bills(id,user_id,creditor,due_date,expected_cents,source_annual_id,source_period)
    VALUES(bill,u,'Fatura de teste','2088-12-10',12000,annual,'2088-12');
  PERFORM finance_record_settlement(1,jsonb_build_object('requestId',gen_random_uuid(),'kind','bill','id',bill,
    'accountId','__trace_bank','date','2088-12-10','cents',12000,'quits',true,'revision',false));
  PERFORM set_config('test.trace_purchase',purchase_id::text,true);
  PERFORM set_config('test.trace_annual',annual::text,true);
END $fixture$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE purchase uuid:=current_setting('test.trace_purchase')::uuid; annual uuid:=current_setting('test.trace_annual')::uuid;
  t jsonb; c jsonb; payment uuid;
BEGIN
  t:=finance_transaction_trace(purchase);
  IF jsonb_array_length(t->'obligations')<>10 OR t#>>'{event,merchant}' IS DISTINCT FROM 'Loja de teste'
     OR t#>>'{event,cash}' IS NOT NULL OR t#>>'{obligations,0,expected}' IS DISTINCT FROM '12000'
     OR t#>>'{obligations,0,payments,0,account}' IS DISTINCT FROM 'Conta de teste'
     OR t#>>'{obligations,1,payments}' IS NOT NULL THEN RAISE EXCEPTION 'Compra, fatura ou pagamento incorreto'; END IF;
  c:=finance_transaction_trace(NULL,annual,'2088-12');
  IF t#>'{obligations,0}' IS DISTINCT FROM c#>'{obligations,0}' THEN RAISE EXCEPTION 'Consulta anual diverge'; END IF;
  SELECT id INTO payment FROM finance_launches WHERE entity_key='bill:trace-'||purchase;
  t:=finance_transaction_trace(payment);
  IF t#>>'{event,cash}' IS DISTINCT FROM '12000' OR jsonb_array_length(t#>'{obligations,0,items}')<>2 OR jsonb_array_length(t#>'{obligations,0,payments}')<>1
    THEN RAISE EXCEPTION 'Baixa sem origem'; END IF;
  DECLARE
    rows jsonb:=jsonb_build_array(jsonb_build_object('creditor','Energia teste','description','Consumo novembro',
      'expectedCents',4100,'dueDate','2088-11-30','expenseKind','consumption','requestId',gen_random_uuid()));
    bills jsonb; aid uuid;
  BEGIN
    bills:=finance_create_open_bills(rows);
    IF finance_create_open_bills(rows)<>bills THEN RAISE EXCEPTION 'Conta avulsa duplicada'; END IF;
    SELECT b.source_annual_id INTO STRICT aid FROM finance_bills b JOIN annual_expenses a ON a.id=b.source_annual_id
      WHERE b.id=bills->>0 AND a.expense_kind='consumption' AND a.consumption_value_type='variable';
    t:=finance_transaction_trace(NULL,aid,'2088-11');
    IF t#>>'{obligations,0,items,0,title}' IS DISTINCT FROM 'Consumo novembro' OR t#>>'{obligations,0,payments}' IS NOT NULL
      THEN RAISE EXCEPTION 'Conta avulsa sem origem ou com baixa antecipada'; END IF;
    rows:=jsonb_build_array((rows->0)-'requestId');
    IF finance_create_open_bills(rows,true)<>finance_create_open_bills(rows,true) THEN RAISE EXCEPTION 'Repetição do CSV'; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  IF finance_transaction_trace(purchase)->'event'<>'null'::jsonb OR finance_transaction_trace(NULL,annual,'2088-12')->'obligations'<>'[]'::jsonb
    THEN RAISE EXCEPTION 'Consulta fora da conta'; END IF;
END $test$;
RESET ROLE;
SELECT 'PASS: compra 10x, pagamento por outra conta, consulta anual inversa, isolamento de usuário' AS verification;
