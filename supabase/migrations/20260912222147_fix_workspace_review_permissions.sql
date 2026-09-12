revoke all on function private.has_guest_capability(uuid, public.workspace_capability) from public, anon;
revoke all on function private.can_edit_guest(uuid) from public, anon;
grant execute on function private.has_guest_capability(uuid, public.workspace_capability) to authenticated, service_role;
grant execute on function private.can_edit_guest(uuid) to authenticated, service_role;

create or replace function public.get_workspace_owner(_event_id uuid)
returns table (
  owner_id uuid,
  full_name text,
  email text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p.id, p.full_name, p.email
  from public.events e
  join public.profiles p on p.id = e.owner_id
  where e.id = _event_id
    and private.has_event_capability(e.id, 'workspace_manage')
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
    and private.has_event_capability(public.guests.event_id, 'guests_edit')
    and private.can_edit_event(public.guests.event_id)
  for update;

  if not found then
    raise exception 'ACCESS_DENIED';
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
  where public.guests.id = current_guest.id
  returning * into updated_guest;

  return query
    select *
    from public.list_workspace_guests(updated_guest.event_id) wg
    where wg.id = updated_guest.id;
end;
$$;

create or replace function public.delete_workspace_guest(_guest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_guest public.guests;
begin
  select * into current_guest
  from public.guests
  where public.guests.id = _guest_id
    and private.has_event_capability(public.guests.event_id, 'guests_edit')
    and private.can_edit_event(public.guests.event_id)
  for update;

  if not found then
    return false;
  end if;

  delete from public.guests where public.guests.id = current_guest.id;
  return found;
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
    and private.has_event_capability(public.guests.event_id, 'wedding_day_edit')
    and private.can_edit_event(public.guests.event_id)
  for update;

  if not found then
    raise exception 'ACCESS_DENIED';
  end if;

  if not private.is_premium_event(current_guest.event_id) then
    raise exception 'PREMIUM_REQUIRED_ATTENDANCE';
  end if;

  update public.guests
  set arrived = _arrived,
      arrived_count = case
        when _arrived is false then 0
        else greatest(coalesce(_arrived_count, arrived_count, group_size), 0)
      end
  where public.guests.id = current_guest.id
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
    and private.has_event_capability(public.guests.event_id, 'gifts_edit')
    and private.can_edit_event(public.guests.event_id)
  for update;

  if not found then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.guests
  set gift_amount = greatest(coalesce(_gift_amount, gift_amount), 0),
      payment_method = nullif(btrim(_payment_method), '')
  where public.guests.id = current_guest.id
  returning * into updated_guest;

  return query
    select *
    from public.list_workspace_guests(updated_guest.event_id) wg
    where wg.id = updated_guest.id;
end;
$$;

revoke all on function public.get_workspace_owner(uuid) from public, anon;
grant execute on function public.get_workspace_owner(uuid) to authenticated, service_role;

revoke all on function public.update_workspace_guest_details(uuid, text, integer, text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.update_workspace_guest_details(uuid, text, integer, text, text, text, text, text, text, boolean, text) to authenticated, service_role;

revoke all on function public.delete_workspace_guest(uuid) from public, anon;
grant execute on function public.delete_workspace_guest(uuid) to authenticated, service_role;

revoke all on function public.update_workspace_guest_attendance(uuid, boolean, integer) from public, anon;
grant execute on function public.update_workspace_guest_attendance(uuid, boolean, integer) to authenticated, service_role;

revoke all on function public.update_workspace_guest_gift(uuid, numeric, text) from public, anon;
grant execute on function public.update_workspace_guest_gift(uuid, numeric, text) to authenticated, service_role;
