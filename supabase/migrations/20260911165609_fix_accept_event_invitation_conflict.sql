create or replace function public.accept_event_invitation(_token text)
returns table (
  event_id uuid,
  member_id uuid,
  role public.workspace_role
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invitation public.event_invitations;
  current_email text;
  inserted_member public.event_members;
begin
  if (select auth.uid()) is null or not private.current_user_is_active() then
    raise exception 'INVITATION_INVALID';
  end if;

  select lower(u.email) into current_email
  from auth.users u
  where u.id = (select auth.uid());

  select * into invitation
  from public.event_invitations
  where token_hash = private.hash_invitation_token(_token)
  for update;

  if not found
     or invitation.status <> 'pending'
     or invitation.expires_at <= now()
     or invitation.email <> current_email then
    raise exception 'INVITATION_INVALID';
  end if;

  if exists (
    select 1
    from public.events e
    where e.id = invitation.event_id
      and e.owner_id = (select auth.uid())
  ) then
    raise exception 'WORKSPACE_OWNER_CANNOT_BE_MEMBER';
  end if;

  insert into public.event_members (event_id, user_id, role, invited_by)
  values (invitation.event_id, (select auth.uid()), invitation.role, invitation.created_by)
  on conflict on constraint event_members_event_id_user_id_key do update
    set role = excluded.role,
        invited_by = excluded.invited_by
  returning * into inserted_member;

  update public.event_invitations
  set status = 'accepted',
      accepted_by = (select auth.uid()),
      accepted_at = now()
  where id = invitation.id;

  insert into public.workspace_permission_events (
    event_id, actor_id, subject_user_id, invitation_id, action, details
  ) values (
    invitation.event_id,
    (select auth.uid()),
    (select auth.uid()),
    invitation.id,
    'invitation_accepted',
    jsonb_build_object('email', invitation.email, 'role', invitation.role)
  );

  event_id := inserted_member.event_id;
  member_id := inserted_member.id;
  role := inserted_member.role;
  return next;
end;
$$;

revoke all on function public.accept_event_invitation(text)
  from public, anon;
grant execute on function public.accept_event_invitation(text)
  to authenticated;
