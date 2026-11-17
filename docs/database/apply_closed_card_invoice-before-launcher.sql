CREATE OR REPLACE FUNCTION public.apply_closed_card_invoice(p_account_id text, p_period text, p_closed_at date, p_due_date date, p_amount_cents bigint, p_origin text, p_provider_reference text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  SELECT f.annual_expense_id INTO v_annual FROM public.finance_account_profiles f
    WHERE f.user_id = v_user AND f.account_id = p_account_id FOR UPDATE;
  IF v_annual IS NULL THEN RAISE EXCEPTION 'Vincule o cartão ao credor anual'; END IF;
  SELECT e.year INTO v_year FROM public.annual_expenses e WHERE e.user_id = v_user AND e.id = v_annual FOR UPDATE;
  IF v_year IS NULL OR v_year <> split_part(p_period, '-', 1)::integer THEN
    RAISE EXCEPTION 'Credor não pertence ao exercício da competência';
  END IF;
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
    IF v_old.origin = 'manual' AND p_origin = 'provider' THEN RETURN 'skipped'; END IF;
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
$function$

