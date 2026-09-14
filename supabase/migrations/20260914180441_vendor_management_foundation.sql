create type public.vendor_status as enum (
  'interested',
  'contacted',
  'quote_received',
  'negotiating',
  'booked',
  'cancelled'
);

create type public.vendor_event_action as enum (
  'vendor_created',
  'vendor_updated',
  'vendor_deleted',
  'expense_linked',
  'expense_unlinked'
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  business_name text not null,
  contact_name text,
  category text not null,
  phone text,
  whatsapp_phone text,
  email text,
  website text,
  instagram text,
  initial_quote numeric,
  status public.vendor_status not null default 'interested',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_business_name_not_blank check (char_length(btrim(business_name)) between 1 and 160),
  constraint vendors_contact_name_length check (contact_name is null or char_length(contact_name) <= 160),
  constraint vendors_category_not_blank check (char_length(btrim(category)) between 1 and 80),
  constraint vendors_phone_length check (phone is null or char_length(phone) <= 40),
  constraint vendors_whatsapp_phone_length check (whatsapp_phone is null or char_length(whatsapp_phone) <= 40),
  constraint vendors_email_length check (email is null or char_length(email) <= 254),
  constraint vendors_website_length check (website is null or char_length(website) <= 300),
  constraint vendors_instagram_length check (instagram is null or char_length(instagram) <= 300),
  constraint vendors_notes_length check (notes is null or char_length(notes) <= 4000),
  constraint vendors_initial_quote_non_negative check (initial_quote is null or initial_quote >= 0)
);

create index vendors_event_id_idx on public.vendors(event_id);
create index vendors_event_status_idx on public.vendors(event_id, status);
create index vendors_event_category_idx on public.vendors(event_id, category);

create trigger trg_vendors_updated_at
before update on public.vendors
for each row execute function public.update_updated_at_column();

create table public.vendor_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  vendor_id uuid not null,
  actor_user_id uuid,
  action public.vendor_event_action not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index vendor_events_event_id_idx on public.vendor_events(event_id);
create index vendor_events_vendor_id_idx on public.vendor_events(vendor_id);
create index vendor_events_event_created_at_idx on public.vendor_events(event_id, created_at desc);

alter table public.expenses
  add column vendor_id uuid null;

alter table public.expenses
  add constraint expenses_vendor_id_fkey
  foreign key (vendor_id) references public.vendors(id) on delete set null;

create index expenses_vendor_id_idx on public.expenses(vendor_id);

create or replace function private.enforce_vendor_event_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.event_id is distinct from old.event_id then
    raise exception 'VENDOR_EVENT_IMMUTABLE';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_vendor_event_immutable() from public, anon, authenticated;
grant execute on function private.enforce_vendor_event_immutable() to service_role;

create trigger trg_vendors_event_immutable
before update on public.vendors
for each row execute function private.enforce_vendor_event_immutable();

create or replace function private.enforce_expense_vendor_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_vendor_event_id uuid;
  old_vendor_id uuid;
  requires_authorization boolean;
begin
  old_vendor_id := case when tg_op = 'UPDATE' then old.vendor_id else null end;

  if new.vendor_id is null then
    if tg_op = 'INSERT' then
      return new;
    end if;

    if old_vendor_id is not null and pg_trigger_depth() > 1 then
      return new;
    end if;
  end if;

  requires_authorization :=
    (tg_op = 'INSERT' and new.vendor_id is not null)
    or (
      tg_op = 'UPDATE'
      and (
        new.vendor_id is distinct from old.vendor_id
        or (new.event_id is distinct from old.event_id and new.vendor_id is not null)
      )
    );

  if not requires_authorization then
    return new;
  end if;

  if not private.current_user_is_active()
     or not private.has_event_capability(new.event_id, 'expenses_edit')
     or not private.has_event_capability(new.event_id, 'vendors_edit')
     or not private.can_edit_event(new.event_id) then
    raise exception 'INVALID_VENDOR_LINK';
  end if;

  if new.vendor_id is not null then
    select v.event_id
      into target_vendor_event_id
    from public.vendors v
    where v.id = new.vendor_id;

    if target_vendor_event_id is null or target_vendor_event_id is distinct from new.event_id then
      raise exception 'INVALID_VENDOR_LINK';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_expense_vendor_link() from public, anon, authenticated;
grant execute on function private.enforce_expense_vendor_link() to service_role;

create trigger trg_expenses_vendor_link
before insert or update on public.expenses
for each row execute function private.enforce_expense_vendor_link();

create or replace function private.audit_vendor_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  changed_fields text[] := array[]::text[];
  audit_details jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
    values (
      new.event_id,
      new.id,
      (select auth.uid()),
      'vendor_created',
      jsonb_build_object('status', new.status, 'category', new.category)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.business_name is distinct from old.business_name then changed_fields := array_append(changed_fields, 'business_name'); end if;
    if new.contact_name is distinct from old.contact_name then changed_fields := array_append(changed_fields, 'contact_name'); end if;
    if new.category is distinct from old.category then changed_fields := array_append(changed_fields, 'category'); end if;
    if new.phone is distinct from old.phone then changed_fields := array_append(changed_fields, 'phone'); end if;
    if new.whatsapp_phone is distinct from old.whatsapp_phone then changed_fields := array_append(changed_fields, 'whatsapp_phone'); end if;
    if new.email is distinct from old.email then changed_fields := array_append(changed_fields, 'email'); end if;
    if new.website is distinct from old.website then changed_fields := array_append(changed_fields, 'website'); end if;
    if new.instagram is distinct from old.instagram then changed_fields := array_append(changed_fields, 'instagram'); end if;
    if new.initial_quote is distinct from old.initial_quote then changed_fields := array_append(changed_fields, 'initial_quote'); end if;
    if new.status is distinct from old.status then changed_fields := array_append(changed_fields, 'status'); end if;
    if new.notes is distinct from old.notes then changed_fields := array_append(changed_fields, 'notes'); end if;

    audit_details := jsonb_build_object('changed_fields', changed_fields);

    if new.status is distinct from old.status then
      audit_details := audit_details || jsonb_build_object('status_from', old.status, 'status_to', new.status);
    end if;

    if new.category is distinct from old.category then
      audit_details := audit_details || jsonb_build_object('category_from', old.category, 'category_to', new.category);
    end if;

    insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
    values (
      new.event_id,
      new.id,
      (select auth.uid()),
      'vendor_updated',
      audit_details
    );
    return new;
  end if;

  insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
  values (
    old.event_id,
    old.id,
    (select auth.uid()),
    'vendor_deleted',
    jsonb_build_object('status', old.status, 'category', old.category)
  );
  return old;
end;
$$;

revoke all on function private.audit_vendor_change() from public, anon, authenticated;
grant execute on function private.audit_vendor_change() to service_role;

create trigger trg_vendors_audit_insert
after insert on public.vendors
for each row execute function private.audit_vendor_change();

create trigger trg_vendors_audit_update
after update on public.vendors
for each row execute function private.audit_vendor_change();

create trigger trg_vendors_audit_delete
after delete on public.vendors
for each row execute function private.audit_vendor_change();

create or replace function private.audit_expense_vendor_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.vendor_id is not null then
      insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
      values (
        new.event_id,
        new.vendor_id,
        (select auth.uid()),
        'expense_linked',
        jsonb_build_object('expense_id', new.id)
      );
    end if;
    return new;
  end if;

  if new.vendor_id is not distinct from old.vendor_id then
    return new;
  end if;

  if old.vendor_id is not null then
    insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
    values (
      old.event_id,
      old.vendor_id,
      (select auth.uid()),
      'expense_unlinked',
      jsonb_build_object('expense_id', new.id)
    );
  end if;

  if new.vendor_id is not null then
    insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
    values (
      new.event_id,
      new.vendor_id,
      (select auth.uid()),
      'expense_linked',
      jsonb_build_object('expense_id', new.id)
    );
  end if;

  return new;
end;
$$;

revoke all on function private.audit_expense_vendor_link() from public, anon, authenticated;
grant execute on function private.audit_expense_vendor_link() to service_role;

create trigger trg_expenses_vendor_audit
after insert or update on public.expenses
for each row execute function private.audit_expense_vendor_link();

revoke all on public.vendors from public, anon;
grant select, insert, update, delete on public.vendors to authenticated;
grant all on public.vendors to service_role;

revoke all on public.vendor_events from public, anon, authenticated;
grant all on public.vendor_events to service_role;

alter table public.vendors enable row level security;
alter table public.vendor_events enable row level security;

create policy vendors_select
on public.vendors
for select
to authenticated
using (
  private.current_user_is_active()
  and private.has_event_capability(event_id, 'vendors_view')
);

create policy vendors_insert
on public.vendors
for insert
to authenticated
with check (
  private.current_user_is_active()
  and private.has_event_capability(event_id, 'vendors_edit')
  and private.can_edit_event(event_id)
);

create policy vendors_update
on public.vendors
for update
to authenticated
using (
  private.current_user_is_active()
  and private.has_event_capability(event_id, 'vendors_edit')
  and private.can_edit_event(event_id)
)
with check (
  private.current_user_is_active()
  and private.has_event_capability(event_id, 'vendors_edit')
  and private.can_edit_event(event_id)
);

create policy vendors_delete
on public.vendors
for delete
to authenticated
using (
  private.current_user_is_active()
  and private.has_event_capability(event_id, 'vendors_edit')
  and private.can_edit_event(event_id)
);
