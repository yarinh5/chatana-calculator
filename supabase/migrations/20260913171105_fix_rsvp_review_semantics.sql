create or replace function private.is_valid_rsvp_token(_token text)
returns boolean
language sql
immutable
strict
security definer
set search_path = pg_catalog
as $$
  select _token ~ '^[A-Za-z0-9_-]{43}$'
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

  if new.note is not null and char_length(new.note) > 1000 then
    raise exception 'RSVP_NOTE_TOO_LONG'
      using errcode = '23514';
  end if;

  if new.dietary_notes is not null and char_length(new.dietary_notes) > 1000 then
    raise exception 'RSVP_DIETARY_NOTES_TOO_LONG'
      using errcode = '23514';
  end if;

  if new.confirmed_count is not null and new.confirmed_count < 0 then
    raise exception 'RSVP_CONFIRMED_COUNT_NEGATIVE'
      using errcode = '23514';
  end if;

  if new.confirmed_count is not null and new.confirmed_count > target_group_size then
    raise exception 'RSVP_CONFIRMED_COUNT_EXCEEDS_GROUP_SIZE'
      using errcode = '23514';
  end if;

  if new.status = 'not_sent' then
    if new.confirmed_count is not null then
      raise exception 'RSVP_CONFIRMED_COUNT_NOT_ALLOWED'
        using errcode = '23514';
    end if;
    new.sent_at := null;
    new.responded_at := null;
  elsif new.status = 'sent' then
    if new.confirmed_count is not null then
      raise exception 'RSVP_CONFIRMED_COUNT_NOT_ALLOWED'
        using errcode = '23514';
    end if;
    new.sent_at := coalesce(new.sent_at, now());
    new.responded_at := null;
  elsif new.status = 'awaiting_response' then
    if new.confirmed_count is not null then
      raise exception 'RSVP_CONFIRMED_COUNT_NOT_ALLOWED'
        using errcode = '23514';
    end if;
    new.sent_at := coalesce(new.sent_at, now());
    new.responded_at := null;
  elsif new.status = 'declined' then
    new.confirmed_count := 0;
    new.responded_at := coalesce(new.responded_at, now());
  elsif new.status = 'confirmed' then
    if new.confirmed_count is null then
      new.confirmed_count := target_group_size;
    end if;
    if new.confirmed_count <> target_group_size then
      raise exception 'RSVP_CONFIRMED_COUNT_MUST_EQUAL_GROUP_SIZE'
        using errcode = '23514';
    end if;
    new.responded_at := coalesce(new.responded_at, now());
  elsif new.status = 'partially_confirmed' then
    if new.confirmed_count is null
       or new.confirmed_count <= 0
       or new.confirmed_count >= target_group_size then
      raise exception 'RSVP_PARTIAL_COUNT_INVALID'
        using errcode = '23514';
    end if;
    new.responded_at := coalesce(new.responded_at, now());
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guest_rsvps'::regclass
      and conname = 'guest_rsvps_note_length'
  ) then
    alter table public.guest_rsvps
      add constraint guest_rsvps_note_length
      check (note is null or char_length(note) <= 1000)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guest_rsvps'::regclass
      and conname = 'guest_rsvps_dietary_notes_length'
  ) then
    alter table public.guest_rsvps
      add constraint guest_rsvps_dietary_notes_length
      check (dietary_notes is null or char_length(dietary_notes) <= 1000)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guest_rsvp_events'::regclass
      and conname = 'guest_rsvp_events_no_token_details'
  ) then
    alter table public.guest_rsvp_events
      add constraint guest_rsvp_events_no_token_details
      check (not (details ?| array['token', 'raw_token', 'token_hash']))
      not valid;
  end if;
end $$;

alter table public.guest_rsvps validate constraint guest_rsvps_note_length;
alter table public.guest_rsvps validate constraint guest_rsvps_dietary_notes_length;
alter table public.guest_rsvp_events validate constraint guest_rsvp_events_no_token_details;

drop index if exists public.guest_rsvp_events_guest_id_idx;

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
  raw_token text;
  token_digest bytea;
  final_expires_at timestamptz;
  revoked_count integer;
  action_name text;
  effective_status public.rsvp_status;
  effective_count integer;
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

  select * into existing_rsvp
  from public.guest_rsvps gr
  where gr.guest_id = _guest_id
  for update;

  effective_status := coalesce(existing_rsvp.status, 'not_sent'::public.rsvp_status);
  effective_count := existing_rsvp.confirmed_count;

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

  perform private.insert_guest_rsvp_event(
    target_event_id,
    _guest_id,
    (select auth.uid()),
    'workspace_user',
    action_name,
    effective_status,
    effective_status,
    effective_count,
    effective_count,
    jsonb_build_object('expires_at', final_expires_at)
  );

  guest_id := _guest_id;
  token := raw_token;
  expires_at := final_expires_at;
  return next;
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
  target_group_size integer;
  collect_dietary boolean;
  next_count integer;
  next_note text;
  next_dietary_notes text;
  next_sent_at timestamptz;
  next_responded_at timestamptz;
  next_last_contact_at timestamptz;
  next_last_reminder_at timestamptz;
begin
  if _status is null then
    raise exception 'RSVP_STATUS_REQUIRED';
  end if;

  if _note is not null and char_length(_note) > 1000 then
    raise exception 'RSVP_NOTE_TOO_LONG'
      using errcode = '23514';
  end if;

  if _dietary_notes is not null and char_length(_dietary_notes) > 1000 then
    raise exception 'RSVP_DIETARY_NOTES_TOO_LONG'
      using errcode = '23514';
  end if;

  target_event_id := private.assert_guest_rsvp_access(_guest_id, 'rsvp_edit', true);

  select g.group_size
    into target_group_size
  from public.guests g
  where g.id = _guest_id
  for update;

  select coalesce(gs.rsvp_collect_dietary, false)
    into collect_dietary
  from public.guest_settings gs
  where gs.event_id = target_event_id;

  if coalesce(collect_dietary, false) is false
     and _dietary_notes is not null
     and btrim(_dietary_notes) <> '' then
    raise exception 'RSVP_DIETARY_NOT_COLLECTED'
      using errcode = '23514';
  end if;

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

  next_note := case
    when _note is null then existing_rsvp.note
    when btrim(_note) = '' then null
    else _note
  end;

  next_dietary_notes := case
    when _dietary_notes is null then existing_rsvp.dietary_notes
    when btrim(_dietary_notes) = '' then null
    else _dietary_notes
  end;

  next_sent_at := case
    when _status = 'not_sent' then null
    when _status in ('sent', 'awaiting_response') then coalesce(existing_rsvp.sent_at, now())
    else existing_rsvp.sent_at
  end;

  next_responded_at := case
    when _status in ('not_sent', 'sent', 'awaiting_response') then null
    else now()
  end;

  next_last_contact_at := case
    when _status = 'not_sent' then null
    else existing_rsvp.last_contact_at
  end;

  next_last_reminder_at := case
    when _status = 'not_sent' then null
    else existing_rsvp.last_reminder_at
  end;

  insert into public.guest_rsvps (
    guest_id,
    status,
    confirmed_count,
    sent_at,
    responded_at,
    last_contact_at,
    last_reminder_at,
    note,
    dietary_notes
  ) values (
    _guest_id,
    _status,
    next_count,
    next_sent_at,
    next_responded_at,
    next_last_contact_at,
    next_last_reminder_at,
    next_note,
    next_dietary_notes
  )
  on conflict on constraint guest_rsvps_pkey do update
    set status = excluded.status,
        confirmed_count = excluded.confirmed_count,
        sent_at = excluded.sent_at,
        responded_at = excluded.responded_at,
        last_contact_at = excluded.last_contact_at,
        last_reminder_at = excluded.last_reminder_at,
        note = excluded.note,
        dietary_notes = excluded.dietary_notes
  returning * into updated_rsvp;

  perform private.insert_guest_rsvp_event(
    target_event_id,
    _guest_id,
    (select auth.uid()),
    'workspace_user',
    'manual_override',
    coalesce(existing_rsvp.status, 'not_sent'::public.rsvp_status),
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
  next_status public.rsvp_status;
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

  next_status := case
    when coalesce(existing_rsvp.status, 'not_sent'::public.rsvp_status) in ('not_sent', 'sent') then 'awaiting_response'::public.rsvp_status
    else existing_rsvp.status
  end;

  insert into public.guest_rsvps (
    guest_id,
    status,
    confirmed_count,
    sent_at,
    responded_at,
    last_contact_at,
    last_reminder_at,
    note,
    dietary_notes
  ) values (
    _guest_id,
    coalesce(next_status, 'awaiting_response'::public.rsvp_status),
    existing_rsvp.confirmed_count,
    coalesce(existing_rsvp.sent_at, now()),
    existing_rsvp.responded_at,
    now(),
    case when _contact_type = 'reminder' then now() else existing_rsvp.last_reminder_at end,
    existing_rsvp.note,
    existing_rsvp.dietary_notes
  )
  on conflict on constraint guest_rsvps_pkey do update
    set status = excluded.status,
        confirmed_count = excluded.confirmed_count,
        sent_at = excluded.sent_at,
        responded_at = excluded.responded_at,
        last_contact_at = excluded.last_contact_at,
        last_reminder_at = excluded.last_reminder_at,
        note = excluded.note,
        dietary_notes = excluded.dietary_notes
  returning * into updated_rsvp;

  action_name := case when _contact_type = 'reminder' then 'reminder_marked' else 'contact_marked' end;

  perform private.insert_guest_rsvp_event(
    target_event_id,
    _guest_id,
    (select auth.uid()),
    'workspace_user',
    action_name,
    coalesce(existing_rsvp.status, 'not_sent'::public.rsvp_status),
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

  sanitized_note := case
    when _note is null then null
    when btrim(_note) = '' then null
    else _note
  end;

  sanitized_dietary := case
    when coalesce(collect_dietary, false) is false then null
    when _dietary_notes is null then null
    when btrim(_dietary_notes) = '' then null
    else _dietary_notes
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
  select g.* into current_guest
  from public.guests g
  where g.id = _guest_id
    and private.has_event_capability(g.event_id, 'guests_edit')
    and private.can_edit_event(g.event_id)
  for update;

  if not found then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.guests g
  set full_name = coalesce(nullif(btrim(_full_name), ''), g.full_name),
      group_size = greatest(coalesce(_group_size, g.group_size), 1),
      phone = nullif(btrim(_phone), ''),
      email = nullif(btrim(_email), ''),
      notes = nullif(btrim(_notes), ''),
      side = nullif(btrim(_side), ''),
      group_category = nullif(btrim(_group_category), ''),
      relationship = nullif(btrim(_relationship), ''),
      needs_transport = coalesce(_needs_transport, g.needs_transport),
      pickup_location = case
        when coalesce(_needs_transport, g.needs_transport) then nullif(btrim(_pickup_location), '')
        else null
      end
  where g.id = current_guest.id
  returning g.* into updated_guest;

  return query
    select
      wg.id, wg.event_id, wg.full_name, wg.group_size, wg.phone, wg.email,
      wg.notes, wg.side, wg.arrived, wg.arrived_count, wg.gift_amount,
      wg.payment_method, wg.created_at, wg.updated_at, wg.group_category,
      wg.relationship, wg.needs_transport, wg.pickup_location,
      wg.can_view_gifts, wg.can_view_attendance
    from public.list_workspace_guests(updated_guest.event_id) wg
    where wg.id = updated_guest.id;
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
  select g.* into current_guest
  from public.guests g
  where g.id = _guest_id
    and private.has_event_capability(g.event_id, 'wedding_day_edit')
    and private.can_edit_event(g.event_id)
  for update;

  if not found then
    raise exception 'ACCESS_DENIED';
  end if;

  if not private.is_premium_event(current_guest.event_id) then
    raise exception 'PREMIUM_REQUIRED_ATTENDANCE';
  end if;

  update public.guests g
  set arrived = _arrived,
      arrived_count = case
        when _arrived is false then 0
        else greatest(coalesce(_arrived_count, g.arrived_count, g.group_size), 0)
      end
  where g.id = current_guest.id
  returning g.* into updated_guest;

  return query
    select
      wg.id, wg.event_id, wg.full_name, wg.group_size, wg.phone, wg.email,
      wg.notes, wg.side, wg.arrived, wg.arrived_count, wg.gift_amount,
      wg.payment_method, wg.created_at, wg.updated_at, wg.group_category,
      wg.relationship, wg.needs_transport, wg.pickup_location,
      wg.can_view_gifts, wg.can_view_attendance
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
  select g.* into current_guest
  from public.guests g
  where g.id = _guest_id
    and private.has_event_capability(g.event_id, 'gifts_edit')
    and private.can_edit_event(g.event_id)
  for update;

  if not found then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.guests g
  set gift_amount = greatest(coalesce(_gift_amount, g.gift_amount), 0),
      payment_method = nullif(btrim(_payment_method), '')
  where g.id = current_guest.id
  returning g.* into updated_guest;

  return query
    select
      wg.id, wg.event_id, wg.full_name, wg.group_size, wg.phone, wg.email,
      wg.notes, wg.side, wg.arrived, wg.arrived_count, wg.gift_amount,
      wg.payment_method, wg.created_at, wg.updated_at, wg.group_category,
      wg.relationship, wg.needs_transport, wg.pickup_location,
      wg.can_view_gifts, wg.can_view_attendance
    from public.list_workspace_guests(updated_guest.event_id) wg
    where wg.id = updated_guest.id;
end;
$$;

revoke all on function private.is_valid_rsvp_token(text) from public, anon, authenticated;

revoke all on function public.issue_guest_rsvp_link(uuid, timestamptz) from public, anon;
grant execute on function public.issue_guest_rsvp_link(uuid, timestamptz) to authenticated, service_role;

revoke all on function public.set_guest_rsvp_state(uuid, public.rsvp_status, integer, text, text) from public, anon;
grant execute on function public.set_guest_rsvp_state(uuid, public.rsvp_status, integer, text, text) to authenticated, service_role;

revoke all on function public.mark_guest_rsvp_contact(uuid, text) from public, anon;
grant execute on function public.mark_guest_rsvp_contact(uuid, text) to authenticated, service_role;

revoke all on function public.get_public_rsvp(text) from public;
grant execute on function public.get_public_rsvp(text) to anon, authenticated, service_role;

revoke all on function public.submit_public_rsvp(text, integer, text, text) from public;
grant execute on function public.submit_public_rsvp(text, integer, text, text) to anon, authenticated, service_role;

revoke all on function public.update_workspace_guest_details(uuid, text, integer, text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.update_workspace_guest_details(uuid, text, integer, text, text, text, text, text, text, boolean, text) to authenticated, service_role;

revoke all on function public.update_workspace_guest_attendance(uuid, boolean, integer) from public, anon;
grant execute on function public.update_workspace_guest_attendance(uuid, boolean, integer) to authenticated, service_role;

revoke all on function public.update_workspace_guest_gift(uuid, numeric, text) from public, anon;
grant execute on function public.update_workspace_guest_gift(uuid, numeric, text) to authenticated, service_role;
