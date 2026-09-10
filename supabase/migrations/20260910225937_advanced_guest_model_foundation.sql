ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS group_category text,
  ADD COLUMN IF NOT EXISTS relationship text,
  ADD COLUMN IF NOT EXISTS needs_transport boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pickup_location text;

CREATE TABLE IF NOT EXISTS public.guest_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  full_name text,
  age_group text,
  meal_preference text,
  dietary_notes text,
  accessibility_notes text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_members_age_group_check
    CHECK (age_group IS NULL OR age_group IN ('adult', 'child', 'infant')),
  CONSTRAINT guest_members_meal_preference_check
    CHECK (
      meal_preference IS NULL
      OR meal_preference IN (
        'regular',
        'vegetarian',
        'vegan',
        'gluten_free',
        'glatt',
        'other'
      )
    ),
  CONSTRAINT guest_members_position_check CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS guest_members_guest_id_idx
  ON public.guest_members(guest_id);

DROP TRIGGER IF EXISTS update_guest_members_updated_at
  ON public.guest_members;
CREATE TRIGGER update_guest_members_updated_at
BEFORE UPDATE ON public.guest_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.guest_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.guest_members FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guest_members TO authenticated;
GRANT ALL ON public.guest_members TO service_role;

DROP POLICY IF EXISTS guest_members_select ON public.guest_members;
DROP POLICY IF EXISTS guest_members_insert ON public.guest_members;
DROP POLICY IF EXISTS guest_members_update ON public.guest_members;
DROP POLICY IF EXISTS guest_members_delete ON public.guest_members;

CREATE POLICY guest_members_select ON public.guest_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = guest_members.guest_id
        AND private.owns_event(g.event_id)
    )
  );

CREATE POLICY guest_members_insert ON public.guest_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = guest_members.guest_id
        AND private.owns_event(g.event_id)
        AND private.can_edit_event(g.event_id)
    )
  );

CREATE POLICY guest_members_update ON public.guest_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = guest_members.guest_id
        AND private.owns_event(g.event_id)
        AND private.can_edit_event(g.event_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = guest_members.guest_id
        AND private.owns_event(g.event_id)
        AND private.can_edit_event(g.event_id)
    )
  );

CREATE POLICY guest_members_delete ON public.guest_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = guest_members.guest_id
        AND private.owns_event(g.event_id)
        AND private.can_edit_event(g.event_id)
    )
  );
