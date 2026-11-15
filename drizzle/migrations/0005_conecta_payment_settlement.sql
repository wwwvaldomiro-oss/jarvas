ALTER TABLE public.finance_bills ADD COLUMN IF NOT EXISTS is_settled boolean NOT NULL DEFAULT false;
ALTER TABLE public.installment_entries ADD COLUMN IF NOT EXISTS is_settled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.record_expense_payment(
  p_bill_id text, p_contract_id text, p_number integer, p_paid_date date,
  p_paid_cents bigint, p_note text, p_is_settled boolean, p_revision boolean
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $axion$
DECLARE
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'É necessário estar autenticado para registrar pagamentos.'; END IF;
  IF (p_bill_id IS NULL) = (p_contract_id IS NULL) THEN RAISE EXCEPTION 'Informe exatamente uma conta ou uma parcela.'; END IF;
  IF p_bill_id IS NOT NULL AND p_number IS NOT NULL THEN RAISE EXCEPTION 'Número de parcela não se aplica ao pagamento desta conta.'; END IF;
  IF p_contract_id IS NOT NULL AND (p_number IS NULL OR p_number < 1) THEN RAISE EXCEPTION 'Parcela inválida.'; END IF;
  IF p_paid_date IS NULL OR p_paid_cents IS NULL OR p_paid_cents <= 0 THEN RAISE EXCEPTION 'Informe data e valor pago válido.'; END IF;
  IF p_is_settled IS NULL OR p_revision IS NULL THEN RAISE EXCEPTION 'Informe explicitamente se a obrigação foi quitada e se é revisão.'; END IF;
  IF length(coalesce(p_note, '')) > 1000 THEN RAISE EXCEPTION 'Observação muito longa.'; END IF;

  IF p_bill_id IS NOT NULL THEN
    SELECT to_jsonb(b) INTO v_before FROM public.finance_bills AS b
      WHERE b.user_id = v_actor AND b.id = p_bill_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada para este usuário.'; END IF;
    IF p_revision AND v_before->>'paid_date' IS NULL THEN RAISE EXCEPTION 'Não é possível revisar uma conta sem pagamento anterior.'; END IF;
    IF NOT p_revision AND v_before->>'paid_date' IS NOT NULL THEN RAISE EXCEPTION 'Esta conta já tem pagamento. Utilize a revisão.'; END IF;
    UPDATE public.finance_bills AS b
      SET paid_date = p_paid_date, paid_cents = p_paid_cents, paid_note = coalesce(p_note, ''), is_settled = p_is_settled
      WHERE b.user_id = v_actor AND b.id = p_bill_id
      RETURNING to_jsonb(b) INTO v_after;
    PERFORM public.audit_append(CASE WHEN p_revision THEN 'revise_bill' ELSE 'pay_bill' END,
      'finance_bills', p_bill_id, v_before, v_after,
      jsonb_build_object('is_settled', p_is_settled, 'revision', p_revision));
  ELSE
    SELECT to_jsonb(i) INTO v_before FROM public.installment_entries AS i
      WHERE i.user_id = v_actor AND i.contract_id = p_contract_id AND i.number = p_number FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada para este usuário.'; END IF;
    IF p_revision AND v_before->>'paid_date' IS NULL THEN RAISE EXCEPTION 'Não é possível revisar uma parcela sem pagamento anterior.'; END IF;
    IF NOT p_revision AND v_before->>'paid_date' IS NOT NULL THEN RAISE EXCEPTION 'Esta parcela já tem pagamento. Utilize a revisão.'; END IF;
    UPDATE public.installment_entries AS i
      SET paid_date = p_paid_date, paid_cents = p_paid_cents, note = coalesce(p_note, ''), is_settled = p_is_settled, updated_at = now()
      WHERE i.user_id = v_actor AND i.contract_id = p_contract_id AND i.number = p_number
      RETURNING to_jsonb(i) INTO v_after;
    PERFORM public.audit_append(CASE WHEN p_revision THEN 'revise_installment' ELSE 'pay_installment' END,
      'installment_entries', p_contract_id || ':' || p_number, v_before, v_after,
      jsonb_build_object('is_settled', p_is_settled, 'revision', p_revision));
  END IF;
END;
$axion$;
REVOKE ALL ON FUNCTION public.record_expense_payment(text, text, integer, date, bigint, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense_payment(text, text, integer, date, bigint, text, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_expense_bulk_settlement()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $bulk$
DECLARE
  v_user uuid := auth.uid();
  v_full integer; v_discount integer; v_discount_cents bigint; v_bill_count integer; v_installment_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.'; END IF;
  WITH pending AS (
    SELECT expected_cents,paid_cents,'bill' AS kind FROM public.finance_bills
      WHERE user_id=v_user AND paid_date IS NOT NULL AND paid_cents > 0 AND is_settled IS DISTINCT FROM true
    UNION ALL
    SELECT expected_cents,paid_cents,'installment' AS kind FROM public.installment_entries
      WHERE user_id=v_user AND paid_date IS NOT NULL AND paid_cents > 0 AND is_settled IS DISTINCT FROM true
  )
  SELECT count(*) FILTER (WHERE paid_cents >= expected_cents),
    count(*) FILTER (WHERE paid_cents < expected_cents),
    coalesce(sum(expected_cents - paid_cents) FILTER (WHERE paid_cents < expected_cents),0),
    count(*) FILTER (WHERE kind='bill'), count(*) FILTER (WHERE kind='installment')
  INTO v_full,v_discount,v_discount_cents,v_bill_count,v_installment_count FROM pending;
  RETURN jsonb_build_object('fullCount',v_full,'partialCount',v_discount,'discountCents',v_discount_cents,
    'billCount',v_bill_count,'installmentCount',v_installment_count);
END;
$bulk$;

CREATE OR REPLACE FUNCTION public.confirm_expense_bulk_settlement(p_include_partial boolean, p_expected_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $bulk$
DECLARE
  v_user uuid := auth.uid();
  v_current integer; v_bills integer := 0; v_installments integer := 0; v_before record; v_after jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.'; END IF;
  IF p_include_partial IS NULL OR p_expected_count IS NULL OR p_expected_count < 0 THEN RAISE EXCEPTION 'Confirmação inválida.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('axion-bulk-settlement'),hashtext(v_user::text));
  SELECT count(*) INTO v_current FROM (
    SELECT 1 FROM public.finance_bills WHERE user_id=v_user AND paid_date IS NOT NULL AND paid_cents > 0
        AND is_settled IS DISTINCT FROM true AND (p_include_partial OR paid_cents >= expected_cents)
    UNION ALL
    SELECT 1 FROM public.installment_entries WHERE user_id=v_user AND paid_date IS NOT NULL AND paid_cents > 0
        AND is_settled IS DISTINCT FROM true AND (p_include_partial OR paid_cents >= expected_cents)
  ) eligible;
  IF v_current <> p_expected_count THEN RAISE EXCEPTION 'A lista de pagamentos mudou. Atualize a prévia antes de confirmar.'; END IF;
  FOR v_before IN
    SELECT b.* FROM public.finance_bills AS b
    WHERE b.user_id=v_user AND b.paid_date IS NOT NULL AND b.paid_cents > 0
      AND b.is_settled IS DISTINCT FROM true AND (p_include_partial OR b.paid_cents >= b.expected_cents)
    ORDER BY b.id FOR UPDATE
  LOOP
    UPDATE public.finance_bills AS b SET is_settled=true WHERE b.user_id=v_user AND b.id=v_before.id RETURNING to_jsonb(b) INTO v_after;
    PERFORM public.audit_append('bulk_settle_existing_payment','finance_bills',v_before.id, to_jsonb(v_before),v_after,
      jsonb_build_object('mode','mass_quitacao','discount',v_before.paid_cents < v_before.expected_cents));
    v_bills := v_bills + 1;
  END LOOP;
  FOR v_before IN
    SELECT i.* FROM public.installment_entries AS i
    WHERE i.user_id=v_user AND i.paid_date IS NOT NULL AND i.paid_cents > 0
      AND i.is_settled IS DISTINCT FROM true AND (p_include_partial OR i.paid_cents >= i.expected_cents)
    ORDER BY i.contract_id,i.number FOR UPDATE
  LOOP
    UPDATE public.installment_entries AS i SET is_settled=true,updated_at=now() WHERE i.user_id=v_user AND i.id=v_before.id RETURNING to_jsonb(i) INTO v_after;
    PERFORM public.audit_append('bulk_settle_existing_payment','installment_entries', v_before.contract_id || ':' || v_before.number,
      to_jsonb(v_before),v_after, jsonb_build_object('mode','mass_quitacao','discount',v_before.paid_cents < v_before.expected_cents));
    v_installments := v_installments + 1;
  END LOOP;
  RETURN jsonb_build_object('updated',v_bills+v_installments,'bills',v_bills,'installments',v_installments);
END;
$bulk$;
REVOKE ALL ON FUNCTION public.preview_expense_bulk_settlement() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.confirm_expense_bulk_settlement(boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_expense_bulk_settlement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_expense_bulk_settlement(boolean,integer) TO authenticated;