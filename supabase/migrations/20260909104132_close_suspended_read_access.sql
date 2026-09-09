-- Route event and subscription reads through the active-account-aware owner
-- helper. Profiles remain self-readable so the client can detect suspension
-- and show the correct sign-out flow.

DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events
  FOR SELECT TO authenticated
  USING (private.owns_event(id));

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (private.owns_event(event_id));
