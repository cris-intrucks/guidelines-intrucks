-- Lectura de mga_playbook para la app (mismo patrón que mga_carriers).
-- SQL Editor del proyecto xikhqdedhgeapczmnguy. Ejecutar una vez.

grant usage on schema public to anon, authenticated;
grant select on public.mga_playbook to anon, authenticated;

alter table public.mga_playbook enable row level security;

drop policy if exists mga_playbook_select_authenticated on public.mga_playbook;
drop policy if exists mga_playbook_select_all on public.mga_playbook;

create policy mga_playbook_select_all
  on public.mga_playbook
  for select
  to anon, authenticated
  using (true);

-- Comprueba que hay filas (si esto da 0, el botón no puede aparecer):
-- select count(*) from public.mga_playbook;
-- select mga from public.mga_playbook;
