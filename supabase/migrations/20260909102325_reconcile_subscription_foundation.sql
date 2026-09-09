-- Reconcile the subscription/payment foundation without deleting existing data.

-- ============ EXPENSE PAYMENTS ============
CREATE TABLE IF NOT EXISTS public.expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT current_date,
  payment_type text NOT NULL DEFAULT 'מקדמה',
  payment_method text NOT NULL DEFAULT 'מזומן',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_payments
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS expense_id uuid,
  ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_date date DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS payment_type text DEFAULT 'מקדמה',
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'מזומן',
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    WITH expected(column_name, udt_name) AS (
      VALUES
        ('id', 'uuid'),
        ('expense_id', 'uuid'),
        ('amount', 'numeric'),
        ('payment_date', 'date'),
        ('payment_type', 'text'),
        ('payment_method', 'text'),
        ('note', 'text'),
        ('created_at', 'timestamptz'),
        ('updated_at', 'timestamptz')
    )
    SELECT 1
    FROM expected e
    JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = 'expense_payments'
     AND c.column_name = e.column_name
    WHERE c.udt_name <> e.udt_name
  ) THEN
    RAISE EXCEPTION 'expense_payments contains incompatible column types; refusing an unsafe conversion';
  END IF;
END;
$$;

UPDATE public.expense_payments SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.expense_payments SET amount = 0 WHERE amount IS NULL;
UPDATE public.expense_payments SET payment_date = current_date WHERE payment_date IS NULL;
UPDATE public.expense_payments SET payment_type = 'מקדמה' WHERE payment_type IS NULL;
UPDATE public.expense_payments SET payment_method = 'מזומן' WHERE payment_method IS NULL;
UPDATE public.expense_payments SET created_at = now() WHERE created_at IS NULL;
UPDATE public.expense_payments SET updated_at = now() WHERE updated_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.expense_payments WHERE expense_id IS NULL) THEN
    RAISE EXCEPTION 'expense_payments has rows without expense_id; refusing to fabricate ownership';
  END IF;
END;
$$;

ALTER TABLE public.expense_payments
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN expense_id SET NOT NULL,
  ALTER COLUMN amount SET DEFAULT 0,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN payment_date SET DEFAULT current_date,
  ALTER COLUMN payment_date SET NOT NULL,
  ALTER COLUMN payment_type SET DEFAULT 'מקדמה',
  ALTER COLUMN payment_type SET NOT NULL,
  ALTER COLUMN payment_method SET DEFAULT 'מזומן',
  ALTER COLUMN payment_method SET NOT NULL,
  ALTER COLUMN note DROP NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expense_payments'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.expense_payments
      ADD CONSTRAINT expense_payments_pkey PRIMARY KEY (id);
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expense_payments'::regclass
      AND contype = 'p'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'public.expense_payments'::regclass
                            AND attname = 'id')]::smallint[]
  ) THEN
    RAISE EXCEPTION 'expense_payments has an incompatible primary key';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.expense_payments'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.expenses'::regclass
      AND c.confdeltype = 'c'
      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                            WHERE attrelid = 'public.expense_payments'::regclass
                              AND attname = 'expense_id')]::smallint[]
  ) THEN
    ALTER TABLE public.expense_payments
      ADD CONSTRAINT expense_payments_expense_id_fkey
      FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS expense_payments_expense_id_idx
  ON public.expense_payments(expense_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_payments TO authenticated;
GRANT ALL ON public.expense_payments TO service_role;
REVOKE ALL ON public.expense_payments FROM anon;
ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_expense_payments_updated_at ON public.expense_payments;
CREATE TRIGGER trg_expense_payments_updated_at
BEFORE UPDATE ON public.expense_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.expense_payments REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'expense_payments'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_payments;
  END IF;
END;
$$;

-- ============ AUTHORIZATION HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT _user_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _user_id AND role = _role
     )
$$;

CREATE OR REPLACE FUNCTION public.owns_event(_event_id uuid)
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
        OR public.has_role((SELECT auth.uid()), 'admin')
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.subscription_status(_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN NOT public.owns_event(_event_id) THEN NULL
    WHEN s.id IS NULL THEN 'trial_expired'
    WHEN s.plan = 'premium' AND s.premium_expires_at > now() THEN 'premium_active'
    WHEN s.plan = 'premium' THEN 'premium_expired'
    WHEN s.trial_expires_at > now() THEN 'trial_active'
    ELSE 'trial_expired'
  END
  FROM (SELECT 1) z
  LEFT JOIN public.subscriptions s ON s.event_id = _event_id
$$;

CREATE OR REPLACE FUNCTION public.is_premium_event(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.owns_event(_event_id)
     AND (
       public.has_role((SELECT auth.uid()), 'admin')
       OR public.subscription_status(_event_id) = 'premium_active'
     )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_event(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.owns_event(_event_id)
     AND (
       public.has_role((SELECT auth.uid()), 'admin')
       OR public.subscription_status(_event_id) IN ('trial_active', 'premium_active')
     )
$$;

-- ============ TRIAL EXPENSE LIMIT ============
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

  IF public.is_premium_event(NEW.event_id) THEN
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

DROP TRIGGER IF EXISTS trg_expenses_trial_limit ON public.expenses;
CREATE TRIGGER trg_expenses_trial_limit
BEFORE INSERT OR UPDATE OF event_id ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_trial_expense_limit();

-- ============ DEPOSIT METADATA = PREMIUM ONLY ============
CREATE OR REPLACE FUNCTION public.enforce_premium_deposit_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF public.is_premium_event(NEW.event_id) THEN
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

DROP TRIGGER IF EXISTS trg_expenses_premium_deposit ON public.expenses;
CREATE TRIGGER trg_expenses_premium_deposit
BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enforce_premium_deposit_metadata();

-- ============ NEW USER FLOW: ROLE IS NEVER EMAIL-BASED ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_event_id uuid;
  v_full_name text;
BEGIN
  v_full_name := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, v_full_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  INSERT INTO public.events (owner_id, event_name)
  VALUES (NEW.id, 'האירוע של ' || v_full_name)
  RETURNING id INTO new_event_id;

  INSERT INTO public.guest_settings (event_id)
  VALUES (new_event_id);

  INSERT INTO public.subscriptions (
    event_id, plan, trial_started_at, trial_expires_at
  ) VALUES (
    new_event_id, 'trial', now(), now() + interval '21 days'
  );

  INSERT INTO public.subscription_events (
    event_id, actor_id, action, details
  ) VALUES (
    new_event_id, NEW.id, 'trial_started', jsonb_build_object('days', 21)
  );

  RETURN NEW;
END;
$$;

-- ============ ADMIN SUBSCRIPTION RPC ============
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
     OR NOT public.has_role((SELECT auth.uid()), 'admin') THEN
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

-- ============ FINAL RLS POLICIES ============
DROP POLICY IF EXISTS expense_payments_owner_all ON public.expense_payments;
DROP POLICY IF EXISTS expense_payments_select ON public.expense_payments;
DROP POLICY IF EXISTS expense_payments_write ON public.expense_payments;
DROP POLICY IF EXISTS expense_payments_insert ON public.expense_payments;
DROP POLICY IF EXISTS expense_payments_update ON public.expense_payments;
DROP POLICY IF EXISTS expense_payments_delete ON public.expense_payments;

CREATE POLICY expense_payments_select
ON public.expense_payments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.expenses x
    WHERE x.id = expense_payments.expense_id
      AND public.owns_event(x.event_id)
  )
);

CREATE POLICY expense_payments_insert
ON public.expense_payments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expenses x
    WHERE x.id = expense_payments.expense_id
      AND public.owns_event(x.event_id)
      AND public.can_edit_event(x.event_id)
      AND public.is_premium_event(x.event_id)
  )
);

CREATE POLICY expense_payments_update
ON public.expense_payments
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.expenses x
    WHERE x.id = expense_payments.expense_id
      AND public.owns_event(x.event_id)
      AND public.can_edit_event(x.event_id)
      AND public.is_premium_event(x.event_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expenses x
    WHERE x.id = expense_payments.expense_id
      AND public.owns_event(x.event_id)
      AND public.can_edit_event(x.event_id)
      AND public.is_premium_event(x.event_id)
  )
);

CREATE POLICY expense_payments_delete
ON public.expense_payments
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.expenses x
    WHERE x.id = expense_payments.expense_id
      AND public.owns_event(x.event_id)
      AND public.can_edit_event(x.event_id)
      AND public.is_premium_event(x.event_id)
  )
);

-- Users may only edit non-privileged profile fields. Admin changes use the
-- existing server-side admin action with the service role.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, last_login) ON public.profiles TO authenticated;

-- The unique constraint already supplies an index for subscriptions.event_id.
DROP INDEX IF EXISTS public.idx_subscriptions_event;

-- ============ FUNCTION PRIVILEGES ============
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.subscription_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_premium_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_subscription(uuid, text, integer, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_trial_expense_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_premium_deposit_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_premium_attendance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_admin_deletion() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_premium_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_subscription(uuid, text, integer, timestamptz, text) TO authenticated;
