-- Rode no SQL Editor se cadastro/login falhar por permissão (RLS)
-- Permite ler perfis publicamente (ranking + checagem de username no cadastro)

create policy "profiles_select_public"
  on public.profiles for select
  using (true);
