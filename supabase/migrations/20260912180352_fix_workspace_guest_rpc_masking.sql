create or replace function private.has_guest_capability(
  _guest_id uuid,
  _capability public.workspace_capability
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.guests g
    where g.id = _guest_id
      and private.has_event_capability(g.event_id, _capability)
  )
$$;

create or replace function private.can_edit_guest(_guest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.guests g
    where g.id = _guest_id
      and private.can_edit_event(g.event_id)
  )
$$;

drop policy if exists guest_members_select on public.guest_members;
drop policy if exists guest_members_insert on public.guest_members;
drop policy if exists guest_members_update on public.guest_members;
drop policy if exists guest_members_delete on public.guest_members;

create policy guest_members_select on public.guest_members
for select to authenticated
using (private.has_guest_capability(guest_id, 'guests_view'));

create policy guest_members_insert on public.guest_members
for insert to authenticated
with check (
  private.has_guest_capability(guest_id, 'guests_edit')
  and private.can_edit_guest(guest_id)
);

create policy guest_members_update on public.guest_members
for update to authenticated
using (
  private.has_guest_capability(guest_id, 'guests_edit')
  and private.can_edit_guest(guest_id)
)
with check (
  private.has_guest_capability(guest_id, 'guests_edit')
  and private.can_edit_guest(guest_id)
);

create policy guest_members_delete on public.guest_members
for delete to authenticated
using (
  private.has_guest_capability(guest_id, 'guests_edit')
  and private.can_edit_guest(guest_id)
);

drop function if exists public.create_workspace_guest(
  uuid, text, integer, text, text, text, text, text, text, boolean, text
);
drop function if exists public.update_workspace_guest_details(
  uuid, text, integer, text, text, text, text, text, text, boolean, text
);
drop function if exists public.update_workspace_guest_attendance(uuid, boolean, integer);
drop function if exists public.update_workspace_guest_gift(uuid, numeric, text);

create or replace function public.create_workspace_guest(
  _event_id uuid,
  _full_name text,
  _group_size integer default 1,
  _phone text default null,
  _email text default null,
  _notes text default null,
  _side text default null,
  _group_category text default null,
  _relationship text default null,
  _needs_transport boolean default false,
  _pickup_location text default null
)
returns table (
  id uuid,
  event_id uuid,
  full_name text,
  group_size integer,
  phone text,
  email text,
  notes text,
  side text,
  arrived boolean,
  arrived_count integer,
  gift_amount numeric,
  payment_method text,
  created_at timestamptz,
  updated_at timestamptz,
  group_category text,
  relationship text,
  needs_transport boolean,
  pickup_location text,
  can_view_gifts boolean,
  can_view_attendance boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  inserted_guest public.guests;
begin
  if not private.has_event_capability(_event_id, 'guests_edit')
     or not private.can_edit_event(_event_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  insert into public.guests (
    event_id, full_name, group_size, phone, email, notes, side,
    group_category, relationship, needs_transport, pickup_location
  ) values (
    _event_id,
    nullif(btrim(_full_name), ''),
    greatest(coalesce(_group_size, 1), 1),
    nullif(btrim(_phone), ''),
    nullif(btrim(_email), ''),
    nullif(btrim(_notes), ''),
    nullif(btrim(_side), ''),
    nullif(btrim(_group_category), ''),
    nullif(btrim(_relationship), ''),
    coalesce(_needs_transport, false),
    case when coalesce(_needs_transport, false) then nullif(btrim(_pickup_location), '') else null end
  )
  returning * into inserted_guest;

  return query
    select *
    from public.list_workspace_guests(inserted_guest.event_id) wg
    where wg.id = inserted_guest.id;
end;
$$;

create or replace function public.update_workspace_guest_details(
  _guest_id uuid,
  _full_name text default null,
  _group_size integer default null,
  _phone text default null,
  _email text default null,
  _notes text default null,
  _side text default null,
  _group_category text default null,
  _relationship text default null,
  _needs_transport boolean default null,
  _pickup_location text default null
)
returns table (
  id uuid,
  event_id uuid,
  full_name text,
  group_size integer,
  phone text,
  email text,
  notes text,
  side text,
  arrived boolean,
  arrived_count integer,
  gift_amount numeric,
  payment_method text,
  created_at timestamptz,
  updated_at timestamptz,
  group_category text,
  relationship text,
  needs_transport boolean,
  pickup_location text,
  can_view_gifts boolean,
  can_view_attendance boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_guest public.guests;
  updated_guest public.guests;
begin
  select * into current_guest
  from public.guests
  where public.guests.id = _guest_id
  for update;

  if not found then
    raise exception 'GUEST_NOT_FOUND';
  end if;

  if not private.has_event_capability(current_guest.event_id, 'guests_edit')
     or not private.can_edit_event(current_guest.event_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.guests
  set full_name = coalesce(nullif(btrim(_full_name), ''), full_name),
      group_size = greatest(coalesce(_group_size, group_size), 1),
      phone = nullif(btrim(_phone), ''),
      email = nullif(btrim(_email), ''),
      notes = nullif(btrim(_notes), ''),
      side = nullif(btrim(_side), ''),
      group_category = nullif(btrim(_group_category), ''),
      relationship = nullif(btrim(_relationship), ''),
      needs_transport = coalesce(_needs_transport, needs_transport),
      pickup_location = case
        when coalesce(_needs_transport, needs_transport) then nullif(btrim(_pickup_location), '')
        else null
      end
  where public.guests.id = _guest_id
  returning * into updated_guest;

  return query
    select *
    from public.list_workspace_guests(updated_guest.event_id) wg
    where wg.id = updated_guest.id;
end;
$$;

create or replace function public.update_workspace_guest_attendance(
  _guest_id uuid,
  _arrived boolean,
  _arrived_count integer default null
)
returns table (
  id uuid,
  event_id uuid,
  full_name text,
  group_size integer,
  phone text,
  email text,
  notes text,
  side text,
  arrived boolean,
  arrived_count integer,
  gift_amount numeric,
  payment_method text,
  created_at timestamptz,
  updated_at timestamptz,
  group_category text,
  relationship text,
  needs_transport boolean,
  pickup_location text,
  can_view_gifts boolean,
  can_view_attendance boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_guest public.guests;
  updated_guest public.guests;
begin
  select * into current_guest
  from public.guests
  where public.guests.id = _guest_id
  for update;

  if not found then
    raise exception 'GUEST_NOT_FOUND';
  end if;

  if not private.has_event_capability(current_guest.event_id, 'wedding_day_edit')
     or not private.can_edit_event(current_guest.event_id)
     or not private.is_premium_event(current_guest.event_id) then
    raise exception 'PREMIUM_REQUIRED_ATTENDANCE';
  end if;

  update public.guests
  set arrived = _arrived,
      arrived_count = case
        when _arrived is false then 0
        else greatest(coalesce(_arrived_count, arrived_count, group_size), 0)
      end
  where public.guests.id = _guest_id
  returning * into updated_guest;

  return query
    select *
    from public.list_workspace_guests(updated_guest.event_id) wg
    where wg.id = updated_guest.id;
end;
$$;

create or replace function public.update_workspace_guest_gift(
  _guest_id uuid,
  _gift_amount numeric default null,
  _payment_method text default null
)
returns table (
  id uuid,
  event_id uuid,
  full_name text,
  group_size integer,
  phone text,
  email text,
  notes text,
  side text,
  arrived boolean,
  arrived_count integer,
  gift_amount numeric,
  payment_method text,
  created_at timestamptz,
  updated_at timestamptz,
  group_category text,
  relationship text,
  needs_transport boolean,
  pickup_location text,
  can_view_gifts boolean,
  can_view_attendance boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_guest public.guests;
  updated_guest public.guests;
begin
  select * into current_guest
  from public.guests
  where public.guests.id = _guest_id
  for update;

  if not found then
    raise exception 'GUEST_NOT_FOUND';
  end if;

  if not private.has_event_capability(current_guest.event_id, 'gifts_edit')
     or not private.can_edit_event(current_guest.event_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.guests
  set gift_amount = greatest(coalesce(_gift_amount, gift_amount), 0),
      payment_method = nullif(btrim(_payment_method), '')
  where public.guests.id = _guest_id
  returning * into updated_guest;

  return query
    select *
    from public.list_workspace_guests(updated_guest.event_id) wg
    where wg.id = updated_guest.id;
end;
$$;

revoke all on function private.has_guest_capability(uuid, public.workspace_capability) from public, anon, authenticated;
revoke all on function private.can_edit_guest(uuid) from public, anon, authenticated;
grant execute on function private.has_guest_capability(uuid, public.workspace_capability) to service_role;
grant execute on function private.can_edit_guest(uuid) to service_role;

revoke all on function public.create_workspace_guest(uuid, text, integer, text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.create_workspace_guest(uuid, text, integer, text, text, text, text, text, text, boolean, text) to authenticated, service_role;

revoke all on function public.update_workspace_guest_details(uuid, text, integer, text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.update_workspace_guest_details(uuid, text, integer, text, text, text, text, text, text, boolean, text) to authenticated, service_role;

revoke all on function public.update_workspace_guest_attendance(uuid, boolean, integer) from public, anon;
grant execute on function public.update_workspace_guest_attendance(uuid, boolean, integer) to authenticated, service_role;

revoke all on function public.update_workspace_guest_gift(uuid, numeric, text) from public, anon;
grant execute on function public.update_workspace_guest_gift(uuid, numeric, text) to authenticated, service_role;
