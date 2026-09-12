alter table public.event_invitations
  drop constraint if exists event_invitations_status_timestamps;

alter table public.event_invitations
  add constraint event_invitations_status_timestamps
  check (
    (status = 'pending' and accepted_at is null and revoked_at is null)
    or (status = 'accepted' and accepted_at is not null)
    or (status = 'revoked' and revoked_at is not null)
    or status = 'expired'
  );

create or replace function public.prevent_admin_deletion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if exists (
    select 1
    from public.user_roles
    where user_id = old.id
      and role = 'admin'::public.app_role
  ) then
    raise exception 'Cannot delete the super admin account';
  end if;

  if exists (
    select 1
    from public.events e
    where e.owner_id = old.id
      and exists (
        select 1
        from public.event_members em
        where em.event_id = e.id
      )
  ) then
    raise exception 'WORKSPACE_OWNER_TRANSFER_REQUIRED';
  end if;

  return old;
end;
$$;

revoke all on function public.prevent_admin_deletion()
  from public, anon, authenticated;
