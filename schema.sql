-- LOTO KENO schema. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user','admin')),
  balance numeric(12,2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('refill','withdraw','bet','win')),
  amount numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.draws (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  numbers int[] not null,
  total int not null,
  rank int not null,
  stake numeric(12,2) not null,
  payout numeric(12,2) not null,
  bets jsonb not null,
  created_at timestamptz not null default now()
);

-- Create a profile (balance 0) automatically for every new sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Row Level Security: players read only their own data; admins read all.
-- There are NO insert/update/delete policies: balances change only via the functions below.
alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.draws enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists tx_read on public.transactions;
create policy tx_read on public.transactions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists draws_read on public.draws;
create policy draws_read on public.draws for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

revoke all on public.profiles, public.transactions, public.draws from anon, authenticated;
grant select on public.profiles, public.transactions, public.draws to authenticated;

-- Server-side draw: 20 unique numbers from 1..80, settled atomically.
create or replace function public.play_round(p_bets jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  bal numeric; new_bal numeric;
  total_stake numeric := 0; payout numeric := 0;
  nums int[]; s int; rk int;
  b jsonb; ch text; stake numeric; mult numeric; won boolean;
  results jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if jsonb_typeof(p_bets) <> 'array' or jsonb_array_length(p_bets) not between 1 and 20 then
    raise exception 'Invalid bets';
  end if;

  select balance into bal from profiles where id = uid for update;

  for b in select * from jsonb_array_elements(p_bets) loop
    stake := round((b->>'stake')::numeric, 2);
    if stake is null or stake < 1 or stake > 100000 then raise exception 'Invalid stake'; end if;
    if upper(b->>'choice') not in ('1','2','3','4','5','ODD','EVEN','UNDER','OVER') then
      raise exception 'Invalid choice';
    end if;
    total_stake := total_stake + stake;
  end loop;
  if total_stake > bal then raise exception 'Insufficient balance'; end if;

  -- gen_random_uuid() is cryptographically secure, so ordering by it gives a fair shuffle
  select array_agg(n) into nums
    from (select n from generate_series(1,80) n order by gen_random_uuid() limit 20) t;
  select sum(x) into s from unnest(nums) x;
  rk := case when s <= 695 then 1 when s <= 763 then 2 when s <= 855 then 3 when s <= 923 then 4 else 5 end;

  for b in select * from jsonb_array_elements(p_bets) loop
    ch := upper(b->>'choice');
    stake := round((b->>'stake')::numeric, 2);
    if ch in ('1','2','3','4','5') then
      won := (rk = ch::int);
      mult := case rk when 1 then 9.2 when 2 then 4.6 when 3 then 2.3 when 4 then 4.6 else 9.2 end;
    else
      mult := 1.95;
      won := case ch when 'ODD' then s % 2 = 1 when 'EVEN' then s % 2 = 0
                     when 'UNDER' then s <= 810 else s >= 811 end;
    end if;
    if won then payout := payout + round(stake * mult, 2); end if;
    results := results || jsonb_build_object('choice', ch, 'stake', stake, 'won', won);
  end loop;

  new_bal := bal - total_stake + payout;
  update profiles set balance = new_bal where id = uid;
  insert into transactions (user_id, kind, amount, balance_after, note)
    values (uid, 'bet', -total_stake, bal - total_stake, 'draw');
  if payout > 0 then
    insert into transactions (user_id, kind, amount, balance_after, note)
      values (uid, 'win', payout, new_bal, 'draw');
  end if;
  insert into draws (user_id, numbers, total, rank, stake, payout, bets)
    values (uid, nums, s, rk, total_stake, payout, p_bets);

  return jsonb_build_object('numbers', to_jsonb(nums), 'total', s, 'rank', rk,
    'stake', total_stake, 'payout', payout, 'balance', new_bal, 'results', results);
end $$;

-- Admin only: add (positive) or remove (negative) balance
create or replace function public.admin_adjust_balance(p_user uuid, p_amount numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare nb numeric;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'Amount must not be zero'; end if;
  update profiles set balance = balance + round(p_amount, 2) where id = p_user returning balance into nb;
  if nb is null then raise exception 'User not found'; end if;
  insert into transactions (user_id, kind, amount, balance_after, note, created_by)
    values (p_user, case when p_amount > 0 then 'refill' else 'withdraw' end,
            round(p_amount, 2), nb, p_note, auth.uid());
  return nb;
end $$;

revoke execute on function public.play_round(jsonb), public.admin_adjust_balance(uuid, numeric, text) from public, anon;
grant execute on function public.play_round(jsonb), public.admin_adjust_balance(uuid, numeric, text) to authenticated;

-- AFTER you sign up on the site with your own email, run this ONCE to make yourself admin:
-- update public.profiles set role = 'admin' where email = 'YOUR-EMAIL@example.com';
