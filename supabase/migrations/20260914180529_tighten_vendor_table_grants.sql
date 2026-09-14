revoke all on public.vendors from authenticated;
grant select, insert, update, delete on public.vendors to authenticated;

revoke all on public.vendors from public, anon;
revoke all on public.vendor_events from public, anon, authenticated;
grant all on public.vendors to service_role;
grant all on public.vendor_events to service_role;
