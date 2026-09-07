-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','premium')),
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_expires_at timestamptz NOT NULL DEFAULT (now() + interval '21 days'),
  premium_started_at timestamptz,
  premium_expires_at timestamptz,
  price_paid numeric,
  currency text NOT NULL DEFAULT 'ILS',
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select_own ON public.subscriptions
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = subscriptions.event_id AND (e.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));

CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_subscriptions_event ON public.subscriptions(event_id);

-- ============ AUDIT LOG ============
CREATE TABLE public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_events_select_admin ON public.subscription_events
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_subscription_events_event ON public.subscription_events(event_id);

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.subscription_status(_event_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN s.id IS NULL THEN 'trial_expired'
    WHEN s.premium_expires_at IS NOT NULL AND s.premium_expires_at > now() THEN 'premium_active'
    WHEN s.premium_expires_at IS NOT NULL THEN 'premium_expired'
    WHEN s.trial_expires_at > now() THEN 'trial_active'
    ELSE 'trial_expired'
  END
  FROM (SELECT 1) z LEFT JOIN public.subscriptions s ON s.event_id = _event_id
$$;

CREATE OR REPLACE FUNCTION public.is_premium_event(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.subscription_status(_event_id) = 'premium_active'
$$;

CREATE OR REPLACE FUNCTION public.can_edit_event(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.subscription_status(_event_id) IN ('trial_active','premium_active')
$$;

CREATE OR REPLACE FUNCTION public.owns_event(_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND (e.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
$$;

REVOKE EXECUTE ON FUNCTION public.subscription_status(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_premium_event(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_event(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owns_event(uuid) FROM anon;

-- ============ TRIAL EXPENSE LIMIT (5 ACTIVE) ============
CREATE OR REPLACE FUNCTION public.enforce_trial_expense_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cnt integer;
BEGIN
  IF public.is_premium_event(NEW.event_id) THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO cnt FROM public.expenses WHERE event_id = NEW.event_id;
  IF cnt >= 5 THEN
    RAISE EXCEPTION 'TRIAL_EXPENSE_LIMIT: הגעתם למגבלת 5 הפריטים בתקופת הניסיון';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expenses_trial_limit BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_trial_expense_limit();

-- ============ ATTENDANCE = PREMIUM ONLY ============
CREATE OR REPLACE FUNCTION public.enforce_premium_attendance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (COALESCE(NEW.arrived,false) OR COALESCE(NEW.arrived_count,0) > 0) AND NOT public.is_premium_event(NEW.event_id) THEN
      RAISE EXCEPTION 'PREMIUM_REQUIRED_ATTENDANCE: מצב "מי הגיע" זמין ב-Premium';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.arrived IS DISTINCT FROM OLD.arrived OR NEW.arrived_count IS DISTINCT FROM OLD.arrived_count)
     AND NOT public.is_premium_event(NEW.event_id) THEN
    RAISE EXCEPTION 'PREMIUM_REQUIRED_ATTENDANCE: מצב "מי הגיע" זמין ב-Premium';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guests_premium_attendance BEFORE INSERT OR UPDATE ON public.guests
FOR EACH ROW EXECUTE FUNCTION public.enforce_premium_attendance();

-- ============ BACKFILL EXISTING EVENTS ============
INSERT INTO public.subscriptions (event_id, plan, trial_started_at, trial_expires_at)
SELECT e.id, 'trial', now(), now() + interval '21 days'
FROM public.events e
ON CONFLICT (event_id) DO NOTHING;

INSERT INTO public.subscription_events (event_id, actor_id, action, details)
SELECT e.id, NULL, 'trial_started', jsonb_build_object('reason','migration_backfill','days',21)
FROM public.events e;

-- ============ NEW USER FLOW ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  new_event_id uuid;
  v_full_name text;
  v_role public.app_role;
begin
  v_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  if lower(new.email) = 'yarinhazan395@gmail.com' then
    v_role := 'admin';
  else
    v_role := 'user';
  end if;

  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, v_full_name);

  insert into public.user_roles (user_id, role) values (new.id, v_role);

  insert into public.events (owner_id, event_name)
  values (new.id, 'האירוע של ' || v_full_name)
  returning id into new_event_id;

  insert into public.guest_settings (event_id) values (new_event_id);

  insert into public.subscriptions (event_id, plan, trial_started_at, trial_expires_at)
  values (new_event_id, 'trial', now(), now() + interval '21 days');

  insert into public.subscription_events (event_id, actor_id, action, details)
  values (new_event_id, new.id, 'trial_started', jsonb_build_object('days', 21));

  return new;
end;
$$;

-- ============ RLS: WRITE GATES ============
DROP POLICY IF EXISTS expenses_owner_all ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated USING (public.owns_event(event_id));
CREATE POLICY expenses_insert ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.owns_event(event_id) AND public.can_edit_event(event_id));
CREATE POLICY expenses_update ON public.expenses FOR UPDATE TO authenticated USING (public.owns_event(event_id) AND public.can_edit_event(event_id)) WITH CHECK (public.owns_event(event_id) AND public.can_edit_event(event_id));
CREATE POLICY expenses_delete ON public.expenses FOR DELETE TO authenticated USING (public.owns_event(event_id) AND public.can_edit_event(event_id));

DROP POLICY IF EXISTS guests_owner_all ON public.guests;
CREATE POLICY guests_select ON public.guests FOR SELECT TO authenticated USING (public.owns_event(event_id));
CREATE POLICY guests_insert ON public.guests FOR INSERT TO authenticated WITH CHECK (public.owns_event(event_id) AND public.can_edit_event(event_id));
CREATE POLICY guests_update ON public.guests FOR UPDATE TO authenticated USING (public.owns_event(event_id) AND public.can_edit_event(event_id)) WITH CHECK (public.owns_event(event_id) AND public.can_edit_event(event_id));
CREATE POLICY guests_delete ON public.guests FOR DELETE TO authenticated USING (public.owns_event(event_id) AND public.can_edit_event(event_id));

DROP POLICY IF EXISTS guest_settings_owner_all ON public.guest_settings;
CREATE POLICY guest_settings_select ON public.guest_settings FOR SELECT TO authenticated USING (public.owns_event(event_id));
CREATE POLICY guest_settings_insert ON public.guest_settings FOR INSERT TO authenticated WITH CHECK (public.owns_event(event_id) AND public.can_edit_event(event_id));
CREATE POLICY guest_settings_update ON public.guest_settings FOR UPDATE TO authenticated USING (public.owns_event(event_id) AND public.can_edit_event(event_id)) WITH CHECK (public.owns_event(event_id) AND public.can_edit_event(event_id));

DROP POLICY IF EXISTS events_owner_all ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY events_update ON public.events FOR UPDATE TO authenticated USING ((owner_id = auth.uid() OR public.has_role(auth.uid(),'admin')) AND public.can_edit_event(id)) WITH CHECK ((owner_id = auth.uid() OR public.has_role(auth.uid(),'admin')) AND public.can_edit_event(id));

DROP POLICY IF EXISTS expense_payments_owner_all ON public.expense_payments;
CREATE POLICY expense_payments_select ON public.expense_payments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = expense_payments.expense_id AND public.owns_event(x.event_id)));
CREATE POLICY expense_payments_write ON public.expense_payments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = expense_payments.expense_id AND public.owns_event(x.event_id) AND public.can_edit_event(x.event_id) AND public.is_premium_event(x.event_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.expenses x WHERE x.id = expense_payments.expense_id AND public.owns_event(x.event_id) AND public.can_edit_event(x.event_id) AND public.is_premium_event(x.event_id)));

-- ============ ADMIN SUBSCRIPTION RPC ============
CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _event_id uuid,
  _action text,
  _months integer DEFAULT NULL,
  _custom_expires timestamptz DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.subscriptions;
  base timestamptz;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;

  INSERT INTO public.subscriptions (event_id) VALUES (_event_id) ON CONFLICT (event_id) DO NOTHING;
  SELECT * INTO s FROM public.subscriptions WHERE event_id = _event_id;

  IF _action = 'grant_premium' THEN
    base := now();
    UPDATE public.subscriptions SET
      plan = 'premium',
      premium_started_at = COALESCE(premium_started_at, base),
      premium_expires_at = COALESCE(_custom_expires, base + make_interval(months => COALESCE(_months,12)))
    WHERE event_id = _event_id RETURNING * INTO s;
  ELSIF _action = 'extend_premium' THEN
    base := GREATEST(COALESCE(s.premium_expires_at, now()), now());
    UPDATE public.subscriptions SET
      plan = 'premium',
      premium_started_at = COALESCE(premium_started_at, now()),
      premium_expires_at = COALESCE(_custom_expires, base + make_interval(months => COALESCE(_months,6)))
    WHERE event_id = _event_id RETURNING * INTO s;
  ELSIF _action = 'revoke_premium' THEN
    UPDATE public.subscriptions SET plan = 'trial', premium_expires_at = now()
    WHERE event_id = _event_id RETURNING * INTO s;
  ELSIF _action = 'reset_trial' THEN
    UPDATE public.subscriptions SET
      plan = 'trial',
      trial_started_at = now(),
      trial_expires_at = now() + make_interval(days => COALESCE(_months,21))
    WHERE event_id = _event_id RETURNING * INTO s;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_ACTION';
  END IF;

  INSERT INTO public.subscription_events (event_id, actor_id, action, details)
  VALUES (_event_id, auth.uid(), _action,
    jsonb_build_object('months', _months, 'custom_expires', _custom_expires, 'note', _note));

  RETURN s;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text, integer, timestamptz, text) FROM anon;