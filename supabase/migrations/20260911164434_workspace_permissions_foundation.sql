create extension if not exists pgcrypto with schema extensions;

create type public.workspace_role as enum (
  'editor',
  'viewer',
  'guest_manager',
  'event_manager'
);

create type public.workspace_capability as enum (
  'workspace_manage',
  'event_view',
  'event_edit',
  'budget_view',
  'budget_edit',
  'expenses_view',
  'expenses_edit',
  'payments_view',
  'payments_edit',
  'vendors_view',
  'vendors_edit',
  'guests_view',
  'guests_edit',
  'rsvp_view',
  'rsvp_edit',
  'seating_view',
  'seating_edit',
  'gifts_view',
  'gifts_edit',
  'documents_view',
  'documents_edit',
  'wedding_day_view',
  'wedding_day_edit'
);

create type public.workspace_invitation_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

create type public.workspace_permission_action as enum (
  'invitation_created',
  'invitation_reissued',
  'invitation_revoked',
  'invitation_accepted',
  'member_role_changed',
  'member_removed'
);

create table private.workspace_role_capabilities (
  role public.workspace_role not null,
  capability public.workspace_capability not null,
  primary key (role, capability)
);

revoke all on private.workspace_role_capabilities from public, anon, authenticated;
grant all on private.workspace_role_capabilities to service_role;

insert into private.workspace_role_capabilities (role, capability)
values
  ('editor', 'event_view'),
  ('editor', 'event_edit'),
  ('editor', 'budget_view'),
  ('editor', 'budget_edit'),
  ('editor', 'expenses_view'),
  ('editor', 'expenses_edit'),
  ('editor', 'payments_view'),
  ('editor', 'payments_edit'),
  ('editor', 'vendors_view'),
  ('editor', 'vendors_edit'),
  ('editor', 'guests_view'),
  ('editor', 'guests_edit'),
  ('editor', 'rsvp_view'),
  ('editor', 'rsvp_edit'),
  ('editor', 'seating_view'),
  ('editor', 'seating_edit'),
  ('editor', 'gifts_view'),
  ('editor', 'gifts_edit'),
  ('editor', 'documents_view'),
  ('editor', 'documents_edit'),
  ('editor', 'wedding_day_view'),
  ('editor', 'wedding_day_edit'),
  ('viewer', 'event_view'),
  ('viewer', 'budget_view'),
  ('viewer', 'expenses_view'),
  ('viewer', 'payments_view'),
  ('viewer', 'vendors_view'),
  ('viewer', 'guests_view'),
  ('viewer', 'rsvp_view'),
  ('viewer', 'seating_view'),
  ('viewer', 'gifts_view'),
  ('viewer', 'documents_view'),
  ('viewer', 'wedding_day_view'),
  ('guest_manager', 'event_view'),
  ('guest_manager', 'guests_view'),
  ('guest_manager', 'guests_edit'),
  ('guest_manager', 'rsvp_view'),
  ('guest_manager', 'rsvp_edit'),
  ('guest_manager', 'seating_view'),
  ('guest_manager', 'seating_edit'),
  ('guest_manager', 'wedding_day_view'),
  ('guest_manager', 'wedding_day_edit'),
  ('event_manager', 'event_view'),
  ('event_manager', 'vendors_view'),
  ('event_manager', 'vendors_edit'),
  ('event_manager', 'guests_view'),
  ('event_manager', 'guests_edit'),
  ('event_manager', 'rsvp_view'),
  ('event_manager', 'rsvp_edit'),
  ('event_manager', 'seating_view'),
  ('event_manager', 'seating_edit'),
  ('event_manager', 'documents_view'),
  ('event_manager', 'documents_edit'),
  ('event_manager', 'wedding_day_view'),
  ('event_manager', 'wedding_day_edit');

create table public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_members_event_id_idx on public.event_members(event_id);
create index event_members_user_id_idx on public.event_members(user_id);
create index event_members_invited_by_idx on public.event_members(invited_by);
create index event_members_event_role_idx on public.event_members(event_id, role);

create trigger trg_event_members_updated_at
before update on public.event_members
for each row execute function public.update_updated_at_column();

alter table public.event_members enable row level security;
revoke all on public.event_members from public, anon, authenticated;
grant all on public.event_members to service_role;

create table public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null,
  role public.workspace_role not null,
  token_hash bytea not null,
  status public.workspace_invitation_status not null default 'pending',
  created_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_invitations_email_normalized
    check (email = lower(btrim(email)) and email <> ''),
  constraint event_invitations_token_hash_length
    check (octet_length(token_hash) = 32),
  constraint event_invitations_status_timestamps
    check (
      (status = 'pending' and accepted_at is null and revoked_at is null)
      or (status = 'accepted' and accepted_at is not null and accepted_by is not null)
      or (status = 'revoked' and revoked_at is not null)
      or status = 'expired'
    )
);

create unique index event_invitations_pending_event_email_key
  on public.event_invitations(event_id, email)
  where status = 'pending';
create unique index event_invitations_token_hash_key
  on public.event_invitations(token_hash);
create index event_invitations_event_id_idx on public.event_invitations(event_id);
create index event_invitations_created_by_idx on public.event_invitations(created_by);
create index event_invitations_accepted_by_idx on public.event_invitations(accepted_by);
create index event_invitations_event_status_idx
  on public.event_invitations(event_id, status, expires_at);

create trigger trg_event_invitations_updated_at
before update on public.event_invitations
for each row execute function public.update_updated_at_column();

alter table public.event_invitations enable row level security;
revoke all on public.event_invitations from public, anon, authenticated;
grant all on public.event_invitations to service_role;

create table public.workspace_permission_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  subject_user_id uuid references public.profiles(id) on delete set null,
  invitation_id uuid references public.event_invitations(id) on delete set null,
  action public.workspace_permission_action not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workspace_permission_events_no_token_details
    check (
      not (details ? 'token')
      and not (details ? 'token_hash')
    )
);

create index workspace_permission_events_event_id_idx
  on public.workspace_permission_events(event_id);
create index workspace_permission_events_actor_id_idx
  on public.workspace_permission_events(actor_id);
create index workspace_permission_events_subject_user_id_idx
  on public.workspace_permission_events(subject_user_id);
create index workspace_permission_events_invitation_id_idx
  on public.workspace_permission_events(invitation_id);

alter table public.workspace_permission_events enable row level security;
revoke all on public.workspace_permission_events from public, anon, authenticated;
grant all on public.workspace_permission_events to service_role;

create or replace function private.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select auth.uid()) is not null
     and exists (
       select 1
       from public.profiles p
       where p.id = (select auth.uid())
         and p.is_active
     )
$$;

create or replace function private.is_event_owner_or_admin(_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.current_user_is_active()
     and exists (
       select 1
       from public.events e
       join public.profiles owner_profile on owner_profile.id = e.owner_id
       where e.id = _event_id
         and owner_profile.is_active
         and (
           e.owner_id = (select auth.uid())
           or private.has_role((select auth.uid()), 'admin')
         )
     )
$$;

create or replace function private.has_event_capability(
  _event_id uuid,
  _capability public.workspace_capability
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.current_user_is_active()
     and exists (
       select 1
       from public.events e
       join public.profiles owner_profile on owner_profile.id = e.owner_id
       where e.id = _event_id
         and owner_profile.is_active
     )
     and (
       private.has_role((select auth.uid()), 'admin')
       or exists (
         select 1
         from public.events e
         where e.id = _event_id
           and e.owner_id = (select auth.uid())
       )
       or exists (
         select 1
         from public.event_members em
         join public.profiles member_profile on member_profile.id = em.user_id
         join private.workspace_role_capabilities wrc on wrc.role = em.role
         where em.event_id = _event_id
           and em.user_id = (select auth.uid())
           and member_profile.is_active
           and wrc.capability = _capability
       )
     )
$$;

create or replace function private.hash_invitation_token(_token text)
returns bytea
language sql
immutable
strict
set search_path = pg_catalog, public, extensions
as $$
  select extensions.digest(_token, 'sha256')
$$;

create or replace function private.generate_invitation_token()
returns text
language sql
volatile
set search_path = pg_catalog, extensions
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
$$;

create or replace function public.prevent_event_member_owner_membership()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.events e
    where e.id = new.event_id
      and e.owner_id = new.user_id
  ) then
    raise exception 'WORKSPACE_OWNER_CANNOT_BE_MEMBER'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_event_members_prevent_owner
before insert or update of event_id, user_id on public.event_members
for each row execute function public.prevent_event_member_owner_membership();

create or replace function private.assert_can_manage_workspace(
  _event_id uuid,
  _require_editable boolean
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null or not private.current_user_is_active() then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not private.is_event_owner_or_admin(_event_id) then
    raise exception 'FORBIDDEN_WORKSPACE_MANAGE';
  end if;

  if _require_editable and not private.can_edit_event(_event_id) then
    raise exception 'WORKSPACE_READ_ONLY';
  end if;
end;
$$;

create or replace function public.create_event_invitation(
  _event_id uuid,
  _email text,
  _role public.workspace_role,
  _expires_in_days integer default 14
)
returns table (
  invitation_id uuid,
  token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  normalized_email text;
  raw_token text;
  hashed_token bytea;
  existing_invitation public.event_invitations;
  result_invitation public.event_invitations;
  action_name public.workspace_permission_action;
begin
  perform private.assert_can_manage_workspace(_event_id, true);

  normalized_email := lower(btrim(_email));
  if normalized_email = '' or normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_INVITATION_EMAIL';
  end if;

  if coalesce(_expires_in_days, 0) <= 0 then
    raise exception 'INVALID_INVITATION_EXPIRY';
  end if;

  if exists (
    select 1
    from public.profiles p
    join public.events e on e.owner_id = p.id
    where e.id = _event_id
      and lower(p.email) = normalized_email
  ) then
    raise exception 'WORKSPACE_OWNER_CANNOT_BE_MEMBER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_event_id::text || ':' || normalized_email, 0));
  raw_token := private.generate_invitation_token();
  hashed_token := private.hash_invitation_token(raw_token);

  select * into existing_invitation
  from public.event_invitations ei
  where ei.event_id = _event_id
    and ei.email = normalized_email
    and ei.status = 'pending'
  for update;

  if found then
    update public.event_invitations
    set role = _role,
        token_hash = hashed_token,
        expires_at = now() + make_interval(days => coalesce(_expires_in_days, 14)),
        created_by = (select auth.uid()),
        accepted_by = null,
        accepted_at = null,
        revoked_at = null
    where id = existing_invitation.id
    returning * into result_invitation;
    action_name := 'invitation_reissued';
  else
    insert into public.event_invitations (
      event_id, email, role, token_hash, created_by, expires_at
    ) values (
      _event_id,
      normalized_email,
      _role,
      hashed_token,
      (select auth.uid()),
      now() + make_interval(days => coalesce(_expires_in_days, 14))
    )
    returning * into result_invitation;
    action_name := 'invitation_created';
  end if;

  insert into public.workspace_permission_events (
    event_id, actor_id, invitation_id, action, details
  ) values (
    _event_id,
    (select auth.uid()),
    result_invitation.id,
    action_name,
    jsonb_build_object('email', normalized_email, 'role', _role)
  );

  invitation_id := result_invitation.id;
  token := raw_token;
  expires_at := result_invitation.expires_at;
  return next;
end;
$$;

create or replace function public.reissue_event_invitation(_invitation_id uuid)
returns table (
  invitation_id uuid,
  token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  invitation public.event_invitations;
  raw_token text;
begin
  select * into invitation
  from public.event_invitations
  where id = _invitation_id
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  perform private.assert_can_manage_workspace(invitation.event_id, true);

  if invitation.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING';
  end if;

  raw_token := private.generate_invitation_token();

  update public.event_invitations
  set token_hash = private.hash_invitation_token(raw_token),
      expires_at = now() + interval '14 days',
      accepted_by = null,
      accepted_at = null,
      revoked_at = null
  where id = invitation.id
  returning * into invitation;

  insert into public.workspace_permission_events (
    event_id, actor_id, invitation_id, action, details
  ) values (
    invitation.event_id,
    (select auth.uid()),
    invitation.id,
    'invitation_reissued',
    jsonb_build_object('email', invitation.email, 'role', invitation.role)
  );

  invitation_id := invitation.id;
  token := raw_token;
  expires_at := invitation.expires_at;
  return next;
end;
$$;

create or replace function public.revoke_event_invitation(_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invitation public.event_invitations;
begin
  select * into invitation
  from public.event_invitations
  where id = _invitation_id
  for update;

  if not found then
    return false;
  end if;

  perform private.assert_can_manage_workspace(invitation.event_id, false);

  update public.event_invitations
  set status = 'revoked',
      revoked_at = now()
  where id = invitation.id
    and status = 'pending'
  returning * into invitation;

  if not found then
    return false;
  end if;

  insert into public.workspace_permission_events (
    event_id, actor_id, invitation_id, action, details
  ) values (
    invitation.event_id,
    (select auth.uid()),
    invitation.id,
    'invitation_revoked',
    jsonb_build_object('email', invitation.email, 'role', invitation.role)
  );

  return true;
end;
$$;

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
  on conflict (event_id, user_id) do update
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

create or replace function public.list_workspace_members(_event_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  email text,
  full_name text,
  role public.workspace_role,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select em.id, em.user_id, p.email, p.full_name, em.role, em.created_at
  from public.event_members em
  join public.profiles p on p.id = em.user_id
  where em.event_id = _event_id
    and private.is_event_owner_or_admin(_event_id)
  order by em.created_at, em.id
$$;

create or replace function public.list_pending_event_invitations(_event_id uuid)
returns table (
  invitation_id uuid,
  email text,
  role public.workspace_role,
  status public.workspace_invitation_status,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select ei.id, ei.email, ei.role, ei.status, ei.expires_at, ei.created_by, ei.created_at
  from public.event_invitations ei
  where ei.event_id = _event_id
    and ei.status = 'pending'
    and ei.expires_at > now()
    and private.is_event_owner_or_admin(_event_id)
  order by ei.created_at, ei.id
$$;

create or replace function public.update_event_member_role(
  _member_id uuid,
  _role public.workspace_role
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  member_before public.event_members;
  member_after public.event_members;
begin
  select * into member_before
  from public.event_members
  where id = _member_id
  for update;

  if not found then
    return false;
  end if;

  perform private.assert_can_manage_workspace(member_before.event_id, true);

  update public.event_members
  set role = _role
  where id = _member_id
  returning * into member_after;

  if not found then
    return false;
  end if;

  insert into public.workspace_permission_events (
    event_id, actor_id, subject_user_id, action, details
  ) values (
    member_after.event_id,
    (select auth.uid()),
    member_after.user_id,
    'member_role_changed',
    jsonb_build_object('previous_role', member_before.role, 'new_role', member_after.role)
  );

  return true;
end;
$$;

create or replace function public.remove_event_member(_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  removed_member public.event_members;
begin
  select * into removed_member
  from public.event_members
  where id = _member_id
  for update;

  if not found then
    return false;
  end if;

  perform private.assert_can_manage_workspace(removed_member.event_id, false);

  delete from public.event_members
  where id = _member_id
  returning * into removed_member;

  if not found then
    return false;
  end if;

  insert into public.workspace_permission_events (
    event_id, actor_id, subject_user_id, action, details
  ) values (
    removed_member.event_id,
    (select auth.uid()),
    removed_member.user_id,
    'member_removed',
    jsonb_build_object('role', removed_member.role)
  );

  return true;
end;
$$;

create or replace function public.list_my_workspaces()
returns table (
  event_id uuid,
  event_name text,
  wedding_date date,
  owner_id uuid,
  is_owner boolean,
  workspace_role public.workspace_role
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select e.id, e.event_name, e.wedding_date, e.owner_id, true, null::public.workspace_role
  from public.events e
  join public.profiles caller on caller.id = (select auth.uid())
  join public.profiles owner_profile on owner_profile.id = e.owner_id
  where caller.is_active
    and owner_profile.is_active
    and e.owner_id = (select auth.uid())
  union all
  select e.id, e.event_name, e.wedding_date, e.owner_id, false, em.role
  from public.event_members em
  join public.events e on e.id = em.event_id
  join public.profiles caller on caller.id = em.user_id
  join public.profiles owner_profile on owner_profile.id = e.owner_id
  where caller.id = (select auth.uid())
    and caller.is_active
    and owner_profile.is_active
  order by 5 desc, 2, 1
$$;

create or replace function public.prevent_admin_deletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.user_roles
    where user_id = old.id
      and role = 'admin'
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

revoke all on function private.current_user_is_active() from public, anon;
revoke all on function private.is_event_owner_or_admin(uuid) from public, anon;
revoke all on function private.has_event_capability(uuid, public.workspace_capability) from public, anon;
revoke all on function private.hash_invitation_token(text) from public, anon;
revoke all on function private.generate_invitation_token() from public, anon;
revoke all on function private.assert_can_manage_workspace(uuid, boolean) from public, anon;

grant execute on function private.current_user_is_active() to authenticated, service_role;
grant execute on function private.is_event_owner_or_admin(uuid) to authenticated, service_role;
grant execute on function private.has_event_capability(uuid, public.workspace_capability) to authenticated, service_role;
grant execute on function private.hash_invitation_token(text) to authenticated, service_role;
grant execute on function private.generate_invitation_token() to service_role;
grant execute on function private.assert_can_manage_workspace(uuid, boolean) to authenticated, service_role;

revoke all on function public.prevent_event_member_owner_membership() from public, anon, authenticated;
revoke all on function public.prevent_admin_deletion() from public, anon, authenticated;

revoke all on function public.create_event_invitation(uuid, text, public.workspace_role, integer)
  from public, anon;
revoke all on function public.reissue_event_invitation(uuid)
  from public, anon;
revoke all on function public.revoke_event_invitation(uuid)
  from public, anon;
revoke all on function public.accept_event_invitation(text)
  from public, anon;
revoke all on function public.list_workspace_members(uuid)
  from public, anon;
revoke all on function public.list_pending_event_invitations(uuid)
  from public, anon;
revoke all on function public.update_event_member_role(uuid, public.workspace_role)
  from public, anon;
revoke all on function public.remove_event_member(uuid)
  from public, anon;
revoke all on function public.list_my_workspaces()
  from public, anon;

grant execute on function public.create_event_invitation(uuid, text, public.workspace_role, integer)
  to authenticated;
grant execute on function public.reissue_event_invitation(uuid)
  to authenticated;
grant execute on function public.revoke_event_invitation(uuid)
  to authenticated;
grant execute on function public.accept_event_invitation(text)
  to authenticated;
grant execute on function public.list_workspace_members(uuid)
  to authenticated;
grant execute on function public.list_pending_event_invitations(uuid)
  to authenticated;
grant execute on function public.update_event_member_role(uuid, public.workspace_role)
  to authenticated;
grant execute on function public.remove_event_member(uuid)
  to authenticated;
grant execute on function public.list_my_workspaces()
  to authenticated;
