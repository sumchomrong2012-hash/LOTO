-- =====================================================================================
--  Khmer Chess — 30-minute clock + voice messages
--  Run ONCE in Supabase -> SQL Editor -> Run. Run it AFTER update_friends_passkey.sql. Safe to run again.
-- =====================================================================================

-- 1) create_room: the clock can now also be 30 minutes (same function as before, only the list of allowed minutes changed)
create or replace function public.create_room(p_color text default 'random', p_minutes int default 20,
                                              p_first_turn text default 'w', p_public boolean default true,
                                              p_passkey text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_color text := p_color; v_room public.rooms;
  v_pass text := nullif(btrim(coalesce(p_passkey, '')), ''); v_hash text; v_salt text;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'no_profile'; end if;
  if v_color not in ('w', 'b', 'random') then raise exception 'bad_color'; end if;
  if p_first_turn not in ('w', 'b') then raise exception 'bad_first_turn'; end if;
  if p_minutes not in (0, 1, 3, 5, 10, 20, 30, 60) then raise exception 'bad_minutes'; end if;
  if v_color = 'random' then v_color := case when random() < 0.5 then 'w' else 'b' end; end if;
  if (select count(*) from public.rooms where host_id = v_uid and status = 'waiting') >= 3 then raise exception 'too_many_waiting_rooms'; end if;
  if (select count(*) from public.rooms where (host_id = v_uid or guest_id = v_uid) and status = 'playing') >= 10 then raise exception 'too_many_games'; end if;
  if v_pass is not null then
    if char_length(v_pass) < 2 or char_length(v_pass) > 20 then raise exception 'bad_passkey'; end if;
    v_salt := replace(gen_random_uuid()::text, '-', '');
    v_hash := v_salt || ':' || encode(sha256(convert_to(v_salt || v_pass, 'UTF8')), 'hex');
  end if;
  insert into public.rooms (code, host_id, host_color, first_turn, minutes, is_public, turn, passkey_hash)
  values (public.gen_room_code(), v_uid, v_color, p_first_turn, p_minutes, coalesce(p_public, true), p_first_turn, v_hash)
  returning * into v_room;
  return public.room_json(v_room);
end $$;

-- 2) voice messages (short recordings, a few KB each, stored with the room and deleted with it)
create table if not exists public.voice_messages (
  id         bigint generated always as identity primary key,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  seconds    int  not null check (seconds between 1 and 30),
  audio      text not null,
  created_at timestamptz not null default now(),
  constraint voice_audio_fmt check (char_length(audio) <= 150000 and audio ~ '^data:audio/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$')
);
create index if not exists voice_messages_room_idx on public.voice_messages (room_id, id);
alter table public.voice_messages enable row level security;
drop policy if exists voice_messages_select on public.voice_messages;
create policy voice_messages_select on public.voice_messages for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = voice_messages.room_id and (r.host_id = auth.uid() or r.guest_id = auth.uid())));
revoke all on public.voice_messages from anon, authenticated;
grant select on public.voice_messages to authenticated;
do $$ begin alter publication supabase_realtime add table public.voice_messages; exception when duplicate_object then null; end $$;

create or replace function public.send_voice(p_room uuid, p_audio text, p_seconds int)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_room public.rooms; v_id bigint;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  select * into v_room from public.rooms where id = p_room;
  if not found then raise exception 'room_not_found'; end if;
  perform public.room_color_of(v_room, v_uid);
  if p_seconds is null or p_seconds < 1 or p_seconds > 30 then raise exception 'bad_voice'; end if;
  if p_audio is null or char_length(p_audio) > 150000 or p_audio !~ '^data:audio/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$' then raise exception 'bad_voice'; end if;
  if (select count(*) from public.voice_messages where room_id = p_room and user_id = v_uid and created_at > now() - interval '1 minute') >= 6 then
    raise exception 'too_many_voice';
  end if;
  insert into public.voice_messages (room_id, user_id, seconds, audio) values (p_room, v_uid, p_seconds, p_audio) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.send_voice(uuid, text, int) from public, anon;
grant  execute on function public.send_voice(uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
