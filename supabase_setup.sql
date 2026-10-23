-- LOTO KENO Online wallet/account schema for Supabase.
-- IMPORTANT: this does NOT implement a real-money payment gateway or wagering settlement.
-- Use only after legal/licensing, age/KYC/AML, responsible-gambling, tax and payment-provider review.
-- Run in Supabase Dashboard -> SQL Editor. Never put a service_role key in browser code.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_id text unique not null default ('LK' || upper(substr(encode(gen_random_bytes(6),'hex'),1,10))),
  display_name text not null default 'Player',
  balance numeric(14,2) not null default 0 check (balance >= 0),
  role text not null default 'player' check (role in ('player','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.balance_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  actor_id uuid references public.profiles(id),
  amount numeric(14,2) not null check (amount <> 0),
  transaction_type text not null check (transaction_type in ('deposit','withdrawal_hold','withdrawal_refund','admin_refill','admin_adjustment','bet','win','refund')),
  reference text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  request_type text not null check (request_type in ('deposit','withdrawal')),
  amount numeric(14,2) not null check (amount >= 1 and amount <= 1000000),
  payment_method text not null check (payment_method in ('bank_transfer','approved_provider')),
  payment_reference text not null check (char_length(payment_reference) between 1 and 120),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  review_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists payment_requests_pending_idx on public.payment_requests(status, created_at);
create index if not exists payment_requests_user_idx on public.payment_requests(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.balance_transactions enable row level security;
alter table public.payment_requests enable row level security;

drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "transactions read own or admin" on public.balance_transactions;
create policy "transactions read own or admin" on public.balance_transactions for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.profiles me where me.id=auth.uid() and me.role='admin'));
drop policy if exists "payment requests read own or admin" on public.payment_requests;
create policy "payment requests read own or admin" on public.payment_requests for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.profiles me where me.id=auth.uid() and me.role='admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,''),'@',1), 'Player'))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Player submits a deposit request. No balance credit occurs until an admin verifies the actual payment.
create or replace function public.request_deposit(request_amount numeric, payment_method text, payment_reference text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare new_id bigint;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if request_amount is null or request_amount < 1 or request_amount > 1000000 then raise exception 'Amount must be between 1 and 1,000,000'; end if;
  if payment_method not in ('bank_transfer','approved_provider') then raise exception 'Unsupported payment method'; end if;
  if payment_reference is null or char_length(trim(payment_reference)) not between 1 and 120 then raise exception 'Payment reference is required'; end if;
  insert into public.payment_requests(user_id,request_type,amount,payment_method,payment_reference)
  values(auth.uid(),'deposit',round(request_amount,2),payment_method,left(trim(payment_reference),120)) returning id into new_id;
  return jsonb_build_object('request_id',new_id,'status','pending');
end;
$$;

-- Withdrawals reserve funds immediately. Rejection returns the reserved amount automatically.
create or replace function public.request_withdrawal(request_amount numeric, payment_method text, payment_reference text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare new_id bigint; bal numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if request_amount is null or request_amount < 1 or request_amount > 1000000 then raise exception 'Amount must be between 1 and 1,000,000'; end if;
  if payment_method not in ('bank_transfer','approved_provider') then raise exception 'Unsupported payment method'; end if;
  if payment_reference is null or char_length(trim(payment_reference)) not between 1 and 120 then raise exception 'Payout reference is required'; end if;
  update public.profiles set balance=balance-round(request_amount,2)
   where id=auth.uid() and balance>=round(request_amount,2) returning balance into bal;
  if not found then raise exception 'Insufficient available balance'; end if;
  insert into public.payment_requests(user_id,request_type,amount,payment_method,payment_reference)
  values(auth.uid(),'withdrawal',round(request_amount,2),payment_method,left(trim(payment_reference),120)) returning id into new_id;
  insert into public.balance_transactions(user_id,actor_id,amount,transaction_type,reference,note)
  values(auth.uid(),auth.uid(),-round(request_amount,2),'withdrawal_hold','request:'||new_id,'Funds reserved for pending withdrawal');
  return jsonb_build_object('request_id',new_id,'status','pending','available_balance',bal);
end;
$$;

-- Admin reviews requests. For deposits, the reviewer MUST independently verify the payment first.
-- Withdrawal approval marks it approved after the operator pays through their compliant provider.
-- Rejected withdrawals are refunded automatically; rejected deposits never affect balance.
create or replace function public.admin_review_payment_request(target_request_id bigint, approve boolean, review_note text default '')
returns jsonb language plpgsql security definer set search_path = public
as $$
declare admin_role text; req public.payment_requests%rowtype; new_bal numeric(14,2);
begin
  select role into admin_role from public.profiles where id=auth.uid();
  if admin_role is distinct from 'admin' then raise exception 'Administrator permission required'; end if;
  select * into req from public.payment_requests where id=target_request_id for update;
  if not found then raise exception 'Payment request not found'; end if;
  if req.status <> 'pending' then raise exception 'Request has already been reviewed'; end if;
  if approve and req.request_type='deposit' then
    update public.profiles set balance=balance+req.amount where id=req.user_id returning balance into new_bal;
    insert into public.balance_transactions(user_id,actor_id,amount,transaction_type,reference,note)
    values(req.user_id,auth.uid(),req.amount,'deposit','request:'||req.id,left(coalesce(review_note,''),160));
  elsif not approve and req.request_type='withdrawal' then
    update public.profiles set balance=balance+req.amount where id=req.user_id returning balance into new_bal;
    insert into public.balance_transactions(user_id,actor_id,amount,transaction_type,reference,note)
    values(req.user_id,auth.uid(),req.amount,'withdrawal_refund','request:'||req.id,left(coalesce(review_note,'Withdrawal request rejected'),160));
  else
    select balance into new_bal from public.profiles where id=req.user_id;
  end if;
  update public.payment_requests set status=case when approve then 'approved' else 'rejected' end,
    reviewed_by=auth.uid(),review_note=left(coalesce(review_note,''),160),reviewed_at=now() where id=req.id;
  return jsonb_build_object('request_id',req.id,'status',case when approve then 'approved' else 'rejected' end,'new_balance',new_bal);
end;
$$;

-- Admin-only manual credit for verified payment/correction. Never trust client-side role checks.
create or replace function public.admin_refill_balance(target_account_id text, refill_amount numeric, refill_note text default 'Verified balance adjustment')
returns jsonb language plpgsql security definer set search_path = public
as $$
declare admin_role text; target public.profiles%rowtype; new_bal numeric(14,2);
begin
  select role into admin_role from public.profiles where id=auth.uid();
  if admin_role is distinct from 'admin' then raise exception 'Administrator permission required'; end if;
  if refill_amount is null or refill_amount<=0 or refill_amount>10000000 then raise exception 'Invalid amount'; end if;
  if refill_note is null or char_length(trim(refill_note))=0 then raise exception 'Audit reason is required'; end if;
  select * into target from public.profiles where account_id=upper(trim(target_account_id)) for update;
  if not found then raise exception 'Account ID not found'; end if;
  update public.profiles set balance=balance+round(refill_amount,2) where id=target.id returning balance into new_bal;
  insert into public.balance_transactions(user_id,actor_id,amount,transaction_type,reference,note)
  values(target.id,auth.uid(),round(refill_amount,2),'admin_refill','manual:'||gen_random_uuid(),left(trim(refill_note),160));
  return jsonb_build_object('account_id',target.account_id,'new_balance',new_bal);
end;
$$;

-- Prevent direct client writes. All balance changes happen in trusted SQL functions only.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.balance_transactions from anon, authenticated;
revoke insert, update, delete on public.payment_requests from anon, authenticated;
grant select on public.profiles, public.balance_transactions, public.payment_requests to authenticated;
revoke all on function public.request_deposit(numeric,text,text) from public;
revoke all on function public.request_withdrawal(numeric,text,text) from public;
revoke all on function public.admin_review_payment_request(bigint,boolean,text) from public;
revoke all on function public.admin_refill_balance(text,numeric,text) from public;
grant execute on function public.request_deposit(numeric,text,text) to authenticated;
grant execute on function public.request_withdrawal(numeric,text,text) to authenticated;
grant execute on function public.admin_review_payment_request(bigint,boolean,text) to authenticated;
grant execute on function public.admin_refill_balance(text,numeric,text) to authenticated;

-- IMPORTANT: after registering your account, promote only your trusted admin account using your exact email.
-- Run this separately in SQL Editor:
-- update public.profiles p set role='admin' from auth.users u where p.id=u.id and u.email='YOUR-EMAIL';

-- Enable Realtime publication for wallet request updates if desired; UI currently refreshes manually.
do $$ begin alter publication supabase_realtime add table public.payment_requests;
exception when duplicate_object then null; when undefined_object then null; end $$;
