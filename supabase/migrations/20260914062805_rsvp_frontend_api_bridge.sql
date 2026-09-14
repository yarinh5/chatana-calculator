drop function if exists public.list_workspace_rsvps(uuid);
drop function if exists public.get_public_rsvp(text);

create or replace function public.get_workspace_rsvp_settings(_event_id uuid)
returns table (
  rsvp_collect_dietary boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(gs.rsvp_collect_dietary, false)
  from public.guest_settings gs
  where gs.event_id = _event_id
    and private.current_user_is_active()
    and private.has_event_capability(_event_id, 'rsvp_view')
  limit 1
$$;

create or replace function public.set_workspace_rsvp_settings(
  _event_id uuid,
  _rsvp_collect_dietary boolean
)
returns table (
  rsvp_collect_dietary boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_settings public.guest_settings;
begin
  if _event_id is null then
    raise exception 'EVENT_REQUIRED';
  end if;

  if not private.current_user_is_active()
     or not private.has_event_capability(_event_id, 'rsvp_edit')
     or not private.can_edit_event(_event_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.guest_settings gs
  set rsvp_collect_dietary = coalesce(_rsvp_collect_dietary, false)
  where gs.event_id = _event_id
  returning gs.* into updated_settings;

  if not found then
    raise exception 'RSVP_SETTINGS_NOT_FOUND';
  end if;

  rsvp_collect_dietary := updated_settings.rsvp_collect_dietary;
  return next;
end;
$$;

create or replace function public.list_workspace_rsvps(_event_id uuid)
returns table (
  guest_id uuid,
  guest_name text,
  guest_phone text,
  guest_email text,
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
    g.phone,
    g.email,
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

create or replace function public.get_public_rsvp(_token text)
returns table (
  event_name text,
  wedding_date date,
  guest_name text,
  group_size integer,
  status public.rsvp_status,
  confirmed_count integer,
  note text,
  dietary_notes text,
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
    r.note,
    r.dietary_notes,
    coalesce(gs.rsvp_collect_dietary, false),
    gl.expires_at,
    case
      when not private.event_subscription_allows_rsvp(g.event_id) then 'subscription_expired'
      else 'active'
    end,
    private.event_subscription_allows_rsvp(g.event_id)
  from public.guest_rsvp_links gl
  join public.guests g on g.id = gl.guest_id
  join public.events e on e.id = g.event_id
  left join public.guest_settings gs on gs.event_id = g.event_id
  left join public.guest_rsvps r on r.guest_id = g.id
  where private.is_valid_rsvp_token(_token)
    and gl.token_hash = private.hash_rsvp_token(_token)
    and gl.revoked_at is null
    and gl.expires_at > now()
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
  if not private.is_valid_rsvp_token(_token) then
    raise exception 'RSVP_LINK_INVALID';
  end if;

  if _confirmed_count is null or _confirmed_count < 0 then
    raise exception 'RSVP_CONFIRMED_COUNT_INVALID'
      using errcode = '23514';
  end if;

  if _note is not null and char_length(_note) > 1000 then
    raise exception 'RSVP_NOTE_TOO_LONG'
      using errcode = '23514';
  end if;

  if _dietary_notes is not null and char_length(_dietary_notes) > 1000 then
    raise exception 'RSVP_DIETARY_NOTES_TOO_LONG'
      using errcode = '23514';
  end if;

  select * into target_link
  from public.guest_rsvp_links gl
  where gl.token_hash = private.hash_rsvp_token(_token)
    and gl.revoked_at is null
    and gl.expires_at > now()
  for update;

  if not found then
    raise exception 'RSVP_LINK_INVALID';
  end if;

  select * into target_guest
  from public.guests g
  where g.id = target_link.guest_id
  for update;

  if not found then
    raise exception 'RSVP_LINK_INVALID';
  end if;

  if not private.event_subscription_allows_rsvp(target_guest.event_id) then
    raise exception 'RSVP_SUBSCRIPTION_EXPIRED';
  end if;

  if _confirmed_count > target_guest.group_size then
    raise exception 'RSVP_CONFIRMED_COUNT_EXCEEDS_GROUP_SIZE'
      using errcode = '23514';
  end if;

  select coalesce(gs.rsvp_collect_dietary, false)
    into collect_dietary
  from public.guest_settings gs
  where gs.event_id = target_guest.event_id;

  if coalesce(collect_dietary, false) is false
     and _dietary_notes is not null
     and btrim(_dietary_notes) <> '' then
    raise exception 'RSVP_DIETARY_NOT_COLLECTED'
      using errcode = '23514';
  end if;

  next_status := case
    when _confirmed_count = 0 then 'declined'::public.rsvp_status
    when _confirmed_count = target_guest.group_size then 'confirmed'::public.rsvp_status
    else 'partially_confirmed'::public.rsvp_status
  end;

  select * into existing_rsvp
  from public.guest_rsvps gr
  where gr.guest_id = target_guest.id
  for update;

  sanitized_note := case
    when _note is null then existing_rsvp.note
    when btrim(_note) = '' then null
    else _note
  end;

  sanitized_dietary := case
    when coalesce(collect_dietary, false) is false then null
    when _dietary_notes is null then existing_rsvp.dietary_notes
    when btrim(_dietary_notes) = '' then null
    else _dietary_notes
  end;

  insert into public.guest_rsvps (
    guest_id,
    status,
    confirmed_count,
    note,
    dietary_notes,
    sent_at,
    responded_at,
    last_contact_at,
    last_reminder_at
  ) values (
    target_guest.id,
    next_status,
    _confirmed_count,
    sanitized_note,
    sanitized_dietary,
    existing_rsvp.sent_at,
    now(),
    existing_rsvp.last_contact_at,
    existing_rsvp.last_reminder_at
  )
  on conflict on constraint guest_rsvps_pkey do update
    set status = excluded.status,
        confirmed_count = excluded.confirmed_count,
        note = excluded.note,
        dietary_notes = excluded.dietary_notes,
        sent_at = excluded.sent_at,
        responded_at = now(),
        last_contact_at = excluded.last_contact_at,
        last_reminder_at = excluded.last_reminder_at
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
    coalesce(existing_rsvp.status, 'not_sent'::public.rsvp_status),
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

revoke all on function public.get_workspace_rsvp_settings(uuid) from public, anon;
grant execute on function public.get_workspace_rsvp_settings(uuid) to authenticated, service_role;

revoke all on function public.set_workspace_rsvp_settings(uuid, boolean) from public, anon;
grant execute on function public.set_workspace_rsvp_settings(uuid, boolean) to authenticated, service_role;

revoke all on function public.list_workspace_rsvps(uuid) from public, anon;
grant execute on function public.list_workspace_rsvps(uuid) to authenticated, service_role;

revoke all on function public.get_public_rsvp(text) from public;
grant execute on function public.get_public_rsvp(text) to anon, authenticated, service_role;

revoke all on function public.submit_public_rsvp(text, integer, text, text) from public;
grant execute on function public.submit_public_rsvp(text, integer, text, text) to anon, authenticated, service_role;
