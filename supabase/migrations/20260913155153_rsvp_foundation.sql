create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'rsvp_status'
  ) then
    create type public.rsvp_status as enum (
      'not_sent',
      'sent',
      'awaiting_response',
      'confirmed',
      'declined',
      'partially_confirmed'
    );
  end if;
end $$;

grant usage on type public.rsvp_status to anon, authenticated, service_role;

create table if not exists public.guest_rsvps (
  guest_id uuid primary key references public.guests(id) on delete cascade,
  status public.rsvp_status not null default 'not_sent',
  confirmed_count integer,
  sent_at timestamptz,
  responded_at timestamptz,
  last_contact_at timestamptz,
  last_reminder_at timestamptz,
  note text,
  dietary_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_rsvp_links (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  token_hash bytea not null,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_rsvp_links_token_hash_sha256
    check (octet_length(token_hash) = 32)
);

create table if not exists public.guest_rsvp_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  source text not null,
  action text not null,
  previous_status public.rsvp_status,
  new_status public.rsvp_status,
  previous_confirmed_count integer,
  new_confirmed_count integer,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint guest_rsvp_events_source_check
    check (source in ('workspace_user', 'public_link', 'system')),
  constraint guest_rsvp_events_action_check
    check (action in (
      'link_created',
      'link_reissued',
      'link_revoked',
      'status_changed',
      'response_submitted',
      'manual_override',
      'contact_marked',
      'reminder_marked'
    ))
);

alter table public.guest_settings
  add column if not exists rsvp_collect_dietary boolean not null default false;

create unique index if not exists guest_rsvp_links_token_hash_key
  on public.guest_rsvp_links(token_hash);

create unique index if not exists guest_rsvp_links_one_active_per_guest_idx
  on public.guest_rsvp_links(guest_id)
  where revoked_at is null;

create index if not exists guest_rsvp_links_guest_id_idx
  on public.guest_rsvp_links(guest_id);

create index if not exists guest_rsvp_links_active_expiry_idx
  on public.guest_rsvp_links(expires_at)
  where revoked_at is null;

create index if not exists guest_rsvp_events_event_id_idx
  on public.guest_rsvp_events(event_id);

create index if not exists guest_rsvp_events_guest_id_idx
  on public.guest_rsvp_events(guest_id);

create index if not exists guest_rsvp_events_actor_id_idx
  on public.guest_rsvp_events(actor_id);

create index if not exists guest_rsvp_events_guest_created_at_idx
  on public.guest_rsvp_events(guest_id, created_at desc);

drop trigger if exists trg_guest_rsvps_updated_at on public.guest_rsvps;
create trigger trg_guest_rsvps_updated_at
before update on public.guest_rsvps
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_guest_rsvp_links_updated_at on public.guest_rsvp_links;
create trigger trg_guest_rsvp_links_updated_at
before update on public.guest_rsvp_links
for each row execute function public.update_updated_at_column();

alter table public.guest_rsvps enable row level security;
alter table public.guest_rsvp_links enable row level security;
alter table public.guest_rsvp_events enable row level security;

revoke all on public.guest_rsvps from public, anon, authenticated;
revoke all on public.guest_rsvp_links from public, anon, authenticated;
revoke all on public.guest_rsvp_events from public, anon, authenticated;
grant all on public.guest_rsvps to service_role;
grant all on public.guest_rsvp_links to service_role;
grant all on public.guest_rsvp_events to service_role;

create or replace function private.hash_rsvp_token(_token text)
returns bytea
language sql
immutable
strict
security definer
set search_path = pg_catalog, extensions
as $$
  select extensions.digest(_token, 'sha256')
$$;

create or replace function private.generate_rsvp_token()
returns text
language sql
volatile
security definer
set search_path = pg_catalog, extensions
as $$
  select rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')
$$;

create or replace function private.event_subscription_allows_rsvp(_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.event_id = _event_id
      and (
        (s.plan = 'premium' and s.premium_expires_at > now())
        or (s.plan = 'trial' and s.trial_expires_at > now())
      )
  )
$$;

create or replace function private.assert_guest_rsvp_access(
  _guest_id uuid,
  _capability public.workspace_capability,
  _require_editable boolean
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  target_event_id uuid;
begin
  if (select auth.uid()) is null or not private.current_user_is_active() then
    raise exception 'UNAUTHENTICATED';
  end if;

  select g.event_id
    into target_event_id
  from public.guests g
  where g.id = _guest_id;

  if target_event_id is null then
    raise exception 'GUEST_NOT_FOUND';
  end if;

  if not private.has_event_capability(target_event_id, _capability) then
    raise exception 'ACCESS_DENIED';
  end if;

  if _require_editable and not private.can_edit_event(target_event_id) then
    raise exception 'RSVP_READ_ONLY';
  end if;

  return target_event_id;
end;
$$;

create or replace function private.insert_guest_rsvp_event(
  _event_id uuid,
  _guest_id uuid,
  _actor_id uuid,
  _source text,
  _action text,
  _previous_status public.rsvp_status,
  _new_status public.rsvp_status,
  _previous_confirmed_count integer,
  _new_confirmed_count integer,
  _details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.guest_rsvp_events (
    event_id,
    guest_id,
    actor_id,
    source,
    action,
    previous_status,
    new_status,
    previous_confirmed_count,
    new_confirmed_count,
    details
  ) values (
    _event_id,
    _guest_id,
    _actor_id,
    _source,
    _action,
    _previous_status,
    _new_status,
    _previous_confirmed_count,
    _new_confirmed_count,
    coalesce(_details, '{}'::jsonb)
  );
end;
$$;

create or replace function public.enforce_guest_rsvp_consistency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_group_size integer;
begin
  select g.group_size
    into target_group_size
  from public.guests g
  where g.id = new.guest_id
  for update;

  if target_group_size is null then
    return new;
  end if;

  if new.confirmed_count is not null and new.confirmed_count < 0 then
    raise exception 'RSVP_CONFIRMED_COUNT_NEGATIVE'
      using errcode = '23514';
  end if;

  if new.confirmed_count is not null and new.confirmed_count > target_group_size then
    raise exception 'RSVP_CONFIRMED_COUNT_EXCEEDS_GROUP_SIZE'
      using errcode = '23514';
  end if;

  if new.status in ('not_sent', 'sent', 'awaiting_response') then
    if new.confirmed_count is not null then
      raise exception 'RSVP_CONFIRMED_COUNT_NOT_ALLOWED'
        using errcode = '23514';
    end if;
    if new.status = 'not_sent' then
      new.sent_at := null;
    end if;
    new.responded_at := null;
  elsif new.status = 'declined' then
    new.confirmed_count := 0;
    if new.responded_at is null then
      new.responded_at := now();
    end if;
  elsif new.status = 'confirmed' then
    if new.confirmed_count is null then
      new.confirmed_count := target_group_size;
    end if;
    if new.confirmed_count <> target_group_size then
      raise exception 'RSVP_CONFIRMED_COUNT_MUST_EQUAL_GROUP_SIZE'
        using errcode = '23514';
    end if;
    if new.responded_at is null then
      new.responded_at := now();
    end if;
  elsif new.status = 'partially_confirmed' then
    if new.confirmed_count is null
       or new.confirmed_count <= 0
       or new.confirmed_count >= target_group_size then
      raise exception 'RSVP_PARTIAL_COUNT_INVALID'
        using errcode = '23514';
    end if;
    if new.responded_at is null then
      new.responded_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_guest_rsvp_consistency on public.guest_rsvps;
create trigger enforce_guest_rsvp_consistency
before insert or update of guest_id, status, confirmed_count on public.guest_rsvps
for each row execute function public.enforce_guest_rsvp_consistency();

create or replace function public.enforce_guest_group_size_not_below_members()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_member_count integer;
  current_rsvp public.guest_rsvps;
begin
  if new.group_size < 1 then
    raise exception 'GUEST_GROUP_SIZE_MINIMUM'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.group_size = old.group_size then
    return new;
  end if;

  select count(*)::integer
    into current_member_count
  from public.guest_members gm
  where gm.guest_id = new.id;

  if current_member_count > new.group_size then
    raise exception 'GUEST_GROUP_SIZE_BELOW_MEMBER_COUNT'
      using errcode = '23514';
  end if;

  select *
    into current_rsvp
  from public.guest_rsvps gr
  where gr.guest_id = new.id;

  if found then
    if current_rsvp.confirmed_count is not null
       and current_rsvp.confirmed_count > new.group_size then
      raise exception 'GUEST_GROUP_SIZE_BELOW_RSVP_COUNT'
        using errcode = '23514';
    end if;

    if current_rsvp.status = 'confirmed'
       and current_rsvp.confirmed_count is distinct from new.group_size then
      raise exception 'GUEST_GROUP_SIZE_CONFLICTS_WITH_RSVP_STATUS'
        using errcode = '23514';
    end if;

    if current_rsvp.status = 'partially_confirmed'
       and not (
         current_rsvp.confirmed_count is not null
         and current_rsvp.confirmed_count > 0
         and current_rsvp.confirmed_count < new.group_size
       ) then
      raise exception 'GUEST_GROUP_SIZE_CONFLICTS_WITH_RSVP_STATUS'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_guest_group_size_not_below_members on public.guests;
create trigger enforce_guest_group_size_not_below_members
before insert or update of group_size on public.guests
for each row execute function public.enforce_guest_group_size_not_below_members();

create or replace function public.list_workspace_rsvps(_event_id uuid)
returns table (
  guest_id uuid,
  guest_name text,
  group_size integer,
  status public.rsvp_status,
  confirmed_count integer,
  sent_at timestamptz,
  responded_at timestamptz,
  last_contact_at timestamptz,
  last_reminder_at timestamptz,
  note text,
  dietary_notes text,
  link_active boolean,
  link_expires_at timestamptz,
  link_revoked_at timestamptz,
  link_last_used_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    g.id,
    g.full_name,
    g.group_size,
    coalesce(r.status, 'not_sent'::public.rsvp_status),
    r.confirmed_count,
    r.sent_at,
    r.responded_at,
    r.last_contact_at,
    r.last_reminder_at,
    r.note,
    r.dietary_notes,
    (l.id is not null and l.revoked_at is null and l.expires_at > now()) as link_active,
    l.expires_at,
    l.revoked_at,
    l.last_used_at,
    coalesce(r.updated_at, g.updated_at)
  from public.guests g
  left join public.guest_rsvps r on r.guest_id = g.id
  left join lateral (
    select gl.id, gl.expires_at, gl.revoked_at, gl.last_used_at
    from public.guest_rsvp_links gl
    where gl.guest_id = g.id
    order by (gl.revoked_at is null) desc, gl.created_at desc, gl.id desc
    limit 1
  ) l on true
  where g.event_id = _event_id
    and private.current_user_is_active()
    and private.has_event_capability(_event_id, 'rsvp_view')
  order by g.full_name, g.created_at, g.id
$$;

create or replace function public.issue_guest_rsvp_link(
  _guest_id uuid,
  _expires_at timestamptz default null
)
returns table (
  guest_id uuid,
  token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  target_event_id uuid;
  existing_rsvp public.guest_rsvps;
  new_rsvp public.guest_rsvps;
  raw_token text;
  token_digest bytea;
  final_expires_at timestamptz;
  revoked_count integer;
  action_name text;
begin
  target_event_id := private.assert_guest_rsvp_access(_guest_id, 'rsvp_edit', true);

  perform 1
  from public.guests g
  where g.id = _guest_id
  for update;

  final_expires_at := coalesce(_expires_at, now() + interval '30 days');
  if final_expires_at <= now() then
    raise exception 'RSVP_LINK_EXPIRY_INVALID';
  end if;

  update public.guest_rsvp_links gl
  set revoked_at = coalesce(gl.revoked_at, now())
  where gl.guest_id = _guest_id
    and gl.revoked_at is null;
  get diagnostics revoked_count = row_count;
  action_name := case when revoked_count > 0 then 'link_reissued' else 'link_created' end;

  raw_token := private.generate_rsvp_token();
  token_digest := private.hash_rsvp_token(raw_token);

  insert into public.guest_rsvp_links (guest_id, token_hash, created_by, expires_at)
  values (_guest_id, token_digest, (select auth.uid()), final_expires_at);

  select * into existing_rsvp
  from public.guest_rsvps gr
  where gr.guest_id = _guest_id
  for update;

  if not found then
    insert into public.guest_rsvps (guest_id, status, sent_at, last_contact_at)
    values (_guest_id, 'sent', now(), now())
    returning * into new_rsvp;
  elsif existing_rsvp.status = 'not_sent' then
    update public.guest_rsvps gr
    set status = 'sent',
        sent_at = coalesce(gr.sent_at, now()),
        last_contact_at = now()
    where gr.guest_id = _guest_id
    returning * into new_rsvp;
  else
    update public.guest_rsvps gr
    set sent_at = coalesce(gr.sent_at, now()),
        last_contact_at = now()
    where gr.guest_id = _guest_id
    returning * into new_rsvp;
  end if;

  perform private.insert_guest_rsvp_event(
    target_event_id,
    _guest_id,
    (select auth.uid()),
    'workspace_user',
    action_name,
    existing_rsvp.status,
    new_rsvp.status,
    existing_rsvp.confirmed_count,
    new_rsvp.confirmed_count,
    jsonb_build_object('expires_at', final_expires_at)
  );

  guest_id := _guest_id;
  token := raw_token;
  expires_at := final_expires_at;
  return next;
end;
$$;

create or replace function public.revoke_guest_rsvp_link(_guest_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_event_id uuid;
  current_rsvp public.guest_rsvps;
  revoked_count integer;
begin
  target_event_id := private.assert_guest_rsvp_access(_guest_id, 'rsvp_edit', false);

  perform 1
  from public.guests g
  where g.id = _guest_id
  for update;

  select * into current_rsvp
  from public.guest_rsvps gr
  where gr.guest_id = _guest_id;

  update public.guest_rsvp_links gl
  set revoked_at = now()
  where gl.guest_id = _guest_id
    and gl.revoked_at is null;
  get diagnostics revoked_count = row_count;

  if revoked_count = 0 then
    return false;
  end if;

  perform private.insert_guest_rsvp_event(
    target_event_id,
    _guest_id,
    (select auth.uid()),
    'workspace_user',
    'link_revoked',
    current_rsvp.status,
    current_rsvp.status,
    current_rsvp.confirmed_count,
    current_rsvp.confirmed_count,
    '{}'::jsonb
  );

  return true;
end;
$$;

create or replace function public.set_guest_rsvp_state(
  _guest_id uuid,
  _status public.rsvp_status,
  _confirmed_count integer default null,
  _note text default null,
  _dietary_notes text default null
)
returns table (
  guest_id uuid,
  status public.rsvp_status,
  confirmed_count integer,
  responded_at timestamptz,
  note text,
  dietary_notes text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_event_id uuid;
  existing_rsvp public.guest_rsvps;
  updated_rsvp public.guest_rsvps;
  next_count integer;
  target_group_size integer;
begin
  if _status is null then
    raise exception 'RSVP_STATUS_REQUIRED';
  end if;

  target_event_id := private.assert_guest_rsvp_access(_guest_id, 'rsvp_edit', true);

  select g.group_size
    into target_group_size
  from public.guests g
  where g.id = _guest_id
  for update;

  select * into existing_rsvp
  from public.guest_rsvps gr
  where gr.guest_id = _guest_id
  for update;

  next_count := case
    when _status in ('not_sent', 'sent', 'awaiting_response') then null
    when _status = 'declined' then 0
    when _status = 'confirmed' then coalesce(_confirmed_count, target_group_size)
    else _confirmed_count
  end;

  insert into public.guest_rsvps (
    guest_id,
    status,
    confirmed_count,
    note,
    dietary_notes,
    responded_at
  ) values (
    _guest_id,
    _status,
    next_count,
    nullif(btrim(_note), ''),
    nullif(btrim(_dietary_notes), ''),
    case when _status in ('confirmed', 'declined', 'partially_confirmed') then now() else null end
  )
  on conflict on constraint guest_rsvps_pkey do update
    set status = excluded.status,
        confirmed_count = excluded.confirmed_count,
        note = excluded.note,
        dietary_notes = excluded.dietary_notes,
        responded_at = excluded.responded_at
  returning * into updated_rsvp;

  perform private.insert_guest_rsvp_event(
    target_event_id,
    _guest_id,
    (select auth.uid()),
    'workspace_user',
    'manual_override',
    existing_rsvp.status,
    updated_rsvp.status,
    existing_rsvp.confirmed_count,
    updated_rsvp.confirmed_count,
    '{}'::jsonb
  );

  guest_id := updated_rsvp.guest_id;
  status := updated_rsvp.status;
  confirmed_count := updated_rsvp.confirmed_count;
  responded_at := updated_rsvp.responded_at;
  note := updated_rsvp.note;
  dietary_notes := updated_rsvp.dietary_notes;
  updated_at := updated_rsvp.updated_at;
  return next;
end;
$$;

create or replace function public.mark_guest_rsvp_contact(
  _guest_id uuid,
  _contact_type text default 'contact'
)
returns table (
  guest_id uuid,
  last_contact_at timestamptz,
  last_reminder_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_event_id uuid;
  existing_rsvp public.guest_rsvps;
  updated_rsvp public.guest_rsvps;
  action_name text;
begin
  target_event_id := private.assert_guest_rsvp_access(_guest_id, 'rsvp_edit', true);

  perform 1
  from public.guests g
  where g.id = _guest_id
  for update;

  if _contact_type not in ('contact', 'reminder') then
    raise exception 'RSVP_CONTACT_TYPE_INVALID';
  end if;

  select * into existing_rsvp
  from public.guest_rsvps gr
  where gr.guest_id = _guest_id
  for update;

  insert into public.guest_rsvps (
    guest_id,
    status,
    last_contact_at,
    last_reminder_at
  ) values (
    _guest_id,
    'awaiting_response',
    now(),
    case when _contact_type = 'reminder' then now() else null end
  )
  on conflict on constraint guest_rsvps_pkey do update
    set status = case
          when public.guest_rsvps.status = 'not_sent' then 'awaiting_response'::public.rsvp_status
          else public.guest_rsvps.status
        end,
        last_contact_at = now(),
        last_reminder_at = case
          when _contact_type = 'reminder' then now()
          else public.guest_rsvps.last_reminder_at
        end
  returning * into updated_rsvp;

  action_name := case when _contact_type = 'reminder' then 'reminder_marked' else 'contact_marked' end;

  perform private.insert_guest_rsvp_event(
    target_event_id,
    _guest_id,
    (select auth.uid()),
    'workspace_user',
    action_name,
    existing_rsvp.status,
    updated_rsvp.status,
    existing_rsvp.confirmed_count,
    updated_rsvp.confirmed_count,
    '{}'::jsonb
  );

  guest_id := updated_rsvp.guest_id;
  last_contact_at := updated_rsvp.last_contact_at;
  last_reminder_at := updated_rsvp.last_reminder_at;
  updated_at := updated_rsvp.updated_at;
  return next;
end;
$$;

create or replace function public.list_guest_rsvp_history(_guest_id uuid)
returns table (
  id uuid,
  event_id uuid,
  guest_id uuid,
  actor_id uuid,
  source text,
  action text,
  previous_status public.rsvp_status,
  new_status public.rsvp_status,
  previous_confirmed_count integer,
  new_confirmed_count integer,
  details jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    e.id,
    e.event_id,
    e.guest_id,
    e.actor_id,
    e.source,
    e.action,
    e.previous_status,
    e.new_status,
    e.previous_confirmed_count,
    e.new_confirmed_count,
    e.details,
    e.created_at
  from public.guest_rsvp_events e
  where e.guest_id = _guest_id
    and private.has_guest_capability(_guest_id, 'rsvp_view')
  order by e.created_at desc, e.id desc
$$;

create or replace function public.get_public_rsvp(_token text)
returns table (
  event_name text,
  wedding_date date,
  guest_name text,
  group_size integer,
  status public.rsvp_status,
  confirmed_count integer,
  rsvp_collect_dietary boolean,
  expires_at timestamptz,
  link_status text,
  can_submit boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    e.event_name,
    e.wedding_date,
    g.full_name,
    g.group_size,
    coalesce(r.status, 'not_sent'::public.rsvp_status),
    r.confirmed_count,
    coalesce(gs.rsvp_collect_dietary, false),
    gl.expires_at,
    case
      when gl.revoked_at is not null then 'revoked'
      when gl.expires_at <= now() then 'expired'
      when not private.event_subscription_allows_rsvp(g.event_id) then 'subscription_expired'
      else 'active'
    end,
    gl.revoked_at is null
      and gl.expires_at > now()
      and private.event_subscription_allows_rsvp(g.event_id)
  from public.guest_rsvp_links gl
  join public.guests g on g.id = gl.guest_id
  join public.events e on e.id = g.event_id
  left join public.guest_settings gs on gs.event_id = g.event_id
  left join public.guest_rsvps r on r.guest_id = g.id
  where gl.token_hash = private.hash_rsvp_token(_token)
  limit 1
$$;

create or replace function public.submit_public_rsvp(
  _token text,
  _confirmed_count integer,
  _note text default null,
  _dietary_notes text default null
)
returns table (
  status public.rsvp_status,
  confirmed_count integer,
  responded_at timestamptz,
  message text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_link public.guest_rsvp_links;
  target_guest public.guests;
  existing_rsvp public.guest_rsvps;
  updated_rsvp public.guest_rsvps;
  collect_dietary boolean;
  next_status public.rsvp_status;
  sanitized_note text;
  sanitized_dietary text;
begin
  if _confirmed_count is null or _confirmed_count < 0 then
    raise exception 'RSVP_CONFIRMED_COUNT_INVALID'
      using errcode = '23514';
  end if;

  select * into target_link
  from public.guest_rsvp_links gl
  where gl.token_hash = private.hash_rsvp_token(_token)
  for update;

  if not found then
    raise exception 'RSVP_LINK_INVALID';
  end if;

  if target_link.revoked_at is not null then
    raise exception 'RSVP_LINK_REVOKED';
  end if;

  if target_link.expires_at <= now() then
    raise exception 'RSVP_LINK_EXPIRED';
  end if;

  select * into target_guest
  from public.guests g
  where g.id = target_link.guest_id
  for update;

  if not found then
    raise exception 'RSVP_GUEST_NOT_FOUND';
  end if;

  if not private.event_subscription_allows_rsvp(target_guest.event_id) then
    raise exception 'RSVP_SUBSCRIPTION_EXPIRED';
  end if;

  if _confirmed_count > target_guest.group_size then
    raise exception 'RSVP_CONFIRMED_COUNT_EXCEEDS_GROUP_SIZE'
      using errcode = '23514';
  end if;

  next_status := case
    when _confirmed_count = 0 then 'declined'::public.rsvp_status
    when _confirmed_count = target_guest.group_size then 'confirmed'::public.rsvp_status
    else 'partially_confirmed'::public.rsvp_status
  end;

  select coalesce(gs.rsvp_collect_dietary, false)
    into collect_dietary
  from public.guest_settings gs
  where gs.event_id = target_guest.event_id;

  sanitized_note := nullif(btrim(_note), '');
  sanitized_dietary := case
    when coalesce(collect_dietary, false) then nullif(btrim(_dietary_notes), '')
    else null
  end;

  select * into existing_rsvp
  from public.guest_rsvps gr
  where gr.guest_id = target_guest.id
  for update;

  insert into public.guest_rsvps (
    guest_id,
    status,
    confirmed_count,
    note,
    dietary_notes,
    responded_at
  ) values (
    target_guest.id,
    next_status,
    _confirmed_count,
    sanitized_note,
    sanitized_dietary,
    now()
  )
  on conflict on constraint guest_rsvps_pkey do update
    set status = excluded.status,
        confirmed_count = excluded.confirmed_count,
        note = excluded.note,
        dietary_notes = excluded.dietary_notes,
        responded_at = now()
  returning * into updated_rsvp;

  update public.guest_rsvp_links gl
  set last_used_at = now()
  where gl.id = target_link.id;

  perform private.insert_guest_rsvp_event(
    target_guest.event_id,
    target_guest.id,
    null,
    'public_link',
    'response_submitted',
    existing_rsvp.status,
    updated_rsvp.status,
    existing_rsvp.confirmed_count,
    updated_rsvp.confirmed_count,
    jsonb_build_object('collect_dietary', coalesce(collect_dietary, false))
  );

  status := updated_rsvp.status;
  confirmed_count := updated_rsvp.confirmed_count;
  responded_at := updated_rsvp.responded_at;
  message := 'RSVP_UPDATED';
  return next;
end;
$$;

revoke all on function private.hash_rsvp_token(text) from public, anon, authenticated;
revoke all on function private.generate_rsvp_token() from public, anon, authenticated;
revoke all on function private.event_subscription_allows_rsvp(uuid) from public, anon, authenticated;
revoke all on function private.assert_guest_rsvp_access(uuid, public.workspace_capability, boolean) from public, anon, authenticated;
revoke all on function private.insert_guest_rsvp_event(uuid, uuid, uuid, text, text, public.rsvp_status, public.rsvp_status, integer, integer, jsonb) from public, anon, authenticated;

revoke all on function public.enforce_guest_rsvp_consistency() from public, anon, authenticated;
revoke all on function public.enforce_guest_group_size_not_below_members() from public, anon, authenticated;

revoke all on function public.list_workspace_rsvps(uuid) from public, anon;
grant execute on function public.list_workspace_rsvps(uuid) to authenticated, service_role;

revoke all on function public.issue_guest_rsvp_link(uuid, timestamptz) from public, anon;
grant execute on function public.issue_guest_rsvp_link(uuid, timestamptz) to authenticated, service_role;

revoke all on function public.revoke_guest_rsvp_link(uuid) from public, anon;
grant execute on function public.revoke_guest_rsvp_link(uuid) to authenticated, service_role;

revoke all on function public.set_guest_rsvp_state(uuid, public.rsvp_status, integer, text, text) from public, anon;
grant execute on function public.set_guest_rsvp_state(uuid, public.rsvp_status, integer, text, text) to authenticated, service_role;

revoke all on function public.mark_guest_rsvp_contact(uuid, text) from public, anon;
grant execute on function public.mark_guest_rsvp_contact(uuid, text) to authenticated, service_role;

revoke all on function public.list_guest_rsvp_history(uuid) from public, anon;
grant execute on function public.list_guest_rsvp_history(uuid) to authenticated, service_role;

revoke all on function public.get_public_rsvp(text) from public;
grant execute on function public.get_public_rsvp(text) to anon, authenticated, service_role;

revoke all on function public.submit_public_rsvp(text, integer, text, text) from public;
grant execute on function public.submit_public_rsvp(text, integer, text, text) to anon, authenticated, service_role;
