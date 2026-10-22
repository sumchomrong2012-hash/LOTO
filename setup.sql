-- ==========================================
-- LOTO KENO - Database Setup
-- Run this in Supabase SQL Editor
-- ==========================================

-- 1. Profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  balance numeric default 0 check (balance >= 0),
  role text default 'user' check (role in ('user', 'admin')),
  created_at timestamptz default now()
);

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, balance, role)
  values (new.id, new.email, 1000, 'user')  -- $1000 starting balance
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Game results table (audit log)
create table if not exists public.game_results (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  sum_value int not null,
  range_result text,
  bet_amount numeric not null,
  win_amount numeric not null,
  created_at timestamptz default now()
);

alter table public.game_results enable row level security;

-- ==========================================
-- RLS Policies
-- ==========================================

-- Drop existing policies to avoid conflicts
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Users can view own results" on public.game_results;
drop policy if exists "Admins can view all results" on public.game_results;

-- PROFILES
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role = 'admin')
  );

create policy "Admins can update all profiles"
  on public.profiles for update
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role = 'admin')
  );

-- GAME RESULTS
create policy "Users can view own results"
  on public.game_results for select
  using (auth.uid() = user_id);

create policy "Admins can view all results"
  on public.game_results for select
  using (
    exists (select 1 from public.profiles
            where id = auth.uid() and role = 'admin')
  );

-- ==========================================
-- RPC: Place Bet & Resolve Game (secure)
-- ==========================================

-- This function runs with SECURITY DEFINER, so it can update the balance
-- safely without granting users direct UPDATE access to profiles.

create or replace function public.place_bet_and_resolve(
  p_sum int,
  p_range text,
  p_bet_amount numeric,
  p_win_amount numeric
) returns json
language plpgsql
security definer
as $$
declare
  v_balance numeric;
  v_new_balance numeric;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  select balance into v_balance from public.profiles where id = v_user;
  if v_balance is null then
    raise exception 'Profile not found';
  end if;

  if p_bet_amount > v_balance then
    raise exception 'Insufficient balance';
  end if;

  v_new_balance := v_balance - p_bet_amount + p_win_amount;

  update public.profiles
    set balance = v_new_balance
    where id = v_user;

  insert into public.game_results
    (user_id, sum_value, range_result, bet_amount, win_amount)
  values
    (v_user, p_sum, p_range, p_bet_amount, p_win_amount);

  return json_build_object(
    'balance', v_new_balance,
    'win', p_win_amount
  );
end;
$$;

-- ==========================================
-- RPC: Admin refill
-- ==========================================

create or replace function public.admin_refill(
  p_email text,
  p_amount numeric
) returns json
language plpgsql
security definer
as $$
declare
  v_admin uuid := auth.uid();
  v_role text;
  v_target_id uuid;
  v_new_balance numeric;
begin
  if v_admin is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role from public.profiles where id = v_admin;
  if v_role is distinct from 'admin' then
    raise exception 'Admin only';
  end if;

  select id into v_target_id from public.profiles where email = p_email;
  if v_target_id is null then
    raise exception 'User not found: %', p_email;
  end if;

  update public.profiles
    set balance = balance + p_amount
    where id = v_target_id
    returning balance into v_new_balance;

  return json_build_object(
    'email', p_email,
    'new_balance', v_new_balance
  );
end;
$$;

-- ==========================================
-- Promote an admin (run manually after signup)
-- ==========================================
-- update public.profiles set role = 'admin' where email = 'admin@example.com';