// A contract installment is the authoritative payment. Annual bills are views of it.
export type LinkedBill = { contract_id?: string | null; installment_number?: number | null;
  source_annual_id?: string | null; source_period?: string | null; due_date?: string;
  paid_date?: string | null; paid_cents?: number | null; paid_note?: string | null; is_settled?: boolean | null };
export type LinkedInstallment = { contract_id: string; number: number; due_date: string;
  paid_date: string | null; paid_cents: number | null; note: string | null; is_settled?: boolean | null };
export function linkedInstallment(bill: LinkedBill, entries: LinkedInstallment[], annualContract?: string | null) {
  const contract = bill.contract_id ?? annualContract;
  if (!contract) return null;
  const matches = entries.filter(e => e.contract_id === contract && (bill.installment_number != null
    ? e.number === bill.installment_number : e.due_date.slice(0, 7) === (bill.source_period ?? bill.due_date?.slice(0, 7))));
  if (matches.length !== 1) return null;
  return matches[0]!;
}
export function projectInstallmentPayment<T extends LinkedBill>(bill: T, entry: LinkedInstallment | null): T {
  if (!entry) return bill;
  return { ...bill, contract_id: entry.contract_id, installment_number: entry.number,
    // Preserve old bill-only records until explicitly corrected; never erase historical payments.
    ...(entry.paid_date ? {paid_date: entry.paid_date, paid_cents: entry.paid_cents,
      paid_note: entry.note, is_settled: entry.is_settled ?? null} : {}) };
}
