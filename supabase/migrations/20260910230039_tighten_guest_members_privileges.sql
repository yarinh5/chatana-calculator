REVOKE ALL ON public.guest_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_members TO authenticated;
GRANT ALL ON public.guest_members TO service_role;
