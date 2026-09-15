-- Uso de la herramienta InTrucks Guidelines
-- Pégalo en el SQL Editor del proyecto xikhqdedhgeapczmnguy y ejecútalo una vez.

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_email text not null,
  event_type text not null,
  module text not null,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists usage_events_created_at_idx on public.usage_events (created_at desc);
create index if not exists usage_events_user_email_idx on public.usage_events (user_email);
create index if not exists usage_events_event_type_idx on public.usage_events (event_type);

alter table public.usage_events enable row level security;

drop policy if exists usage_insert_own on public.usage_events;
create policy usage_insert_own
  on public.usage_events
  for insert
  to authenticated
  with check (lower(user_email) = lower(coalesce(auth.jwt()->>'email', '')));

drop policy if exists usage_select_team on public.usage_events;
create policy usage_select_team
  on public.usage_events
  for select
  to authenticated
  using (true);

grant select, insert on public.usage_events to authenticated;

-- Resumen de los últimos 7 días (para copiar cada lunes o programar un aviso)
create or replace view public.v_usage_last_7d as
select
  user_email,
  count(*) filter (where event_type = 'session_start') as sesiones,
  count(*) filter (where event_type = 'guidelines_search') as busquedas_estado,
  count(*) filter (where event_type = 'mga_search') as busquedas_mga,
  count(*) filter (where event_type = 'nv_open') as new_ventures,
  count(*) filter (where event_type = 'account_map_classify') as clasificador,
  count(*) as eventos,
  count(distinct (created_at at time zone 'America/Bogota')::date) as dias_activos,
  min(created_at) as primera_vez,
  max(created_at) as ultima_vez
from public.usage_events
where created_at >= now() - interval '7 days'
group by user_email
order by eventos desc;

-- Por tipo de uso (últimos 7 días)
create or replace view public.v_usage_by_type_7d as
select
  event_type,
  module,
  count(*) as veces,
  count(distinct user_email) as usuarios
from public.usage_events
where created_at >= now() - interval '7 days'
group by event_type, module
order by veces desc;

grant select on public.v_usage_last_7d to authenticated;
grant select on public.v_usage_by_type_7d to authenticated;
alter view public.v_usage_last_7d set (security_invoker = true);
alter view public.v_usage_by_type_7d set (security_invoker = true);
