
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_event_id uuid;
  v_full_name text;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_full_name);

  insert into public.user_roles (user_id, role) values (new.id, 'user');

  insert into public.events (owner_id, event_name)
  values (new.id, 'האירוע של ' || v_full_name)
  returning id into new_event_id;

  insert into public.guest_settings (event_id) values (new_event_id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
