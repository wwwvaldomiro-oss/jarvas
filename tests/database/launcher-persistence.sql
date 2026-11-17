DO $test$
DECLARE u uuid; payload jsonb; plan jsonb; result jsonb; lid uuid; sid uuid; total bigint; n int; rows_before int; BEGIN
 SELECT id INTO u FROM auth.users ORDER BY created_at LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'Não há usuário para teste transacional';END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 INSERT INTO finance_launcher_accounts(user_id,account_id,name,account_type) VALUES(u,'__test_card__','Cartão teste','CREDIT'),(u,'__test_bank__','Conta teste','BANK');
 payload:=jsonb_build_object('requestId',gen_random_uuid(),'kind','card_credit','title','Pix Cartão Parcelado','date','2079-12-17','firstDue','2080-01-17','totalCents',121521,'receivedCents',100000,'medium','card','accountId','__test_card__','destinationAccountId','__test_bank__','creditorId',NULL,'sourceId',NULL,'installments',10,'startingInstallment',1,'source','Cartão de crédito','note','Teste transacional','alreadySettled',true,'baselineIncludesFirst',false);
 SELECT jsonb_agg(jsonb_build_object('number',i,'period',to_char(date '2080-01-17'+make_interval(months=>i-1),'YYYY-MM'),'dueDate',to_char(date '2080-01-17'+make_interval(months=>i-1),'YYYY-MM-DD'),'cents',12152+CASE WHEN i=1 THEN 1 ELSE 0 END,'includedInBaseline',false) ORDER BY i) INTO plan FROM generate_series(1,10) i;
 result:=finance_launch_transaction(1,payload,plan);lid:=(result->>'id')::uuid;
 SELECT count(*),sum(amount_cents) INTO n,total FROM finance_launch_parts WHERE launch_id=lid;
 IF n<>10 OR total<>121521 THEN RAISE EXCEPTION 'Falha no parcelamento';END IF;
 IF NOT EXISTS(SELECT 1 FROM revenue_entries WHERE id=(SELECT entity_id::uuid FROM finance_launches WHERE id=lid) AND received_cents=100000 AND category='Crédito recebido') THEN RAISE EXCEPTION 'Falha na entrada líquida';END IF;
 result:=finance_launch_transaction(1,payload,plan);
 IF (result->>'id')::uuid<>lid OR NOT(result->>'duplicate')::boolean THEN RAISE EXCEPTION 'Falha de idempotência';END IF;
 IF NOT EXISTS(SELECT 1 FROM annual_expense_months m JOIN annual_expenses a ON a.id=m.annual_expense_id WHERE a.user_id=u AND a.creditor='Cartão teste' AND a.year=2080 AND m.month=1 AND m.expected_cents=12153) THEN RAISE EXCEPTION 'Falha na previsão anual';END IF;
 PERFORM finance_launch_undo(1,lid);
 IF EXISTS(SELECT 1 FROM finance_launches WHERE id=lid AND status<>'undone') THEN RAISE EXCEPTION 'Falha em desfazer';END IF;
 IF EXISTS(SELECT 1 FROM revenue_entries WHERE id=(SELECT entity_id::uuid FROM finance_launches WHERE id=lid) AND category<>'Cancelado') THEN RAISE EXCEPTION 'Entrada não cancelada';END IF;
 IF EXISTS(SELECT 1 FROM annual_expense_months m JOIN annual_expenses a ON a.id=m.annual_expense_id WHERE a.user_id=u AND a.creditor='Cartão teste' AND a.year=2080 AND coalesce(m.expected_cents,0)<>0) THEN RAISE EXCEPTION 'Parcelas não revertidas';END IF;
 PERFORM finance_launch_undo(1,lid);
 result:=finance_launcher_state(1);
 IF result->>'version'<>'1' THEN RAISE EXCEPTION 'Falha no estado'; END IF;
 RAISE NOTICE 'PASS: crédito, 10 parcelas, centavos, previsão anual, idempotência, desfazer e auditoria';
END $test$;
DO $cases$
DECLARE u uuid:=auth.uid(); payload jsonb; plan jsonb; result jsonb; baseline uuid; purchase uuid; lid uuid; payment_id uuid; eid uuid; total bigint; count_before int; rejected boolean; BEGIN
 payload:=jsonb_build_object('requestId',gen_random_uuid(),'kind','invoice_baseline','title','Fatura inicial','date','2080-12-17','firstDue','2081-01-17','totalCents',50000,'receivedCents',NULL,'medium','card','accountId','__test_card__','destinationAccountId',NULL,'creditorId',NULL,'sourceId',NULL,'installments',1,'startingInstallment',1,'source','','note','','alreadySettled',false,'baselineIncludesFirst',false);
 plan:=jsonb_build_array(jsonb_build_object('number',1,'period','2081-01','dueDate','2081-01-17','cents',50000,'includedInBaseline',false));
 result:=finance_launch_transaction(1,payload,plan);baseline:=(result->>'id')::uuid;
 payload:=payload||jsonb_build_object('requestId',gen_random_uuid(),'kind','expense','title','Compra incluída','totalCents',10000,'baselineIncludesFirst',true);
 plan:=jsonb_build_array(jsonb_build_object('number',1,'period','2081-01','dueDate','2081-01-17','cents',10000,'includedInBaseline',true));
 PERFORM finance_launch_transaction(1,payload,plan);
 payload:=payload||jsonb_build_object('requestId',gen_random_uuid(),'title','Compra nova','totalCents',20000,'baselineIncludesFirst',false);
 plan:=jsonb_build_array(jsonb_build_object('number',1,'period','2081-01','dueDate','2081-01-17','cents',20000,'includedInBaseline',false));
 result:=finance_launch_transaction(1,payload,plan);purchase:=(result->>'id')::uuid;
 SELECT m.expected_cents INTO total FROM annual_expense_months m JOIN annual_expenses a ON a.id=m.annual_expense_id WHERE a.user_id=u AND a.creditor='Cartão teste' AND a.year=2081 AND m.month=1;
 IF total<>70000 THEN RAISE EXCEPTION 'Base e parcelas duplicadas: %',total;END IF;
 SELECT count(*) INTO count_before FROM finance_launches WHERE user_id=u;
 rejected:=false;BEGIN
  PERFORM finance_launch_transaction(1,payload||jsonb_build_object('requestId',gen_random_uuid()),jsonb_set(plan,'{0,cents}','19999'));
 EXCEPTION WHEN OTHERS THEN rejected:=true;END;
 IF NOT rejected OR (SELECT count(*) FROM finance_launches WHERE user_id=u)<>count_before THEN RAISE EXCEPTION 'Plano adulterado não foi revertido';END IF;
 PERFORM apply_closed_card_invoice('__test_card__','2081-01',current_date,'2081-01-17',71500,'provider','__test_official__');
 SELECT m.expected_cents INTO total FROM annual_expense_months m JOIN annual_expenses a ON a.id=m.annual_expense_id WHERE a.user_id=u AND a.creditor='Cartão teste' AND a.year=2081 AND m.month=1;
 IF total<>71500 THEN RAISE EXCEPTION 'Fatura oficial não prevaleceu';END IF;
 rejected:=false;BEGIN PERFORM finance_launch_undo(1,purchase);EXCEPTION WHEN OTHERS THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Fatura fechada foi alterada por desfazimento';END IF;
 -- A bank expense can be paid and later undone as one operation.
 payload:=payload||jsonb_build_object('requestId',gen_random_uuid(),'title','Despesa bancária teste','medium','bank','accountId','__test_bank__','date','2081-12-17','firstDue','2082-01-17','totalCents',10000);
 plan:=jsonb_build_array(jsonb_build_object('number',1,'period','2082-01','dueDate','2082-01-17','cents',10000,'includedInBaseline',false));
 result:=finance_launch_transaction(1,payload,plan);lid:=(result->>'id')::uuid;
 PERFORM finance_record_settlement(1,jsonb_build_object('requestId',gen_random_uuid(),'kind','bill','id','launch:'||lid::text,'number',NULL,'accountId','__test_bank__','date','2082-01-17','cents',10000,'note','Pago','reason','','quits',true,'revision',false));
 IF NOT EXISTS(SELECT 1 FROM finance_bills WHERE user_id=u AND id='launch:'||lid::text AND paid_cents=10000 AND is_settled) THEN RAISE EXCEPTION 'Baixa bancária não persistiu';END IF;
 SELECT id INTO payment_id FROM finance_launches WHERE user_id=u AND entity_key='bill:launch:'||lid::text AND status<>'undone';
 PERFORM finance_launch_undo(1,payment_id);
 PERFORM finance_launch_undo(1,lid);
 IF EXISTS(SELECT 1 FROM finance_bills WHERE user_id=u AND id='launch:'||lid::text AND (paid_date IS NOT NULL OR expected_cents<>0)) THEN RAISE EXCEPTION 'Despesa não foi revertida';END IF;
 -- Undoing a receipt reopens its original commitment.
 INSERT INTO revenue_entries(user_id,title,category,expected_cents,due_date) VALUES(u,'Receita teste','Renda Extra',162000,'2082-01-17') RETURNING id INTO eid;
 PERFORM finance_record_settlement(1,jsonb_build_object('requestId',gen_random_uuid(),'kind','revenue','id',eid,'number',NULL,'accountId','__test_bank__','date','2082-01-17','cents',162000,'note','Recebido','reason','','quits',true,'revision',false));
 SELECT id INTO lid FROM finance_launches WHERE user_id=u AND entity_key='revenue:'||eid::text AND status<>'undone';
 IF NOT EXISTS(SELECT 1 FROM revenue_entries WHERE id=eid AND received_cents=162000) THEN RAISE EXCEPTION 'Recebimento não persistiu';END IF;
 PERFORM finance_launch_undo(1,lid);
 IF NOT EXISTS(SELECT 1 FROM revenue_entries WHERE id=eid AND received_date IS NULL AND expected_cents=162000) THEN RAISE EXCEPTION 'Receita não foi reaberta';END IF;
 -- The same UUID cannot be read or undone as another identity.
 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 IF jsonb_array_length(finance_launcher_state(1)->'launches')<>0 THEN RAISE EXCEPTION 'Dados de outro usuário expostos';END IF;
 rejected:=false;BEGIN PERFORM finance_launch_undo(1,baseline);EXCEPTION WHEN OTHERS THEN rejected:=true;END;
 IF NOT rejected THEN RAISE EXCEPTION 'Usuário diferente conseguiu desfazer';END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
END $cases$;
SELECT 'PASS: real PostgreSQL save, cents, idempotency, baseline deduplication, official invoice, tamper rollback, bank payment, receipt, undo and user isolation' AS verification;
