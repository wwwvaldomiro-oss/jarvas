-- Read the financial trail through existing keys. A cash payment belongs to the
-- obligation (one monthly invoice may cover many purchases), never to each item.
CREATE OR REPLACE FUNCTION public.finance_transaction_trace(
  p_launch_id uuid DEFAULT NULL, p_annual_id uuid DEFAULT NULL, p_period text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
WITH selected AS (
  SELECT * FROM finance_launches
  WHERE user_id=auth.uid() AND id=p_launch_id AND p_annual_id IS NULL
), cells AS (
  SELECT a.id AS annual_id, p_period AS period FROM annual_expenses a
  WHERE p_launch_id IS NULL AND a.id=p_annual_id AND a.user_id=auth.uid()
    AND p_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(p_period,4)=a.year::text
  UNION
  SELECT p.annual_expense_id,p.period FROM selected l JOIN finance_launch_parts p
    ON p.user_id=l.user_id AND p.launch_id=l.id
  UNION
  SELECT b.source_annual_id,b.source_period FROM selected l JOIN finance_bills b
    ON b.user_id=l.user_id AND l.entity_kind='bill' AND b.id=l.entity_id
  UNION
  SELECT a.id,to_char(i.due_date,'YYYY-MM') FROM selected l JOIN installment_entries i
    ON i.user_id=l.user_id AND l.entity_kind='installment' AND l.entity_id=i.contract_id AND i.number=l.entity_number
    JOIN annual_expenses a ON a.user_id=i.user_id AND a.source_contract_id=i.contract_id AND a.year=extract(year FROM i.due_date)
  UNION
  SELECT a.id,b.period FROM selected l JOIN finance_card_initial_balances b ON b.user_id=l.user_id AND b.launch_id=l.id
    JOIN finance_account_profiles f ON f.user_id=b.user_id AND f.account_id=b.account_id
    JOIN annual_expenses a ON a.user_id=l.user_id AND (a.id=f.annual_expense_id OR a.source_template_id=f.annual_expense_id)
      AND a.year::text=left(b.period,4)
), obligations AS (
  SELECT c.period,a.id,a.creditor,a.source_contract_id,m.expected_cents
  FROM cells c JOIN annual_expenses a ON a.id=c.annual_id AND a.user_id=auth.uid()
  LEFT JOIN annual_expense_months m ON m.annual_expense_id=a.id AND m.month=right(c.period,2)::int
  WHERE c.period IS NOT NULL
), items AS (
  SELECT o.id,o.period,l.title,l.payload->>'merchant' AS merchant,l.payload->>'date' AS date,
    coalesce(ac.name,CASE WHEN l.payload->>'medium'='creditor' THEN o.creditor END) AS instrument,
    p.number,(l.payload->>'installments')::int AS count,p.amount_cents AS cents,p.included_in_baseline AS included
  FROM obligations o JOIN finance_launch_parts p ON p.user_id=auth.uid() AND p.annual_expense_id=o.id AND p.period=o.period
    JOIN finance_launches l ON l.id=p.launch_id AND l.user_id=p.user_id AND l.status<>'undone'
    LEFT JOIN finance_launcher_accounts ac ON ac.user_id=l.user_id AND ac.account_id=l.payload->>'accountId'
), payments AS (
  SELECT o.id,o.period,'installment:'||i.contract_id||':'||i.number AS entity_key,i.paid_date AS date,i.paid_cents AS cents,i.is_settled AS settled
  FROM obligations o JOIN installment_entries i ON i.user_id=auth.uid() AND o.source_contract_id=i.contract_id
    AND to_char(i.due_date,'YYYY-MM')=o.period AND i.paid_date IS NOT NULL
  UNION
  SELECT o.id,o.period,CASE WHEN b.contract_id IS NOT NULL AND b.installment_number IS NOT NULL
      THEN 'installment:'||b.contract_id||':'||b.installment_number ELSE 'bill:'||b.id END,
    b.paid_date,b.paid_cents,b.is_settled
  FROM obligations o JOIN finance_bills b ON b.user_id=auth.uid() AND b.source_annual_id=o.id AND b.source_period=o.period
  WHERE b.paid_date IS NOT NULL AND NOT EXISTS (
    SELECT FROM installment_entries i WHERE i.user_id=b.user_id AND i.paid_date IS NOT NULL
    AND i.contract_id=coalesce(b.contract_id,o.source_contract_id)
    AND (i.number=b.installment_number OR (b.installment_number IS NULL AND to_char(i.due_date,'YYYY-MM')=o.period))
  )
), cell_details AS (
  SELECT o.creditor,o.period,o.expected_cents AS expected,
    (SELECT inv.amount_cents FROM finance_card_closed_invoices inv JOIN finance_account_profiles f
       ON f.user_id=inv.user_id AND f.account_id=inv.account_id
       JOIN annual_expenses a ON a.id=o.id AND a.user_id=f.user_id
       WHERE inv.user_id=auth.uid() AND inv.period=o.period AND f.annual_expense_id IN (a.id,a.source_template_id)
       ORDER BY inv.due_date DESC LIMIT 1) AS closed_total,
    (SELECT jsonb_agg(to_jsonb(i)-'id'-'period' ORDER BY i.date,i.title,i.number) FROM items i WHERE i.id=o.id AND i.period=o.period) AS items,
    (SELECT jsonb_agg(jsonb_build_object('date',p.date,'cents',p.cents,'settled',p.settled,'account',a.name) ORDER BY p.date,p.entity_key)
     FROM payments p LEFT JOIN finance_launches l ON l.user_id=auth.uid() AND l.entity_key=p.entity_key AND l.status IN ('settled','reconciled')
     LEFT JOIN finance_launcher_accounts a ON a.user_id=l.user_id AND a.account_id=l.account_id
     WHERE p.id=o.id AND p.period=o.period) AS payments
  FROM obligations o
), event AS (
  SELECT l.title,coalesce(l.payload->>'date',l.operation_date::text) AS date,l.kind,l.status,l.direction,
    l.payload->>'medium' AS medium,coalesce((l.payload->>'totalCents')::bigint,l.amount_cents) AS total,
    l.payload->>'merchant' AS merchant,coalesce(nullif(l.payload->>'source',''),s.title,c.buyer) AS payer,
    l.payload->>'note' AS note,a.name AS instrument,d.name AS destination,
    CASE WHEN l.status IN ('settled','reconciled') AND l.direction IS NOT NULL THEN l.amount_cents END AS cash,
    l.operation_date AS cash_date,actual.name AS cash_account,
    (l.payload ? 'settlement' OR l.payload ? 'migrated') AS settlement,
    (l.payload->>'receivedCents')::bigint AS net
  FROM selected l LEFT JOIN revenue_entries r ON r.user_id=l.user_id AND l.entity_kind='revenue' AND r.id::text=l.entity_id
    LEFT JOIN revenue_sources s ON s.user_id=r.user_id AND s.id=r.source_id
    LEFT JOIN revenue_contracts c ON c.user_id=r.user_id AND c.id=r.contract_id
    LEFT JOIN finance_launcher_accounts a ON a.user_id=l.user_id AND a.account_id=coalesce(l.payload->>'accountId',l.account_id)
    LEFT JOIN finance_launcher_accounts d ON d.user_id=l.user_id AND d.account_id=l.payload->>'destinationAccountId'
    LEFT JOIN finance_launcher_accounts actual ON actual.user_id=l.user_id AND actual.account_id=
      CASE WHEN l.kind='card_credit' THEN l.destination_account_id ELSE l.account_id END
)
SELECT jsonb_build_object('event',(SELECT to_jsonb(e) FROM event e),
  'obligations',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.period,d.creditor) FROM cell_details d),'[]'::jsonb));
$$;
REVOKE ALL ON FUNCTION public.finance_transaction_trace(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_transaction_trace(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';

-- A one-off bill has no cash account until payment. Persist its annual cell,
-- monthly bill and originating event together, including a whole CSV batch.
CREATE OR REPLACE FUNCTION public.finance_create_open_bills(p_rows jsonb, p_csv boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  u uuid:=auth.uid(); row_data jsonb; request uuid; launch uuid; annual uuid; bill text;
  creditor text; detail text; classification text; due date; period text; cents bigint;
  fingerprint text; previous text; result jsonb:='[]';
BEGIN
  IF u IS NULL OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Dados de contas inválidos'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(u::text,17));
  FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    creditor:=trim(row_data->>'creditor'); detail:=trim(coalesce(row_data->>'description',''));
    classification:=coalesce(row_data->>'expenseKind','debt');
    due:=(row_data->>'dueDate')::date; period:=to_char(due,'YYYY-MM'); cents:=(row_data->>'expectedCents')::bigint;
    IF coalesce(length(creditor),0) NOT BETWEEN 1 AND 200 OR length(detail)>1000 OR due IS NULL OR cents IS NULL
      OR cents NOT BETWEEN 1 AND 999999999999 OR classification NOT IN ('debt','consumption')
      THEN RAISE EXCEPTION 'Credor, vencimento, valor ou classificação inválidos'; END IF;
    fingerprint:=md5((row_data-'requestId')::text);
    request:=CASE WHEN p_csv THEN md5('csv:'||u||':'||fingerprint)::uuid ELSE (row_data->>'requestId')::uuid END;
    IF request IS NULL THEN RAISE EXCEPTION 'Solicitação sem identificação'; END IF;
    SELECT r.fingerprint,l.entity_id INTO previous,bill FROM finance_launch_requests r
      JOIN finance_launches l ON l.user_id=r.user_id AND l.id=r.launch_id WHERE r.user_id=u AND r.request_id=request;
    IF FOUND THEN
      IF fingerprint<>previous THEN RAISE EXCEPTION 'A solicitação anterior possui outros dados'; END IF;
      result:=result||jsonb_build_array(bill); CONTINUE;
    END IF;
    annual:=finance_launcher_annual_row(NULL,extract(year FROM due)::int,due,NULL,creditor);
    IF classification='consumption' THEN
      UPDATE annual_expenses SET expense_kind='consumption',expense_source='consumption',consumption_value_type='variable'
        WHERE user_id=u AND id=annual;
    END IF;
    INSERT INTO annual_expense_months(annual_expense_id,month,expected_cents) VALUES(annual,extract(month FROM due)::int,cents);
    bill:=(CASE WHEN p_csv THEN 'csv-' ELSE 'manual-' END)||request;
    INSERT INTO finance_bills(id,user_id,creditor,description,due_date,expected_cents,expense_kind,source_annual_id,source_period)
      VALUES(bill,u,creditor,detail,due,cents,classification,annual,period);
    INSERT INTO finance_launches(user_id,request_id,payload,kind,title,operation_date,amount_cents,entity_kind,entity_id)
      VALUES(u,request,jsonb_build_object('kind','expense','medium','payable','merchant',creditor,'installments',1,
        'note',detail,'totalCents',cents,'firstDue',due),'expense',coalesce(nullif(detail,''),creditor),
        (now() AT TIME ZONE 'America/Sao_Paulo')::date,cents,'bill',bill) RETURNING id INTO launch;
    INSERT INTO finance_launch_parts(user_id,launch_id,number,period,due_date,amount_cents,annual_expense_id)
      VALUES(u,launch,1,period,due,cents,annual);
    INSERT INTO finance_launch_requests VALUES(u,request,fingerprint,launch);
    PERFORM audit_append('add_bill','bill',bill,NULL,row_data,jsonb_build_object('annualId',annual,'launchId',launch));
    result:=result||jsonb_build_array(bill);
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_create_open_bills(jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_create_open_bills(jsonb,boolean) TO authenticated;
