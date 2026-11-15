create table if not exists public.axion_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade
);
alter table public.axion_owner enable row level security;
revoke all on public.axion_owner from public, anon, authenticated;
grant all on public.axion_owner to service_role;

create or replace function public.axion_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.axion_owner where user_id = (select auth.uid()));
$$;
revoke all on function public.axion_is_owner() from public, anon;
grant execute on function public.axion_is_owner() to authenticated;

create table if not exists public.axion_conversations (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  archived boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  branches jsonb not null check (jsonb_typeof(branches) = 'array' and octet_length(branches::text) <= 1000000),
  updated_at timestamptz not null default now()
);
create index if not exists axion_conversations_user_updated on public.axion_conversations(user_id, updated_at desc);
alter table public.axion_conversations enable row level security;
revoke all on public.axion_conversations from public, anon, authenticated;
grant select, insert, update, delete on public.axion_conversations to authenticated;
grant all on public.axion_conversations to service_role;
create policy axion_owner_conversations on public.axion_conversations for all to authenticated
using (user_id = (select auth.uid()) and (select public.axion_is_owner()))
with check (user_id = (select auth.uid()) and (select public.axion_is_owner()));

create table if not exists public.axion_monthly_reservations (
  month date primary key,
  reserved_cents integer not null check (reserved_cents between 1 and 3000)
);
alter table public.axion_monthly_reservations enable row level security;
revoke all on public.axion_monthly_reservations from public, anon, authenticated;
create or replace function public.axion_reserve(p_cents integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if not public.axion_is_owner() or p_cents is null or p_cents not between 1 and 3000 then
    raise exception 'Reserva Axion inválida' using errcode = '42501';
  end if;
  insert into public.axion_monthly_reservations as budget(month,reserved_cents)
  values (pg_catalog.date_trunc('month', pg_catalog.timezone('America/Sao_Paulo', now()))::date,p_cents)
  on conflict(month) do update set reserved_cents = budget.reserved_cents + excluded.reserved_cents
    where budget.reserved_cents + excluded.reserved_cents <= 3000
  returning reserved_cents into total;
  return total;
end;
$$;
revoke all on function public.axion_reserve(integer) from public, anon;
grant execute on function public.axion_reserve(integer) to authenticated;
create table if not exists public.axion_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  tone text not null check (tone in ('direto','detalhado')),
  deep boolean not null default false,
  memory text not null default '' check (char_length(memory) <= 2000)
);
alter table public.axion_preferences enable row level security;
revoke all on public.axion_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.axion_preferences to authenticated;
grant all on public.axion_preferences to service_role;
create policy axion_owner_preferences on public.axion_preferences for all to authenticated
using (user_id = (select auth.uid()) and (select public.axion_is_owner()))
with check (user_id = (select auth.uid()) and (select public.axion_is_owner()));

-- Provider keys live in server-only tables (no client grants, no policies).
create table if not exists public.axion_provider (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key text not null,
  model text not null check (model ~ '^[a-zA-Z0-9._:-]{1,120}$'),
  max_request_cents integer not null check (max_request_cents between 1 and 3000),
  web boolean not null default false
);
alter table public.axion_provider enable row level security;
revoke all on public.axion_provider from public, anon, authenticated, service_role;

create or replace function public.axion_provider_status()
returns table(model text, max_request_cents integer, web boolean)
language sql stable security definer set search_path = '' as $$
  select p.model, p.max_request_cents, p.web from public.axion_provider p
  where p.user_id = (select auth.uid()) and public.axion_is_owner();
$$;
revoke all on function public.axion_provider_status() from public, anon;
grant execute on function public.axion_provider_status() to authenticated;

create or replace function public.axion_save_provider(
  p_owner uuid, p_key text, p_model text, p_cents integer, p_web boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare old_provider public.axion_provider%rowtype;
begin
  perform 1 from public.axion_owner where user_id = p_owner for update;
  if not found then raise exception 'Titular Axion inválido' using errcode = '42501'; end if;
  select * into old_provider from public.axion_provider where singleton;
  if old_provider.api_key is not null and old_provider.user_id <> p_owner then
    raise exception 'Provedor pertence a outro titular' using errcode = '42501';
  end if;
  if p_key is not null and (char_length(p_key) < 20 or char_length(p_key) > 512 or p_key !~ '^sk-[A-Za-z0-9_-]+$') then
    raise exception 'Chave inválida' using errcode = '22023';
  end if;
  if old_provider.api_key is null and p_key is null then raise exception 'Chave necessária' using errcode = '22023'; end if;
  insert into public.axion_provider (singleton,user_id,api_key,model,max_request_cents,web)
  values (true,p_owner,coalesce(p_key, old_provider.api_key),p_model,p_cents,p_web)
  on conflict (singleton) do update set api_key=excluded.api_key, model=excluded.model,
    max_request_cents=excluded.max_request_cents, web=excluded.web;
end;
$$;
revoke all on function public.axion_save_provider(uuid,text,text,integer,boolean) from public, anon, authenticated;
grant execute on function public.axion_save_provider(uuid,text,text,integer,boolean) to service_role;

create or replace function public.axion_read_provider(p_owner uuid)
returns table(api_key text, model text, max_request_cents integer, web boolean)
language sql stable security definer set search_path = '' as $$
  select p.api_key,p.model,p.max_request_cents,p.web
  from public.axion_provider p
  join public.axion_owner o on o.user_id=p.user_id
  where p.user_id=p_owner;
$$;
revoke all on function public.axion_read_provider(uuid) from public, anon, authenticated;
grant execute on function public.axion_read_provider(uuid) to service_role;

create table if not exists public.axion_transfer (
  singleton boolean primary key default true check (singleton),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.axion_transfer enable row level security;
revoke all on public.axion_transfer from public, anon, authenticated, service_role;

create or replace function public.axion_transfer_pending() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.axion_transfer t join public.axion_owner o on o.user_id=t.from_user
    where t.to_user=(select auth.uid()) and t.expires_at > now()
  );
$$;

create or replace function public.axion_request_transfer(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
declare target uuid;
begin
  perform 1 from public.axion_owner where user_id=actor for update;
  if not found then raise exception 'Titular Axion inválido' using errcode = '42501'; end if;
  select min(id::text)::uuid into target from auth.users
    where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null
    having count(*) = 1;
  if target is null or target=actor then raise exception 'Conta de destino inválida' using errcode = '22023'; end if;
  insert into public.axion_transfer(singleton,from_user,to_user,expires_at)
  values(true,actor,target,now() + interval '15 minutes')
  on conflict(singleton) do update set from_user=excluded.from_user,to_user=excluded.to_user,expires_at=excluded.expires_at;
end;
$$;

create or replace function public.axion_cancel_transfer() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.axion_owner where user_id=auth.uid() for update;
  if not found then raise exception 'Titular Axion inválido' using errcode = '42501'; end if;
  delete from public.axion_transfer where from_user=auth.uid();
end;
$$;

create or replace function public.axion_accept_transfer() returns void
language plpgsql security definer set search_path = '' as $$
declare previous uuid;
declare next_owner uuid := auth.uid();
begin
  select user_id into previous from public.axion_owner where singleton for update;
  if previous is null or not exists (
    select 1 from public.axion_transfer t join auth.users u on u.id=t.to_user
    where t.from_user=previous and t.to_user=next_owner and t.expires_at > now() and u.email_confirmed_at is not null
  ) then raise exception 'Transferência não disponível' using errcode = '42501'; end if;
  delete from public.axion_provider where user_id=previous;
  update public.axion_owner set user_id=next_owner where singleton;
  delete from public.axion_transfer where singleton;
end;
$$;

revoke all on function public.axion_transfer_pending(), public.axion_request_transfer(text), public.axion_cancel_transfer(), public.axion_accept_transfer() from public, anon;
grant execute on function public.axion_transfer_pending(), public.axion_request_transfer(text), public.axion_cancel_transfer(), public.axion_accept_transfer() to authenticated;

create table if not exists public.axion_gemini (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text not null
);
alter table public.axion_gemini enable row level security;
revoke all on public.axion_gemini from public, anon, authenticated, service_role;

create or replace function public.axion_gemini_configured() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.axion_is_owner() and exists (
    select 1 from public.axion_gemini where user_id = (select auth.uid())
  );
$$;
revoke all on function public.axion_gemini_configured() from public, anon;
grant execute on function public.axion_gemini_configured() to authenticated;

create or replace function public.axion_save_gemini(p_owner uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.axion_owner where user_id=p_owner for update;
  if not found then raise exception 'Titular inválido' using errcode='42501'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{20,200}$' then
    raise exception 'Chave inválida' using errcode='22023';
  end if;
  insert into public.axion_gemini(user_id,api_key) values(p_owner,p_key)
  on conflict (user_id) do update set api_key=excluded.api_key;
end;
$$;
revoke all on function public.axion_save_gemini(uuid,text) from public, anon, authenticated;
grant execute on function public.axion_save_gemini(uuid,text) to service_role;

create or replace function public.axion_read_gemini(p_owner uuid) returns text
language sql stable security definer set search_path = '' as $$
  select g.api_key from public.axion_gemini g
  join public.axion_owner o on o.user_id=g.user_id
  where g.user_id=p_owner;
$$;
revoke all on function public.axion_read_gemini(uuid) from public, anon, authenticated;
grant execute on function public.axion_read_gemini(uuid) to service_role;

create or replace function public.axion_clear_previous_gemini() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' or new.user_id is distinct from old.user_id then
    delete from public.axion_gemini where user_id=old.user_id;
  end if;
  return null;
end;
$$;
revoke all on function public.axion_clear_previous_gemini() from public, anon, authenticated, service_role;
create trigger axion_clear_previous_gemini after update or delete on public.axion_owner
for each row execute function public.axion_clear_previous_gemini();

create table if not exists public.finance_card_debt_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  liability_key text not null check (char_length(liability_key) between 3 and 160),
  card_id text not null check (char_length(card_id) between 1 and 160),
  updated_at timestamptz not null default now(),
  primary key (user_id, liability_key)
);
create index if not exists finance_card_debt_links_by_card on public.finance_card_debt_links (user_id, card_id);
alter table public.finance_card_debt_links enable row level security;
revoke all on public.finance_card_debt_links from anon;
grant select, insert, update, delete on public.finance_card_debt_links to authenticated;
grant all on public.finance_card_debt_links to service_role;
create policy "finance_card_debt_links_own_records"
on public.finance_card_debt_links for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));