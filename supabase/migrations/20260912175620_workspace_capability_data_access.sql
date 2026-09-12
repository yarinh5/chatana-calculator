create or replace function private.all_workspace_capabilities()
returns public.workspace_capability[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(e.enumlabel::public.workspace_capability order by e.enumsortorder), array[]::public.workspace_capability[])
  from pg_catalog.pg_enum e
  where e.enumtypid = 'public.workspace_capability'::regtype
$$;

create or replace function private.subscription_status(_event_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when not private.has_event_capability(_event_id, 'event_view') then null
    when s.id is null then 'trial_expired'
    when s.plan = 'premium' and s.premium_expires_at > now() then 'premium_active'
    when s.plan = 'premium' then 'premium_expired'
    when s.trial_expires_at > now() then 'trial_active'
    else 'trial_expired'
  end
  from (select 1) z
  left join public.subscriptions s on s.event_id = _event_id
$$;

create or replace function public.subscription_status(_event_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.subscription_status(_event_id)
$$;

create or replace function private.can_edit_event(_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.has_event_capability(_event_id, 'event_view')
     and (
       private.has_role((select auth.uid()), 'admin')
       or private.subscription_status(_event_id) in ('trial_active', 'premium_active')
     )
$$;

create or replace function private.is_premium_event(_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.has_event_capability(_event_id, 'event_view')
     and (
       private.has_role((select auth.uid()), 'admin')
       or private.subscription_status(_event_id) = 'premium_active'
     )
$$;

create or replace function public.list_my_workspace_access()
returns table (
  event_id uuid,
  event_name text,
  wedding_date date,
  owner_id uuid,
  is_owner boolean,
  workspace_role public.workspace_role,
  effective_capabilities public.workspace_capability[]
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with caller as (
    select p.id
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
  ),
  owned as (
    select
      e.id as event_id,
      e.event_name,
      e.wedding_date,
      e.owner_id,
      (e.owner_id = (select id from caller)) as is_owner,
      null::public.workspace_role as workspace_role,
      private.all_workspace_capabilities() as effective_capabilities
    from public.events e
    join public.profiles owner_profile on owner_profile.id = e.owner_id
    where owner_profile.is_active
      and exists (select 1 from caller)
      and (
        e.owner_id = (select id from caller)
        or private.has_role((select id from caller), 'admin')
      )
  ),
  memberships as (
    select
      e.id as event_id,
      e.event_name,
      e.wedding_date,
      e.owner_id,
      false as is_owner,
      em.role as workspace_role,
      coalesce(array_agg(wrc.capability order by wrc.capability), array[]::public.workspace_capability[]) as effective_capabilities
    from public.event_members em
    join public.events e on e.id = em.event_id
    join public.profiles owner_profile on owner_profile.id = e.owner_id
    join private.workspace_role_capabilities wrc on wrc.role = em.role
    where em.user_id = (select id from caller)
      and owner_profile.is_active
      and exists (select 1 from caller)
    group by e.id, e.event_name, e.wedding_date, e.owner_id, em.role
  )
  select distinct on (event_id)
    event_id, event_name, wedding_date, owner_id, is_owner, workspace_role, effective_capabilities
  from (
    select * from owned
    union all
    select * from memberships
  ) accessible
  order by event_id, is_owner desc, event_name, event_id
$$;

create or replace function public.prevent_event_owner_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'WORKSPACE_OWNER_TRANSFER_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_events_prevent_owner_change on public.events;
create trigger trg_events_prevent_owner_change
before update of owner_id on public.events
for each row execute function public.prevent_event_owner_change();

create or replace function public.list_workspace_guests(_event_id uuid)
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
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    g.id,
    g.event_id,
    g.full_name,
    g.group_size,
    g.phone,
    g.email,
    g.notes,
    g.side,
    case when private.has_event_capability(_event_id, 'wedding_day_view') then g.arrived else null end,
    case when private.has_event_capability(_event_id, 'wedding_day_view') then g.arrived_count else null end,
    case when private.has_event_capability(_event_id, 'gifts_view') then g.gift_amount else null end,
    case when private.has_event_capability(_event_id, 'gifts_view') then g.payment_method else null end,
    g.created_at,
    g.updated_at,
    g.group_category,
    g.relationship,
    g.needs_transport,
    g.pickup_location,
    private.has_event_capability(_event_id, 'gifts_view') as can_view_gifts,
    private.has_event_capability(_event_id, 'wedding_day_view') as can_view_attendance
  from public.guests g
  where g.event_id = _event_id
    and private.has_event_capability(_event_id, 'guests_view')
  order by g.full_name, g.created_at, g.id
$$;

create or replace function public.list_workspace_guest_members(_event_id uuid)
returns table (
  id uuid,
  guest_id uuid,
  full_name text,
  "position" integer,
  age_group text,
  meal_preference text,
  dietary_notes text,
  accessibility_notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select gm.id, gm.guest_id, gm.full_name, gm.position, gm.age_group, gm.meal_preference,
         gm.dietary_notes, gm.accessibility_notes, gm.created_at, gm.updated_at
  from public.guest_members gm
  join public.guests g on g.id = gm.guest_id
  where g.event_id = _event_id
    and private.has_event_capability(_event_id, 'guests_view')
  order by gm.position, gm.created_at, gm.id
$$;

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
returns setof public.guests
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

  return query select * from public.guests where id = inserted_guest.id;
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
returns setof public.guests
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
  where id = _guest_id
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
  where id = _guest_id
  returning * into updated_guest;

  return query select * from public.guests where id = updated_guest.id;
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
  where id = _guest_id
  for update;

  if not found then
    return false;
  end if;

  if not private.has_event_capability(current_guest.event_id, 'guests_edit')
     or not private.can_edit_event(current_guest.event_id) then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.guests where id = _guest_id;
  return true;
end;
$$;

create or replace function public.update_workspace_guest_attendance(
  _guest_id uuid,
  _arrived boolean,
  _arrived_count integer default null
)
returns setof public.guests
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
  where id = _guest_id
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
  where id = _guest_id
  returning * into updated_guest;

  return query select * from public.guests where id = updated_guest.id;
end;
$$;

create or replace function public.update_workspace_guest_gift(
  _guest_id uuid,
  _gift_amount numeric default null,
  _payment_method text default null
)
returns setof public.guests
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
  where id = _guest_id
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
  where id = _guest_id
  returning * into updated_guest;

  return query select * from public.guests where id = updated_guest.id;
end;
$$;

drop policy if exists events_select on public.events;
drop policy if exists events_update on public.events;
create policy events_select on public.events
for select to authenticated
using (private.has_event_capability(id, 'event_view'));
create policy events_update on public.events
for update to authenticated
using (private.has_event_capability(id, 'event_edit') and private.can_edit_event(id))
with check (private.has_event_capability(id, 'event_edit') and private.can_edit_event(id));

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
for select to authenticated
using (private.has_event_capability(event_id, 'event_view'));

drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert on public.expenses;
drop policy if exists expenses_update on public.expenses;
drop policy if exists expenses_delete on public.expenses;
create policy expenses_select on public.expenses
for select to authenticated
using (private.has_event_capability(event_id, 'expenses_view'));
create policy expenses_insert on public.expenses
for insert to authenticated
with check (private.has_event_capability(event_id, 'expenses_edit') and private.can_edit_event(event_id));
create policy expenses_update on public.expenses
for update to authenticated
using (private.has_event_capability(event_id, 'expenses_edit') and private.can_edit_event(event_id))
with check (private.has_event_capability(event_id, 'expenses_edit') and private.can_edit_event(event_id));
create policy expenses_delete on public.expenses
for delete to authenticated
using (private.has_event_capability(event_id, 'expenses_edit') and private.can_edit_event(event_id));

drop policy if exists expense_payments_select on public.expense_payments;
drop policy if exists expense_payments_insert on public.expense_payments;
drop policy if exists expense_payments_update on public.expense_payments;
drop policy if exists expense_payments_delete on public.expense_payments;
create policy expense_payments_select on public.expense_payments
for select to authenticated
using (
  exists (
    select 1 from public.expenses x
    where x.id = expense_payments.expense_id
      and private.has_event_capability(x.event_id, 'payments_view')
  )
);
create policy expense_payments_insert on public.expense_payments
for insert to authenticated
with check (
  exists (
    select 1 from public.expenses x
    where x.id = expense_payments.expense_id
      and private.has_event_capability(x.event_id, 'payments_edit')
      and private.can_edit_event(x.event_id)
      and private.is_premium_event(x.event_id)
  )
);
create policy expense_payments_update on public.expense_payments
for update to authenticated
using (
  exists (
    select 1 from public.expenses x
    where x.id = expense_payments.expense_id
      and private.has_event_capability(x.event_id, 'payments_edit')
      and private.can_edit_event(x.event_id)
      and private.is_premium_event(x.event_id)
  )
)
with check (
  exists (
    select 1 from public.expenses x
    where x.id = expense_payments.expense_id
      and private.has_event_capability(x.event_id, 'payments_edit')
      and private.can_edit_event(x.event_id)
      and private.is_premium_event(x.event_id)
  )
);
create policy expense_payments_delete on public.expense_payments
for delete to authenticated
using (
  exists (
    select 1 from public.expenses x
    where x.id = expense_payments.expense_id
      and private.has_event_capability(x.event_id, 'payments_edit')
      and private.can_edit_event(x.event_id)
      and private.is_premium_event(x.event_id)
  )
);

drop policy if exists guest_settings_select on public.guest_settings;
drop policy if exists guest_settings_insert on public.guest_settings;
drop policy if exists guest_settings_update on public.guest_settings;
create policy guest_settings_select on public.guest_settings
for select to authenticated
using (private.has_event_capability(event_id, 'budget_view'));
create policy guest_settings_insert on public.guest_settings
for insert to authenticated
with check (private.has_event_capability(event_id, 'budget_edit') and private.can_edit_event(event_id));
create policy guest_settings_update on public.guest_settings
for update to authenticated
using (private.has_event_capability(event_id, 'budget_edit') and private.can_edit_event(event_id))
with check (private.has_event_capability(event_id, 'budget_edit') and private.can_edit_event(event_id));

drop policy if exists guests_select on public.guests;
drop policy if exists guests_insert on public.guests;
drop policy if exists guests_update on public.guests;
drop policy if exists guests_delete on public.guests;
create policy guests_select on public.guests
for select to authenticated
using (
  private.has_event_capability(event_id, 'guests_view')
  and private.has_event_capability(event_id, 'gifts_view')
  and private.has_event_capability(event_id, 'wedding_day_view')
);
create policy guests_insert on public.guests
for insert to authenticated
with check (
  private.has_event_capability(event_id, 'guests_edit')
  and private.has_event_capability(event_id, 'gifts_edit')
  and private.has_event_capability(event_id, 'wedding_day_edit')
  and private.can_edit_event(event_id)
);
create policy guests_update on public.guests
for update to authenticated
using (
  private.has_event_capability(event_id, 'guests_edit')
  and private.has_event_capability(event_id, 'gifts_edit')
  and private.has_event_capability(event_id, 'wedding_day_edit')
  and private.can_edit_event(event_id)
)
with check (
  private.has_event_capability(event_id, 'guests_edit')
  and private.has_event_capability(event_id, 'gifts_edit')
  and private.has_event_capability(event_id, 'wedding_day_edit')
  and private.can_edit_event(event_id)
);
create policy guests_delete on public.guests
for delete to authenticated
using (
  private.has_event_capability(event_id, 'guests_edit')
  and private.can_edit_event(event_id)
);

drop policy if exists guest_members_select on public.guest_members;
drop policy if exists guest_members_insert on public.guest_members;
drop policy if exists guest_members_update on public.guest_members;
drop policy if exists guest_members_delete on public.guest_members;
create policy guest_members_select on public.guest_members
for select to authenticated
using (
  exists (
    select 1 from public.guests g
    where g.id = guest_members.guest_id
      and private.has_event_capability(g.event_id, 'guests_view')
  )
);
create policy guest_members_insert on public.guest_members
for insert to authenticated
with check (
  exists (
    select 1 from public.guests g
    where g.id = guest_members.guest_id
      and private.has_event_capability(g.event_id, 'guests_edit')
      and private.can_edit_event(g.event_id)
  )
);
create policy guest_members_update on public.guest_members
for update to authenticated
using (
  exists (
    select 1 from public.guests g
    where g.id = guest_members.guest_id
      and private.has_event_capability(g.event_id, 'guests_edit')
      and private.can_edit_event(g.event_id)
  )
)
with check (
  exists (
    select 1 from public.guests g
    where g.id = guest_members.guest_id
      and private.has_event_capability(g.event_id, 'guests_edit')
      and private.can_edit_event(g.event_id)
  )
);
create policy guest_members_delete on public.guest_members
for delete to authenticated
using (
  exists (
    select 1 from public.guests g
    where g.id = guest_members.guest_id
      and private.has_event_capability(g.event_id, 'guests_edit')
      and private.can_edit_event(g.event_id)
  )
);

revoke all on function private.all_workspace_capabilities() from public, anon, authenticated;
grant execute on function private.all_workspace_capabilities() to service_role;

revoke all on function public.prevent_event_owner_change() from public, anon, authenticated;

revoke all on function public.subscription_status(uuid) from public, anon;
grant execute on function public.subscription_status(uuid) to authenticated, service_role;

revoke all on function public.list_my_workspace_access() from public, anon;
grant execute on function public.list_my_workspace_access() to authenticated, service_role;

revoke all on function public.list_workspace_guests(uuid) from public, anon;
grant execute on function public.list_workspace_guests(uuid) to authenticated, service_role;

revoke all on function public.list_workspace_guest_members(uuid) from public, anon;
grant execute on function public.list_workspace_guest_members(uuid) to authenticated, service_role;

revoke all on function public.create_workspace_guest(uuid, text, integer, text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.create_workspace_guest(uuid, text, integer, text, text, text, text, text, text, boolean, text) to authenticated, service_role;

revoke all on function public.update_workspace_guest_details(uuid, text, integer, text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.update_workspace_guest_details(uuid, text, integer, text, text, text, text, text, text, boolean, text) to authenticated, service_role;

revoke all on function public.delete_workspace_guest(uuid) from public, anon;
grant execute on function public.delete_workspace_guest(uuid) to authenticated, service_role;

revoke all on function public.update_workspace_guest_attendance(uuid, boolean, integer) from public, anon;
grant execute on function public.update_workspace_guest_attendance(uuid, boolean, integer) to authenticated, service_role;

revoke all on function public.update_workspace_guest_gift(uuid, numeric, text) from public, anon;
grant execute on function public.update_workspace_guest_gift(uuid, numeric, text) to authenticated, service_role;
