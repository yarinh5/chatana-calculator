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

    if old_vendor_id is not null
       and (
         not exists (select 1 from public.events e where e.id = old.event_id)
         or not exists (select 1 from public.vendors v where v.id = old_vendor_id)
       ) then
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
