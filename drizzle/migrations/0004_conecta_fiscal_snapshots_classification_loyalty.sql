create table if not exists public.fiscal_documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 issuer text not null check (length(trim(issuer)) > 0),
 issued_on date not null,
 document_number text,
 access_key text check (access_key is null or access_key ~ '^[0-9]{44}$'),
 total_cents bigint not null check(total_cents>=0),
 category text not null default 'outros' check(category in ('mercado','outros')),
 original_path text not null,
 pdf_path text not null,
 original_name text not null,
 file_sha256 text not null check(file_sha256 ~ '^[0-9a-f]{64}$'),
 verified boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index if not exists fiscal_document_key_unique on public.fiscal_documents(user_id,access_key) where access_key is not null;
create unique index if not exists fiscal_document_hash_unique on public.fiscal_documents(user_id,file_sha256);
create index if not exists fiscal_documents_user_date on public.fiscal_documents(user_id,issued_on desc);
create table if not exists public.fiscal_document_items(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 document_id uuid not null references public.fiscal_documents(id) on delete cascade,
 description text not null check(length(trim(description))>0),
 quantity numeric(12,3) not null check(quantity>0),
 unit_price_cents bigint not null check(unit_price_cents>=0),
 total_cents bigint not null check(total_cents>=0)
);
create index if not exists fiscal_items_document on public.fiscal_document_items(document_id);
grant select, insert, update, delete on public.fiscal_documents, public.fiscal_document_items to authenticated;
grant all on public.fiscal_documents, public.fiscal_document_items to service_role;
alter table public.fiscal_documents enable row level security;
alter table public.fiscal_document_items enable row level security;
create policy fiscal_docs_owner on public.fiscal_documents for all to authenticated using (user_id=auth.uid()) with check(user_id=auth.uid());
create policy fiscal_items_owner on public.fiscal_document_items for all to authenticated
 using (user_id=auth.uid() and exists(select 1 from public.fiscal_documents d where d.id=document_id and d.user_id=auth.uid()))
 with check (user_id=auth.uid() and exists(select 1 from public.fiscal_documents d where d.id=document_id and d.user_id=auth.uid()));
create policy fiscal_storage_owner_select on storage.objects for select to authenticated
 using (bucket_id='fiscal-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy fiscal_storage_owner_insert on storage.objects for insert to authenticated
 with check (bucket_id='fiscal-private' and (storage.foldername(name))[1]=auth.uid()::text);
create policy fiscal_storage_owner_delete on storage.objects for delete to authenticated
 using (bucket_id='fiscal-private' and (storage.foldername(name))[1]=auth.uid()::text);

CREATE TABLE IF NOT EXISTS public.finance_card_month_snapshots (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  transactions jsonb NOT NULL DEFAULT '[]'::jsonb,
  available_limit_cents bigint, total_limit_cents bigint, used_limit_cents bigint,
  closing_date date, due_date date, invoice_cents bigint, provider_invoice_id text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, account_id, period)
);
ALTER TABLE public.finance_card_month_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_card_month_snapshots FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_card_month_snapshots TO authenticated;
GRANT ALL ON public.finance_card_month_snapshots TO service_role;
CREATE POLICY finance_card_month_snapshots_owner ON public.finance_card_month_snapshots
 FOR ALL TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE INDEX IF NOT EXISTS finance_card_snapshots_by_period ON public.finance_card_month_snapshots (user_id, period);

ALTER TABLE public.annual_expenses
  ADD COLUMN IF NOT EXISTS expense_kind text NOT NULL DEFAULT 'debt',
  ADD COLUMN IF NOT EXISTS consumption_value_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS expense_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_contract_id text,
  ADD COLUMN IF NOT EXISTS source_template_id uuid,
  ADD COLUMN IF NOT EXISTS annual_tax_kind text;
ALTER TABLE public.finance_bills ADD COLUMN IF NOT EXISTS expense_kind text NOT NULL DEFAULT 'debt';
ALTER TABLE public.annual_expenses ADD CONSTRAINT annual_expenses_kind_chk CHECK (expense_kind IN ('debt', 'consumption'));
ALTER TABLE public.annual_expenses ADD CONSTRAINT annual_expenses_value_type_chk CHECK (consumption_value_type IN ('fixed', 'variable'));
ALTER TABLE public.finance_bills ADD CONSTRAINT finance_bills_kind_chk CHECK (expense_kind IN ('debt', 'consumption'));
ALTER TABLE public.annual_expenses ADD CONSTRAINT annual_expenses_source_chk
  CHECK (expense_source IN ('manual', 'contract', 'card', 'consumption', 'annual_tax'));
ALTER TABLE public.annual_expenses ADD CONSTRAINT annual_expenses_tax_kind_chk
  CHECK ((expense_source <> 'annual_tax' AND annual_tax_kind IS NULL)
      OR (expense_source = 'annual_tax' AND annual_tax_kind IN ('iptu', 'ipva', 'other')));
CREATE UNIQUE INDEX IF NOT EXISTS annual_expenses_source_contract_year_unique
  ON public.annual_expenses (user_id, year, source_contract_id) WHERE source_contract_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS annual_expenses_source_template_year_unique
  ON public.annual_expenses (user_id, year, source_template_id) WHERE source_template_id IS NOT NULL;

create table if not exists public.travel_loyalty_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program_name text not null,
  program_type text not null check (program_type in ('milhas', 'pontos')),
  balance integer not null default 0 check (balance >= 0),
  expiration_date date,
  value_per_point numeric(12,6) not null default 0.01 check (value_per_point >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists travel_loyalty_programs_user_id_idx on public.travel_loyalty_programs (user_id);
create index if not exists travel_loyalty_programs_expiration_idx on public.travel_loyalty_programs (user_id, expiration_date);
grant select, insert, update, delete on public.travel_loyalty_programs to authenticated;
grant all on public.travel_loyalty_programs to service_role;
alter table public.travel_loyalty_programs enable row level security;
create policy "Users manage own loyalty programs" on public.travel_loyalty_programs for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

ALTER TABLE public.pluggy_items ADD COLUMN IF NOT EXISTS connection_slot text NOT NULL DEFAULT 'primary'
  CHECK (connection_slot IN ('primary','secondary'));
CREATE INDEX IF NOT EXISTS pluggy_items_slot_user_idx ON public.pluggy_items(user_id,connection_slot);
CREATE TABLE IF NOT EXISTS public.pluggy_secondary_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 8 AND 100),
  client_secret text NOT NULL CHECK (length(client_secret) BETWEEN 8 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pluggy_secondary_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pluggy_secondary_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pluggy_secondary_credentials TO service_role;
CREATE OR REPLACE FUNCTION public.prevent_pluggy_item_slot_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.connection_slot IS DISTINCT FROM OLD.connection_slot THEN
    RAISE EXCEPTION 'Changing Pluggy connection origin is not allowed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pluggy_items_slot_locked BEFORE UPDATE ON public.pluggy_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_pluggy_item_slot_change();