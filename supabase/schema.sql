create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  business_name text,
  avatar_url text,
  phone text,
  company_name text,
  language text default 'es',
  timezone text default 'Europe/Madrid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_data_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  migrated_from_local boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.app_data_snapshots enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "snapshots_select_own" on public.app_data_snapshots;
drop policy if exists "snapshots_insert_own" on public.app_data_snapshots;
drop policy if exists "snapshots_update_own" on public.app_data_snapshots;
drop policy if exists "snapshots_delete_own" on public.app_data_snapshots;

create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "snapshots_select_own"
on public.app_data_snapshots for select
using (auth.uid() = user_id);

create policy "snapshots_insert_own"
on public.app_data_snapshots for insert
with check (auth.uid() = user_id);

create policy "snapshots_update_own"
on public.app_data_snapshots for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "snapshots_delete_own"
on public.app_data_snapshots for delete
using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, business_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'business_name', '')
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
