REVOKE ALL ON FUNCTION public.subscription_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_premium_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subscription(uuid, text, integer, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_trial_expense_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_premium_attendance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_admin_deletion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.subscription_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_premium_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text, integer, timestamptz, text) TO authenticated;