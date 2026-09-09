-- Keep authorization helpers out of the API-exposed public schema and make
-- policy expressions planner-friendly. The public admin RPC remains exposed,
-- but performs its own role check before any mutation.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _user_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_roles
       WHERE user_id = _user_id
         AND role = _role
     )
$$;

CREATE OR REPLACE FUNCTION private.owns_event(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = _event_id
      AND (
        e.owner_id = (SELECT auth.uid())
        OR private.has_role((SELECT auth.uid()), 'admin')
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.subscription_status(_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN NOT private.owns_event(_event_id) THEN NULL
    WHEN s.id IS NULL THEN 'trial_expired'
    WHEN s.plan = 'premium' AND s.premium_expires_at > now() THEN 'premium_active'
    WHEN s.plan = 'premium' THEN 'premium_expired'
    WHEN s.trial_expires_at > now() THEN 'trial_active'
    ELSE 'trial_expired'
  END
  FROM (SELECT 1) z
  LEFT JOIN public.subscriptions s ON s.event_id = _event_id
$$;

CREATE OR REPLACE FUNCTION private.is_premium_event(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT private.owns_event(_event_id)
     AND (
       private.has_role((SELECT auth.uid()), 'admin')
       OR private.subscription_status(_event_id) = 'premium_active'
     )
$$;

CREATE OR REPLACE FUNCTION private.can_edit_event(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT private.owns_event(_event_id)
     AND (
       private.has_role((SELECT auth.uid()), 'admin')
       OR private.subscription_status(_event_id) IN ('trial_active', 'premium_active')
     )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.owns_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.subscription_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_premium_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_edit_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_event(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.subscription_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_premium_event(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_edit_event(uuid) TO authenticated, service_role;

-- Avoid an unindexed foreign key when invitation relationships are queried or
-- when an inviter is removed.
CREATE INDEX IF NOT EXISTS idx_profiles_invited_by ON public.profiles(invited_by);

-- Rebuild policies around private helpers. SELECT-wrapped auth calls are
-- evaluated once per statement rather than once per row.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY profiles_admin_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY profiles_admin_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_delete ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY user_roles_admin_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'))
  WITH CHECK (private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;
CREATE POLICY events_select ON public.events
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY events_update ON public.events
  FOR UPDATE TO authenticated
  USING (
    (owner_id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'))
    AND private.can_edit_event(id)
  )
  WITH CHECK (
    (owner_id = (SELECT auth.uid()) OR private.has_role((SELECT auth.uid()), 'admin'))
    AND private.can_edit_event(id)
  );

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = subscriptions.event_id
        AND (
          e.owner_id = (SELECT auth.uid())
          OR private.has_role((SELECT auth.uid()), 'admin')
        )
    )
  );

DROP POLICY IF EXISTS subscription_events_select_admin ON public.subscription_events;
CREATE POLICY subscription_events_select_admin ON public.subscription_events
  FOR SELECT TO authenticated
  USING (private.has_role((SELECT auth.uid()), 'admin'));

DROP POLICY IF EXISTS expenses_select ON public.expenses;
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
DROP POLICY IF EXISTS expenses_update ON public.expenses;
DROP POLICY IF EXISTS expenses_delete ON public.expenses;
CREATE POLICY expenses_select ON public.expenses
  FOR SELECT TO authenticated USING (private.owns_event(event_id));
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (private.owns_event(event_id) AND private.can_edit_event(event_id));
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (private.owns_event(event_id) AND private.can_edit_event(event_id))
  WITH CHECK (private.owns_event(event_id) AND private.can_edit_event(event_id));
CREATE POLICY expenses_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (private.owns_event(event_id) AND private.can_edit_event(event_id));

DROP POLICY IF EXISTS guests_select ON public.guests;
DROP POLICY IF EXISTS guests_insert ON public.guests;
DROP POLICY IF EXISTS guests_update ON public.guests;
DROP POLICY IF EXISTS guests_delete ON public.guests;
CREATE POLICY guests_select ON public.guests
  FOR SELECT TO authenticated USING (private.owns_event(event_id));
CREATE POLICY guests_insert ON public.guests
  FOR INSERT TO authenticated
  WITH CHECK (private.owns_event(event_id) AND private.can_edit_event(event_id));
CREATE POLICY guests_update ON public.guests
  FOR UPDATE TO authenticated
  USING (private.owns_event(event_id) AND private.can_edit_event(event_id))
  WITH CHECK (private.owns_event(event_id) AND private.can_edit_event(event_id));
CREATE POLICY guests_delete ON public.guests
  FOR DELETE TO authenticated
  USING (private.owns_event(event_id) AND private.can_edit_event(event_id));

DROP POLICY IF EXISTS guest_settings_select ON public.guest_settings;
DROP POLICY IF EXISTS guest_settings_insert ON public.guest_settings;
DROP POLICY IF EXISTS guest_settings_update ON public.guest_settings;
CREATE POLICY guest_settings_select ON public.guest_settings
  FOR SELECT TO authenticated USING (private.owns_event(event_id));
CREATE POLICY guest_settings_insert ON public.guest_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.owns_event(event_id) AND private.can_edit_event(event_id));
CREATE POLICY guest_settings_update ON public.guest_settings
  FOR UPDATE TO authenticated
  USING (private.owns_event(event_id) AND private.can_edit_event(event_id))
  WITH CHECK (private.owns_event(event_id) AND private.can_edit_event(event_id));

DROP POLICY IF EXISTS expense_payments_select ON public.expense_payments;
DROP POLICY IF EXISTS expense_payments_insert ON public.expense_payments;
DROP POLICY IF EXISTS expense_payments_update ON public.expense_payments;
DROP POLICY IF EXISTS expense_payments_delete ON public.expense_payments;
CREATE POLICY expense_payments_select ON public.expense_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses x
      WHERE x.id = expense_payments.expense_id
        AND private.owns_event(x.event_id)
    )
  );
CREATE POLICY expense_payments_insert ON public.expense_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses x
      WHERE x.id = expense_payments.expense_id
        AND private.owns_event(x.event_id)
        AND private.can_edit_event(x.event_id)
        AND private.is_premium_event(x.event_id)
    )
  );
CREATE POLICY expense_payments_update ON public.expense_payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses x
      WHERE x.id = expense_payments.expense_id
        AND private.owns_event(x.event_id)
        AND private.can_edit_event(x.event_id)
        AND private.is_premium_event(x.event_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses x
      WHERE x.id = expense_payments.expense_id
        AND private.owns_event(x.event_id)
        AND private.can_edit_event(x.event_id)
        AND private.is_premium_event(x.event_id)
    )
  );
CREATE POLICY expense_payments_delete ON public.expense_payments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses x
      WHERE x.id = expense_payments.expense_id
        AND private.owns_event(x.event_id)
        AND private.can_edit_event(x.event_id)
        AND private.is_premium_event(x.event_id)
    )
  );

-- Trigger functions use the same private helpers so the public helper RPCs can
-- be removed without changing enforcement behavior.
CREATE OR REPLACE FUNCTION public.enforce_trial_expense_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cnt integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.event_id = OLD.event_id THEN
    RETURN NEW;
  END IF;

  IF private.is_premium_event(NEW.event_id) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text, 0));
  SELECT count(*) INTO cnt
  FROM public.expenses
  WHERE event_id = NEW.event_id;

  IF cnt >= 5 THEN
    RAISE EXCEPTION 'TRIAL_EXPENSE_LIMIT: הגעתם למגבלת 5 הפריטים בתקופת הניסיון';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_premium_deposit_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF private.is_premium_event(NEW.event_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.requires_deposit
       OR NEW.deposit_percent IS DISTINCT FROM 30
       OR NEW.deposit_date IS NOT NULL
       OR NEW.balance_date IS NOT NULL THEN
      RAISE EXCEPTION 'PREMIUM_REQUIRED_PAYMENTS: ניהול מקדמות ותשלומים זמין ב-Premium';
    END IF;
  ELSIF NEW.requires_deposit IS DISTINCT FROM OLD.requires_deposit
     OR NEW.deposit_percent IS DISTINCT FROM OLD.deposit_percent
     OR NEW.deposit_date IS DISTINCT FROM OLD.deposit_date
     OR NEW.balance_date IS DISTINCT FROM OLD.balance_date
     OR (
       NEW.event_id IS DISTINCT FROM OLD.event_id
       AND (
         NEW.requires_deposit
         OR NEW.deposit_percent IS DISTINCT FROM 30
         OR NEW.deposit_date IS NOT NULL
         OR NEW.balance_date IS NOT NULL
       )
     ) THEN
    RAISE EXCEPTION 'PREMIUM_REQUIRED_PAYMENTS: ניהול מקדמות ותשלומים זמין ב-Premium';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_premium_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (COALESCE(NEW.arrived, false) OR COALESCE(NEW.arrived_count, 0) > 0)
       AND NOT private.is_premium_event(NEW.event_id) THEN
      RAISE EXCEPTION 'PREMIUM_REQUIRED_ATTENDANCE: מצב "מי הגיע" זמין ב-Premium';
    END IF;
    RETURN NEW;
  END IF;

  IF (
    NEW.arrived IS DISTINCT FROM OLD.arrived
    OR NEW.arrived_count IS DISTINCT FROM OLD.arrived_count
  ) AND NOT private.is_premium_event(NEW.event_id) THEN
    RAISE EXCEPTION 'PREMIUM_REQUIRED_ATTENDANCE: מצב "מי הגיע" זמין ב-Premium';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_subscription(
  _event_id uuid,
  _action text,
  _months integer DEFAULT NULL,
  _custom_expires timestamptz DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  previous_row public.subscriptions;
  result_row public.subscriptions;
  base timestamptz;
  effective_months integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT private.has_role((SELECT auth.uid()), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = _event_id) THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;

  IF _custom_expires IS NOT NULL AND _custom_expires <= now() THEN
    RAISE EXCEPTION 'INVALID_EXPIRY: custom expiry must be in the future';
  END IF;

  INSERT INTO public.subscriptions (event_id)
  VALUES (_event_id)
  ON CONFLICT (event_id) DO NOTHING;

  SELECT * INTO previous_row
  FROM public.subscriptions
  WHERE event_id = _event_id
  FOR UPDATE;

  IF _action = 'grant_premium' THEN
    effective_months := COALESCE(_months, 12);
    IF _custom_expires IS NULL AND effective_months <= 0 THEN
      RAISE EXCEPTION 'INVALID_MONTHS';
    END IF;

    UPDATE public.subscriptions SET
      plan = 'premium',
      premium_started_at = now(),
      premium_expires_at = COALESCE(
        _custom_expires,
        now() + make_interval(months => effective_months)
      )
    WHERE event_id = _event_id
    RETURNING * INTO result_row;

  ELSIF _action = 'extend_premium' THEN
    effective_months := COALESCE(_months, 6);
    IF _custom_expires IS NULL AND effective_months <= 0 THEN
      RAISE EXCEPTION 'INVALID_MONTHS';
    END IF;

    base := GREATEST(COALESCE(previous_row.premium_expires_at, now()), now());
    UPDATE public.subscriptions SET
      plan = 'premium',
      premium_started_at = COALESCE(premium_started_at, now()),
      premium_expires_at = COALESCE(
        _custom_expires,
        base + make_interval(months => effective_months)
      )
    WHERE event_id = _event_id
    RETURNING * INTO result_row;

  ELSIF _action = 'revoke_premium' THEN
    UPDATE public.subscriptions SET
      plan = 'premium',
      premium_started_at = COALESCE(premium_started_at, now()),
      premium_expires_at = now()
    WHERE event_id = _event_id
    RETURNING * INTO result_row;

  ELSIF _action = 'reset_trial' THEN
    effective_months := COALESCE(_months, 21);
    IF effective_months <= 0 THEN
      RAISE EXCEPTION 'INVALID_TRIAL_DAYS';
    END IF;

    UPDATE public.subscriptions SET
      plan = 'trial',
      trial_started_at = now(),
      trial_expires_at = now() + make_interval(days => effective_months),
      premium_started_at = NULL,
      premium_expires_at = NULL
    WHERE event_id = _event_id
    RETURNING * INTO result_row;

  ELSE
    RAISE EXCEPTION 'UNKNOWN_ACTION';
  END IF;

  INSERT INTO public.subscription_events (
    event_id, actor_id, action, details
  ) VALUES (
    _event_id,
    (SELECT auth.uid()),
    _action,
    jsonb_build_object(
      'months_or_days', _months,
      'custom_expires', _custom_expires,
      'note', _note,
      'previous', to_jsonb(previous_row),
      'current', to_jsonb(result_row)
    )
  );

  RETURN result_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_subscription(uuid, text, integer, timestamptz, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text, integer, timestamptz, text)
  TO authenticated;

-- No application code calls these helpers as RPCs. Removing them from public
-- keeps them outside PostgREST's exposed schema while preserving all RLS logic.
DROP FUNCTION public.can_edit_event(uuid);
DROP FUNCTION public.is_premium_event(uuid);
DROP FUNCTION public.subscription_status(uuid);
DROP FUNCTION public.owns_event(uuid);
DROP FUNCTION public.has_role(uuid, public.app_role);
