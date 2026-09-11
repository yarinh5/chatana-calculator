do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'guests_group_size_minimum'
      and conrelid = 'public.guests'::regclass
  ) then
    alter table public.guests
      add constraint guests_group_size_minimum
      check (group_size >= 1)
      not valid;
  end if;
end $$;

alter table public.guests validate constraint guests_group_size_minimum;

create or replace function public.enforce_guest_member_group_size()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_group_size integer;
  current_member_count integer;
begin
  if tg_op = 'UPDATE' and old.guest_id is not distinct from new.guest_id then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    perform 1
    from public.guests
    where id in (old.guest_id, new.guest_id)
    order by id
    for update;
  else
    perform 1
    from public.guests
    where id = new.guest_id
    for update;
  end if;

  select group_size
    into target_group_size
  from public.guests
  where id = new.guest_id;

  if target_group_size is null then
    return new;
  end if;

  select count(*)::integer
    into current_member_count
  from public.guest_members
  where guest_id = new.guest_id
    and (tg_op <> 'UPDATE' or id <> new.id);

  if current_member_count + 1 > target_group_size then
    raise exception 'GUEST_MEMBER_GROUP_SIZE_EXCEEDED'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_guest_group_size_not_below_members()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_member_count integer;
begin
  if new.group_size < 1 then
    raise exception 'GUEST_GROUP_SIZE_MINIMUM'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.group_size >= old.group_size then
    return new;
  end if;

  select count(*)::integer
    into current_member_count
  from public.guest_members
  where guest_id = new.id;

  if current_member_count > new.group_size then
    raise exception 'GUEST_GROUP_SIZE_BELOW_MEMBER_COUNT'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_guest_member_group_size on public.guest_members;
create trigger enforce_guest_member_group_size
  before insert or update of guest_id on public.guest_members
  for each row
  execute function public.enforce_guest_member_group_size();

drop trigger if exists enforce_guest_group_size_not_below_members on public.guests;
create trigger enforce_guest_group_size_not_below_members
  before insert or update of group_size on public.guests
  for each row
  execute function public.enforce_guest_group_size_not_below_members();

revoke execute on function public.enforce_guest_member_group_size() from public, anon, authenticated;
revoke execute on function public.enforce_guest_group_size_not_below_members() from public, anon, authenticated;
