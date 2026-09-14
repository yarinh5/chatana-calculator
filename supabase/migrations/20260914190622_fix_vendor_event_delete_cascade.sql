create or replace function private.enforce_vendor_event_immutable()
returns trigger
language plpgsql
security invoker
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
    if exists (select 1 from public.events e where e.id = new.event_id) then
      insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
      values (
        new.event_id,
        new.id,
        (select auth.uid()),
        'vendor_created',
        jsonb_build_object('status', new.status, 'category', new.category)
      );
    end if;
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

    if exists (select 1 from public.events e where e.id = new.event_id) then
      insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
      values (
        new.event_id,
        new.id,
        (select auth.uid()),
        'vendor_updated',
        audit_details
      );
    end if;
    return new;
  end if;

  if exists (select 1 from public.events e where e.id = old.event_id) then
    insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
    values (
      old.event_id,
      old.id,
      (select auth.uid()),
      'vendor_deleted',
      jsonb_build_object('status', old.status, 'category', old.category)
    );
  end if;

  return old;
end;
$$;

revoke all on function private.audit_vendor_change() from public, anon, authenticated;
grant execute on function private.audit_vendor_change() to service_role;

create or replace function private.audit_expense_vendor_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    if new.vendor_id is not null
       and exists (select 1 from public.events e where e.id = new.event_id) then
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

  if old.vendor_id is not null
     and exists (select 1 from public.events e where e.id = old.event_id) then
    insert into public.vendor_events (event_id, vendor_id, actor_user_id, action, details)
    values (
      old.event_id,
      old.vendor_id,
      (select auth.uid()),
      'expense_unlinked',
      jsonb_build_object('expense_id', new.id)
    );
  end if;

  if new.vendor_id is not null
     and exists (select 1 from public.events e where e.id = new.event_id) then
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
