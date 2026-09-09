
-- ============ ENUM for roles ============
create type public.app_role as enum ('admin', 'user');

-- ============ updated_at helper ============
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ PROFILES ============
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  is_active   boolean not null default true,
  invited_by  uuid references public.profiles(id) on delete set null,
  last_login  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

-- ============ USER_ROLES (separate table for security) ============
create table public.user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role    public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- Security definer function: check role without RLS recursion
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ============ EVENTS ============
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  event_name   text not null default 'החתונה שלי',
  wedding_date date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index events_owner_idx on public.events(owner_id);

grant select, insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;

-- ============ GUEST_SETTINGS ============
create table public.guest_settings (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null unique references public.events(id) on delete cascade,
  total_invited      integer not null default 250,
  attendance_rate    integer not null default 80,
  reserve            integer not null default 20,
  avg_envelope_price integer not null default 600,
  updated_at         timestamptz not null default now()
);

grant select, insert, update, delete on public.guest_settings to authenticated;
grant all on public.guest_settings to service_role;
alter table public.guest_settings enable row level security;

-- ============ EXPENSES ============
create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  name             text not null,
  price            numeric not null default 0,
  category         text not null,
  requires_deposit boolean not null default false,
  deposit_percent  integer not null default 30,
  deposit_date     date,
  balance_date     date,
  meal_price       numeric,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index expenses_event_idx on public.expenses(event_id);

grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;

-- ============ RLS POLICIES ============

-- profiles: user sees self; admin sees all
create policy "profiles_select_own" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "profiles_admin_insert" on public.profiles for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
create policy "profiles_admin_delete" on public.profiles for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- user_roles: user sees own; admin manages all
create policy "user_roles_select_own" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "user_roles_admin_all" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- events
create policy "events_owner_all" on public.events for all to authenticated
  using (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (owner_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- guest_settings (through event)
create policy "guest_settings_owner_all" on public.guest_settings for all to authenticated
  using (
    exists (select 1 from public.events e where e.id = guest_settings.event_id
            and (e.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  )
  with check (
    exists (select 1 from public.events e where e.id = guest_settings.event_id
            and (e.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  );

-- expenses
create policy "expenses_owner_all" on public.expenses for all to authenticated
  using (
    exists (select 1 from public.events e where e.id = expenses.event_id
            and (e.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  )
  with check (
    exists (select 1 from public.events e where e.id = expenses.event_id
            and (e.owner_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
  );

-- ============ TRIGGERS ============

-- updated_at triggers
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();
create trigger trg_events_updated_at before update on public.events
  for each row execute function public.update_updated_at_column();
create trigger trg_expenses_updated_at before update on public.expenses
  for each row execute function public.update_updated_at_column();
create trigger trg_guest_settings_updated_at before update on public.guest_settings
  for each row execute function public.update_updated_at_column();

-- New user: create profile + role + initial event + guest settings
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_event_id uuid;
  v_full_name text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_full_name);

  insert into public.user_roles (user_id, role) values (new.id, 'user');

  insert into public.events (owner_id, event_name)
  values (new.id, 'האירוע של ' || v_full_name)
  returning id into new_event_id;

  insert into public.guest_settings (event_id) values (new_event_id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent deleting the super admin
create or replace function public.prevent_admin_deletion()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.user_roles where user_id = old.id and role = 'admin') then
    raise exception 'Cannot delete the super admin account';
  end if;
  return old;
end;
$$;

create trigger trg_prevent_admin_delete
  before delete on public.profiles
  for each row execute function public.prevent_admin_deletion();
