-- =================================================================
-- ADAIRIMOVEIS: preparar o banco de dados no Supabase
--
-- 1. Troque o e-mail na PARTE 1 pelo e-mail que o corretor vai usar
--    para entrar no painel.
-- 2. Copie tudo, cole no SQL Editor do Supabase e clique em Run.
--
-- Pode rodar de novo quantas vezes quiser: nada é apagado.
-- =================================================================


-- PARTE 1: quem pode cadastrar imóveis ----------------------------

create table if not exists public.administradores (
  email text primary key
);
alter table public.administradores enable row level security;

-- TROQUE O E-MAIL AQUI. Para mais de um administrador, repita a linha com outro e-mail.
insert into public.administradores (email) values (lower('EMAIL_DO_CORRETOR@exemplo.com')) on conflict (email) do nothing;


-- PARTE 2: regra que confere se quem entrou é administrador -------

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.administradores
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.eh_admin() from public;
grant execute on function public.eh_admin() to anon, authenticated;


-- PARTE 3: tabela dos imóveis -------------------------------------

create table if not exists public.imoveis (
  id uuid primary key default gen_random_uuid(),
  codigo bigint generated always as identity unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  finalidade text not null default 'venda' check (finalidade in ('venda', 'aluguel')),
  tipo text not null default 'casa' check (tipo in ('casa', 'apartamento', 'terreno', 'sitio', 'chacara')),
  titulo text not null,
  preco numeric not null default 0 check (preco >= 0),
  localizacao text not null default '',
  condominio boolean not null default false,
  nome_condominio text not null default '',
  area numeric,
  area_unidade text not null default 'm2' check (area_unidade in ('m2', 'ha', 'alq')),
  quartos integer,
  banheiros integer,
  vagas integer,
  descricao text not null default '',
  mapa text not null default '',
  fotos jsonb not null default '[]'::jsonb,
  situacao text not null default 'disponivel' check (situacao in ('disponivel', 'reservado', 'vendido', 'alugado')),
  destaque boolean not null default false
);

create or replace function public.marcar_atualizacao()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists imoveis_atualizado on public.imoveis;
create trigger imoveis_atualizado
  before update on public.imoveis
  for each row execute function public.marcar_atualizacao();

alter table public.imoveis enable row level security;

-- Quem visita o site pode ver. Só administradores alteram.
grant select on public.imoveis to anon, authenticated;
grant insert, update, delete on public.imoveis to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "Todos veem os imoveis" on public.imoveis;
create policy "Todos veem os imoveis" on public.imoveis
  for select to anon, authenticated
  using (true);

drop policy if exists "Admin cadastra imoveis" on public.imoveis;
create policy "Admin cadastra imoveis" on public.imoveis
  for insert to authenticated
  with check (public.eh_admin());

drop policy if exists "Admin edita imoveis" on public.imoveis;
create policy "Admin edita imoveis" on public.imoveis
  for update to authenticated
  using (public.eh_admin())
  with check (public.eh_admin());

drop policy if exists "Admin exclui imoveis" on public.imoveis;
create policy "Admin exclui imoveis" on public.imoveis
  for delete to authenticated
  using (public.eh_admin());


-- PARTE 4: pasta das fotos ----------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg'];

drop policy if exists "Todos veem as fotos" on storage.objects;
create policy "Todos veem as fotos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'fotos');

drop policy if exists "Admin envia fotos" on storage.objects;
create policy "Admin envia fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and public.eh_admin());

drop policy if exists "Admin altera fotos" on storage.objects;
create policy "Admin altera fotos" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and public.eh_admin());

drop policy if exists "Admin apaga fotos" on storage.objects;
create policy "Admin apaga fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and public.eh_admin());
