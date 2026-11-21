-- ИМРАН: 6-жаңыртуу — «Карабай жазуу» онлайн тренажёру.
-- Supabase → SQL Editor → толугу менен коюп, Run басыңыз.
-- Тренажёр сайттагы эле аккаунттарды колдонот (телефон + сырсөз). Бул SQL башка таблицаларга тийбейт.

-- 1) Тренажёрдун маалыматы: ар бир колдонуучуга бир сап
create table if not exists public.typing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  max_lesson int not null default 1 check (max_lesson between 1 and 100),   -- азыркы (ачык) сабак
  paid boolean not null default false,                                      -- толук доступ төлөнгөнбү
  pay_requested_at timestamptz,                                             -- «Төлөдүм» басканда
  devices text[] not null default '{}',                                     -- байланган түзмөктөр
  active_device text,                                                       -- азыр иштеп жаткан түзмөк
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Түз кирүүгө жол жок: бардыгы төмөнкү функциялар аркылуу гана (RLS күйгүзүлгөн, policy жок)
alter table public.typing_accounts enable row level security;
revoke all on public.typing_accounts from anon, authenticated;

-- 2) Жөндөөлөр (settings таблицасынан): бекер сабактар, баа, түзмөк лимити
create or replace function public.typing_cfg() returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'free',    coalesce((select nullif(value,'')::int from settings where key = 'typing_free'), 5),
    'price',   coalesce((select value from settings where key = 'typing_price'), ''),
    'devices', coalesce((select nullif(value,'')::int from settings where key = 'typing_devices'), 2));
$$;

-- 3) Азыркы колдонуучунун абалы
create or replace function public.typing_state() returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'id', a.user_id,
    'name', p.full_name,
    'login', p.login,
    'max', a.max_lesson,
    'paid', a.paid,
    'pending', (a.pay_requested_at is not null and not a.paid),
    'admin', public.is_admin(),
    'config', public.typing_cfg())
  from typing_accounts a left join profiles p on p.id = a.user_id
  where a.user_id = auth.uid();
$$;

-- 4) Кирүүдө түзмөктү байлоо жана «азыр ушул түзмөк иштеп жатат» деп белгилөө
create or replace function public.typing_claim(device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); a typing_accounts; lim int;
begin
  if uid is null then raise exception 'Кирүү керек'; end if;
  if device is null or device !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'Түзмөк аныкталган жок'; end if;
  insert into typing_accounts (user_id) values (uid) on conflict (user_id) do nothing;
  select * into a from typing_accounts where user_id = uid for update;
  lim := (typing_cfg()->>'devices')::int;
  if not public.is_admin() and not (device = any(a.devices)) then
    if coalesce(array_length(a.devices, 1), 0) >= lim then raise exception 'DEVICE_LIMIT'; end if;
    a.devices := array_append(a.devices, device);
  end if;
  update typing_accounts set devices = a.devices, active_device = device, last_seen = now() where user_id = uid;
  return typing_state();
end; $$;

-- 5) Тандалган түзмөк дагы активдүүбү (башка түзмөктөн кирсе, мурункусу чыгат)
create or replace function public.typing_ping(device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a typing_accounts;
begin
  select * into a from typing_accounts where user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false); end if;
  if a.active_device is distinct from device and not public.is_admin() then
    return jsonb_build_object('ok', false, 'kicked', true);
  end if;
  update typing_accounts set last_seen = now() where user_id = auth.uid();
  return typing_state();
end; $$;

-- 6) Прогресс: бекер сабактардан ашпайт, бир жолу бир гана кадам алдыга
create or replace function public.typing_progress(new_max int, device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a typing_accounts; adm boolean := public.is_admin(); cap int; n int;
begin
  select * into a from typing_accounts where user_id = auth.uid() for update;
  if not found then raise exception 'Кирүү керек'; end if;
  if a.active_device is distinct from device and not adm then raise exception 'KICKED'; end if;
  cap := case when a.paid or adm then 100 else (typing_cfg()->>'free')::int + 1 end;
  n := least(greatest(coalesce(new_max, 1), 1), cap);
  if not adm then n := least(n, a.max_lesson + 1); end if;
  update typing_accounts set max_lesson = greatest(max_lesson, n), last_seen = now() where user_id = auth.uid();
  return typing_state();
end; $$;

-- 7) «Төлөдүм» баскычы
create or replace function public.typing_pay_request(device text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update typing_accounts set pay_requested_at = coalesce(pay_requested_at, now())
   where user_id = auth.uid() and not paid;
  return typing_state();
end; $$;

-- ===== Окутуучунун (админдин) функциялары =====
create or replace function public.typing_admin_list() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Уруксат жок'; end if;
  return jsonb_build_object(
    'config', typing_cfg(),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.user_id, 'name', p.full_name, 'login', p.login, 'phone', p.phone,
        'max', t.max_lesson, 'paid', t.paid,
        'pending', (t.pay_requested_at is not null and not t.paid),
        'devices', coalesce(array_length(t.devices, 1), 0),
        'last', t.last_seen, 'created', t.created_at) order by t.last_seen desc)
      from typing_accounts t join profiles p on p.id = t.user_id
      where coalesce(p.role, 'student') <> 'admin'), '[]'::jsonb));
end; $$;

create or replace function public.typing_admin_set_paid(target uuid, val boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Уруксат жок'; end if;
  update typing_accounts set paid = val, pay_requested_at = case when val then null else pay_requested_at end
   where user_id = target;
end; $$;

create or replace function public.typing_admin_set_max(target uuid, n int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Уруксат жок'; end if;
  update typing_accounts set max_lesson = least(greatest(n, 1), 100) where user_id = target;
end; $$;

create or replace function public.typing_admin_reset_devices(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Уруксат жок'; end if;
  update typing_accounts set devices = '{}', active_device = null where user_id = target;
end; $$;

-- Тренажёрдун маалыматын гана өчүрөт (сайттагы аккаунт жана курстун кабинети калат)
create or replace function public.typing_admin_delete(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Уруксат жок'; end if;
  delete from typing_accounts where user_id = target;
end; $$;

create or replace function public.typing_admin_config(price text, free int, devices int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Уруксат жок'; end if;
  insert into settings (key, value) values ('typing_price', coalesce(price, ''))
    on conflict (key) do update set value = excluded.value;
  insert into settings (key, value) values ('typing_free', least(greatest(coalesce(free, 5), 1), 99)::text)
    on conflict (key) do update set value = excluded.value;
  insert into settings (key, value) values ('typing_devices', least(greatest(coalesce(devices, 2), 1), 5)::text)
    on conflict (key) do update set value = excluded.value;
end; $$;

-- Телефон номерин өзгөртүү (логин да өзгөрөт): мис. 0700 123 456
create or replace function public.typing_admin_set_phone(target uuid, new_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare d text := regexp_replace(coalesce(new_phone, ''), '\D', '', 'g'); lg text;
begin
  if not public.is_admin() then raise exception 'Уруксат жок'; end if;
  if length(d) = 10 and left(d, 1) = '0' then d := '996' || substr(d, 2);
  elsif length(d) = 9 then d := '996' || d; end if;
  if not (length(d) = 12 and left(d, 3) = '996') then raise exception 'Телефон номерин туура жазыңыз, мисалы: 0700 123 456'; end if;
  lg := d || '@tel.imran-kurs.kg';
  if exists (select 1 from auth.users where email = lg and id <> target) then raise exception 'Бул номер башка адамда бар'; end if;
  update auth.users set email = lg,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('phone', '+' || d),
         updated_at = now() where id = target;
  update auth.identities set provider_id = lg,
         identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', lg)
   where user_id = target and provider = 'email';
  update public.profiles set phone = '+' || d, login = lg where id = target;
end; $$;

-- Уруксаттар: бардыгы кирген колдонуучулар үчүн (админ функциялары өздөрү текшерет)
revoke all on function public.typing_state(), public.typing_claim(text), public.typing_ping(text),
  public.typing_progress(int, text), public.typing_pay_request(text),
  public.typing_admin_list(), public.typing_admin_set_paid(uuid, boolean), public.typing_admin_set_max(uuid, int),
  public.typing_admin_reset_devices(uuid), public.typing_admin_delete(uuid),
  public.typing_admin_config(text, int, int), public.typing_admin_set_phone(uuid, text) from public, anon;
grant execute on function public.typing_state(), public.typing_claim(text), public.typing_ping(text),
  public.typing_progress(int, text), public.typing_pay_request(text),
  public.typing_admin_list(), public.typing_admin_set_paid(uuid, boolean), public.typing_admin_set_max(uuid, int),
  public.typing_admin_reset_devices(uuid), public.typing_admin_delete(uuid),
  public.typing_admin_config(text, int, int), public.typing_admin_set_phone(uuid, text) to authenticated;
revoke all on function public.typing_cfg() from public;
grant execute on function public.typing_cfg() to anon, authenticated;
