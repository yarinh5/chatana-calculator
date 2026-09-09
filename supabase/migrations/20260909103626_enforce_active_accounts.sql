-- Suspended accounts keep their Auth identity for recoverability, but must not
-- retain access to event data through an already-issued JWT.

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
       FROM public.user_roles ur
       JOIN public.profiles p ON p.id = ur.user_id
       WHERE ur.user_id = _user_id
         AND ur.role = _role
         AND p.is_active
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
    JOIN public.profiles p ON p.id = e.owner_id
    WHERE e.id = _event_id
      AND p.is_active
      AND (
        e.owner_id = (SELECT auth.uid())
        OR private.has_role((SELECT auth.uid()), 'admin')
      )
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.owns_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.owns_event(uuid) TO authenticated, service_role;
